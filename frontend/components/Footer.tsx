import Link from 'next/link';
import { KettleMotif, CupMotif, PlantMotif } from '@/components/BrandMotifs';

/** リンクの当たり判定は .hit（::after で上下左右 6px 広げる）で確保する。
 *  min-h-11 で背を伸ばすと 390px のフッターがさらに縦に伸びるため、
 *  版面の高さを変えずにタップ領域だけを広げる方式にする。
 *  実測: 文字丈 28px ＋ py-0.5(4px) ＝ 32px、.hit の ±6px を足して **44px**。
 *  py-0.5 を外すと 40px になり 44px を割るので消さないこと。
 *  隣の項目と当たり判定が重ならないよう、リストの行間は space-y-3（12px = 6px×2）に取る。 */
const footerLinkClass =
  'hit inline-block rounded py-0.5 text-ink-soft transition-colors duration-fast hover:text-brand-700 hover:underline decoration-line-strong underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

const columnHeadClass = 'mb-4 text-eyebrow uppercase font-num text-ink-muted';

/** ご案内。遷移先の静的ページを持たないため、リンクではなく事実を添えた定義リストで示す。 */
const GUIDE_ITEMS: { term: string; detail: string }[] = [
  { term: '配送について', detail: '全国一律 送料無料' },
  { term: '返品・交換について', detail: '各商品ページの記載をご確認ください' },
  { term: 'お支払い方法', detail: 'ご注文手続きの画面でご案内します' },
  { term: 'よくあるご質問', detail: '右下のアシスタントにお尋ねください' },
];

export default function Footer() {
  return (
    <footer>
      {/* 奥付帯。全ページ共通のブランド反響として、本体より上に深緑の帯を置く。 */}
      <div className="on-dark bg-invert band-sm">
        <div className="wrap-wide flex flex-col items-center gap-5 text-center">
          <div className="flex items-end gap-8 text-brand-300" aria-hidden="true">
            {/* 3点の高さは同じ（h-14）。BrandMotifs の viewBox を 120×120 の正方形・
                接地線 y=108 に統一したので、同じ数字を渡せば光学サイズも接地も揃う。
                個別に h-16 / h-12 / h-14 と手当てしていた頃は、同じ3点セットが
                署名帯・フッター・ログイン・カテゴリ札で4通りの大小関係になっていた。 */}
            <KettleMotif className="pointer-events-none select-none h-14 opacity-60" />
            <CupMotif className="pointer-events-none select-none h-14 opacity-60" />
            <PlantMotif className="pointer-events-none select-none h-14 opacity-60" />
          </div>
          <p className="text-eyebrow uppercase font-num text-on-dark-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          {/* 標語。全ページ共通で最も目に付く1行なので、熟語の途中（「すこし機／嫌が」）で
              折れないよう改行位置を版として固定する。jp-name の語句境界制御に加え、
              読点で意味の切れる2節に分けて各節を nowrap にし、
              どのブラウザ・どの幅でも「使うたびに、／すこし機嫌がよくなる道具を。」で割る。 */}
          <p className="font-mincho text-h3 text-on-dark jp-head jp-name">
            <span className="inline-block whitespace-nowrap">使うたびに、</span>
            <span className="inline-block whitespace-nowrap">すこし機嫌がよくなる道具を。</span>
          </p>
        </div>
      </div>

      {/* 本体 */}
      <div className="bg-surface text-body text-ink-muted">
        <div className="wrap-wide band">
          {/* 390px では 4ブロックが1列に積まれ、フッター本体だけで 978px（＝1.1画面）あった。
              SHOPPING と ACCOUNT はどちらも短いリンク列なので、狭幅から2列に畳む。
              ブランド説明と GUIDE は行が長いので 640px 未満だけ2列ぶんの幅を取り、
              sm 以上は従来どおり4ブロックが2列に並ぶ（640〜1023 で行数を増やさない）。 */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-x-8 lg:grid-cols-4">
            {/* ブランド */}
            <div className="col-span-2 sm:col-span-1">
              {/* py-2 は見た目の余白ではなくタップ域（文字丈 28px → 44px）。 */}
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded py-2 font-mincho text-lg font-bold tracking-[0.06em] text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                  <path
                    d="M4 6h16l-1.5 9.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 6Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path d="M8 6V5a4 4 0 0 1 8 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Hibino
              </Link>
              {/* 標語は奥付帯の1本だけにする。ここで似た言い回しをもう1本並べると
                  同一画面に 12px 差の標語が2つ立ち、どちらが看板か読めなくなる。
                  こちらは店の説明（事実）に徹する。 */}
              <p className="mt-4 max-w-[22rem] text-ink-muted jp-body">
                季節ごとの特集と定番の道具を、月に一度の誌面のかたちでお届けしています。
              </p>
            </div>

            {/* お買い物 */}
            <div>
              <h2 className={columnHeadClass}>SHOPPING</h2>
              <ul className="space-y-3">
                <li>
                  {/* 一覧・検索は /products に独立している（トップは特集ページ）。 */}
                  <Link href="/products" className={footerLinkClass}>
                    商品一覧
                  </Link>
                </li>
                <li>
                  <Link href="/cart" className={footerLinkClass}>
                    カート
                  </Link>
                </li>
                <li>
                  <Link href="/orders" className={footerLinkClass}>
                    注文履歴
                  </Link>
                </li>
                <li>
                  <Link href="/wishlist" className={footerLinkClass}>
                    お気に入り
                  </Link>
                </li>
              </ul>
            </div>

            {/* アカウント */}
            <div>
              <h2 className={columnHeadClass}>ACCOUNT</h2>
              <ul className="space-y-3">
                <li>
                  <Link href="/login" className={footerLinkClass}>
                    ログイン
                  </Link>
                </li>
                <li>
                  <Link href="/register" className={footerLinkClass}>
                    会員登録
                  </Link>
                </li>
                <li>
                  <Link href="/account" className={footerLinkClass}>
                    アカウント設定
                  </Link>
                </li>
              </ul>
            </div>

            {/* ご案内。640px 未満では2列2行に畳んで、巻末の索引が本文より長くなるのを防ぐ。 */}
            <div className="col-span-2 sm:col-span-1">
              <h2 className={columnHeadClass}>GUIDE</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:block sm:space-y-3">
                {GUIDE_ITEMS.map((item) => (
                  <div key={item.term}>
                    <dt className="text-ink-soft">{item.term}</dt>
                    <dd className="text-caption text-ink-muted">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-6">
            <p className="text-caption text-ink-muted">
              &copy; <span className="tnum">2026</span> Hibino — 日々の暮らしの道具店
            </p>
            {/* ink-faint は罫・アイコン等の非テキスト装飾専用（対 surface 3.65:1）。
                読ませる文字なので ink-muted（AA）に置く。 */}
            <p className="text-eyebrow uppercase font-num text-ink-muted">HIBINO JOURNAL</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
