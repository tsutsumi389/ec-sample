import type { ReactNode } from 'react';
import Breadcrumbs, { type BreadcrumbItem } from '@/components/Breadcrumbs';
import { MOTIFS, type MotifName } from '@/components/BrandMotifs';
import { withWordBreaks } from '@/lib/wordBreak';

/**
 * ページの「扉」。沈んだ地のフルブリード帯 ＋ 裁ち落とした線画 ＋ eyebrow ＋ 明朝の h1。
 *
 * これまで /products だけがこの造形を持ち、/cart /orders /login /wishlist /account は
 * 素の地に h1 が置かれるだけで、章ごとに扉の様式が4通りに割れていた。全ページの扉を
 * この1コンポーネントに畳み込み、判型記号を1つにする。
 *
 * 使い方:
 *   <PageMasthead eyebrow="CART" title="カート" width="default" motif="kettle" />
 *   <PageMasthead eyebrow="PRODUCTS" title={heading} subtitle="…" right={<p>全 12 件</p>}
 *                 breadcrumbs={[{ label: 'ホーム', href: '/' }, { label: '商品一覧' }]} />
 *
 * 約束:
 * - この帯の直後に続く本文は、必ず同じ `width` の .wrap* を使うこと（左端が段差する）。
 * - 線画は装飾なので支援技術には出さない（aria-hidden・pointer-events-none）が、
 *   **図案の選び方には意味を持たせる**。カテゴリを持つ扉（商品詳細・カテゴリ一覧）は
 *   lib/categoryMotifs.ts の motifForCategory() で引き、ホームのカテゴリ札と同じ図案にする。
 *   同じカテゴリはどの面でも同じ線画で出るので、線画が誌面の目次として働く。
 *   カテゴリを持たないページ（カート・注文履歴など）は意味の近い図案を1つ固定で持つ。
 */

/** 'none' で線画を消す。それ以外は BrandMotifs の語彙（7種）をそのまま受ける。 */
export type MastheadMotif = MotifName | 'none';
export type MastheadWidth = 'wide' | 'default' | 'read';

const WRAPS: Record<MastheadWidth, string> = {
  wide: 'wrap-wide', // 一覧・カテゴリ・検索結果（グリッドが wrap-wide のページ）
  default: 'wrap', // カート・注文履歴・アカウント（本文系ページ）
  read: 'wrap-read', // ログイン・会員登録などの読み物幅
};

export default function PageMasthead({
  eyebrow,
  title,
  subtitle,
  right,
  motif = 'cup',
  breadcrumbs,
  width = 'wide',
  as: Tag = 'h1',
  className = '',
}: {
  /** 欧文ラベル。uppercase は CSS 側で当てる。 */
  eyebrow?: string;
  title: string;
  subtitle?: string | null;
  /** 見出しの右端に置く要素（件数など）。 */
  right?: ReactNode;
  /** 右上で裁ち落とす線画。'none' で消す。 */
  motif?: MastheadMotif;
  /** 見出しの上に置くパンくず。 */
  breadcrumbs?: BreadcrumbItem[];
  /** 帯の内側の版面幅。**続く本文と必ず揃えること。** */
  width?: MastheadWidth;
  as?: 'h1' | 'h2';
  className?: string;
}) {
  const Motif = motif === 'none' ? null : MOTIFS[motif];

  return (
    // 沈んだ地（sunken）と本文の地（page）の差は 1.22:1 しかない。下端の罫を line にすると
    // 対 sunken 1.09:1 でほぼ消え、帯が帯として閉じない。line-strong（1.48:1）で締める。
    <section
      className={`relative overflow-hidden border-b border-line-strong bg-sunken band-lg ${className}`}
    >
      {/* 上端で裁ち落とす（＝誌面の裁断）。見出しの行と重ならない高さに収めている。 */}
      {Motif && (
        <Motif
          // md 未満は帯が浅く、3段のパンくず（PDP）が線画の裾に潜り込む。
          // 上へもう一段送って、パンくずの行より上で裁ち落ちるようにする。
          className="pointer-events-none absolute -top-20 right-2 h-36 select-none text-brand-700 opacity-[0.12] md:-top-24 md:right-10 md:h-64"
          aria-hidden
        />
      )}
      <div className={`${WRAPS[width]} relative`}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mb-6">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        )}
        {/* 線画（右上で裁ち落とす）と right スロット（件数など）は同じ座標を取り合う。
            両方あるときだけ右に逃げ幅を作り、装飾の弧が「唯一の読ませる数値」を横切るのを防ぐ。 */}
        <div
          className={`flex flex-wrap items-end justify-between gap-x-8 gap-y-3 ${
            right && Motif ? 'md:pr-36' : ''
          }`}
        >
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-eyebrow uppercase font-num text-ink-muted">{eyebrow}</p>
            )}
            {/* 可変長の和文。<wbr> を語境界に挿し（jp-name の keep-all と対）、
                大見出しなので jp-display（balance ＋ カタカナの字送り補正）を併用する。 */}
            <Tag
              className={`font-mincho text-h1 text-ink jp-head jp-name jp-display ${
                eyebrow ? 'mt-3' : ''
              }`}
            >
              {withWordBreaks(title)}
            </Tag>
            {subtitle && (
              <p className="mt-3 max-w-[34rem] text-body text-ink-muted">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      </div>
    </section>
  );
}
