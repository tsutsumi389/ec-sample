'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ChatBubbleIcon } from '@/components/Icons';
import AssistantPanel from '@/components/assistant/AssistantPanel';
import { useAssistant, useAssistantGeometry } from '@/lib/assistant-context';
import { isProductDetail } from '@/lib/assistantPageContext';
import { FOCUS_RING } from '@/lib/buttonStyles';

/**
 * 全ページ常駐する AIショッピングアシスタントのウィジェット。
 * フローティングボタンで開く（閉じるのはサイドバーヘッダーの × と Escape）。
 * 開いている間 FAB は隠すので、このボタンは「開く」専用。
 * 管理画面（/admin 配下）では表示しない。
 *
 * 開閉状態・幅・接岸判定は lib/assistant-context.tsx が持つ（検索0件の画面など、ページ側からも
 * 開けるようにするため）。パネルの描画・FAB・本文の押し出し・背景の inert はここが受け持つ。
 *
 * 形は2つだけ。**接岸（xl 以上）** は右端に居座る非モーダルのサイドバーで、本文を左へ詰める。
 * **オーバーレイ（xl 未満）** は全画面のモーダル。中間の「浮いた小窓」は持たない——
 * 窓の寸法を段階で切り替える仕組みと、幅をドラッグで決める仕組みを同居させると、
 * 同じ「広さ」を2つの機構が別々に決めることになる。
 */
