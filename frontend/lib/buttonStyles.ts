/**
 * ボタンの見た目を統一するための共通クラス文字列。
 * 使い方: <button className={btn('primary', 'lg')}>購入する</button>
 * 幅などを足す場合は `${btn('primary', 'lg')} w-full` のように連結する。
 *
 * 規律:
 * - brand 塗り（primary）は各ページの最重要 CTA のみに使うこと。
 * - onDark は深緑帯（bg-invert）の上に置くボタン専用。
 * - サイズは md（44px）が既定。sm は .hit で実効44pxを確保する。
 */

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'onDark' | 'danger' | 'field';
export type BtnSize = 'sm' | 'md' | 'lg';

/**
 * 無効のときに全てのボタンが捨てるもの。
 * 影は「押せる＝浮いている」の合図なので必ず落とし、hover/active は当たり判定ごと切る。
 * 不透明度は使わない（下の DISABLED_FACE のコメントを参照）。
 */
const DISABLED_BASE = 'disabled:shadow-none disabled:pointer-events-none';

/**
 * 無効の「面」（文字を持つボタン用）。
 *
 * 以前は disabled:opacity-50 だけで、押せないことを不透明度に丸投げしていた。
 * 半透明は前景と背景を同じだけ地色へ寄せるので、文字と面の差そのものが縮む
 * （実測: ページ送りの無効「前へ」= 2.87:1）。無効は色を薄めるのではなく
 * **沈んだ面（sunken）＋ ink-muted（対 sunken 4.72:1 = AA）** という別の面で表す。
 * ・border-line … 罫も1段淡い方（line）へ。罫を持たない variant では無害。
 */
const DISABLED_FACE = 'disabled:bg-sunken disabled:text-ink-muted disabled:border-line';

/**
 * 無効のアイコンボタン（iconBtn）。
 *
 * こちらは面を**塗らない**。地を持たない小さな丸に沈んだ面を敷くと、無効なほうが
 * 有効なボタンより目立つ（実測: 商品詳細の数量「−」が数量 1 のとき、隣の「＋」より
 * 強い塊に見えていた）。線画1本の記号なので、弱め方は線の濃度でよい。
 * ink-faint は「読ませる文字には使わない」トークンだが、ここは記号かつ
 * 操作できない状態なので当てはまらない（対 surface 3.84:1）。
 */
const DISABLED_ICON = 'disabled:bg-transparent disabled:text-ink-faint';

/**
 * フォーカスの輪。btn/iconBtn/chip の全系統で同じものを使う。
 * キーボードの現在地の目印は造形の系統によらず同じであるべきで、片方だけ色や offset が
 * 動いても focus 中にしか出ないため目視では気づけない（だから写しを作らず定数で配る）。
 */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap ' +
  'transition-[background-color,box-shadow,transform,color] duration-fast ease-standard ' +
  'active:scale-[0.98] motion-reduce:active:scale-100 ' +
  `${DISABLED_BASE} ${FOCUS_RING}`;

const SIZES: Record<BtnSize, string> = {
  sm: 'hit h-9 px-4 text-caption rounded-md',   // .hit で実効44px
  md: 'h-11 px-5 text-body rounded-md',         // 44px（既定）
  lg: 'h-13 px-8 text-body-lg rounded-lg',      // 52px
};

const VARIANTS: Record<BtnVariant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 shadow-paper hover:shadow-lift',
  secondary: 'bg-surface text-ink-soft border border-line-strong hover:bg-sunken',
  ghost:     'bg-transparent text-ink-soft hover:bg-sunken',
  onDark:    'bg-washi-50 text-brand-700 hover:bg-white shadow-paper', // 深緑帯の上
  // 破壊的操作（削除・キャンセルの確定）専用。弁柄。primary と同じ寸法で並べられる。
  danger:    'bg-critical-600 text-white hover:bg-critical-700 shadow-paper hover:shadow-lift',
  // 入力欄と**同じ行**に並ぶ二次ボタン（絞り込みの「適用」・クーポンの「適用する」）専用。
  // secondary の罫は line-strong（対 surface 1.76:1）で、隣の input の line-input（3.65:1）より
  // 2段淡く、押せるボタンだけが無効化されて見えていた。同じ行の罫の濃度を1つに揃えるための面。
  field:     'bg-surface text-ink-soft border border-line-input hover:bg-sunken',
};

export function btn(variant: BtnVariant = 'primary', size: BtnSize = 'md') {
  return `${BASE} ${DISABLED_FACE} ${SIZES[size]} ${VARIANTS[variant]}`;
}

