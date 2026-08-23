/**
 * JS から幅を判定するときのメディアクエリ。**Tailwind の `screens` 既定値と一致させること**
 * （`tailwind.config.ts` に `screens` の上書きは無いので、`sm:` `xl:` はこの数と同じ）。
 *
 * 1本にまとめてあるのは、同じ数が離れた2箇所で「一致していること」を前提にされているため。
 * `xl` は Header のオフキャンバス・ドロワーが消える境界（`xl:hidden`）であり、同時に
 * アシスタントがサイドバーとして接岸する境界でもある。片方だけ動かすと 1024〜1279px で
 * ドロワー（`fixed inset-0 z-[55]`）がサイドバーの真上に開く。
 */
export const MQ_SM = '(min-width: 640px)';
export const MQ_XL = '(min-width: 1280px)';
