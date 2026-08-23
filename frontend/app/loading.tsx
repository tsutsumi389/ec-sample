import { CupMotif } from '@/components/BrandMotifs';
import Spinner from '@/components/Spinner';

/**
 * ルート境界の読み込み画面（Next.js の loading boundary）。
 *
 * 各ページはクライアント側で取得するので、ふだん出るのはそれぞれの器に合わせた
 * スケルトン（components/Skeleton.tsx）。ここが出るのはルートのコードを取りに行って
 * いるあいだで、**どのページになるかまだ分からない**＝特定の版面は模せない。
 * 造形と帯の丈（band-xl）は EmptyState / ErrorNotice / not-found と揃える（遷移で跳ねない）。
 */
export default function Loading() {
  return (
    <section className="band-xl">
      <div className="flex flex-col items-center justify-center px-4 text-center">
        <div className="text-line-strong" aria-hidden="true">
          <CupMotif className="h-20" />
        </div>
        {/* 棚。線画の接地線（viewBox 120 の y=108）に罫を合わせる。 */}
        <div aria-hidden="true" className="-mt-2 mb-2 h-px w-24 bg-line-strong" />
        <p className="mt-5 flex items-center gap-3 font-mincho text-h3 text-ink jp-head">
          <Spinner className="text-ink-muted" />
          読み込んでいます
        </p>
      </div>
    </section>
  );
}