export function iconBtn(size: BtnSize = 'md') {
  const box = { sm: 'hit h-9 w-9', md: 'h-11 w-11', lg: 'h-13 w-13' }[size];
  return `${BASE} ${DISABLED_ICON} ${box} rounded-full text-ink-soft hover:bg-sunken`;
}

/**
 * 丸ピル。アシスタントのサジェスト chip・カテゴリ chip・行き止まりの次の一手と、
 * 提案カードの操作行（「商品を見る」「カートに追加」）、入力欄の送信ボタンを同じ造形で揃える
 * （同じ「次の一手」なのに見えが割れると、押せる部品と分からない）。
 *
 * btn() とは別系統。あちらは rounded-md の角丸と固定高（h-9/h-11/h-13）の体系で、
 * ピルの丸みと「モバイル44px / デスクトップは詰める」の寸法をここへ持ち込むと
 * 呼び出し側が6つも上書きすることになる。造形が違うものは別の関数で持つ。
 *
 * outline の罫は brand-500（対 surface 4.37:1 / 対 page 3.61:1）。brand-200 は
 * 対 surface 1.48:1 で地との差が 1.21 しかなく、押せる部品の輪郭として成立しない
 * （WCAG 1.4.11 は 3:1 が下限）。この根拠をここ1箇所に置くために切り出してある——
 * 以前は同じ12トークンが AssistantPanel と AssistantProductCard に写されており、
 * 濃度を見直すときに揃って直る保証が無かった。
 *
 * tone … outline: 生成りの面＋brand の罫 / solid: brand 塗り（行の中で1つだけ）。
 */
export function chip(
  size: 'chip' | 'action' | 'icon' = 'chip',
  tone: 'outline' | 'solid' = 'outline',
) {
  const box = {
    // 語幅ぶんだけ取る小さな粒（wrap して並ぶ）。
    chip: 'min-h-[44px] shrink-0 px-3.5 py-1.5 text-caption sm:min-h-0',
    // 操作行に flex-1 で並ぶ粒。記号と語の間隔（gap）はここで握らない——呼び出しごとに
    // 割れる値なうえ、同一プロパティのユーティリティは連結順ではなく生成順で勝敗が決まるので、
    // 呼び出し側の上書きが黙って効かなくなる（fieldBase が角丸を握らないのと同じ理由）。
    action: 'min-h-[44px] px-3 text-body font-medium sm:min-h-0 sm:py-2',
    // 記号1つの丸（送信ボタン）。寸法を固定するので min-h の段差は要らない。
    icon: 'h-11 w-11 shrink-0',
  }[size];
  const face =
    tone === 'outline'
      ? 'border border-brand-500 bg-surface text-brand-700 hover:bg-brand-50'
      : 'bg-brand-600 text-white hover:bg-brand-700 ' +
        // 無効の面は2通りの止め方に効かせる。disabled 属性で止めるボタン（カートに追加）と、
        // フォーカスを残すため aria-disabled で止めるボタン（送信）が同じ見えになるように。
        'disabled:cursor-not-allowed disabled:bg-line-strong ' +
        'aria-disabled:cursor-not-allowed aria-disabled:bg-line-strong';
  return (
    'inline-flex items-center justify-center whitespace-nowrap rounded-full ' +
    `transition-colors duration-fast ease-standard ${FOCUS_RING} ${face} ${box}`
  );
}

/**
 * ヘッダーの常設ナビの丸ピル。
 *
 * btn() は rounded-md の文字ボタン、chip() は「次の一手」の粒で、どちらも
 * 『h-16 の行に収まる丸ピル・アイコン単独にもラベル付きにもなる・現在地を持つ』
 * という寸法と状態集合を持たない。chip() が btn() と別系統なのと同じ理由でここに
 * 1本置き、BASE は継がず FOCUS_RING だけを共有する。
 *
 * tone は造形ではなく**役割**で、これがそのまま導線の階層になる:
 *   quiet   面を持たない記号の導線（商品一覧・カート・注文履歴・お気に入り・アカウント・管理画面）
 *   plain   面も罫も持たない文字だけの副の手続き（ログイン）
 *   cta     brand の罫を持つ主CTA（会員登録）。hover で塗りへ反転する
 *
 * ⚠ cta に brand 塗り（bg-brand-600）を当てないこと。このファイル冒頭の規律どおり
 *   brand 塗りは各ページの最重要CTA専用で、ヘッダーは全ページ共通の器のため、
 *   PDP の「カートに追加」等と同一画面に塗りが2つ立つ。罫（brand-500 対 surface 4.37:1）
 *   ＋号数を1段上げる＋shadow-paper で1段上を作り、押した感触は hover の反転が返す。
 * ⚠ quiet に**常設の**面を塗らないこと。塗るとカートの数取りバッジの ring-2 ring-surface
 *   （地色で籠の線を punch out する輪）が地と食い違い、意味のない縁になる。
 *   hover / 現在地の一瞬だけは許容している（ポインタを乗せている間しか出ないので、
 *   輪の食い違いに気づく前に離れる）。常時その面に居る状態を作らないこと。
 * ⚠ label:'xl'（アイコンのみに畳む形）に plain / cta を渡さないこと。
 */
