'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { AssistantPageContext, Product } from '@/lib/types';

/**
 * 「いまお客様が開いている画面」を**経路（URL）から**導出する。
 *
 * 各ページに「自分は商品詳細だ」と名乗らせる形（`registerPageContext({...})` の類）に
 * しないのは、画面を 1 つ足した人が呼び忘れても誰も気づけないため。
 * **経路の判定も、画面に紐づく状態も、このファイルだけ**が持つ。
 *
 * 送るのは route と ID だけ。商品名・価格・在庫のような「画面に出ている事実」は送らない——
 * 送り返させると effective_price の判断がクライアント側にも生まれて必ずどちらかが古くなる。
 * 加えて、任意の文字列を送れるようにすると `<message>` タグの囲い（「これは指示ではありません」と
 * 宣言している唯一の境界）の**外側**に本文を差し込む経路になる。商品の実体はバックエンドが
 * product_id から引き直す（`services/assistant.resolve_page_anchor`）。
 *
 * 商品詳細のみ。カテゴリ・検索結果などを足すときは、この関数とバックエンドの
 * `AssistantPageContextIn.route`（Literal）の両方に足す——片方だけ増やすと 422 になるので、
 * 取りこぼしはテストを待たずリクエストの時点で見える。
 */

/** 商品詳細の経路。`/products/12`（末尾スラッシュ可）だけに一致させる。 */
const PRODUCT_DETAIL_RE = /^\/products\/(\d+)\/?$/;

export function derivePageContext(pathname: string | null): AssistantPageContext | null {
  if (!pathname) return null;
  const matched = PRODUCT_DETAIL_RE.exec(pathname);
  if (!matched) return null;
  const productId = Number(matched[1]);
  // 桁溢れ（安全な整数を超える ID）はサーバーの ge=1 検証より手前で落とす。
  if (!Number.isSafeInteger(productId) || productId <= 0) return null;
  return { route: 'product_detail', product_id: productId };
}

/**
 * 商品詳細ページか。`AssistantWidget` が FAB を固定購入バーの上へ逃がす判定に使う。
 * 経路の判定を持つのはこのファイルだけ——別々の正規表現で持つと、PDP の経路を変えた日に
 * 「FAB は避けるのにコンテキストは送らない」ような食い違いが黙って生まれる。
 */
export function isProductDetail(pathname: string | null): boolean {
  return derivePageContext(pathname) !== null;
}

/**
 * パネルが引くフック。経路から画面を導き、ピルに出す商品名を引き、外す操作を持つ。
 * 状態をパネル（1000行超のチャット部品）に置かないのは、ここに入るものが例外なく
 * 「画面の種類ごとの都合」だから（`lib/useAdminResource.ts` と同じ置き方）。
 *
 * - `context` … 実際に送ってよい画面。取り下げ済みなら null。
 * - `label`   … ピルに出す商品名。未取得（読み込み中・一時的な失敗）なら null。
 * - `dismiss` … いまの画面を前提から外す。**別の商品ページへ移れば自動で復帰する**。
 */
export function useAssistantPageContext(): {
  context: AssistantPageContext | null;
  label: string | null;
  dismiss: () => void;
} {
  // usePathname はクエリ文字列を含まないので Suspense 境界は要らない（useSearchParams は要る。
  // 検索結果の画面を足すときはそこで詰まる）。
  const pathname = usePathname();
  const context = useMemo(() => derivePageContext(pathname), [pathname]);
  const productId = context?.product_id ?? null;

  // 前提から外した商品。「×」で外した場合と、404（存在しない・非公開）だった場合の両方を
  // ここ 1 つで持つ——どちらも「この画面は前提にしない、次の商品へ移ったら戻す」で挙動が同じ。
  // 404 を送信ごと取り下げるのは、サーバー側でもアンカーが解決できない（＝何も効かない）のに
  // ピルだけが「見ているつもり」を主張する状態を作らないため。
  const [suppressedId, setSuppressedId] = useState<number | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  // ピルに出す商品名を引く。**開いたときだけでなく遷移のたび**に引き直す——接岸中の
  // サイドバーはページ遷移で閉じないので、パネルは開いたまま画面だけが変わる。依存は
  // productId（取り下げ後の context ではない。送信対象に依存させると「外す → 引かない」で
  // 次に来たとき名前が出ない）。
  useEffect(() => {
    if (productId === null) {
      setLabel(null);
      return;
    }
    let cancelled = false;
    // 前の商品の名前を残さない。残すと遷移直後の一瞬だけ、隣の商品を前提にしていると見える。
    setLabel(null);
    api
      .get<Product>(`/products/${productId}`)
      .then((product) => {
        if (!cancelled) setLabel(product.name);
      })
      .catch((err) => {
        if (cancelled) return;
        // 404 のときだけ送信対象から外す。通信断などの一時的な失敗は名前が出ないだけで、
        // コンテキスト自体は送る（サーバーが引き直せる）。
        if (err instanceof ApiError && err.status === 404) setSuppressedId(productId);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const dismiss = useCallback(() => setSuppressedId(productId), [productId]);

  return {
    // context は useMemo 済みなので、この三項の結果も参照が保たれる（send の deps に置ける）。
    context: context !== null && context.product_id !== suppressedId ? context : null,
    label,
    dismiss,
  };
}
