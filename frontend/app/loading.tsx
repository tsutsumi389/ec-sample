import { CupMotif } from '@/components/BrandMotifs';
import Spinner from '@/components/Spinner';

/**
 * ルート境界の読み込み画面（Next.js の loading boundary）。
 *
 * 各ページはクライアント側で取得するので、ふだん出るのはこの画面ではなく
 * それぞれの器に合わせたスケルトン（components/Skeleton.tsx）。ここが出るのは
 * ルートのコードを取りに行っているあいだで、**どのページになるかまだ分からない**。
 * したがって特定の版面を模したスケルトンは置けない。
 *
 * 造形は components/EmptyState.tsx / components/ErrorNotice.tsx と同じ縦積み
 * （線画 → 棚の罫 → 明朝の見出し）にして、空・エラー・読み込み中の3つを1系統に保つ。
 * 帯の丈（band-xl）も app/not-found.tsx と揃えるので、遷移で版面が跳ねない。
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
