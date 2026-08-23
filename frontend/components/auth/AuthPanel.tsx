'use client';

import { useState, type ReactNode } from 'react';
import { KettleMotif, CupMotif, PlantMotif } from '@/components/BrandMotifs';
import { inputClass } from '@/lib/formStyles';

/**
 * ブランド面の「棚」。ログインと会員登録の扉は造形が透かしの図案とリード文1行しか違わない
 * ので、器はこの1ファイルに閉じる。
 *
 * 3点の高さは同じ数字を渡す。BrandMotifs の viewBox が 120×120 の正方形・接地線 y=108 に
 * 統一されているので、それだけで光学サイズも接地も揃う（図案ごとに手当てしないこと）。
 */
function BrandShelf({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-end gap-6 text-brand-300 ${className}`} aria-hidden="true">
      <KettleMotif className="pointer-events-none select-none h-12 opacity-80" />
      <CupMotif className="pointer-events-none select-none h-12 opacity-80" />
      <PlantMotif className="pointer-events-none select-none h-12 opacity-80" />
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  value: string;
  /**
   * ログインは 'current-password'、会員登録は 'new-password'。
   * ここを取り違えるとパスワード管理ソフトが既存の資格情報を新規欄に埋める。
   */
  autoComplete: 'current-password' | 'new-password';
  invalid?: boolean;
  onChange: (value: string) => void;
}

export function PasswordField({
  id,
  value,
  autoComplete,
  invalid,
  onChange,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        aria-required="true"
        aria-invalid={invalid}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} pr-11 ${invalid ? 'border-critical-400' : ''}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
        aria-pressed={visible}
        /* w-11 = 44px。pr-3 だけだと当たり判定が 32px しかなく、
           アイコンの光学位置（右から 22px）は w-11 + 中央寄せでも変わらない。 */
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-faint transition-colors duration-fast hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Suspense の受け（useSearchParams を使うフォームを包むときに必要）。 */
export function AuthPanelFallback() {
  return (
    <div className="wrap band-lg text-body text-ink-muted">
      <div className="mx-auto max-w-sm">読み込み中...</div>
    </div>
  );
}

/**
 * 深緑のブランド面（デスクトップは左カラム、モバイルはフォーム上の横帯）＋ フォーム面。
 * どちらの判型でもブランド面を出す（片側だけ消える状態を作らない）。
 */
export default function AuthPanel({
  watermark,
  lead,
  children,
}: {
  /**
   * ブランド面の背面に敷く透かし。
   *
   * ⚠ 棚（BrandShelf）に無い図案を選ぶこと。同じ図柄を透かしと棚の両方に置くと、
   *   同じものが2つの縮尺で1つのパネルに並び、装飾ではなく描画の重複に見える。
   * ⚠ パネルの下端（-bottom-*）に置かないこと。下端には棚（1px の罫＋3点の線画）があり、
   *   768px ではカラム実幅が約 293px しかないため透かしが棚まで届き、線がもつれた
   *   1つの塊に見える。本文ブロックに紐づけて右へ裁ち落とせば、棚とは構造的に交差しない。
   */
  watermark: ReactNode;
  /** ブランド面のリード文（ログインと会員登録で1行だけ違う）。 */
  lead: string;
  children: ReactNode;
}) {
  return (
    /* 版面幅は他ページと同じ3系統に揃える（max-w-5xl のような第4の幅を作らない）。 */
    <div className="wrap band-lg">
      <div className="grid overflow-hidden rounded-2xl bg-surface shadow-float md:grid-cols-12">
        <div className="on-dark bg-invert px-6 py-8 md:hidden">
          <p className="text-eyebrow uppercase font-num text-on-dark-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          <p className="mt-3 font-mincho text-h3 text-on-dark jp-head jp-name">
            日々に寄り添う道具を。
          </p>
          <BrandShelf className="mt-5 border-t border-brand-400/30 pt-4" />
        </div>

        {/* 左: ブランド面（デスクトップ。5:7 の非対称）
            768px ではカラムが狭くなるので、見出しの丈と余白を1段落として縦の膨らみを抑える。 */}
        <div className="on-dark relative hidden flex-col justify-between overflow-hidden bg-invert p-8 md:col-span-5 md:flex lg:p-10">
          <p className="relative text-eyebrow uppercase font-num text-on-dark-muted">
            HIBINO — 日々の暮らしの道具店
          </p>
          <div className="relative py-8 lg:py-10">
            {watermark}
            {/* 5列カラムの実幅（1440px で約373px）に収まる字数で改行位置を固定する。
                明朝を大きくするのは、1行11文字が確実に収まる xl 以上だけにする。
                見出し・リード文は relative（絶対配置の透かしより後）で必ず上に乗る。 */}
            <p className="relative font-mincho text-h3 text-on-dark jp-head jp-name xl:text-h2">
              日々に寄り添う道具を、
              <br />
              あなたのもとへ。
            </p>
            <p className="relative mt-4 text-body text-on-dark-muted jp-body">{lead}</p>
          </div>
          <BrandShelf className="relative border-t border-brand-400/30 pt-6" />
        </div>

        <div className="p-8 sm:p-10 md:col-span-7">{children}</div>
      </div>
    </div>
  );
}
