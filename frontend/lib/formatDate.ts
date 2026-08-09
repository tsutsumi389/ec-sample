/**
 * 日時の表示整形。
 *
 * `new Date(iso).toLocaleString('ja-JP')` が8箇所に散っていた（うち1箇所だけが
 * null を「—」に畳むローカル関数を持ち、他は素の式のまま）。表記の粒度を変えたいとき
 * ——年を省く、時刻を落とす、`Intl.DateTimeFormat` に寄せる——に回る場所を1つにする。
 *
 * ⚠ 整形は必ずクライアントで行う。サーバー描画とタイムゾーンが食い違うと hydration が
 *   ずれるため、これを使う画面は 'use client' 側に置くこと（現在の呼び出し元はすべてそう）。
 */

/** 日時（年月日＋時刻）。null・undefined・空文字は「—」に畳む。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ja-JP');
}
