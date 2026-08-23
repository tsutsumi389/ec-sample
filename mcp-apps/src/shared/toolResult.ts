/**
 * ホストから届く CallToolResult の読み取り。
 *
 * CallToolResult の zod スキーマが passthrough（$loose）なので、_meta の型は
 * `{ [x: string]: unknown; ... }` になり、**_meta.ui は unknown として出てくる**。
 * これは型定義の不備ではなく正しい——Python 側が組んだ辞書がプロセス境界を越えて
 * 来るのだから、TypeScript が中身を知っているはずがない。**境界のここで1回だけ
 * 形を確かめて絞り、View 本体には絞り込み済みの型だけを渡す。** View のあちこちで
 * `as` を書かせないためにこのモジュールがある。
 */

import type { AppEventMap } from "@modelcontextprotocol/ext-apps/react";

import type { ProductUiMeta, SearchUiItem, SearchUiMeta } from "./types.ts";

/**
 * ホストが toolresult の通知 / callServerTool の戻り値で渡してくる結果の型
 * （= CallToolResult）。
 *
 * **`App["ontoolresult"]` から `Parameters<NonNullable<...>>` で削り出さないこと**——
 * あれは SDK が deprecated にしている setter であり、購読に使ってはならないものを型の
 * 取り出し口にすると、setter が消えた日に無関係な理由で壊れる。
 * `@modelcontextprotocol/sdk` から CallToolResult を直接 import しても同じ型になるが、
 * あれは ext-apps の推移的な依存なので参照しない（依存の向きを ext-apps 1本に見せる）。
 */
export type ToolResult = AppEventMap["toolresult"];

/**
 * structuredContent をオブジェクトとして取り出す。形が違えば null。
 *
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
 * 空配列は「UI 用データが無い＝画像もページURLも出せない」だけを意味し、検索結果
 * そのもの（structuredContent.items）とは無関係。カードは id で突き合わせるので、
 * items が空でも商品名・価格は描ける。
 *
 * 絞り込みに無名の `{ items?: unknown }` ではなく types.ts の SearchUiMeta を使うのは、
 * **backend の契約の写しを実際に使われる型にしておくため**——使われない型は
 * build_search_ui_items からずれても誰も気づけない。
 */
export function extractSearchUiItems(result: ToolResult): SearchUiItem[] {
  const ui = result._meta?.ui;
  if (typeof ui !== "object" || ui === null) return [];
  const items = (ui as Partial<SearchUiMeta>).items;
  return Array.isArray(items) ? items : [];
}

/** get_product の _meta.ui を取り出す。無ければ null（1件だけなので id の突き合わせは不要）。 */
export function extractProductUiMeta(result: ToolResult): ProductUiMeta | null {
  const ui = result._meta?.ui;
  return typeof ui === "object" && ui !== null ? (ui as ProductUiMeta) : null;
}

/**
 * エラー結果から画面に出す文言を取り出す。
 *
 * content はモデル向けの文面だが、サーバーが用意した文言を優先して**そのまま使う**。
 * get_product が存在しない product_id に返す "Product not found" は英語のまま素通し
 * される（backend の errors.py）が、**決め打ちの日本語に翻訳し直さないこと**——
 * 対応表を View に持ち込むと、backend が文言を足したとき View だけが古い訳を出し続ける。
 *
 * @param fallback content から取れなかったときの汎用文。View ごとに違うので引数で受ける。
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

/** callServerTool そのものが例外で終わったときの文言。**View に依存しないのでここが持つ。** */
export const NETWORK_ERROR_MESSAGE = "通信エラーが発生しました。もう一度お試しください。";

/** parseToolResult の結果。成功なら絞り込み済みの本体、失敗なら画面に出す文言。 */
export type ToolOutcome<T> =
  | { ok: true; data: T; result: ToolResult }
  | { ok: false; message: string };

/**
 * ツールの結果を「描けるもの」か「出す文言」かに振り分ける。**分岐（届かなかった /
 * isError / 形が違う）を View ごとに書かせないために、抽出関数と同じ層へ寄せてある。**
 *
 * `result` を成功側に添えて返すのは、_meta.ui の取り出し（extractSearchUiItems /
 * extractProductUiMeta）が呼び出し側で必要になるため。**`result` を握り直すために
 * 非 null アサーションを書かせないこと**がこの形の目的。
 *
 * @param messages missing = 結果そのものが届かなかった / fallback = isError だが
 *   content から文言を取れなかった / malformed = structuredContent の形が違う。
 *   サーバーが返した文言があればそちらが常に優先される（extractErrorMessage）。
 */
export function parseToolResult<T>(
  result: ToolResult | undefined,
  messages: { missing: string; fallback: string; malformed: string },
): ToolOutcome<T> {
  // 型の上では常に値が来ることになっているが、これはホストの実装を信じた型であって
  // 検査ではない。
  if (!result) return { ok: false, message: messages.missing };
  if (result.isError) {
    return { ok: false, message: extractErrorMessage(result, messages.fallback) };
  }
  const data = extractStructuredContent<T>(result);
  return data !== null ? { ok: true, data, result } : { ok: false, message: messages.malformed };
}
