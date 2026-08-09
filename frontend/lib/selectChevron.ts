/**
 * <select> を appearance-none にしたときに背景画像として敷く自前シェブロン。
 *
 * stroke は line-input（washi-500 = #8F826B）の暖色ヘアラインに合わせてある。
 * ブラウザ既定の矢印は冷たいグレーで、生成りの面の上だけ色が浮くため全画面でこれを使うこと。
 */
export const SELECT_CHEVRON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238F826B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m19.5 8.25-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E";

/**
 * シェブロンを敷くための伴走クラス。画像だけを配って寸法・位置・右パディングを
 * 呼び出し側に任せていたため、4箇所が3通り（任意値クラス2種・style オブジェクト1種）に
 * 割れていた。矢印の大きさや位置を変えるときはここ1箇所を直す。
 *
 * 使い方: `className={`${fieldBase} ${SELECT_CHEVRON_CLASS}`}` ＋
 *         `style={{ backgroundImage: `url("${SELECT_CHEVRON}")` }}`
 */
export const SELECT_CHEVRON_CLASS =
  'appearance-none bg-no-repeat bg-[length:1rem_1rem] bg-[right_0.625rem_center] pr-9';
