'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ChatBubbleIcon } from '@/components/Icons';
import AssistantPanel from '@/components/assistant/AssistantPanel';
import { useAssistant } from '@/lib/assistant-context';

/**
 * 全ページ右下に常駐する AIショッピングアシスタントのウィジェット。
 * フローティングボタンでパネルを開く（閉じるのはパネルヘッダーの × と Escape）。
 * 開いている間 FAB は隠すので、このボタンは「開く」専用。
 * 管理画面（/admin 配下）では表示しない。
 *
 * 開閉状態は lib/assistant-context.tsx が持つ（検索0件の画面など、ページ側からも
 * 開けるようにするため）。パネルの描画・FAB・背景の不活性化はここが引き続き受け持つ。
 */
export default function AssistantWidget() {
  const pathname = usePathname();
  const { open, prefill, returnFocusRef, openAssistant, closeAssistant } = useAssistant();

  // アシスタントを出さないページ。
  // ・/admin: 買い物文脈が無い。
  // ・/login /register: 商品の相談が前提の機能なので出す理由が無いうえ、390px では
  //   FAB（右下 56px 円）がパスワード欄の表示/非表示トグルに完全に重なり（実測 32×32px、
  //   トグルの当たり判定 32×44px をほぼ覆う）、目のアイコンを潰して操作を奪っていた。
  //   カード内寸の右端と FAB の座標は幅で決まるので、偶然ではなく必ず重なる。
  const hidden =
    pathname?.startsWith('/admin') || pathname === '/login' || pathname === '/register';
  // 開くトリガ（FAB）への参照。フォーカスの戻し先が消えていたときの退避先でもある。
  const fabRef = useRef<HTMLButtonElement>(null);
  // 閉じた後にフォーカスを戻す先。handleClose が控え、下の effect が実際に当てる。
  const pendingFocusRef = useRef<HTMLElement | null>(null);

  // パネルを閉じたら開く前のトリガへフォーカスを返す。
  // 呼び出し元はパネルヘッダーの × と Escape だけ（FAB は開く専用にしたのでここへは来ない）。
  const handleClose = useCallback(() => {
    // 戻し先は「開いた側が渡したボタン」。ページ側から開いた場合（検索0件の相談導線など）に
    // FAB へ戻すと、画面の反対側へフォーカスが飛んで操作の文脈が切れる。
    pendingFocusRef.current = returnFocusRef.current;
    closeAssistant();
  }, [closeAssistant, returnFocusRef]);

  // 実際にフォーカスを当てるのはここ。requestAnimationFrame では当たらない——
  // FAB は開いている間 display:none で、rAF のコールバックは再描画のコミットより先に
  // 走ることがあり、display:none の要素は focus() を受け取れないため（無言で失敗する）。
  // effect なら DOM への反映後に走るので、FAB が現れてから確実に当たる。
  useEffect(() => {
    if (open) return;
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    // 開いている間に呼び出し側が消えている（検索結果が入れ替わった等）ときは FAB へ退避する。
    (target.isConnected ? target : fabRef.current)?.focus();
  }, [open]);

  // パネル内のリンクで遷移するときに閉じる経路。閉じるだけでフォーカスは戻さない。
  // フォーカスは遷移先の先頭へ移るべきで、元のボタンに取り残すと文脈が壊れるため。
  // 閉じれば背景の inert は上の effect（依存 [open]）のクリーンアップで必ず外れる。
  // これを通さずに遷移すると header/main/footer の inert が残り、遷移先が一切操作できない。
  const handleCloseForNavigation = useCallback(() => closeAssistant(), [closeAssistant]);

  // パネル（role="dialog" aria-modal）を開いている間は背景ページ（ヘッダー/本文/フッター）を
  // inert + aria-hidden にして不活性化する。Tab フォーカストラップだけでは塞げない
  // スクリーンリーダーの仮想カーソルやポインタ操作からも背景を隔離し、モーダル性を担保する。
  // FAB（閉じるボタン）とパネル自体は body 直下の別要素のため不活性化の対象外。
  useEffect(() => {
    if (!open) return;
    const backdrop = ['header', 'main', 'footer']
      .map((tag) => document.querySelector(tag))
      .filter((el): el is HTMLElement => el instanceof HTMLElement);
    backdrop.forEach((el) => {
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    });
    return () => {
      backdrop.forEach((el) => {
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
      });
    };
  }, [open]);

  // 非表示ページへ遷移したら開いた状態を必ず畳む。
  // 開いたまま return null にすると、上の inert 効果のクリーンアップが走らず
  // header/main/footer に inert が残って全ページが操作不能になる。
  useEffect(() => {
    if (hidden) closeAssistant();
  }, [hidden, closeAssistant]);

  if (hidden) return null;

  // 商品詳細はモバイルで固定購入バーが出るため、FAB をその上へ逃がす。
  // それ以外のページでも safe-area 分を足し、レーンや一覧のカードに被らせない。
  const onPdp = /^\/products\/[^/]+$/.test(pathname ?? '');
  // 商品詳細の固定購入バーは `lg:hidden`（= 1024px 未満で表示）なので、
  // FAB の退避解除も lg に揃える。md（768px）で解除すると 768〜1023px で
  // FAB が「カートに追加」の右上角に乗る。
  const fabPosition = onPdp
    ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6'
    : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))] md:bottom-6';

  // 横位置は版面（.wrap-wide = 82.5rem）の外側の余白へ逃がす。
  // 100% は fixed の包含ブロック＝ビューポート幅。
  //   (100% - 82.5rem)/2 … 版面の外に残る余白
  //   - 2rem            … 版面の内側 padding ぶんを差し引き、本文の右端と 8px あける
  // 余白が足りない幅（〜1320px）では max() が効いて従来どおり右端 24px に落ちる。
  // これで広い画面ではカード列・本文の上に FAB が乗らなくなる。
  const fabRight = 'right-[max(1.5rem,calc((100%_-_82.5rem)_/_2_-_2rem))]';

  return (
    <>
      {/* パネルは開くたびにマウントし直されるので、prefill は初期値としてそのまま渡してよい
          （開いている間に prefill が変わる経路は無い。開いている間、背景は inert なので
          ページ側の「相談する」ボタンは押せない）。 */}
      {open && (
        <AssistantPanel
          prefill={prefill}
          onClose={handleClose}
          onNavigate={handleCloseForNavigation}
        />
      )}

      {/* フローティングボタン。開いている間は全幅で隠すので「開く」専用（開閉トグルではない）。
          FAB は z-50 かつパネルより後ろの DOM なので、重なった領域では必ず FAB が勝つ。
          そのため入力フォームに 1px でも掛かると「送信」を押したつもりが「閉じる」になる。
          掛かる組み合わせは wide/full だけではない:
          ・wide(sm:bottom-6) / full(sm:inset-6) … パネル下端が 24px まで来るので、
            bottom-6 の FAB（24〜80px）が入力フォームの帯に丸ごと入る。
          ・normal でも商品詳細の 640〜1023px … 固定購入バーを避けて FAB が
            bottom-5.5rem へ退避する（88〜144px）ため、パネル下端 96px から上の
            48px ぶん、つまり送信ボタンの高さにちょうど乗る。
          サイズごとに出し分けても、この2系統の座標が幅とページで動く以上また衝突が生えるので、
          「開いている間は出さない」を不変条件にする。閉じる手段はパネルヘッダーの × と Escape が残る。
          aria-expanded は残す（隠れている間も開閉状態を名乗る属性のため）。
          奥付帯（bg-invert）の上に重なっても輪郭が消えないよう、影に加えて淡いリングを持たせる。 */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => openAssistant({ returnFocusTo: fabRef })}
        aria-label="アシスタントを開く"
        aria-expanded={open}
        className={`fixed z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-float ring-1 ring-washi-50/25 transition-[background-color,transform] duration-fast ease-standard hover:bg-brand-700 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${fabRight} ${fabPosition} ${
          open ? 'hidden' : 'inline-flex'
        }`}
      >
        <ChatBubbleIcon className="h-6 w-6" />
      </button>
    </>
  );
}
