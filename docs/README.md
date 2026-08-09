# ドキュメント索引

Hibino EC（Next.js 14 + FastAPI + PostgreSQL 16）のドキュメント一覧。

## system-design/ — システム設計書（HTML）

コードベースの構造化分析に基づく統合設計書。全 11 章。ブラウザで [`system-design/index.html`](system-design/index.html) を開くと目次から各章へ辿れる。

| 章 | ドキュメント | 内容 |
| --- | --- | --- |
| — | [index.html](system-design/index.html) | 表紙と全章の目次 |
| 01 | [01-overview.html](system-design/01-overview.html) | 本書の目的・対象読者・範囲 |
| 02 | [02-system.html](system-design/02-system.html) | システム概要と業務ドメインの位置づけ |
| 03 | [03-tech-stack.html](system-design/03-tech-stack.html) | 採用技術スタックと選定理由 |
| 04 | [04-architecture.html](system-design/04-architecture.html) | 3 層 + Ollama 連携のアーキテクチャ全体像 |
| 05 | [05-data-model.html](system-design/05-data-model.html) | エンティティ・テーブル定義・状態遷移 |
| 06 | [06-api.html](system-design/06-api.html) | `/api` 配下の全エンドポイントと認可レベル |
| 07 | [07-flows.html](system-design/07-flows.html) | 検索・カート・注文など主要処理フロー |
| 08 | [08-ai.html](system-design/08-ai.html) | 埋め込み生成・ハイブリッド検索・商品 Q&A の設計 |
| 09 | [09-auth.html](system-design/09-auth.html) | JWT 認証とロールベースの認可設計 |
| 10 | [10-frontend.html](system-design/10-frontend.html) | App Router 構成・コンポーネント分割・状態管理 |
| 11 | [11-decisions.html](system-design/11-decisions.html) | 設計上の決定と、コードに現れない運用ルール |

スタイル・スクリプトは `system-design/assets/`（`design.css` / `design.js`）に共通化されている。

## design/ — 機能設計書（HTML）

機能単位の設計書。ブラウザで [`design/index.html`](design/index.html) を開くと 3 文書の索引から辿れる。

- [design/index.html](design/index.html) — 表紙と 3 文書の索引。
- [design/ai-assistant.html](design/ai-assistant.html) — 全ページ常駐のチャット型ショッピングアシスタント「Hibinoの店員AI」の設計。
- [design/search-uiux.html](design/search-uiux.html) — 商品検索の UI/UX 改善（IME 対応・サジェスト・関連度順・モバイルドロワー）の設計。
- [design/feature-additions.html](design/feature-additions.html) — 一般的な EC 標準機能を拡充するための機能追加設計と実装分担。

スタイル・スクリプトは system-design と共通の `system-design/assets/` を参照する。

## operations/ — 運用フロー書（HTML）

管理者が実際に手を動かしている運用手順を、実装から読み取って書き起こした現状（As-Is）の記録。全 8 章。ブラウザで [`operations/index.html`](operations/index.html) を開くと目次から各章へ辿れる。改善提案は含まない。

| 章 | ドキュメント | 内容 |
| --- | --- | --- |
| — | [index.html](operations/index.html) | 表紙と全章の目次 |
| 01 | [01-overview.html](operations/01-overview.html) | 登場人物と権限、管理画面の地図、できること・できないことの総覧 |
| 02 | [02-product.html](operations/02-product.html) | 商品ライフサイクル（6 状態・登録フォーム・削除＝アーカイブ・カテゴリ） |
| 03 | [03-inventory-price.html](operations/03-inventory-price.html) | 在庫と価格（在庫更新の唯一の経路・欠品対応・セールの開始と終了） |
| 04 | [04-order.html](operations/04-order.html) | 受注〜出荷〜完了（ステータス運用・キャンセル 2 経路と在庫戻し） |
| 05 | [05-coupon.html](operations/05-coupon.html) | クーポン運用（発行・割引計算・停止と失効・回数制限の不在） |
| 06 | [06-experiment.html](operations/06-experiment.html) | A/Bテスト運用（企画→開始→監視→判定→終了、結果の読み方） |
| 07 | [07-quality.html](operations/07-quality.html) | カタログ品質と顧客接点（埋め込み更新・レビュー・Q&A・ユーザー管理） |
| 08 | [08-gaps.html](operations/08-gaps.html) | 画面が無い作業（DB 直操作・API 直叩き）と落とし穴の一覧 |

スタイル・スクリプトは system-design と共通の `system-design/assets/` を参照する。

## api/ — API 仕様

- [api/new-features.md](api/new-features.md) — 追加機能で新設したバックエンド API の一覧・認可・入出力仕様。

## evaluation/ — 評価基準

- [evaluation/design.md](evaluation/design.md) — デザイン性（美的品質・造形の洗練度）の評価基準（100 点満点、実画面ベース）。
- [evaluation/uiux.md](evaluation/uiux.md) — UI/UX の評価基準（100 点満点、コードレビューによる静的評価）。
- [evaluation/uiux-visual.md](evaluation/uiux-visual.md) — UI/UX の評価基準（100 点満点、実画面スクリーンショットベース）。
