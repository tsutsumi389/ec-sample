import type { Config } from 'tailwindcss';

/**
 * 生成りの紙。イラストの暖色クリームに合わせた独自ニュートラル。
 *
 * 面の階層は surface → page → sunken の3段しかないので、隣り合う2段の明度差が
 * 全ページの「段差が見えるか」を決める。
 *
 * ── r3 で明度設計をやり直した理由 ────────────────────────────────────────
 * 旧値は surface:page = 1.09 しかなく、明るい帯に置いたカードの輪郭（＝白い情報エリアと
 * ページ地の境目）が影だけに依存していた。副作用として ProductLane の端マスクが
 * 深緑帯では効くのに明るい帯では機能不全になっていた（マスクで抜いた先の地色が
 * カードとほぼ同じ明度なので、裁ち落としが「減衰していない」ように見える）。
 * surface を紙の白へ上げ、page を一段沈めて 1.09 → 1.21 に開いた。
 *
 * 実測（コントラスト比。WCAG の相対輝度で計算）:
 *   surface : page   = 1.21   （旧 1.09）
 *   page    : sunken = 1.23   （旧 1.22。逆転させないよう sunken も連動して沈めた）
 *   surface : sunken = 1.49
 *   surface : tile   = 1.16 / tile : page = 1.05
 *     ＝ 面の並びは surface > tile > page > sunken の4段。tile（商品SVGの地色）は
 *       変更できない固定値なので、page をその下に置いて「図版はカードの内側の一段」に
 *       なるよう並べ直している。
 *
 * ── この2段を動かすときの下限 ──────────────────────────────────────────
 * sunken をこれ以上沈めると ink-muted（washi-600）が対 sunken 4.5:1 を割る。
 * page をこれ以上沈めると page:sunken が 1.22 を割って段差が消える。
 * つまり surface:page はこの体系ではここが上限で、残りは影（shadow-paper）と
 * レーンの端マスク幅で補っている。
 */
const washi = {
  50:  '#FFFDFA', // surface: カード・パネル・ヘッダー（＝ white の置換値。純白ではなく暖色寄り）
  100: '#EFE7D5', // page: ページ地（対 surface 1.21:1 / 対 tile 1.05:1）
  200: '#DED1B5', // sunken: 扉帯・フィルタ帯・編集帯・スケルトン（対 page 1.23:1）
  300: '#D9CDB3', // line: ヘアライン（対 page 1.28:1 / 対 sunken 1.04:1 ＝ sunken 上では効かない）
  400: '#BCAE93', // line-strong: 罫・二次ボーダー（対 page 1.78:1 / 対 sunken 1.45:1）
  500: '#8F826B', // border-input / icon-faint（対 surface 3.84:1 = UI 3:1 合格 / AA は未達）
                  // ⚠ lib/selectChevron.ts の stroke がこの値を data URI に焼き込んでいる。動かすなら両方。
  600: '#605744', // ink-muted（対 page 5.80:1 / 対 surface 7.02:1 / 対 sunken 4.72:1 = 全面で AA 合格）
  700: '#524A3D', // 対 page 7.1:1
  800: '#3A342B', // ink-soft: 本文（対 page 10.0:1）
  900: '#221F19', // ink: 見出し（対 page 13.4:1）
};

/** ブランド。商品SVGの実測値と一致するため 50-900 は変更禁止。950 のみ追加。 */
const brand = {
  50:  '#F0F7F6',
  100: '#DCECEA',
  200: '#B9D9D5',
  300: '#8FC0BA',
  400: '#5FA19A',
  500: '#3D837B',
  600: '#2A6B63', // primary CTA（対 white 6.0:1）
  700: '#22574F', // CTA hover（対 white 8.0:1）
  800: '#1D463F',
  900: '#193A34',
  950: '#10251F', // 追加: 表紙・編集帯・奥付帯の地（対 washi-100 で 14.3:1）
};

/** 柿渋。#D97706 / #B45309 は商品SVGに実在する差し色。 */
const accent = {
  50:  '#FBF1E5',
  100: '#F6E2C9',
  200: '#EDCB9F',
  300: '#E0AC6B',
  400: '#D97706', // SVG実測色
  500: '#C86505',
  600: '#B45309', // SVG実測色。塗り・マーク用
  700: '#8F3F06', // テキスト用（対 accent-50 6.5:1）
  800: '#713205',
  900: '#582704',
};

/** 弁柄。エラー・削除のみ。 */
const critical = {
  50:  '#FBEDEA',
  100: '#F6DDD7',
  200: '#EFC9BF',
  300: '#E0A99C',
  400: '#C97463',
  500: '#B04B38',
  600: '#A03328', // 対 white 6.8:1
  700: '#7E2519',
  800: '#631D14',
  900: '#4A150E',
};

