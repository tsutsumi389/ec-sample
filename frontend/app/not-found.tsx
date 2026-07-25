import Link from 'next/link';
import { btn } from '@/lib/buttonStyles';
import { KettleMotif } from '@/components/BrandMotifs';

export default function NotFound() {
  return (
    <section className="relative overflow-hidden band-xl">
      {/* 背面の線画。他ページ（表紙・署名帯・奥付帯）と同じ判型記号をここでも反響させる。 */}
      <KettleMotif
        className="pointer-events-none select-none absolute left-1/2 top-4 h-72 -translate-x-1/2 text-brand-700 opacity-[0.07]"
        strokeWidth={2}
        aria-hidden
      />

      <div className="wrap-read relative text-center">
        <p className="text-eyebrow uppercase font-num text-ink-muted">ERROR — PAGE NOT FOUND</p>
        <p className="mt-6 font-mincho text-display text-brand-700">404</p>

        {/* jp-name で語句境界の改行にする（付けないと「見つ／かり」で割れる） */}
        <h1 className="mt-6 font-mincho text-h1 text-ink jp-head jp-name">
          お探しの道具は見つかりませんでした
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted jp-body">
          ページが移動または削除されたのかもしれません。
          <br className="hidden sm:block" />
          よろしければ、トップから道具をゆっくり眺めてみてください。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className={`${btn('primary', 'lg')} w-full sm:w-auto`}>
            トップへ戻る
          </Link>
          <Link href="/products" className={`${btn('secondary', 'lg')} w-full sm:w-auto`}>
            商品一覧を見る
          </Link>
        </div>
      </div>
    </section>
  );
}
