/**
 * <select> を appearance-none にしたときに背景画像として敷く自前シェブロン。
 *
 * stroke は line-input（washi-500 = #8F826B）の暖色ヘアラインに合わせてある。
 * ブラウザ既定の矢印は冷たいグレーで、生成りの面の上だけ色が浮くため全画面でこれを使うこと。
 * 併せて `appearance-none bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem_1rem]` と
 * 右パディング（pr-9 以上）を指定する。
 */
export const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238F826B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m19.5 8.25-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E";
