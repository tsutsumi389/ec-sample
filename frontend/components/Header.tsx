'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { btn, iconButton } from '@/lib/buttonStyles';
import { useFocusTrap } from '@/lib/focusTrap';
import SearchBox from '@/components/SearchBox';
import {
  SearchIcon,
  CartIcon,
  MenuIcon,
  CloseIcon,
  UserIcon,
  PackageIcon,
  HeartIcon,
  BoxIcon,
  ClipboardListIcon,
  ChevronRightIcon,
  ArrowRightIcon,
} from '@/components/Icons';

export default function Header() {
  const { user, loading, logout } = useAuth();
  const { count } = useCart();
  const router = useRouter();
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  // カート数の増加時に一瞬バッジを弾ませる。
  const [bump, setBump] = useState(false);
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 300);
      prevCount.current = count;
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  // ページ遷移でドロワーと検索バーを閉じる。
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // ドロワーは xl 未満、開閉式の検索バーは sm 未満の帯にしか存在しない。
  // 開いたまま幅が広がると、パネルが display:none になったのに背面スクロールだけ
  // 止まったままになる（body の overflow を戻す後始末が走らない）ので、
  // 受け皿が消える幅に達したら状態ごと閉じる。
  useEffect(() => {
    const drawerMq = window.matchMedia('(min-width: 1280px)');
    const searchMq = window.matchMedia('(min-width: 640px)');
    const syncDrawer = () => drawerMq.matches && setMenuOpen(false);
    const syncSearch = () => searchMq.matches && setSearchOpen(false);
    syncDrawer();
    syncSearch();
    drawerMq.addEventListener('change', syncDrawer);
    searchMq.addEventListener('change', syncSearch);
    return () => {
      drawerMq.removeEventListener('change', syncDrawer);
      searchMq.removeEventListener('change', syncSearch);
    };
  }, []);

  // ドロワー表示中は Esc で閉じ、背面スクロールを止め、Tab を内部で循環させる（フォーカストラップ）。
  // 開いたら閉じるボタンにフォーカスし、閉じたら開いた元のハンバーガーボタンへフォーカスを戻す
  // （復帰先は「開く直前にフォーカスしていた要素」＝ハンバーガーなので、フックの控えで足りる）。
  useFocusTrap(drawerRef, {
    active: menuOpen,
    onEscape: () => setMenuOpen(false),
    initialFocus: closeBtnRef,
    restoreFocus: true,
    lockScroll: true,
  });

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    router.push('/');
  };

  // ナビのピル。高さ 44px（h-11）でタップ領域を確保する。
  //
  // 1024〜1279px は「アイコンのみ」（w-11 の正方形＝44px 角）、1280px 以上は
  // 「アイコン＋ラベル」に開く。ラベル込みのフルナビは実測で約810px 必要で、
  // 1024px の版面（実効 960px）ではロゴ＋検索欄と食い合って版面を溢れる。
  // 一方でアイコンのみなら 5項目 236px で収まるので、ドロワーへ全退避させずに済む。
  // ラベルは <span className="nav-label"> 側が xl で現れる（下の navLabel）。
  //
  // wide=true は「アイコンでは意味が立たない項目」（ログイン／会員登録）用。
  // 人型と矢印が並ぶだけの2つ組は判じ物になるので、この2項目だけは常にラベルを出す。
  // 未ログイン時はナビが少なく幅に余裕がある（1024px で検索欄 639px を確保）。
  const pillClass = (href: string, wide = false) =>
    `inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
      wide
        ? 'w-auto justify-start px-3'
        : 'w-11 justify-center px-0 xl:w-auto xl:justify-start xl:px-3'
    } ${
      isActive(href)
        ? 'bg-brand-50 font-semibold text-brand-700'
        : 'text-ink-soft hover:bg-brand-50 hover:text-brand-700'
    }`;

  /** ナビのラベル。xl 未満はアイコンのみになるので隠す（読み上げは aria-label が担う）。 */
  const navLabel = (text: string) => <span className="hidden xl:inline">{text}</span>;

  // 数取りバッジ。包含ブロックは必ず「20px のアイコン」でなければならない。
  // relative を 44px のボタン箱側に付けると、-top/-right がボタンの角に解決されて
  // バッジがアイコンから 20px 上へ飛び、ヘッダー最上端に貼りついた別物に見える。
  // そのため下の cartIconWithBadge() で必ずアイコンごと relative な span に包む。
  // ring は地色の輪。バッジを籠の輪郭から切り離し、図案が読めなくなるのを防ぐ。
  const cartBadge =
    count > 0 ? (
      <span
        aria-hidden="true"
        className={`tnum absolute -right-2 -top-2 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[0.625rem] font-bold leading-none text-white ring-2 ring-surface ${
          bump ? 'animate-bump' : ''
        }`}
      >
        {count > 9 ? '9+' : count}
      </span>
    ) : null;

  // アイコン＋バッジの1組。ラベル付きのピルでは、バッジがアイコン箱の外へ
  // 8px（＋ring 2px）はみ出すぶんが gap-1.5 を食い潰して「カ」に 1.5px まで迫るので、
  // 数がある時だけ右マージンで補正し、他のナビ項目の光学アキ（8.5〜10.5px）に揃える。
  // コンポーネントではなく素の関数にする（毎レンダーで再マウントされると
  // バッジの animate-bump が最初から再生されてしまうため）。
  const cartIconWithBadge = (labelled = false) => (
    <span className={`relative inline-flex ${labelled && count > 0 ? 'xl:mr-3' : ''}`}>
      <CartIcon className="h-5 w-5" />
      {cartBadge}
    </span>
  );

  const cartLabel = count > 0 ? `カート（${count}点）` : 'カート';

  const drawerLinkClass = (href: string) =>
    `flex min-h-[2.75rem] items-center gap-3 rounded-md px-3 py-2.5 text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
      isActive(href) ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-soft hover:bg-brand-50'
    }`;

  /**
   * ドロワーの項目。ログイン状態での出し分けはここ（配列を組む側）に寄せ、
   * 描画側は行の造形を1つだけ持つ。
   * 一覧・検索は /products に独立した。ホーム自体へはロゴから戻れる。
   */
  const drawerItems: { href: string; icon: (p: { className?: string }) => JSX.Element; label: string }[] = [
    { href: '/products', icon: BoxIcon, label: '商品一覧' },
    { href: '/cart', icon: CartIcon, label: cartLabel },
    ...(!loading && user
      ? [
          { href: '/orders', icon: PackageIcon, label: '注文履歴' },
          { href: '/wishlist', icon: HeartIcon, label: 'お気に入り' },
          { href: '/account', icon: UserIcon, label: 'アカウント' },
          ...(user.role === 'admin'
            ? [{ href: '/admin', icon: ClipboardListIcon, label: '管理画面' }]
            : []),
        ]
      : []),
    ...(!loading && !user
      ? [
          { href: '/login', icon: UserIcon, label: 'ログイン' },
          { href: '/register', icon: UserIcon, label: '会員登録' },
        ]
      : []),
  ];

  return (
    // ドロワーは <header> の外（body 直下）に置く。
    // header は backdrop-blur を持つため position:fixed の包含ブロックになり、
    // 中に入れると fixed inset-0 が「ヘッダーの箱」に対して解決されてしまう
    // （＝高さ64pxの潰れたドロワーになり、閉状態のパネルが版面の右外に居座って
    //   モバイル全ページに約290pxの横スクロールを作っていた）。
    <>
      {/* 本文へスキップ。キーボードで最初に当たる要素にする（全ページでヘッダーの
          ナビ7項目を通過させないため）。着地点 <main id="main" tabindex="-1"> は
          上の useEffect が補う。焦点が当たったときだけ左上に現れる。 */}
      <a
        href="#main"
        className="sr-only rounded-md focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:inline-flex focus:h-11 focus:items-center focus:bg-surface focus:px-4 focus:text-body focus:font-medium focus:text-brand-700 focus:shadow-float focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
      >
        本文へスキップ
      </a>

      {/* 行の高さは h-16（= globals.css の --header-h: 4rem）に固定する。
          フィルタ帯などの sticky が top-[var(--header-h)] でこの値を参照するため、
          padding で高さを作らず必ず h-16 のままにすること。 */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/92 backdrop-blur">
        <div className="wrap-wide">
          <div className="flex h-16 min-w-0 items-center gap-3">
            {/* ロゴ（誌名。明朝＝ブランド表記のフェイス） */}
            {/* py-2 は見た目の余白ではなくタップ域（文字丈 28px → 44px）。行は h-16 のまま。 */}
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded py-2 font-mincho text-xl font-bold tracking-[0.06em] text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
                <path
                  d="M4 6h16l-1.5 9.5a2 2 0 0 1-2 1.5H7.5a2 2 0 0 1-2-1.5L4 6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M8 6V5a4 4 0 0 1 8 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Hibino
            </Link>

            {/* 検索（sm 以上で常時表示）。
                ヘッダーは幅に応じて4段構えにする:
                  〜639px     ロゴ＋アイコン4つ（検索・お気に入り・カート・メニュー）
                  640〜1023px ロゴ＋常設の検索欄＋アイコン3つ（お気に入り・カート・メニュー）
                  1024〜1279px ロゴ＋常設の検索欄＋アイコンのみの主要ナビ＋メニュー
                  1280px〜    ロゴ＋常設の検索欄＋ラベル付きフルナビ（ドロワー無し）
                フルナビ（ログイン時7項目・whitespace-nowrap）は実測で約810px 必要なため、
                sm(640) や lg(1024) で「ラベル付きのまま」出すと flex-1 の検索欄が
                28px まで潰れて版面を溢れる。そこでラベルだけを落とし、44px 角の
                アイコンピル（5項目で 236px）にして 1024px から主要導線を版面に出す。
                768px では検索欄が 200px まで痩せる（実測）ので、そこは畳んだままにする。 */}
            {/* SearchBox は useSearchParams を使うため Suspense 境界が必要
                （Header は layout でレンダリングされ、無いと next build が落ちる）。
                fallback はレイアウトが崩れないよう同じ幅クラスの空要素にする。 */}
            <Suspense fallback={<div className="hidden min-w-0 flex-1 sm:block" />}>
              <SearchBox
                className="hidden min-w-0 flex-1 sm:block sm:min-w-[12rem] xl:ml-4"
                inputClassName="h-11"
                buttonClassName="h-11"
              />
            </Suspense>

            {/* 主要ナビ（md 以上）。md〜lg はアイコンのみ、xl でラベルが開く。 */}
            <nav
              aria-label="主要ナビゲーション"
              className="ml-auto hidden min-w-0 shrink-0 items-center gap-1 whitespace-nowrap text-sm lg:flex"
            >
              {/* 一覧・検索が /products に独立したため、常設の入口をナビに置く。
                  前方一致の isActive により /products/[id]（商品詳細）閲覧中もアクティブ扱いになる。 */}
              <Link
                href="/products"
                className={pillClass('/products')}
                aria-current={isActive('/products') ? 'page' : undefined}
                aria-label="商品一覧"
                title="商品一覧"
              >
                <BoxIcon className="h-5 w-5 shrink-0" />
                {navLabel('商品一覧')}
              </Link>
              <Link
                href="/cart"
                className={pillClass('/cart')}
                aria-current={isActive('/cart') ? 'page' : undefined}
                aria-label={cartLabel}
                title={cartLabel}
              >
                {cartIconWithBadge(true)}
                {navLabel('カート')}
              </Link>

              {!loading && user && (
                <>
                  <Link
                    href="/orders"
                    className={pillClass('/orders')}
                    aria-current={isActive('/orders') ? 'page' : undefined}
                    aria-label="注文履歴"
                    title="注文履歴"
                  >
                    <PackageIcon className="h-5 w-5 shrink-0" />
                    {navLabel('注文履歴')}
                  </Link>
                  <Link
                    href="/wishlist"
                    className={pillClass('/wishlist')}
                    aria-current={isActive('/wishlist') ? 'page' : undefined}
                    aria-label="お気に入り"
                    title="お気に入り"
                  >
                    <HeartIcon className="h-5 w-5 shrink-0" />
                    {navLabel('お気に入り')}
                  </Link>
                  <Link
                    href="/account"
                    className={pillClass('/account')}
                    aria-current={isActive('/account') ? 'page' : undefined}
                    aria-label="アカウント"
                    title="アカウント"
                  >
                    <UserIcon className="h-5 w-5 shrink-0" />
                    {navLabel('アカウント')}
                  </Link>
                  {user.role === 'admin' && (
                    <Link
                      href="/admin"
                      className={pillClass('/admin')}
                      aria-current={pathname?.startsWith('/admin') ? 'page' : undefined}
                      aria-label="管理画面"
                      title="管理画面"
                    >
                      <ClipboardListIcon className="h-5 w-5 shrink-0" />
                      {navLabel('管理画面')}
                    </Link>
                  )}

                  {/* 会員ブロック（xl のみ）。ナビ項目と同じ視覚重量で並べない。
                      「氏名」は読ませるだけのラベル、「ログアウト」は破線の無い
                      ghost ボタン（h-9・text-caption・角丸 md）に落として、
                      丸ピンのナビ（h-11・rounded-full）とは造形の階層を分ける。
                      境目には 1px の縦罫を1本だけ入れて、群の切れ目を明示する。 */}
                  <span
                    aria-hidden="true"
                    className="mx-2 hidden h-6 w-px shrink-0 bg-line-strong xl:block"
                  />
                  <span className="hidden min-w-0 max-w-[9rem] truncate text-caption text-ink-muted xl:block">
                    {user.name} さん
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    /* ナビ項目（14px/400/ink-soft）より一段落として、
                       会員ブロックが導線の列に混ざらないようにする。 */
                    className={`${btn('ghost', 'sm')} ml-1 hidden font-normal text-ink-muted xl:inline-flex`}
                  >
                    ログアウト
                  </button>
                </>
              )}

              {!loading && !user && (
                <>
                  <Link href="/login" className={pillClass('/login', true)}>
                    <UserIcon className="h-5 w-5 shrink-0" />
                    ログイン
                  </Link>
                  <Link
                    href="/register"
                    /* 会員登録は xl でだけ出す。lg 未満のドロワーにも同項目がある。 */
                    className={`${pillClass('/register', true)} hidden xl:inline-flex`}
                  >
                    <ArrowRightIcon className="h-5 w-5 shrink-0" />
                    会員登録
                  </Link>
                </>
              )}
            </nav>

            {/* 圧縮操作群（xl未満）。
                sm 以上では検索欄が常設になるので検索アイコンを落とし、
                lg 以上では上の主要ナビが同じ導線を持つのでお気に入り／カートも落とす。
                残るハンバーガーは xl 未満で常に出す（会員ブロックの受け皿）。 */}
            <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-1 xl:hidden">
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="検索"
                aria-expanded={searchOpen}
                className={`${iconButton} sm:hidden`}
              >
                <SearchIcon className="h-5 w-5" />
              </button>
              {/* 狭幅でもお気に入りだけはドロワーの外に出す（2タップを1タップにする）。 */}
              {!loading && user && (
                <Link
                  href="/wishlist"
                  aria-label="お気に入り"
                  aria-current={isActive('/wishlist') ? 'page' : undefined}
                  className={`${iconButton} lg:hidden ${
                    isActive('/wishlist') ? 'bg-brand-50 text-brand-700' : ''
                  }`}
                >
                  <HeartIcon className="h-5 w-5" />
                </Link>
              )}
              <Link
                href="/cart"
                aria-label={cartLabel}
                aria-current={isActive('/cart') ? 'page' : undefined}
                className={`${iconButton} lg:hidden ${
                  isActive('/cart') ? 'bg-brand-50 text-brand-700' : ''
                }`}
              >
                {cartIconWithBadge()}
              </Link>
              <button
                type="button"
                ref={menuBtnRef}
                onClick={() => setMenuOpen(true)}
                aria-label="メニューを開く"
                aria-expanded={menuOpen}
                className={iconButton}
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* モバイル検索バー（開閉式・sm 未満のみ。sm 以上は常設欄があるため出さない） */}
          {searchOpen && (
            <div className="pb-3 sm:hidden">
              {/* PC 版と同じく useSearchParams のための Suspense 境界。fallback は null で可
                  （開閉式のためレイアウトへの影響が無い）。 */}
              <Suspense fallback={null}>
                <SearchBox
                  inputClassName="h-11"
                  buttonClassName="h-11"
                  autoFocus
                  onSubmitted={() => setSearchOpen(false)}
                />
              </Suspense>
            </div>
          )}
        </div>
      </header>

      {/* ドロワー（右からスライドイン・xl 未満）。
          <header> の外に出すことで fixed inset-0 がビューポートに対して解決される。
          閉状態では invisible にして、版面の右外にある 288px のパネルが
          フォーカス可能なまま居座る（＝幽霊の段）のを断つ。
          visibility は transition 対象にすると閉じ切るまで visible が保たれるため、
          スライドアウトのアニメーションは失われない。
          overflow-hidden は保険（万一 fixed が祖先に包含されても裁ち落とす）。
          重なり順は PDPの固定購入バー(z-30) < アシスタントFAB(z-50) < ドロワー(z-55)
          < トースト(z-60)。ドロワーは aria-modal なので FAB より上に置く。 */}
      <div
        className={`fixed inset-0 z-[55] overflow-hidden transition-[visibility] duration-slow xl:hidden ${
          menuOpen ? 'visible' : 'invisible pointer-events-none'
        }`}
        aria-hidden={!menuOpen}
      >
        {/* オーバーレイ */}
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-invert/50 backdrop-blur-[1px] transition-opacity duration-slow ease-standard ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* パネル */}
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="メニュー"
          className={`absolute right-0 top-0 flex h-full w-72 max-w-[82%] flex-col bg-surface shadow-float transition-transform duration-slow ease-standard ${
            menuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span>
              <span className="block text-eyebrow uppercase font-num text-ink-muted">MENU</span>
              <span className="mt-1 block font-mincho text-h3 text-ink">メニュー</span>
            </span>
            <button
              type="button"
              ref={closeBtnRef}
              onClick={() => setMenuOpen(false)}
              aria-label="メニューを閉じる"
              className={iconButton}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {!loading && user && (
            <p className="border-b border-line px-4 py-3 text-caption text-ink-muted">
              <span className="font-medium text-ink-soft">{user.name}</span> さん、こんにちは
            </p>
          )}

          <nav className="flex-1 overflow-y-auto p-2">
            {/* 項目はデータで持ち、行の造形は1つだけ書く。
                以前は同じ3つ組（アイコン＋ラベル＋シェブロン）が8回写されていて、
                シェブロンの色や間隔を変えるのに8箇所を直す必要があった。
                ログイン状態での出し分けは配列を組む側に寄せる。 */}
            {drawerItems.map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} className={drawerLinkClass(href)}>
                <Icon className="h-5 w-5 text-ink-faint" />
                <span className="flex-1">{label}</span>
                <ChevronRightIcon className="h-4 w-4 text-line-strong" />
              </Link>
            ))}
          </nav>

          {!loading && user && (
            <div className="border-t border-line p-2">
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-[2.75rem] w-full items-center gap-3 rounded-md px-3 py-2.5 text-body text-ink-soft transition-colors duration-fast hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
              >
                <ArrowRightIcon className="h-5 w-5 text-ink-faint" />
                <span>ログアウト</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