/** 成功。brand と同系にして色数を増やさない。 */
const success = {
  50:  '#EFF6F2',
  100: '#DCEBE3',
  200: '#B8D7C6',
  300: '#8DBDA3',
  400: '#5E9C7C',
  500: '#3F7D5D',
  600: '#31654A',
  700: '#27503B',
  800: '#1E3F2E',
  900: '#172F23',
};

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand,
        washi,
        accent,
        critical,

        // ── 機械的移行のためのエイリアス ───────────────────────────
        // 実測 gray-* 550箇所 / red-* 30ファイル。手作業置換は取りこぼすため
        // ここで丸ごと暖色体系に差し替える。個別クラスの書き換えは原則不要。
        white: washi[50],   // 純白を使わない。全カード・ヘッダーが生成り紙になる
        gray: {
          50:  washi[100],  // ページ地・hover（bg-gray-50 は本アプリでは「地」）
          100: washi[200],  // チップ地・画像タイルのフォールバック
          200: washi[300],  // ヘアライン
          300: washi[400],  // 二次ボーダー
          400: washi[500],  // アイコン・装飾（UI 3:1 合格）
          500: washi[600],  // 補助テキスト（AA 合格）
          600: washi[700],
          700: washi[800],
          800: '#2C2721',
          900: washi[900],
        },
        red: critical,    // エラー・必須マーク・削除を弁柄に吸収
        amber: accent,    // セール・在庫僅少を柿渋に吸収
        green: success,   // Badge の success を brand 同系に吸収
        purple: brand,    // 体系外の purple を brand に吸収
        // ──────────────────────────────────────────────────────

        // ── セマンティック ────────────────────────────────────────
        page:            washi[100],
        surface:         washi[50],
        // 沈んだ面。page との差は 1.23:1 しかないので、大きな帯では
        // `.edge-b`（globals.css）か border-line-strong で下端に線を1本置くこと。
        // border-line は対 sunken 1.04:1 でほぼ見えない。
        sunken:          washi[200],
        invert:          brand[950],
        // 商品SVGの地色。画像が載る面だけに使う。**public/products/*.svg の
        // 背景 rect と必ず同じ値にすること**（ずれると図版の四角い継ぎ目が出る）。
        // 旧値 #F5F4F1 は寒色のグレー白で、生成りの紙の上に置くと図版だけ色温度が違い、
        // カードの上半分と下半分が別の紙に見えていた。washi ランプの内側に引き込んで
        // 図版を紙の一部にしてある。r3 で page を沈めたので、いまの並びは
        // surface(#FFFDFA) > tile(#F2ECE1) > page(#EFE7D5) > sunken(#DED1B5)。
        // 図版はカードの内側の一段、カードはページ地の一段上、と読める。
        tile:            '#F2ECE1',
        line:            washi[300],
        'line-strong':   washi[400],
        'line-input':    washi[500],
        ink:             washi[900],
        'ink-soft':      washi[800],
        // 補助テキストの下限。プレースホルダ・キャプション・eyebrow はこれを使う。
        'ink-muted':     washi[600],
        // ⚠ 非テキスト装飾専用（罫・アイコン・区切り記号）。washi-500 は
        //   対 surface 3.84:1 / 対 page 3.17:1 で、UI 部品の 3:1 は満たすが
        //   **文字の AA 4.5:1 を満たさない**。
        //   text-ink-faint を「読ませる文字」に使わないこと。とくに
        //   placeholder:text-ink-faint は禁止（プレースホルダは globals.css の
        //   ::placeholder 既定＝ink-muted に任せ、クラスを書かない）。
        //   暗い地の上では逆に明るさが足りない（対 invert 4.26:1）ので on-dark-muted を使う。
        //   ⚠ 対 sunken は 2.58:1。沈んだ帯の上では区切り記号にも使わないこと。
        'ink-faint':     washi[500],
        'on-dark':       washi[100],
        'on-dark-muted': brand[200],
      },

      fontFamily: {
        sans:   ['var(--font-sans-jp)', 'Hiragino Kaku Gothic ProN', 'sans-serif'],
        mincho: ['var(--font-mincho)', 'Hiragino Mincho ProN', 'YuMincho', 'serif'],
        num:    ['var(--font-num)', 'var(--font-sans-jp)', 'sans-serif'],
      },

      // 既定の text-sm 等は温存したまま追加する（既存256箇所を壊さない）
      //
      // 見出し3段（h2 / h1 / display）は本アプリでは全て明朝で組む。明朝は palt が効かない
      // （globals.css §2 の実測コメント）ので、和文の全角送りに正のトラッキングを足すと
      // 字間が二重に開く。号数が上がるほど 1文字あたりの余りが大きいので、
      // display → h1 → h2 の順に締めた値を持たせる。
      // カタカナ語だけに残るアキは .kana（--kana-track）で別に詰める。
      // 明示的な tracking-* ユーティリティは letterSpacing プラグインが後に出力されるため
      // ここより後勝ちになる（縦組みの SignatureBand 等はそのまま効く）。
      fontSize: {
        eyebrow:  ['0.6875rem', { lineHeight: '1',    letterSpacing: '0.22em', fontWeight: '500' }],
        caption:  ['0.8125rem', { lineHeight: '1.7',  letterSpacing: '0.02em' }],
        body:     ['0.9375rem', { lineHeight: '1.85', letterSpacing: '0.02em' }],
        'body-lg':['1.0625rem', { lineHeight: '1.9',  letterSpacing: '0.015em' }],
        h3:       ['1.125rem',  { lineHeight: '1.55', letterSpacing: '0.005em', fontWeight: '500' }],
        h2:       ['clamp(1.5rem, 1.15rem + 1.4vw, 2rem)',      { lineHeight: '1.3',  letterSpacing: '0.01em',  fontWeight: '700' }],
        h1:       ['clamp(1.875rem, 1.4rem + 2vw, 2.5rem)',     { lineHeight: '1.25', letterSpacing: '0',       fontWeight: '700' }],
        // 900 は使わない。明朝は 700 のみ読み込んでおり、持たないウェイトを指定すると
        // ブラウザが合成ボールドで太らせて線が潰れる（layout.tsx のコメント参照）。
        display:  ['clamp(2.5rem, 1.6rem + 3.6vw, 4.25rem)',    { lineHeight: '1.12', letterSpacing: '-0.01em', fontWeight: '700' }],
        'num-lg': ['clamp(1.5rem, 1.2rem + 1.2vw, 2rem)',       { lineHeight: '1.1',  letterSpacing: '-0.01em', fontWeight: '700' }],
      },

      spacing: {
        13: '3.25rem', // btn lg の高さ 52px
      },

      boxShadow: {
        // 影は黒でなく washi-800 rgb(58,52,43) に着色する（冷たさを消す）
        // paper は「明るい面（page）に置いたカードの輪郭」を影だけで成立させる最小値。
        // r2 の 0 1px 2px/.05 + 0 1px 1px/.03 では接地が読めず、カード下半分が
        // ページ地に溶けていた。1段目を濃く、2段目を広げて設置面を作る。
        paper: '0 1px 2px rgba(58,52,43,.07), 0 2px 5px -1px rgba(58,52,43,.07)',
        lift:  '0 2px 6px rgba(58,52,43,.06), 0 14px 28px -12px rgba(58,52,43,.20)',
        float: '0 8px 24px rgba(58,52,43,.10), 0 28px 56px -20px rgba(58,52,43,.28)',
      },

      transitionDuration: {
        fast:   '120ms',
        base:   '180ms',
        slow:   '280ms',
        reveal: '480ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit:     'cubic-bezier(0.4, 0, 1, 1)',
      },

      // モーションの語彙。すべて globals.css §5 の prefers-reduced-motion ガードで無効化される。
      // 並びに段階を付けるときは親に `.stagger` を付ける（globals.css §3b）。
      //
      // ⚠ ここに置くのは「一度きり・不可逆」の動きだけ。**開いて閉じる／出て消える UI は
      //   keyframes ではなく transition で書くこと**（開閉の途中で向きを変えられる／
      //   出と消えでイージングを非対称にできる）。実装の所在:
      //     高さ 0⇄auto の展開 … globals.css の `.reveal`
      //     ドロワーと背面の膜 … components/Header.tsx（translate-x / opacity の transition）
      //     トースト          … lib/toast-context.tsx（ease-entrance ⇄ ease-exit）
      //   以前ここに置いていた fade-in / reveal / toast-in / toast-out / drawer-in / scrim-in は
      //   上の実装と二重定義で、どこからも参照されていなかったため削除した。
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'none' },
        },
        bump: {
          '0%':   { transform: 'scale(1)' },
          '35%':  { transform: 'scale(1.28)' },
          '100%': { transform: 'scale(1)' },
        },
        // 読み込み中のプレースホルダの呼吸。Tailwind 既定の animate-pulse
        // （2s / cubic-bezier(.4,0,.6,1) / opacity 1→.5）はこの体系の duration・easing の
        // どちらにも属さない唯一のモーションだったので、自前のトークンで置き換える。
        // 振れ幅を .55 までに留めるのは、沈んだ地（sunken）の上で「消えた」に見せないため。
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '.55' },
        },
      },
      animation: {
        rise: 'rise 480ms cubic-bezier(0.16,1,0.3,1) both',
        bump: 'bump 320ms cubic-bezier(0.2,0,0,1)',
        // 1.6s は --dur-* のどれでもない（4段はいずれも「一度きりの状態遷移」の尺で、
        // 反復には短すぎる）。反復モーションはこの1本だけに閉じ、ease は standard を使う。
        breathe: 'breathe 1.6s cubic-bezier(0.2,0,0,1) infinite',
      },

      ringColor:       { DEFAULT: brand[600] },
      ringOffsetColor: { DEFAULT: washi[50] },
    },
  },
  plugins: [],
};

export default config;
