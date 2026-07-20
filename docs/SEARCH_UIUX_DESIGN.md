# 商品検索 UI/UX 改善 設計書

## 1. 概要

セマンティック検索（ハイブリッド検索、#15）とキーワードサジェスト（#17）で検索基盤は整ったが、
検索の入力から結果閲覧までの体験には粗が残っていた。本書は、その改善として実施した
10項目（品質修正 / サジェスト強化 / 結果ページ改善の3フェーズ）の設計を記す。

- 指揮・設計・検証: Fable / 実装: Opus サブエージェント×3（検索窓・バックエンド・結果ページの3領域に分割し並列実装）
- 対象コード: `frontend/components/SearchBox.tsx`, `frontend/components/Header.tsx`,
  `frontend/components/ProductFilters.tsx`, `frontend/app/page.tsx`,
  `frontend/lib/searchHistory.ts`（新規）, `frontend/lib/types.ts`,
  `backend/app/routers/products.py`, `backend/app/schemas.py`

## 2. 前提（改善前のアーキテクチャ）

- 検索窓は `SearchBox`（WAI-ARIA combobox 準拠）。`GET /products/suggest` からキーワード候補を
  デバウンス（250ms）+ AbortController 付きで取得。確定で `/?search=...` に遷移。
- 検索結果はホーム（`/?search=`）の `ProductListContent` が表示。カテゴリチップ・並び替え・
  価格帯フィルタ・絞り込みチップ・ページネーションあり。
- `GET /products` はハイブリッド検索: `name ILIKE` ∪ pgvector 意味的候補（動的カットオフ）。
  **`sort` 未指定 かつ 意味的候補を実際に使ったときだけ関連度順**で並ぶ。
- `GET /products/suggest` は出品中（`LISTED_STATUSES`）商品名への ILIKE のみの軽量エンドポイント。
  埋め込みは入力中には一切呼ばない（この原則は本改善でも維持）。

## 3. 改善項目

### フェーズ1: 品質修正（実質バグの解消）

| # | 項目 | 設計判断 |
|---|---|---|
| A-1 | IME 変換確定 Enter での誤検索防止 | `handleKeyDown` で `e.nativeEvent.isComposing \|\| e.keyCode === 229`（Safari の compositionend 後 Enter 対策）を判定。変換中の Enter は `preventDefault` で form の暗黙送信ごと止め、矢印・Esc も変換中は無効化。日本語ECでは必須のガード |
| A-2 | 検索欄と URL の同期 | `useSearchParams` で `?search=` を初期値・変化時に反映。タイピング上書きを防ぐため「パラメータが実際に変わったときだけ」`setQuery`。URL 由来の反映ではドロップダウンを開かない（`suppressFetchRef` を流用）。`SearchBox` が `useSearchParams` を使うため、layout 配下の `Header` 内 2 箇所を `<Suspense>` でラップ（無いと `next build` が落ちる） |
| A-3 | 「関連度順」表示と実際の並び順の一致 | 検索中に sort 未指定だと実際は関連度順なのに UI は「新着順」を表示していた。`ProductFilters` に `searching` prop を追加し、検索中はセレクト先頭に「関連度順」を出して既定表示にする。関連度順は **select 内だけの擬似値 `__relevance__`** で表現し、選択時は `sort: null`（URL から sort を削除）へマップ。バックエンドに `sort=relevance` は存在しないため URL には一切流さない |
| A-4 | クリア（×）ボタン | 入力があるときだけ表示。`onMouseDown` で `preventDefault` してフォーカス（＝ドロップダウン）を維持したままクリアし、履歴表示へ遷移 |

### フェーズ2: サジェスト強化

| # | 項目 | 設計判断 |
|---|---|---|
| B-1 | 検索履歴（最近の検索） | `lib/searchHistory.ts` 新規。localStorage キー `hibino:search-history`、最大5件・新しい順・重複（大文字小文字無視）は先頭繰り上げ。SSR ガード / 例外握りつぶしは `recentlyViewed.ts` と同じ流儀。**2文字未満（サジェスト非対象域）のフォーカスで履歴を表示**し、個別削除・全消去はドロップダウンを閉じずに即時反映 |
| B-2 | 一致部分ハイライト | 最初の一致のみ、文字列分割で `<mark>`（黄背景は打ち消し太字化）。`dangerouslySetInnerHTML` は使わない |
| B-3 | 商品ダイレクト候補 | キーワード候補の下に「商品」セクションとしてサムネイル+商品名+実売価格を最大3件表示し、クリックで検索を経ずに `/products/{id}` へ直行。API 拡張は §4 |