export default function AssistantWidget() {
  const pathname = usePathname();
  const { open, prefill, prefillNonce, returnFocusRef, openAssistant, closeAssistant } =
    useAssistant();
  const { docked, width, resizing } = useAssistantGeometry();

  // アシスタントを出さないページ。
  // ・/admin: 買い物文脈が無い。
  // ・/login /register: 商品の相談が前提の機能なので出す理由が無いうえ、390px では
  //   FAB（右下 56px 円）がパスワード欄の表示/非表示トグルに完全に重なり（実測 32×32px、
  //   トグルの当たり判定 32×44px をほぼ覆う）、目のアイコンを潰して操作を奪っていた。
  //   カード内寸の右端と FAB の座標は幅で決まるので、偶然ではなく必ず重なる。
  const hidden =
    pathname?.startsWith('/admin') || pathname === '/login' || pathname === '/register';
  // 「アシスタントが実際に効いている」条件。下の3本の effect（inert・gutter・幅）が
  // 同じ条件を見る。3箇所に書き写すと、条件を1つ足したとき1箇所漏れて
  // inert か --assistant-dock のどちらかが取り残される（＝全ページ操作不能／本文が詰まったまま）。
  // hidden ページでは open が畳まれる前の1コミットをここで弾く。
  const active = open && !hidden;
  const dockedActive = active && docked;
  // 開くトリガ（FAB）への参照。フォーカスの戻し先が消えていたときの退避先でもある。
  const fabRef = useRef<HTMLButtonElement>(null);
  // 閉じた後にフォーカスを戻す先。handleClose が控え、下の effect が実際に当てる。
  const pendingFocusRef = useRef<HTMLElement | null>(null);

  // パネルを閉じたら開く前のトリガへフォーカスを返す。
  // 呼び出し元はヘッダーの × と Escape だけ（FAB は開く専用にしたのでここへは来ない）。
  const handleClose = useCallback(() => {
    // 戻し先は「開いた側が渡したボタン」。ページ側から開いた場合（検索0件の相談導線など）に
    // FAB へ戻すと、画面の反対側へフォーカスが飛んで操作の文脈が切れる。
    pendingFocusRef.current = returnFocusRef.current;
    closeAssistant();
  }, [closeAssistant, returnFocusRef]);

  // パネル内のリンクで遷移するときの扱い。
  // 接岸中は **閉じない**——本文を押しのけて併置している非モーダルのサイドバーなので、
  // 商品ページへ移っても相談は続いているのが正しい（閉じると提案を1つ見るたびに会話が消える）。
  // オーバーレイ中は本文を覆っているので閉じる。閉じないと遷移先が見えないうえ、下の
  // inert 効果のクリーンアップが走らず header/main/footer が不活性のまま残る。
  const handleNavigate = useCallback(() => {
    if (docked) return;
    closeAssistant();
  }, [docked, closeAssistant]);

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

  // オーバーレイ（xl 未満）のときだけ背景ページ（ヘッダー/本文/フッター）を
  // inert + aria-hidden にして不活性化する。全画面を覆う role="dialog" aria-modal なので、
  // Tab フォーカストラップだけでは塞げないスクリーンリーダーの仮想カーソルやポインタ操作からも
  // 背景を隔離する必要がある。
  // **接岸中は張らない**——サイドバーは本文と併置される非モーダルの領域で、相談しながら
  // 商品を見て回れることが目的。ここで inert を張るとその目的ごと消える。
  useEffect(() => {
    if (!active || docked) return;
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
  }, [active, docked]);

  // 接岸中は本文を左へ詰める。サイドバーは position:fixed なので body の padding では動かない。
  // 幅を CSS 変数で配り、body 側（globals.css §6）と サイドバー側が同じ1つの値を見る。
  //
  // --assistant-gutter は縦スクロールバーの実測幅。0 でない環境（Windows/Linux の古典的な
  // スクロールバー）でサイドバーを right:0 に置くと、文書のスクロールバーを覆って
  // つまみを掴めなくなる。その幅ぶんだけ内側へ寄せ、スクロールバーの列を残す。
  // macOS のオーバーレイ・スクロールバーでは 0 になり、右端にぴたりと接岸する。
  //
  // 測り直しは ResizeObserver に任せる。開いた瞬間に1回だけ測ると、そのとき短くて
  // スクロールバーが無かったページ（＝gutter 0）から長いページへ遷移した途端に
  // サイドバーがスクロールバーを覆い、つまみを掴めなくなる——この変数が防ぐはずの
  // 事故そのものが起きる。root の content box はスクロールバーの出入りとウィンドウの
  // リサイズの両方で変わるので、それを観測すれば両方に追随できる。
  // 同じ値の書き戻しは避ける（ResizeObserver の再入を招かないため）。
  useEffect(() => {
    if (!dockedActive) return;
    const root = document.documentElement;
    let last = '';
    const measure = () => {
      const gutter = `${window.innerWidth - root.clientWidth}px`;
      if (gutter === last) return;
      last = gutter;
      root.style.setProperty('--assistant-gutter', gutter);
    };
    measure();
    // 存在チェックは ScrollableTable / ProductLane と同じ手当て。
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(root);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--assistant-gutter');
    };
  }, [dockedActive]);

  // 幅そのものは別の effect で配る（gutter の観測を幅の変化のたびに張り直さないため）。
  useEffect(() => {
    if (!dockedActive) return;
    const root = document.documentElement;
    root.style.setProperty('--assistant-dock', `${width}px`);
    return () => {
      root.style.removeProperty('--assistant-dock');
    };
  }, [dockedActive, width]);

  // 幅を掴んでいる間の印。<html>/<body> に効く副作用はこのウィジェットが一手に引き受ける
  // （--assistant-dock・--assistant-gutter・inert と同じ層）。掴んだ状態そのものは provider が
  // 持つので、接岸が解けてハンドルが消えた場合も provider 側で降ろされ、ここは必ず後始末できる。
  // 効き目は globals.css §6（本文の補間を切る・選択を止める）。
  useEffect(() => {
    if (!dockedActive || !resizing) return;
    const root = document.documentElement;
    root.setAttribute('data-assistant-resizing', '');
    return () => root.removeAttribute('data-assistant-resizing');
  }, [dockedActive, resizing]);

  // 非表示ページへ遷移したら開いた状態を必ず畳む。
  // 開いたまま return null にすると、上の effect のクリーンアップが走らず
  // header/main/footer に inert が残る／本文が詰まったまま戻らない。
  useEffect(() => {
    if (hidden) closeAssistant();
  }, [hidden, closeAssistant]);

  if (hidden) return null;

  // 商品詳細はモバイルで固定購入バーが出るため、FAB をその上へ逃がす。
  // それ以外のページでも safe-area 分を足し、レーンや一覧のカードに被らせない。
  // 経路の判定は lib/assistantPageContext.ts の1本（アシスタントへ送る画面と同じ源）。
  const onPdp = isProductDetail(pathname);
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
  // 接岸中の座標は考えなくてよい（FAB は開いている間 display:none なので、
  // サイドバーが出ている間にこの計算が使われることは無い）。
  const fabRight = 'right-[max(1.5rem,calc((100%_-_82.5rem)_/_2_-_2rem))]';

  return (
    <>
      {/* prefill はマウント時の初期値。ただし**接岸中は既に開いているパネルへ向けて
          openAssistant() が呼ばれうる**（非モーダルなので、検索0件の「相談する」ボタンが
          背後で押せる）。そのときパネルは再マウントされないので初期値は読み直されない——
          prefillNonce の変化を合図に入力欄へ入れ直す（渡さないと、押しても何も起きない
          ボタンになる）。 */}
      {open && (
        <AssistantPanel
          prefill={prefill}
          prefillNonce={prefillNonce}
          onClose={handleClose}
          onNavigate={handleNavigate}
        />
      )}

      {/* フローティングボタン。開いている間は全幅で隠すので「開く」専用（開閉トグルではない）。
          FAB は z-50 かつパネルより後ろの DOM なので、重なった領域では必ず FAB が勝つ。
          そのため入力フォームに 1px でも掛かると「送信」を押したつもりが「閉じる」になる。
          接岸中もオーバーレイ中も、パネルの下端＝入力フォームは FAB の座標帯に必ず届くので、
          「開いている間は出さない」を不変条件にする。閉じる手段はヘッダーの × と Escape が残る。
          aria-expanded は残す（隠れている間も開閉状態を名乗る属性のため）。
          奥付帯（bg-invert）の上に重なっても輪郭が消えないよう、影に加えて淡いリングを持たせる。 */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => openAssistant({ returnFocusTo: fabRef })}
        aria-label="アシスタントを開く"
        aria-expanded={open}
        aria-controls="assistant-sidebar"
        className={`fixed z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-float ring-1 ring-washi-50/25 transition-[background-color,transform] duration-fast ease-standard hover:bg-brand-700 active:scale-[0.98] motion-reduce:active:scale-100 ${FOCUS_RING} ${fabRight} ${fabPosition} ${
          open ? 'hidden' : ''
        }`}
      >
        <ChatBubbleIcon className="h-6 w-6" />
      </button>
    </>
  );
}
