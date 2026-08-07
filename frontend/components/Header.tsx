'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { btn, iconButton, navPill, NAV_ACTIVE_BAR, FOCUS_RING } from '@/lib/buttonStyles';
import { useFocusTrap } from '@/lib/focusTrap';
import { withRedirect } from '@/lib/redirect';
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

  // ログイン・会員登録へ送るときに現在地を引き継ぐ（CLAUDE.md の規律。
  // 「カートに入れた → ログイン → トップに着く」経路を作らないため）。
  // ただし /login・/register 自身に居るときは付けない——自分自身へ戻すループになり、
  // かつログイン画面から会員登録へ渡り歩くたびにクエリが自分のパスで上書きされて、
  // 本来の戻り先（カート等）を失う。
  //
  // 既知の欠け: pathname だけなのでクエリは落ちる（/products?search=… から入ると
  // 検索語・絞り込み・並び順が戻り先に残らない）。同じ画面の WishlistButton は
  // pathname+search を渡しており、そこだけ挙動が割れている。
  // 揃えるには useSearchParams が要るが、Header は layout でレンダリングされるため
  // Suspense 境界なしでは next build が落ちる（SearchBox が境界を持つのと同じ理由）。
  // 直すときは境界を1つ足して backTo をその中で組むこと。
  const backTo =
    pathname && !pathname.startsWith('/login') && !pathname.startsWith('/register') ? pathname : '/';

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
  // 補正は xl 限定にしない——ナビの「カート」は lg からラベル付きになったため、
  // xl 限定のままだと 1024〜1279px でだけバッジが文字に噛む。
  // コンポーネントではなく素の関数にする（毎レンダーで再マウントされると
  // バッジの animate-bump が最初から再生されてしまうため）。
  const cartIconWithBadge = (labelled = false) => (
    <span className={`relative inline-flex ${labelled && count > 0 ? 'mr-3' : ''}`}>
      <CartIcon className="h-5 w-5" />
      {cartBadge}
    </span>
  );

  const cartLabel = count > 0 ? `カート（${count}点）` : 'カート';

  // 現在地は面ではなく左の見出し罫で出す。bg-brand-50 は対 surface 1.07:1 しかなく、
  // 「選ばれている行」の合図として成立していなかった（罫は brand-600 対 surface 6.12:1）。
  // 面は hover と共通の sunken にして、hover と現在地が font-weight でしか
  // 区別できない状態を解く。focus の輪は写しを作らず FOCUS_RING を配る。
  const drawerLinkClass = (href: string) =>
    `relative flex min-h-[2.75rem] items-center gap-3 rounded-md px-3 py-2.5 text-body transition-colors duration-fast ease-standard ${FOCUS_RING} ${
      isActive(href)
        ? "bg-sunken font-semibold text-brand-700 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-600 before:content-['']"
        : 'text-ink-soft hover:bg-sunken'
    }`;

  /**
   * ドロワーの項目。ログイン状態での出し分けはここ（配列を組む側）に寄せ、
   * 描画側は行の造形を1つだけ持つ。
   * 一覧・検索は /products に独立した。ホーム自体へはロゴから戻れる。
   *
   * match は href と別に持つ。href は withRedirect() で `?redirect=` が付くことがあり、
   * isActive() は完全一致・前方一致で見るのでクエリ付きの href では現在地を取り違える。
   *
   * 会員登録はこの配列に入れない。ドロワー下端の CTA へ格上げしたのと、
   * ログイン・会員登録・アカウントの3つが同じ UserIcon で並ぶ三つ巴を断つため。
   */
  const drawerItems: {
    href: string;
    match: string;
    icon: (p: { className?: string }) => JSX.Element;
    label: string;
  }[] = [
    { href: '/products', match: '/products', icon: BoxIcon, label: '商品一覧' },
    { href: '/cart', match: '/cart', icon: CartIcon, label: cartLabel },
    ...(!loading && user
      ? [
          { href: '/orders', match: '/orders', icon: PackageIcon, label: '注文履歴' },
          { href: '/wishlist', match: '/wishlist', icon: HeartIcon, label: 'お気に入り' },
          { href: '/account', match: '/account', icon: UserIcon, label: 'アカウント' },
          ...(user.role === 'admin'
            ? [{ href: '/admin', match: '/admin', icon: ClipboardListIcon, label: '管理画面' }]
            : []),
        ]
      : []),
    ...(!loading && !user
      ? [
          {
            href: withRedirect('/login', backTo),
            match: '/login',
            icon: UserIcon,
            label: 'ログイン',
          },
        ]
      : []),
  ];

  return (
    // ドロワーは <header> の外（body 直下）に置く。
    // header に backdrop-filter / transform / will-change のどれかが付くと
    // position:fixed の包含ブロックになり、中に入れた fixed inset-0 が
    // 「ヘッダーの箱」に対して解決されてしまう
    // （＝高さ64pxの潰れたドロワーになり、閉状態のパネルが版面の右外に居座って
    //   モバイル全ページに約290pxの横スクロールを作っていた）。
    // いま header は不透明な面になり backdrop-blur を持たないが、この配置は
    // **blur を戻したときへの保険**なので崩さないこと（外へ出したまま気づけない）。
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
          padding で高さを作らず必ず h-16 のままにすること。

          面は不透明の bg-surface で固定する。bg-surface/92 は Tailwind の既定 opacity
          スケール（5の倍数のみ）に無く任意値記法でもないため CSS が生成されず、
          ヘッダーは面をまったく持っていなかった（computed = rgba(0,0,0,0)）。
          スクロール 0 では body の bg-page が透けて「それらしく」見えるだけで、
          下を深緑帯（bg-invert: 表紙・レコメンド・奥付）が通った瞬間に
          ロゴ（対 invert 1.95:1）もナビ（同 1.31:1）も読めなくなっていた。
          半端な不透明度がどうしても要るときは、既定スケール（5の倍数）の値を使うか、
          スラッシュのあとを角括弧で囲む任意値記法で書き、**生成CSSに実在するか**を必ず見る。
          クラス名らしき綴りはこのコメント本文からも拾われて CSS になるので、
          「生成されているから正しい」は根拠にならない（ここに実例を書き残せないのはそのため）。

          罫は line-strong。line は対 sunken 1.04:1 で、/products の PageMasthead
          （bg-sunken）に接すると段差ごと消える。

          backdrop-blur は外した（不透明の面の背後をぼかしても出力は変わらない）。
          ただしドロワーはこれまで通り <header> の外に置くこと——将来 blur を戻したとき、
          包含ブロックの事故（モバイル全ページに約290pxの横スクロール）が無言で再発する。 */}
      <header className="sticky top-0 z-30 border-b border-line-strong bg-surface">
        <div className="wrap-wide">
          <div className="flex h-16 min-w-0 items-center gap-3">
            {/* ロゴ（誌名。明朝＝ブランド表記のフェイス） */}
            {/* py-2 は見た目の余白ではなくタップ域（文字丈 28px → 44px）。行は h-16 のまま。 */}
            <Link
              href="/"
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded py-2 font-mincho text-xl font-bold tracking-[0.06em] text-brand-700 ${FOCUS_RING}`}
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
                  1024〜1279px ロゴ＋常設の検索欄＋主要ナビ（商品一覧・カート・認証の導線は
                              ラベル付き／会員の記号群はアイコンのみ）＋メニュー
                  1280px〜    ロゴ＋常設の検索欄＋ラベル付きフルナビ（ドロワー無し）
                「約810px 必要だから lg では全部畳む」という以前の断は、実測すると
                admin（nav 849.7px）のときだけ正しかった。1024px の余裕は未ログインで
                388px・一般会員で349pxあり、ラベル付き4項目（412.7px）でも 172px 残る。
                そこで畳むのは「語が無くても図案で分かる会員の記号群」だけに絞り、
                商品一覧・カート・ログイン・会員登録は lg からラベルを出す（籠と箱と
                荷箱が無地で4つ並ぶ判じ物を、少なくとも前2つについては解く）。
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

            {/* 主要ナビ（lg 以上）。導線の階層は面ではなく tone で表す:
                記号だけの quiet ／ 文字だけの plain（ログイン）／ brand の罫を持つ cta（会員登録）。
                号数は navPill が持つ（以前ここに素の text-sm を当てていたが、この体系の
                和文スケールは caption 13px と body 15px で、14px は定義に存在しない）。 */}
            <nav
              aria-label="主要ナビゲーション"
              className="ml-auto hidden min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap lg:flex"
            >
              {/* 一覧・検索が /products に独立したため、常設の入口をナビに置く。
                  前方一致の isActive により /products/[id]（商品詳細）閲覧中もアクティブ扱いになる。
                  可視ラベルを常時出すので aria-label と title は付けない（読み上げが二重になる）。 */}
              <Link
                href="/products"
                className={navPill('quiet', { active: isActive('/products'), label: 'always' })}
                aria-current={isActive('/products') ? 'page' : undefined}
              >
                <BoxIcon className="h-5 w-5 shrink-0" />
                商品一覧
              </Link>
              {/* aria-label はここだけ残す。点数を運ぶのはこの属性で、バッジ側は aria-hidden。 */}
              <Link
                href="/cart"
                className={navPill('quiet', { active: isActive('/cart'), label: 'always' })}
                aria-current={isActive('/cart') ? 'page' : undefined}
                aria-label={cartLabel}
              >
                {cartIconWithBadge(true)}
                カート
              </Link>

              {!loading && user && (
                <>
                  {/* 語を持つ導線（商品一覧・カート）と、lg では記号だけになる会員の群との
                      切れ目。xl ではラベルが開いて群の区別が語で付くうえ、admin@1280 の
                      余裕は 35.7px しかないので、この罫は lg 帯にだけ出す（9px）。 */}
                  <span
                    aria-hidden="true"
                    className="mx-1 hidden h-5 w-px shrink-0 bg-line-strong lg:block xl:hidden"
                  />
                  <Link
                    href="/orders"
                    className={navPill('quiet', { active: isActive('/orders'), label: 'xl' })}
                    aria-current={isActive('/orders') ? 'page' : undefined}
                    aria-label="注文履歴"
                    title="注文履歴"
                  >
                    <PackageIcon className="h-5 w-5 shrink-0" />
                    {navLabel('注文履歴')}
                  </Link>
                  <Link
                    href="/wishlist"
                    className={navPill('quiet', { active: isActive('/wishlist'), label: 'xl' })}
                    aria-current={isActive('/wishlist') ? 'page' : undefined}
                    aria-label="お気に入り"
                    title="お気に入り"
                  >
                    <HeartIcon className="h-5 w-5 shrink-0" />
                    {navLabel('お気に入り')}
                  </Link>
                  <Link
                    href="/account"
                    className={navPill('quiet', { active: isActive('/account'), label: 'xl' })}
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
                      className={navPill('quiet', {
                        active: !!pathname?.startsWith('/admin'),
                        label: 'xl',
                      })}
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
                    /* 一段落とすのは**造形**で行う（h-9・角丸 md ＝ 丸ピンのナビ h-11・
                       rounded-full と別の系統）。色とウェイトは呼び出し側から下げられない——
                       btn() の内側の text-ink-soft / font-medium が生成順で必ず後勝ちするため、
                       ここに text-ink-muted や font-normal を連結しても1px も変わらない
                       （実際に font-normal がそうやって効かないまま残っていた）。
                       色で落としたくなったら buttonStyles.ts 側に variant を足すこと。 */
                    className={`${btn('ghost', 'sm')} ml-1 hidden xl:inline-flex`}
                  >
                    ログアウト
                  </button>
                </>
              )}

              {/* 認証が解けるまでの席取り。ログイン・会員登録は lg から出るので、
                  席も lg から取る（nav 自体が lg:flex なのでそれ未満では親ごと消える）。
                  xl 限定にすると 1024〜1279px でだけ席が空かず、解けた瞬間に
                  flex-1 の検索欄が約186px 縮んで見える。
                  なお「認証への入口が画面上に1つも無い」のは xl だけの話（圧縮群もドロワーも
                  xl:hidden のため）で、その穴自体はここでは塞がらない。ここが受け持つのは
                  横方向の跳ねだけ。
                  呼吸は animate-breathe（animate-pulse はこの体系の duration/easing の
                  どちらにも属さないため使わない）。 */}
              {loading && (
                <span
                  aria-hidden="true"
                  className="ml-1 hidden h-11 w-[11.5rem] shrink-0 animate-breathe rounded-full bg-sunken lg:block"
                />
              )}

              {/* 認証の2つは記号を持たせない。ログインの UserIcon はログイン後の
                  「アカウント」と同じ人型で、会員登録の → はこのファイル内で
                  「ログアウト」にも当たっていた（同じ字面が正反対を指していた）。
                  階層は記号ではなく面で割る: ログイン＝面も罫も無い文字だけ、
                  会員登録＝brand の罫（塗りはページ側の最重要CTA専用なので使わない）。 */}
              {!loading && !user && (
                <>
                  <Link
                    href={withRedirect('/login', backTo)}
                    className={navPill('plain', { active: isActive('/login'), label: 'always' })}
                    aria-current={isActive('/login') ? 'page' : undefined}
                  >
                    ログイン
                  </Link>
                  {/* lg でも常設する。以前は xl 限定で、同じ帯にログインだけが残り
                      「獲得の導線だけが畳まれる」逆転が起きていた（幅は足りている）。 */}
                  <Link
                    href={withRedirect('/register', backTo)}
                    className={`${navPill('cta', {
                      active: isActive('/register'),
                      label: 'always',
                    })} ml-1`}
                    aria-current={isActive('/register') ? 'page' : undefined}
                  >
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
                  /* 現在地は面ではなく 3px の罫で出す（NAV_ACTIVE_BAR）。丸に面を塗ると、
                     カートバッジの ring-2 ring-surface（地色で籠の線を punch out する輪）が
                     地と食い違って意味のない縁になる。
                     色は変えられない——iconBtn() の内側の text-ink-soft が生成順で必ず勝つので、
                     ここに text-brand-700 を連結しても効かない（書くと「効いている」という
                     思い込みだけが残る）。合図は罫が単独で担う。
                     罫の幾何は「ヘッダーの最下段が h-16 の行であること」が前提なので、
                     検索欄を展開している間（h-16 の下にもう一段積まれる）は出さない。 */
                  className={`${iconButton} lg:hidden ${
                    isActive('/wishlist') && !searchOpen ? NAV_ACTIVE_BAR : ''
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
                  isActive('/cart') && !searchOpen ? NAV_ACTIVE_BAR : ''
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
            {/* key は match。label はカートの点数を含む可変値（「カート（2点）」）なので、
                key にすると点数が変わるたびに行が再マウントされ、その行にフォーカスが
                あったとき body へ落ちて useFocusTrap の循環から抜ける
                （ゲストカートを持ったままドロワーの「ログイン」へ進み、直後の
                 POST /cart/merge で count が変わる経路で実際に起きる）。 */}
            {drawerItems.map(({ href, match, icon: Icon, label }) => (
              <Link
                key={match}
                href={href}
                className={drawerLinkClass(match)}
                aria-current={isActive(match) ? 'page' : undefined}
              >
                {/* ink-faint は対 sunken 2.49:1 で、現在地・hover の面（bg-sunken）に
                    乗った瞬間に UI の 3:1 を割る（tailwind.config.ts が名指しで禁じる用法）。
                    ink-muted なら対 surface 7.03:1 / 対 sunken 4.72:1 で両面とも合格する。 */}
                <Icon className="h-5 w-5 text-ink-muted" />
                <span className="flex-1">{label}</span>
                <ChevronRightIcon className="h-4 w-4 text-line-strong" />
              </Link>
            ))}
          </nav>

          {/* 会員登録はドロワーの行ではなくフッタの CTA として持つ。
              ここは塗ってよい——ドロワーは aria-modal で背後が膜の下におり、
              「同一画面に brand 塗りが2つ立つ」というヘッダー側の制約が働かない。
              この面での最重要アクションなので btn('primary') をそのまま使う。 */}
          {!loading && !user && (
            <div className="border-t border-line p-3">
              <Link
                href={withRedirect('/register', backTo)}
                className={`${btn('primary', 'md')} w-full`}
                /* 判定は href ではなく定数で行う。href には ?redirect= が付くことがあり、
                   isActive() は完全一致・前方一致で見るので取り違える。 */
                aria-current={isActive('/register') ? 'page' : undefined}
              >
                会員登録
              </Link>
            </div>
          )}

          {!loading && user && (
            <div className="border-t border-line p-2">
              <button
                type="button"
                onClick={handleLogout}
                className={`flex min-h-[2.75rem] w-full items-center gap-3 rounded-md px-3 py-2.5 text-body text-ink-soft transition-colors duration-fast hover:bg-sunken ${FOCUS_RING}`}
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
