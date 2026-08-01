'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';
import SectionHead from '@/components/SectionHead';
import { MOTIFS } from '@/components/BrandMotifs';
// カテゴリ名 → 線画の対応表は扉（PageMasthead）と共有する。
// 同じカテゴリはホームの札でもカテゴリページの扉でも同じ図案になる＝線画が目次として働く。
import { motifForCategory } from '@/lib/categoryMotifs';
// 語の切れ目に <wbr> を挿し、カタカナの字送りを詰める共通処理。CSS の
// word-break: auto-phrase は評価環境の Chromium では効かない（実測）ため、
// 札の名前もここで改行位置を決める。
import { withWordBreaks } from '@/lib/wordBreak';
import { fetchCategories } from '@/lib/categories';

/** ローディング時に場所を予約するタイル数。実データ（5件）と同じにして読み込み後の段差を消す。 */
const SKELETON_TILES = 5;

/**
 * カテゴリの「目次の札」。高さ 56px のピル横スクロール帯を置き換えたもの。
 *
 * 造形の意図（r1 からの作り直し）:
 * - 旧版は 4:5 の縦長タイルの背面に線画を敷いていたため、(a) 上部 55% が完全な空白、
 *   (b) 線画がカテゴリ名の字面を貫通、(c) 線画がタイル右端で唐突に断ち切られて描画バグに見える、
 *   の3点が同時に起きていた。線画を「背面の装飾」から「上段の図版」に格上げして解決している。
 * - 上段＝図版（線画を1本の水平罫の上に接地させる）／下段＝キャプション（通し番号＋明朝の名前）。
 *   署名帯の「棚」と同じ造形を小さく反復させ、判型記号としての一貫性を取る。
 * - 線画はタイルの内側に完全に収める。裁ち落とすのは表紙・扉のような大きい面だけの権利にする。
 * - 高さはアスペクト比ではなく中身で決める。グリッドの stretch で全タイルが同じ高さになる。
 * - 図版の高さは全札で1つ（h-16 md:h-[4.5rem]）。BrandMotifs の viewBox を 120×120 の
 *   正方形に統一したので、旧 MOTIF_HEIGHT / MOTIF_SCALE のような図案ごとの手当ては要らない。
 * - タップ領域はタイル全体。44px を大幅に超えるので .hit は不要
 *   （overflow-hidden があるため .hit の ::after はそもそも効かない）。
 *
 * 誌面の号数（order）は呼び出し側（app/page.tsx）が渡す。表紙が No.01、レーンが
 * No.02… と続くので、目次だけ番号が消えると「日々帖」の約束が途中で切れる。
 */
export default function CategoryTiles({ order }: { order: number }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        /* 補助的なセクションなので取得失敗時は黙って隠す */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && categories.length === 0) return null;

  /**
   * 最終行の穴埋め。2列（〜md）で件数が奇数だと最終行に1枚だけ残って右端が開き、
   * 「未完成のグリッド」に見える。その1枚だけを2列ぶんに伸ばして行を閉じる。
   * md（3列）と lg（5列）は最終行が欠けたままにする（誌面としてはそのほうが自然）。
   * 注: Tailwind はクラス名を静的に走査するため、col-span を式で組み立ててはならない。
   */
  const spanLast = categories.length % 2 === 1;
  const eyebrow = `No.${String(order).padStart(2, '0')} — Categories`;

  return (
    // 面の交替。直前は沈んだ地のレーン、直後は新着グリッド（沈んだ地）なので、
    // ここだけ生成りに戻して「目次の1頁」を作る。
    <section className="band-lg bg-page">
      <div className="wrap-wide">
        <SectionHead title="カテゴリから探す" eyebrow={eyebrow} className="mb-6" />

        {/* 768px は3列。5列のままだと札の内寸が 96px しかなく、text-h3 の
            「ファッション小物」が語中で折れて「ファッショ／ン小物」になっていた
            （3列なら内寸 約200px で全カテゴリ名が1行に収まる）。
            .stagger で左から順に置かれていく（globals.css §3b）。
            子は `animate-rise` を素で書く（motion-safe: を付けると生成 CSS の順で
            animation ショートハンドが delay を 0s に戻し、段差が消える。
            reduced-motion は globals.css §5 の一括ガードが受け持つ）。 */}
        <ul className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
          {loading
            ? Array.from({ length: SKELETON_TILES }).map((_, i) => (
                <li key={i} aria-hidden="true" className={i === 4 ? 'max-md:col-span-2' : ''}>
                  {/* animate-breathe はこの体系の keyframes（tailwind.config.ts）。
                      Tailwind 既定の animate-pulse は 2s / cubic-bezier(.4,0,.6,1) と、
                      duration・easing のどちらのトークンにも属さない唯一のモーションだった。 */}
                  <div className="h-[11.5rem] animate-breathe rounded-xl bg-sunken motion-reduce:animate-none md:h-[13rem]" />
                </li>
              ))
            : categories.map((category, i) => {
                const motif = motifForCategory(category.name);
                const Motif = motif === 'none' ? null : MOTIFS[motif];
                return (
                  <li
                    key={category.id}
                    className={`animate-rise ${
                      spanLast && i === categories.length - 1 ? 'max-md:col-span-2' : ''
                    }`}
                  >
                    <Link
                      href={`/categories/${category.id}`}
                      className="group flex h-full flex-col rounded-xl bg-sunken p-4 transition-[background-color,transform] duration-base ease-standard hover:-translate-y-1 hover:bg-line motion-reduce:hover:translate-y-0"
                    >
                      {/* 図版。棚（1px 罫）の上に線画を接地させる。
                          図案を持たないカテゴリでも棚の高さは予約し、札の判型を揃える。 */}
                      <span className="flex h-20 items-end justify-center border-b border-line-strong md:h-24">
                        {Motif && (
                          <Motif
                            aria-hidden
                            className="h-16 w-auto select-none text-brand-700 opacity-70 transition-transform duration-slow ease-entrance group-hover:-translate-y-1 motion-reduce:group-hover:translate-y-0 md:h-[4.5rem]"
                          />
                        )}
                      </span>

                      {/* キャプション。図版と縄張りを分けるので、線が字に食い込まない。 */}
                      <span className="mt-4 flex flex-1 flex-col">
                        <span className="text-eyebrow tnum text-ink-muted">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="mt-2 block font-mincho text-h3 text-ink jp-name">
                          {withWordBreaks(category.name)}
                        </span>
                        {/* hover で伸びる細罫。矢印アイコンを置かずに「進める」ことを示す。
                            mt-auto で札の下端に接地させ、名前の行数が違っても罫の位置を揃える。 */}
                        <span aria-hidden className="mt-auto block pt-3">
                          <span className="block h-px w-6 bg-line-strong transition-[width] duration-base ease-standard group-hover:w-12" />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
        </ul>
      </div>
    </section>
  );
}
