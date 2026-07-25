import type { ReactNode } from 'react';
import { CupMotif } from '@/components/BrandMotifs';

interface EmptyStateProps {
  /** 差し替えたい図版。省略時はブランドの線画（湯呑み）が入る。 */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * データが無いときの空状態表示。中央寄せで、図版・見出し・説明・アクションを縦に並べる。
 * 空の画面こそブランドが見える場所なので、既定の図版はブランドの線画にしている。
 *
 * 造形は SignatureBand と同じ装置を使う ——「1本の水平罫（棚）の上に線画が立つ」。
 * 何も無い画面で線画だけが宙に浮くと、図版が置き忘れのように見える。棚を1本引くと、
 * 空状態が「まだ何も置かれていない棚」として読め、署名帯・カテゴリ札・ログインの左パネルと
 * 同じ語彙になる。
 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {/* 図版は差し替えても大きさを変えない（画面ごとに図版の丈が違うと空状態が揃わない） */}
      <div className="text-line-strong [&>svg]:h-20 [&>svg]:w-auto" aria-hidden="true">
        {icon ?? <CupMotif className="h-20" />}
      </div>
      {/* 棚。BrandMotifs は viewBox 120 の y=108 が接地線なので、h-20（80px）では
          図版の下端から 8px 上（= -mt-2）に引くと線画がちょうど罫の上に立つ。
          mb-2 で見た目の丈を 80px に戻し、下の見出しとのアキ（mt-5）を変えない。 */}
      <div aria-hidden="true" className="-mt-2 mb-2 h-px w-24 bg-line-strong" />
      <p className="mt-5 font-mincho text-h3 text-ink jp-head">{title}</p>
      {description && <p className="wrap-read mt-2 text-body text-ink-muted">{description}</p>}
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}
