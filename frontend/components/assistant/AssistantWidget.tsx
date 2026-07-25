'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChatBubbleIcon, XMarkIcon } from '@/components/Icons';
import AssistantPanel from '@/components/assistant/AssistantPanel';

/**
 * 全ページ右下に常駐する AIショッピングアシスタントのウィジェット。
 * フローティングボタンでパネルを開閉する。
 * 管理画面（/admin 配下）では表示しない。
 */
export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // アシスタントを出さないページ。
  // ・/admin: 買い物文脈が無い。
  // ・/login /register: 商品の相談が前提の機能なので出す理由が無いうえ、390px では
  //   FAB（右下 56px 円）がパスワード欄の表示/非表示トグルに完全に重なり（実測 32×32px、
  //   トグルの当たり判定 32×44px をほぼ覆う）、目のアイコンを潰して操作を奪っていた。
  //   カード内寸の右端と FAB の座標は幅で決まるので、偶然ではなく必ず重なる。
  const hidden =
    pathname?.startsWith('/admin') || pathname === '/login' || pathname === '/register';
  // 開くトリガ（FAB）への参照。閉じたときにフォーカスを戻し、キーボード操作の文脈を保つ。
  const fabRef = useRef<HTMLButtonElement>(null);

  // パネルを閉じたら開く前のトリガ（FAB）へフォーカスを返す。
  // パネルのアンマウント後に確実に当てるため次フレームで実行する。
  const handleClose = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

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
    if (hidden) setOpen(false);
  }, [hidden]);

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
      {open && <AssistantPanel onClose={handleClose} />}

      {/* フローティングボタン。パネル全画面表示のモバイルでは開いている間は隠す。
          奥付帯（bg-invert）の上に重なっても輪郭が消えないよう、影に加えて淡いリングを持たせる。 */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? handleClose() : setOpen(true))}
        aria-label={open ? 'アシスタントを閉じる' : 'アシスタントを開く'}
        aria-expanded={open}
        className={`fixed z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-float ring-1 ring-washi-50/25 transition-[background-color,transform] duration-fast ease-standard hover:bg-brand-700 active:scale-95 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${fabRight} ${fabPosition} ${
          open ? 'hidden sm:inline-flex' : 'inline-flex'
        }`}
      >
        {open ? <XMarkIcon className="h-6 w-6" /> : <ChatBubbleIcon className="h-6 w-6" />}
      </button>
    </>
  );
}