**ドロップダウンの選択肢モデル**: 履歴・キーワード・商品が混在するため、
`Option = { kind: 'history' | 'keyword' | 'product', ... }` の**種別付きフラット1次元配列**に正規化
（履歴モード = 履歴のみ / 通常モード = キーワード→商品の順）。`activeIndex` はこの配列の添字で、
↑↓ / Enter / `aria-activedescendant` が種別を問わず一貫動作する。セクション見出しは配列に含めず
`role="presentation"` の `li` として描画（キーボードで止まらない）。確定は `selectOption` に集約し、
product は遷移・それ以外は検索実行。

### フェーズ3: 検索結果ページ改善

| # | 項目 | 設計判断 |
|---|---|---|
| C-1 | 0件時の体験 | 検索0件時の文言を「別の言葉・一般的な言葉・曖昧な表現でも探せる」へ差し替え（セマンティック検索の示唆）。取得済み `categories` をチップで出しカテゴリ導線を追加。「絞り込みをすべて解除」は残置 |
| C-2 | モバイルのフィルタドロワー | `sm` 未満はフィルタ本体を畳み、「絞り込み・並び替え」ボタン（適用中フィルタ数バッジ付き。search はカウント外、並び順は既定からの逸脱を1件と数える）→ ボトムシートで表示。フィルタ本体は `FilterBody` に切り出して PC 版と共用し、`useId` で id 衝突を回避。ドロワーは `role="dialog" aria-modal`、Esc・背景タップで閉じる、背景スクロール固定、簡易フォーカストラップ、閉じたらトリガーへフォーカス復帰（`ConfirmDialog` の作法を踏襲）。フィルタ変更は即時反映でドロワーは開いたまま |
| C-3 | 再検索時のローディング | `hasLoadedOnce` を導入し、スケルトン全置換は初回のみ。2回目以降のロード中は直前のグリッドを `opacity-50 pointer-events-none` + `aria-busy` で薄く残し、レイアウトの跳ねを解消 |

## 4. API 仕様変更: GET /products/suggest（拡張）

- 認可: 不要
- クエリ: `q: string`（2文字未満は DB を引かず即空返し）, `limit: int = 8`（キーワード候補数、1〜20）
- レスポンス: `SuggestOut`

```jsonc
{
  "suggestions": ["マイクロファイバータオル", ...],  // 従来どおり（変更なし）
  "products": [                                      // 追加。最大3件
    {
      "id": 38,
      "name": "マイクロファイバータオル",
      "image_url": "/products/yoga-mat.svg",  // null あり
      "price": 1680,
      "sale_price": null,
      "effective_price": 1680                  // 実売価格。表示はこれを使う
    }
  ]
}
```

- `products` は `SuggestProductOut`（`schemas.py`）。`ProductOut` は重い（レビュー集計・画像配列）ため
  表示に必要な最小限だけ返す。
- 商品の可視性は `Product.status.in_(LISTED_STATUSES)` のみで判定（status が唯一の源、CLAUDE.md 準拠）。
- キーワード候補と同じエスケープ済み ILIKE パターン・同じ関連度順
  （`strpos` → `char_length(name)` → `name`）で **1クエリ追加**のみ。埋め込み等の重い処理は不使用。
- 後方互換: `products` は default `[]`。フロントは `res.products ?? []` で欠損に耐える
  （旧バックエンドと併用しても安全）。

## 5. 並び順の仕様（正）

| 状況 | 実際の並び | UI 表示 |
|---|---|---|
| 非検索・sort 未指定 | 新着順（従来どおり） | 「新着順」 |
| 検索中・sort 未指定 | 関連度順（ILIKE 一致優先 + 意味的距離） | 「関連度順」（A-3 で一致させた） |
| sort 明示指定 | 指定どおり（セマンティックはフィルタとしてのみ作用） | 指定どおり |

## 6. 検証結果（2026-07-20）

- `make lint` / コンテナ内 `tsc --noEmit`: パス
- `make up-d` → バックエンド起動エラーなし。`/products/suggest` が新形状を返すこと、
  2文字未満で `{suggestions: [], products: []}` を返すことを curl で確認
- ホーム / `/?search=` の表示 200
- 既知の制約: コンテナ内 `next build` は Google Fonts（Noto Sans JP）へ到達できず失敗する
  （本改善と無関係の既存環境制約）。`useSearchParams` の Suspense 境界は実装済みだが
  本番ビルドでの静的検証は未実施

## 7. 非ゴール・見送り

- 専用の `/search` ページ化（ホーム内表示のままで十分と判断）
- サジェストへの人気キーワード・カテゴリ候補の追加（履歴で代替。必要になったら検討）
- 検索実行時の既存フィルタ維持（新しい検索でフィルタをリセットする現行挙動は一般的なECの慣習どおり）
