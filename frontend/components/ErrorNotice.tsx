import type { ReactNode } from 'react';
import { BroomMotif } from '@/components/BrandMotifs';
import { btn } from '@/lib/buttonStyles';

interface ErrorNoticeProps {
  /** 差し替えたい図版。省略時はブランドの線画（箒）が入る。 */
  icon?: ReactNode;
  /** 見出し。省略時は「読み込めませんでした」。 */
  title?: string;
  /** API から返った文言など、状況の説明。 */
  description?: string;
  /** 復帰の操作。押すと再取得する。 */
  onRetry?: () => void;
  /** 復帰ボタンの文言。 */
  retryLabel?: string;
  /** 復帰ボタンの隣に置く追加の導線（一覧へ戻る、など）。 */
  action?: ReactNode;
  className?: string;
}

/**
 * データの取得に失敗したときの表示。
 *
 * 造形は components/EmptyState.tsx と**同じ縦積み**にしてある ——
 * 線画 → 棚（1本の水平罫）→ 明朝の見出し → 説明 → アクション。
 * 「まだ何も無い」と「取れなかった」は利用者にとって地続きの経験なので、
 * ここだけ赤い箱にすると、世界観の外にある別のシステムからの通知に見える。
 * 異常であることは色ではなく **文言と復帰の操作** で伝え、色は見出し上の
 * eyebrow（critical-700 = 対 page 5.9:1）1行だけに留める。
 *
 * ⚠ 復帰手段のないエラー表示を作らないこと。onRetry か action のどちらかは必ず渡す。
 *   （読み込み失敗の画面で利用者にできることが無いと、行き止まりになる）
 */
export default function ErrorNotice({
  icon,
  title = '読み込めませんでした',
  description,
  onRetry,
  retryLabel = 'もう一度読み込む',
  action,
  className,
}: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center px-4 py-16 text-center ${className ?? ''}`}
    >
      {/* 図版の丈は EmptyState と同じ h-20。空とエラーで図版の大きさが変わらない。 */}
      <div className="text-line-strong [&>svg]:h-20 [&>svg]:w-auto" aria-hidden="true">
        {icon ?? <BroomMotif className="h-20" />}
      </div>
      {/* 棚。BrandMotifs は viewBox 120 の y=108 が接地線なので、h-20（80px）では
          図版の下端から 8px 上（= -mt-2）に引くと線画がちょうど罫の上に立つ。 */}
      <div aria-hidden="true" className="-mt-2 mb-2 h-px w-24 bg-line-strong" />
      <p className="mt-5 text-eyebrow uppercase font-num text-critical-700">ERROR</p>
      <p className="mt-2 font-mincho text-h3 text-ink jp-head">{title}</p>
      {description && <p className="wrap-read mt-2 text-body text-ink-muted">{description}</p>}
      {(onRetry || action) && (
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
          {onRetry && (
            <button type="button" onClick={onRetry} className={btn('secondary', 'md')}>
              {retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