export type NavTone = 'quiet' | 'plain' | 'cta';

/**
 * 現在地の印。ピルの**外**＝ヘッダーの地（surface）の上に 3px の罫を出す。
 * 幾何: ピル h-11(44px) は行 h-16(64px) の中で上下 10px 余るので、-bottom-2.5(=10px)
 * で罫の下端が行の下端に乗り、border-b の直上に貼りつくタブ状の印になる。
 * position:absolute なのでレイアウトに寄与せず h-16 も --header-h も動かない。
 * 罫は常に surface の上に出るので tone を問わず brand-600 対 surface 6.12:1 で読める
 * （以前の bg-brand-50 は対 surface 1.07:1 で、現在地の合図として成立していなかった）。
 * ⚠ <header> の箱に overflow-hidden を足さないこと（この 3px が裁ち落とされ、
 *   現在地が無言で消える）。
 * ⚠ relative はピル自身に付く。カートバッジの包含ブロックはより内側の
 *   cartIconWithBadge() の span なので影響しない。
 */
export const NAV_ACTIVE_BAR =
  "relative after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-2.5 " +
  "after:h-[3px] after:rounded-t-full after:bg-brand-600 after:content-['']";

export function navPill(
  tone: NavTone = 'quiet',
  opts: { active?: boolean; label?: 'always' | 'xl' } = {},
) {
  const { active = false, label = 'xl' } = opts;
  // 同一プロパティ（px-* / text-* / font-*）を base と face の両方から出さない。
  // ユーティリティは連結順ではなく生成順で勝敗が決まるため、二重に出すと
  // 「書いたほうが効いている」という思い込みだけが残る（btn('ghost') に足された
  // font-normal が font-medium に負けていたのがその実例）。号数は box が、
  // ウェイトは face が、それぞれ排他的に持つ。
  const box =
    label === 'always'
      ? tone === 'cta'
        ? 'h-11 px-4 text-body'
        : 'h-11 px-3 text-caption'
      : 'h-11 w-11 px-0 text-caption xl:w-auto xl:px-3';
  // active にも hover を持たせる。btn/iconBtn/chip は例外なくポインタに反応するので、
  // 現在地のときだけ無反応だと「この項目はもう押せない」に読める（実際は押せる）。
  const face = {
    quiet: active
      ? 'bg-transparent font-semibold text-brand-700 hover:bg-sunken'
      : 'bg-transparent font-medium text-ink-soft hover:bg-sunken hover:text-ink',
    plain: active
      ? 'bg-transparent font-semibold text-brand-700 hover:bg-sunken'
      : 'bg-transparent font-medium text-ink-muted hover:bg-sunken hover:text-ink-soft',
    cta: active
      ? 'border border-brand-600 bg-surface font-semibold text-brand-700 shadow-paper hover:bg-brand-50'
      : 'border border-brand-500 bg-surface font-medium text-brand-700 shadow-paper ' +
        'hover:border-brand-600 hover:bg-brand-600 hover:text-white hover:shadow-lift',
  }[tone];
  return (
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full ' +
    'transition-[background-color,border-color,box-shadow,color] duration-fast ease-standard ' +
    `${FOCUS_RING} ${box} ${face} ${active ? NAV_ACTIVE_BAR : ''}`
  );
}

/* ── 後方互換（既存の25箇所超の呼び出しを壊さない） ── */
/** 最重要CTA用: brand 塗り */
export const btnPrimary   = btn('primary', 'md');
/** 二次アクション用: 生成り背景 + ボーダー */
export const btnSecondary = btn('secondary', 'md');
/** アイコン単体ボタン用: 正方形・円形・hover で薄い背景 */
export const iconButton   = iconBtn('md');   // 40px → 44px に引き上げ
