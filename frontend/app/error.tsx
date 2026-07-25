'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { KettleMotif } from '@/components/BrandMotifs';
import { btn } from '@/lib/buttonStyles';

/**
 * ルート境界のエラー画面（Next.js の error boundary）。
 *
 * これが無いと、描画中に投げられた例外は Next の既定画面（黒背景の素の英文）に落ちる。
 * 世界観の外へ出るのはエラーのときこそ避けたいので、app/not-found.tsx と**同じ造形**
 * （裁ち落としの線画 → 欧文の柱 → 明朝の見出し → 説明 → 復帰の2手）で組む。
 *
 * 図案は not-found のケトルと分ける（行灯＝あかり）。同じ絵だと「さっきと同じ画面が
 * また出た」に見え、404 とシステムエラーの区別が付かない。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 画面には出さない（利用者に読ませる情報ではない）。開発時の追跡用。
    console.error(error);
  }, [error]);

  return (
    <section className="relative overflow-hidden band-xl">
      <KettleMotif
        className="pointer-events-none select-none absolute left-1/2 top-4 h-72 -translate-x-1/2 text-brand-700 opacity-[0.07]"
        strokeWidth={2}
        aria-hidden
      />

      <div className="wrap-read relative text-center">
        <p className="text-eyebrow uppercase font-num text-ink-muted">Error — something went wrong</p>

        <h1 className="mt-6 font-mincho text-h1 text-ink jp-head jp-name">
          うまく読み込めませんでした
        </h1>
        <p className="mt-4 text-body-lg text-ink-muted jp-body">
          一時的な不具合かもしれません。
          <br className="hidden sm:block" />
          もう一度読み込むか、トップから道具をゆっくり眺めてみてください。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className={`${btn('primary', 'lg')} w-full sm:w-auto`}>
            もう一度読み込む
          </button>
          <Link href="/" className={`${btn('secondary', 'lg')} w-full sm:w-auto`}>
            トップへ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
