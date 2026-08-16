/**
 * 表示用の純関数。両 View に同じものが重複していたので括った。
 *
 * ここに置いてよいのは「サーバーから来た値を表示の形に整えるだけ」の処理に限る。
 * **在庫・販売状態から文言を組み立てる関数を足さないこと**——availability の文言は
 * backend の services/cart.py が唯一の源であり、View はそれをそのまま出す。
 */

/** 金額表示。両 View 共通で "¥12,800" の形にする。 */
export function formatYen(amount: number): string {
  return "¥" + amount.toLocaleString("ja-JP");
}

/**
 * 評価表示。レビューが1件も無い商品は avg_rating が null で届く。
 * 「★ 0.0（0件）」ではなく「レビューなし」と出すのが現行の見せ方。
 */
export function formatRating(avgRating: number | null, reviewCount: number): string {
  return avgRating != null ? `★ ${avgRating.toFixed(1)}（${reviewCount}件）` : "レビューなし";
}

/**
 * ツール引数の「指定なし」を落とす。空文字・undefined・null は引数から消える。
 *
 * **0 を落とさないこと。** min_price=0 は「0円以上」という有効な指定であり、
 * `value || undefined` や `value ?? undefined` に書き換えると 0 と "" を同一視して
 * （前者）、あるいは "" を残して（後者）壊れる。三項の条件をそのまま保つこと。
 *
 * 今のところ使うのは search の doSearch だけだが、この落とし穴ごと1か所に
 * 閉じ込めておきたいので shared に置いてある。
 */
export function toArg<T extends string | number>(value: T | null | undefined): T | undefined {
  return value === undefined || value === null || value === "" ? undefined : value;
}

/**
 * ツール引数（ontoolinput が渡す Record<string, unknown>）から文字列だけを受け取る。
 * 型が違えば「指定なし」として落とす。
 *
 * 引数は backend 側（tools.py のシグネチャ）で検証済みなので、実際には想定外の型が
 * 届くことは無い。それでも素通しにしないのは、**中身を確かめずに信じると型の上だけ
 * 安全な嘘になる**ため。両 View の ontoolinput が同じ規律で読むよう、read* は
 * View 側に書かず必ずここを通すこと。
 */
export function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 同上、数値版（min_price / max_price / page / limit / product_id）。 */
export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
