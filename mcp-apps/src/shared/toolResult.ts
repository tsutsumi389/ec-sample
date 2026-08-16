/**
 * ホストから届く CallToolResult の読み取り。両 View で完全に重複している処理。
 *
 * **_meta（アンダースコア付き）が CallToolResult の実際のプロパティ名。**
 * 移植前の View にはこれを「型定義のズレを疑って実測した結論」と書いてあったが、
 * あれは SDK を vendor バンドル（globalThis.__McpAppSdk）から読んでいた
 * ＝型が一切無かった時代の事情。npm 依存にした今は spec.types.d.ts の
 * McpUiToolResultNotification が params: CallToolResult と宣言しており、_meta は
 * 型の上でも正式に存在する。
 *
 * ただし CallToolResult の zod スキーマが passthrough（$loose）なので、_meta の型は
 * `{ [x: string]: unknown; ... }` になり、**_meta.ui は unknown として出てくる**。
 * これは型定義の不備ではなく正しい——Python 側が組んだ辞書がプロセス境界を越えて
 * 来るのだから、TypeScript が中身を知っているはずがない。**境界のここで1回だけ
 * 形を確かめて絞り、View 本体には絞り込み済みの型だけを渡す。** View のあちこちで
 * `as` を書かせないためにこのモジュールがある。
 */

import type { App } from "@modelcontextprotocol/ext-apps/react";

import type { ProductUiMeta, SearchUiItem, SearchUiMeta } from "./types.ts";

/**
 * ホストが toolresult の通知 / callServerTool の戻り値で渡してくる結果の型
 * （= CallToolResult）。
 *
 * 型の取り出し口に `App["ontoolresult"]`（deprecated な setter）を使っているのは、
 * **型がそこにしか現れないから**であって、購読の仕方の話ではない（購読は
 * `addEventListener("toolresult", ...)` を使う。理由は shared/host.ts のコメント）。
 *
 * `@modelcontextprotocol/sdk` から CallToolResult を直接 import しても同じ型になるが、
 * SDK は ext-apps の都合で入っている推移的な依存なので、mcp-apps 側のソースからは
 * 参照しない（依存の向きを ext-apps 1本に見せておく）。
 */
export type ToolResult = Parameters<NonNullable<App["ontoolresult"]>>[0];

/**
 * structuredContent をオブジェクトとして取り出す。形が違えば null。
 *
 * 呼び出し側が期待する型（ProductSearchResult / ProductDetail）を型引数で渡す。
 * **ここが唯一のキャスト地点**——中身のフィールドまでは検査しない（backend の
 * pydantic モデルが出力を保証しており、二重に検査しても片方が古くなるだけ）。
 */
export function extractStructuredContent<T>(result: ToolResult): T | null {
  const data = result.structuredContent;
  return data && typeof data === "object" ? (data as T) : null;
}

/**
 * search_products の _meta.ui.items を取り出す。無ければ空配列。
 *
 * 空配列を返すのは「UI 用データが無い＝画像もページURLも出せない」だけを意味し、
 * 検索結果そのもの（structuredContent.items）とは無関係。カードは id で突き合わせる
 * ので、items が空でも商品名・価格は描ける。
 *
 * 絞り込みの型に types.ts の SearchUiMeta を使う（無名の `{ items?: unknown }` を
 * 書かない）。**backend の契約の写しを、実際に使われる型にしておくため**——
 * 使われない型は build_search_ui_items からずれても誰も気づけない。
 */
export function extractSearchUiItems(result: ToolResult): SearchUiItem[] {
  const ui = result._meta?.ui;
  if (typeof ui !== "object" || ui === null) return [];
  const items = (ui as Partial<SearchUiMeta>).items;
  return Array.isArray(items) ? items : [];
}

/**
 * get_product の _meta.ui を取り出す。無ければ null。
 *
 * 商品詳細は1件だけなので、search のような id による突き合わせは要らず、
 * _meta.ui をそのままオブジェクトとして読む。
 */
export function extractProductUiMeta(result: ToolResult): ProductUiMeta | null {
  const ui = result._meta?.ui;
  return typeof ui === "object" && ui !== null ? (ui as ProductUiMeta) : null;
}

/**
 * エラー結果から画面に出す文言を取り出す。
 *
 * content はモデル向けの文面だが、この画面では読める形の日本語エラー文として
 * **そのまま使う**。View 側で「買えない理由」を作文しないのと同じ理由で、
 * サーバーが用意した文言を優先する。get_product が存在しない product_id に対して
 * 返す "Product not found" は英語のまま素通しされる（backend の errors.py 参照）が、
 * **決め打ちの日本語に翻訳し直さないこと**——メッセージの対応表を View に持ち込むと、
 * backend が文言を足したときに View だけが古い訳を出し続ける。
 *
 * @param fallback content から取れなかったときの汎用文。View ごとに違う
 *   （検索は「検索に失敗しました。もう一度お試しください。」、詳細は
 *   「商品情報を取得できませんでした。」）ので引数で受け取る。
 */
export function extractErrorMessage(result: ToolResult, fallback: string): string {
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block && block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        return block.text;
      }
    }
  }
  return fallback;
}
