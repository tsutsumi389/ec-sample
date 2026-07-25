import type { ReactNode } from 'react';
import { withWordBreaks } from '@/lib/wordBreak';

/**
 * 全ページのセクション見出しを1つの造形に寄せる「節記号」。
 * 2px×20px の brand 縦罫 ＋ 明朝の見出し ＋ 右へ伸びる 1px 罫。
 *
 * 使い方:
 *   <SectionHead title="新着アイテム" eyebrow="NEW ARRIVALS" />
 *   <SectionHead as="h1" title={heading} right={<p>…</p>} />
 *   <SectionHead as="h3" size="sm" eyebrow="ABOUT" title="この道具について" />
 *   深緑帯（bg-invert）の中では tone="onDark" を渡す。
 *
 * size:
 * - 'md'（既定）… 章の見出し（text-h2・縦罫 20px・横罫 40/64px）
 * - 'sm'        … カード内・段組みの中の小見出し（text-h3・縦罫 16px・横罫 32px）。
 *                 これが無かったため PDP の ABOUT / SPECIFICATION やカートの
 *                 お届け先が eyebrow＋見出しを手組みし、同じページに
 *                 「節記号あり／なし」の2様式が混在していた。
 *
 * 造形の約束（崩さないこと）:
 * - 右の 1px 罫は**固定長**（40px / md 以上 64px）。以前は `flex-1` で余り幅を
 *   拾っていたため、subtitle や right の有無で 0px〜182px に揺れ、同じ判型記号が
 *   「罫あり／罫なし／罫の断片」の3種類に分裂していた。長さは見出し文字数に依存させない。
 * - 縦罫も横罫も「1行目と同じ高さの箱」に入れて中央に置く。見出しが2行に折り返す
 *   モバイルでも、記号が行間に取り残されない。
 */

/** 記号を見出しの1行目の高さに揃えるための箱。見出しと同じ行高（1.3em / 1.55em）を持たせる。 */
const MARK_SLOT = {
  md: 'flex h-[1.3em] shrink-0 items-center text-h2',
  sm: 'flex h-[1.55em] shrink-0 items-center text-h3',
} as const;

const TITLE_SIZE = { md: 'text-h2', sm: 'text-h3' } as const;
const RULE_V = { md: 'h-5 w-[2px]', sm: 'h-4 w-[2px]' } as const;
const RULE_H = { md: 'h-px w-10 md:w-16', sm: 'h-px w-8' } as const;

export default function SectionHead({
  title,
  subtitle,
  eyebrow,
  right,
  as: Tag = 'h2',
  size = 'md',
  tone = 'default',
  className = '',
}: {
  title: string;
  subtitle?: string | null;
  eyebrow?: string;
  right?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  size?: 'md' | 'sm';
  tone?: 'default' | 'onDark';
  className?: string;
}) {
  const onDark = tone === 'onDark';

  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-2 ${className}`}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p
            className={`text-eyebrow uppercase font-num ${
              onDark ? 'text-on-dark-muted' : 'text-ink-muted'
            }`}
          >
            {eyebrow}
          </p>
        )}
        <div className={`flex items-start gap-3 ${size === 'sm' ? 'mt-1.5' : 'mt-2'}`}>
          <span aria-hidden className={MARK_SLOT[size]}>
            <span
              className={`${RULE_V[size]} ${onDark ? 'bg-brand-400' : 'bg-brand-600'}`}
            />
          </span>
          <Tag
            className={`font-mincho ${TITLE_SIZE[size]} jp-head jp-name min-w-0 ${
              onDark ? 'text-on-dark' : 'text-ink'
            }`}
          >
            {withWordBreaks(title)}
          </Tag>
          <span aria-hidden className={MARK_SLOT[size]}>
            <span
              className={`${RULE_H[size]} ${onDark ? 'bg-brand-400/40' : 'bg-line-strong'}`}
            />
          </span>
        </div>
        {subtitle && (
          <p
            className={`mt-2 text-body ${onDark ? 'text-on-dark-muted' : 'text-ink-muted'}`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}
