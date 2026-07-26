'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import type { Address, Cart, CouponValidation, GuestCart, Product } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { useToast } from '@/lib/toast-context';
import {
  readGuestCart,
  reconcileGuestCart,
  removeFromGuestCart,
  setGuestCartQuantity,
} from '@/lib/guestCart';
import Spinner from '@/components/Spinner';
import Price from '@/components/Price';
import PageMasthead from '@/components/PageMasthead';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import SectionHead from '@/components/SectionHead';
import { Skeleton } from '@/components/Skeleton';
import { TrashIcon, ChevronRightIcon } from '@/components/Icons';
import { btn } from '@/lib/buttonStyles';
import { EVENT_BEGIN_CHECKOUT, EVENT_VIEW_CART, track } from '@/lib/analytics';
import { SELECT_CHEVRON } from '@/lib/selectChevron';
import { withWordBreaks } from '@/lib/wordBreak';

/** 入力欄の共通クラス（罫は line-input）。角丸は呼び出し側の rounded-* で決める。
 *  placeholder の色はここで指定しない。globals.css の input::placeholder 既定
 *  （ink-muted＝AA 合格）に落とすため、placeholder:text-* を書かないこと。 */
const inputBase =
  'w-full border border-line-input bg-surface px-3.5 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:border-brand-600 disabled:opacity-50 disabled:bg-sunken';

/** 1行入力（数量 select と同じ 6px）。 */
const inputClass = `${inputBase} rounded-md`;

/**
 * 複数行入力。rounded-xl(12px) のカードの直下に置くブロックなので、同じ階層に並ぶ
 * 住所ラジオ（rounded-lg）と角丸を揃える。resize-none で素のグラバーを消し、
 * 行数は rows で決める（誌面の枠なので、利用者が高さを変えられる必要はない）。
 */
const textareaClass = `${inputBase} resize-none rounded-lg`;

/**
 * 明細 1 行の描画データ。ログイン後のカート（サーバー）とゲストカート（端末＋
 * POST /cart/preview で解決）を同じ形に正規化し、行の造形を 1 つに保つ。
 */
interface CartRow {
  /** React の key。行の宛先が id 体系ごと違うので接頭辞で分ける。 */
  key: string;
  /** 数量変更・削除の宛先。ログイン時は CartItem.id、ゲスト時は商品ID。 */
  targetId: number;
  product: Product;
  /** 買える数量。買えない明細（在庫切れ・販売停止）は 0。 */
  quantity: number;
  subtotal: number;
  /** 在庫で数量を丸めた・いま買えない、などサーバーからの申し送り。無ければ null。 */
  notice: string | null;
}

function toRows(cart: Cart): CartRow[] {
  return cart.items.map((item) => ({
    key: `item-${item.id}`,
    targetId: item.id,
    product: item.product,
    quantity: item.quantity,
    subtotal: item.subtotal,
    notice: null,
  }));
}

function toGuestRows(cart: GuestCart): CartRow[] {
  return cart.items.map((item) => ({
    key: `product-${item.product.id}`,
    targetId: item.product.id,
    product: item.product,
    quantity: item.quantity,
    subtotal: item.subtotal,
    notice: item.reason,
  }));
}

/** 読み込み中のカート行スケルトン（実際の行レイアウトに合わせる）。 */
function CartRowSkeleton() {
  return (
    <div className="flex gap-4 py-6 sm:gap-6">
      <Skeleton className="h-24 w-24 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-2.5 h-4 w-1/4" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Skeleton className="h-11 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { refresh } = useCart();
  const { showToast } = useToast();

  // null は「まだ取得していない」。空配列は「カートが空」。
  const [rows, setRows] = useState<CartRow[] | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** 注文確定の失敗。取得失敗（error）とは復帰導線が違うので別の状態に分ける
   *  （取得失敗＝再読み込み／確定失敗＝もう一度試す。後者はサマリーの中に出す）。 */
  const [orderError, setOrderError] = useState('');
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // 削除確認ダイアログ
  const [removeTarget, setRemoveTarget] = useState<CartRow | null>(null);
  const [removing, setRemoving] = useState(false);

  // 注文確定ボタンはサマリー（右カラム）にあるため、住所未入力で弾いたときは
  // 左カラムの入力欄までフォーカスを移してエラーの所在を明示する。
  const addressRef = useRef<HTMLTextAreaElement>(null);

  // 住所帳
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoaded, setAddressesLoaded] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<number | 'manual'>('manual');

  // クーポン
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState<CouponValidation | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_amount: number } | null>(
    null
  );

  // ファネルの「カートを開いた」段。確定操作（begin_checkout）まで進んだ人と分けて数える。
  useEffect(() => {
    track(EVENT_VIEW_CART);
  }, []);

  /**
   * カートの中身を取る。ログイン時はサーバーのカート、未ログイン時は端末の控えを
   * POST /cart/preview に渡して解決させる（価格・購入可否・在庫の判断はサーバー側が
   * 唯一の源。effective_price の計算をクライアントへ写さない）。
   */
  const fetchCart = useCallback(async (): Promise<{
    rows: CartRow[];
    subtotal: number;
    /** 商品ごと引けずに落とした件数（ゲストのみ）。黙って消さずに知らせるために返す。 */
    droppedCount: number;
  }> => {
    if (user) {
      const data = await api.get<Cart>('/cart');
      return { rows: toRows(data), subtotal: data.total_amount, droppedCount: 0 };
    }
    const lines = readGuestCart();
    if (lines.length === 0) return { rows: [], subtotal: 0, droppedCount: 0 };
    const data = await api.post<GuestCart>('/cart/preview', { items: lines });
    // 取り扱いが終わった商品を落とし、在庫で丸めた数量を端末の控えにも反映する。
    // 買えない明細（quantity=0）は要求数量のまま残す——在庫が戻れば買えるので、
    // 黙って消すより「在庫切れです」の行として見せて、外すかどうかは本人に委ねる。
    reconcileGuestCart(
      data.items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity > 0 ? item.quantity : item.requested_quantity,
      }))
    );
    return {
      rows: toGuestRows(data),
      subtotal: data.total_amount,
      droppedCount: data.dropped_product_ids.length,
    };
  }, [user]);

  const loadCart = useCallback(() => {
    setLoading(true);
    setError('');
    fetchCart()
      .then(({ rows: nextRows, subtotal: nextSubtotal, droppedCount }) => {
        setRows(nextRows);
        setSubtotal(nextSubtotal);
        // 商品ページごと無くなった品は行として見せられないので落とすしかない。
        // ただし黙って消すと「入れたはずのものが無い」だけが残るため必ず伝える。
        if (droppedCount > 0) {
          showToast(`お取り扱いが終了した${droppedCount}点をカートから外しました`, {
            type: 'info',
          });
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'カートの取得に失敗しました'))
      .finally(() => setLoading(false));
    // showToast は ToastProvider が useCallback で固定しているため依存に入れても再生成されない。
  }, [fetchCart, showToast]);

  // 数量変更・削除の後にスケルトンを出さず静かに取り直す。
  const refreshCart = async () => {
    const { rows: nextRows, subtotal: nextSubtotal } = await fetchCart();
    setRows(nextRows);
    setSubtotal(nextSubtotal);
    return nextSubtotal;
  };

  // 数量変更・削除でカート合計が変わったら、適用中クーポンを新しい小計で再検証する。
  // 無効になった（最低購入額割れなど）場合はクーポンを解除して通知する。
  const revalidateAppliedCoupon = async (nextSubtotal: number) => {
    if (!appliedCoupon) return;
    const removeStaleCoupon = () => {
      setAppliedCoupon(null);
      setCouponResult(null);
      showToast('カート内容が変わったためクーポンを解除しました。再度ご確認ください', {
        type: 'info',
      });
    };
    try {
      const result = await api.post<CouponValidation>('/coupons/validate', {
        code: appliedCoupon.code,
        subtotal: nextSubtotal,
      });
      if (result.valid) {
        setAppliedCoupon({ code: appliedCoupon.code, discount_amount: result.discount_amount });
        setCouponResult(result);
      } else {
        removeStaleCoupon();
      }
    } catch {
      // 再検証できない場合は割引額が古いまま残るのを避けるためクーポンを解除する
      removeStaleCoupon();
    }
  };

  // 認証状態が確定してから読む（確定前に読むと、ログイン済みでもゲスト経路で取ってしまう）。
  useEffect(() => {
    if (authLoading) return;
    loadCart();
  }, [authLoading, loadCart]);

  useEffect(() => {
    if (!user) return;
    api
      .get<Address[]>('/addresses')
      .then((list) => {
        setAddresses(list);
        const defaultAddr = list.find((a) => a.is_default) ?? list[0];
        if (defaultAddr) setSelectedAddressId(defaultAddr.id);
      })
      .catch(() => {
        // 住所帳が取得できなくても従来のテキスト入力にフォールバックできるため致命的ではない
      })
      .finally(() => setAddressesLoaded(true));
  }, [user]);

  const handleQuantityChange = async (row: CartRow, quantity: number) => {
    if (quantity < 1) return;
    setUpdatingId(row.targetId);
    try {
      // 宛先は行の出自で決まる（ログイン時はカート明細、ゲスト時は端末の控え）。
      if (user) {
        await api.put(`/cart/items/${row.targetId}`, { quantity });
      } else {
        setGuestCartQuantity(row.targetId, quantity);
      }
      const nextSubtotal = await refreshCart();
      await refresh();
      showToast('数量を変更しました');
      await revalidateAppliedCoupon(nextSubtotal);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '更新に失敗しました', { type: 'error' });
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      if (user) {
        await api.delete(`/cart/items/${removeTarget.targetId}`);
      } else {
        removeFromGuestCart(removeTarget.targetId);
      }
      const nextSubtotal = await refreshCart();
      await refresh();
      showToast('カートから削除しました');
      setRemoveTarget(null);
      await revalidateAppliedCoupon(nextSubtotal);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : '削除に失敗しました', { type: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  const handleValidateCoupon = async () => {
    const code = couponCode.trim();
    if (!code || !rows) return;
    setCouponValidating(true);
    setCouponResult(null);
    try {
      const result = await api.post<CouponValidation>('/coupons/validate', {
        code,
        subtotal,
      });
      setCouponResult(result);
      if (result.valid) {
        setAppliedCoupon({ code, discount_amount: result.discount_amount });
        await refresh();
        showToast('クーポンを適用しました');
      } else {
        setAppliedCoupon(null);
      }
    } catch (e) {
      setCouponResult({
        valid: false,
        discount_amount: 0,
        message: e instanceof ApiError ? e.message : 'クーポンの確認に失敗しました',
      });
      setAppliedCoupon(null);
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponResult(null);
    setCouponCode('');
  };

  /** お届け先の入力欄まで送り、フォーカスを当てる（サマリーの予告行から呼ぶ）。 */
  const focusAddress = () => {
    addressRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    addressRef.current?.focus({ preventScroll: true });
  };

  // 住所帳の選択でも手入力でもない＝このままでは注文を確定できない状態。
  // 「押してからエラーで戻される」順序にしないため、CTA の直上で先に予告する。
  const usingSavedAddress = addresses.length > 0 && selectedAddressId !== 'manual';
  const addressMissing = !usingSavedAddress && !address.trim();

  const handleOrder = async () => {
    const useSavedAddress = addresses.length > 0 && selectedAddressId !== 'manual';
    if (!useSavedAddress && !address.trim()) {
      setAddressError('配送先住所を入力してください');
      focusAddress();
      return;
    }
    setAddressError('');
    setSubmitting(true);
    setOrderError('');
    // ファネルの中間段。入力が揃って実際に注文処理へ進んだ時点を記録する
    // （カートを開いただけの人と、購入まで踏み込んだ人を区別するため）。
    track(EVENT_BEGIN_CHECKOUT, { value: total });
    try {
      const payload: Record<string, unknown> = {};
      if (useSavedAddress) {
        payload.address_id = selectedAddressId;
      } else {
        payload.shipping_address = address.trim();
      }
      if (appliedCoupon) {
        payload.coupon_code = appliedCoupon.code;
      }
      const order = await api.post<{ id: number }>('/orders', payload);
      await refresh();
      showToast('ご注文ありがとうございます');
      if (order?.id) {
        router.push(`/orders/${order.id}?thanks=1`);
      } else {
        router.push('/orders');
      }
    } catch (e) {
      setOrderError(e instanceof ApiError ? e.message : '注文に失敗しました');
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="wrap band-lg flex items-center text-body text-ink-muted">
        <Spinner className="mr-2" />
        読み込み中...
      </div>
    );
  }

  /**
   * 明細行の削除ボタン。<md は品名行の右上、md 以上は操作行の末尾に置くため、
   * 造形を1つに保ったまま2箇所へ出す（同時に見えるのは常に片方だけ）。
   * h-9 + .hit（±6px）＝ 実効 48px。
   */
  const removeButton = (row: CartRow, className = '') => (
    <button
      type="button"
      onClick={() => setRemoveTarget(row)}
      disabled={updatingId === row.targetId}
      aria-label={`${row.product.name}を削除`}
      className={`hit inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors duration-fast hover:bg-critical-50 hover:text-critical-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-50 ${className}`}
    >
      <TrashIcon className="h-5 w-5" />
    </button>
  );

  const discount = appliedCoupon?.discount_amount ?? 0;
  const total = Math.max(subtotal - discount, 0);
  // 点数は「買える数量」で数える（在庫切れの行は金額にも点数にも入れない）。
  const itemCount = rows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0;
  const hasItems = Boolean(rows && rows.length > 0);
  // ゲストは注文まで進めない。カートは見せ、確定の手前でログインへ送る。
  const guestCheckout = !user;
  // 買える品が 1 つ以上あるか（在庫切れの行だけが残っている状態では確定させない）。
  const canCheckout = itemCount > 0;

  return (
    <>
      {/* 扉。全ページ共通の PageMasthead に寄せる（幅は本文と同じ wrap ＝ width="default"）。 */}
      <PageMasthead
        eyebrow="CART"
        title="カート"
        subtitle={
          guestCheckout
            ? 'ご注文の前にログインが必要です。カートの中身はそのまま引き継がれます。'
            : 'お届け先をご確認のうえ、ご注文へお進みください。'
        }
        width="default"
        motif="kettle"
        breadcrumbs={[{ label: 'ホーム', href: '/' }, { label: 'カート' }]}
        right={
          !loading && hasItems ? (
            <p className="whitespace-nowrap text-body text-ink-muted">
              全 <span className="tnum text-num-lg text-ink">{itemCount}</span> 点
            </p>
          ) : undefined
        }
      />

      <div className="wrap band-lg">
        {/* 取得失敗。文言だけで終わらせず、必ず復帰導線（再読み込み）を対で置く。 */}
        {error && (
          <div role="alert" className="mb-6 rounded-xl bg-critical-50 px-5 py-4">
            <p className="text-body text-critical-600">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError('');
                loadCart();
              }}
              className={`${btn('secondary', 'sm')} mt-3`}
            >
              再読み込み
            </button>
          </div>
        )}

        {loading && (
          <div className="divide-y divide-line border-y border-line">
            <CartRowSkeleton />
            <CartRowSkeleton />
            <CartRowSkeleton />
          </div>
        )}

        {!loading && rows && rows.length === 0 && (
          <EmptyState
            title="カートは空です"
            description="気になる道具を見つけて、カートに入れてみてください。"
            action={
              <Link href="/products" className={btn('primary', 'lg')}>
                商品を見る
              </Link>
            }
          />
        )}

        {!loading && rows && rows.length > 0 && (
          <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-10">
            {/* 左: 明細 + クーポン + お届け先 */}
            <div className="lg:col-span-7">
              <SectionHead title="ご注文の品" eyebrow="ITEMS" />

              {/* カードにせず、罫線だけの表組みにする（誌面の明細） */}
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {rows.map((row) => (
                  <li key={row.key} className="flex gap-4 py-6 sm:gap-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.product.image_url}
                      alt={row.product.name}
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.src.endsWith('/no-image.svg')) return;
                        img.onerror = null;
                        img.src = '/no-image.svg';
                      }}
                      /* 画像が載る面はイラストの地色（tile）にして額縁を消す。
                         買えない行は図版を沈ませる（一覧カードと同じ規律）。 */
                      className={`h-24 w-24 shrink-0 rounded-lg bg-tile object-cover ${
                        row.quantity === 0 ? 'opacity-50' : ''
                      }`}
                    />
                    {/* 768〜1023px（単カラムで行幅 704px）だけ「品名｜数量｜行合計｜削除」の
                        1行に組み替える。この帯では品名の右に約380pxの死空間が残っていた。
                        lg 以上は右にサマリーが入って明細カラムが 543px まで痩せ、
                        同じ1行組みだと品名の桁が 103px になって「ハンドブレン／ダー」と
                        語中で折れるので、積み上げに戻す（＝lg:block 以降のリセット）。 */}
                    <div className="min-w-0 flex-1 md:flex md:items-center md:gap-6 lg:block">
                      <div className="flex items-start justify-between gap-3 md:min-w-0 md:flex-1">
                        <div className="min-w-0">
                          <Link
                            href={`/products/${row.product.id}`}
                            className="text-h3 text-ink jp-name transition-colors duration-fast hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 rounded"
                          >
                            {/* 素の商品名を書かない。<wbr> を語句境界だけに挿し、
                                「ブルートゥースス／ピーカー」のような語中改行を止める。 */}
                            {withWordBreaks(row.product.name)}
                          </Link>
                          {/* 単価は数量が2以上のときだけ出す。数量1では「¥2,680 × 1」と
                              行合計「¥2,680」が同じ数字を2度言うだけになる。 */}
                          {row.quantity > 1 && (
                            <p className="mt-1.5 tnum text-caption text-ink-muted">
                              単価 ¥{row.product.effective_price.toLocaleString()} ×{' '}
                              {row.quantity}
                            </p>
                          )}
                          {/* 在庫で数量を丸めた・いま買えない、という申し送り。金額の変化を
                              黙って起こさず、必ず理由をその行に書く。 */}
                          {row.notice && (
                            <p role="status" className="mt-1.5 text-caption text-critical-600">
                              {row.notice}
                            </p>
                          )}
                        </div>
                        {removeButton(row, 'md:hidden lg:inline-flex')}
                      </div>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 md:mt-0 md:shrink-0 md:gap-5 lg:mt-4 lg:gap-4">
                        {/* 買えない行に数量セレクトは出さない（操作しても何も変わらない）。
                            残るのは「削除して先へ進む」導線だけ。 */}
                        {row.quantity > 0 && (
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={`qty-${row.key}`}
                              className="text-caption text-ink-muted"
                            >
                              数量
                            </label>
                            <select
                              id={`qty-${row.key}`}
                              value={row.quantity}
                              disabled={updatingId === row.targetId}
                              onChange={(e) => handleQuantityChange(row, Number(e.target.value))}
                              aria-label={`${row.product.name}の数量`}
                              style={{ backgroundImage: `url("${SELECT_CHEVRON}")` }}
                              className="tnum h-11 appearance-none rounded-md border border-line-input bg-surface bg-[length:1rem_1rem] bg-[right_0.625rem_center] bg-no-repeat pl-3.5 pr-9 text-body text-ink focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:opacity-50"
                            >
                              {Array.from(
                                { length: Math.max(row.product.stock, row.quantity, 1) },
                                (_, i) => i + 1
                              ).map((q) => (
                                <option key={q} value={q}>
                                  {q}
                                </option>
                              ))}
                            </select>
                            {updatingId === row.targetId && (
                              <Spinner className="h-4 w-4 text-ink-faint" />
                            )}
                          </div>
                        )}
                        <Price
                          value={row.subtotal}
                          size="base"
                          as="p"
                          className="tnum sm:ml-auto sm:text-right md:ml-0 md:w-28 lg:ml-auto lg:w-auto"
                        />
                        {removeButton(row, 'hidden md:inline-flex lg:hidden')}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* クーポンとお届け先は注文の入力欄なので、ログイン後にだけ出す。ゲストに
                  空欄を並べても埋められず、「入力したのに進めない」体験になるだけ。
                  ゲストの導線はサマリー側の「ログインしてご注文へ」1 本に絞る。 */}
              {!guestCheckout && (
                <>
              {/* クーポン（折りたたみ）。二次的な操作なので影は持たせず地の色差だけで浮かせる。 */}
              <div className="mt-8 overflow-hidden rounded-xl bg-sunken">
                <button
                  type="button"
                  onClick={() => setCouponOpen((o) => !o)}
                  aria-expanded={couponOpen}
                  aria-controls="coupon-panel"
                  className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 px-5 py-3.5 text-body font-medium text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                >
                  <span>
                    クーポンをお持ちの方
                    {appliedCoupon && (
                      <span className="ml-2 text-caption text-brand-700">
                        適用中: {appliedCoupon.code}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon
                    className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-fast ${
                      couponOpen ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {couponOpen && (
                  <div id="coupon-panel" className="px-5 pb-5">
                    <label htmlFor="coupon" className="sr-only">
                      クーポンコード
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="coupon"
                        type="text"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value);
                          setCouponResult(null);
                        }}
                        placeholder="例）WELCOME10"
                        disabled={Boolean(appliedCoupon)}
                        className={`${inputClass} h-11 flex-1`}
                      />
                      {appliedCoupon ? (
                        <button
                          type="button"
                          onClick={handleRemoveCoupon}
                          className={`${btn('field', 'md')} shrink-0`}
                        >
                          解除
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleValidateCoupon}
                          disabled={couponValidating || !couponCode.trim()}
                          className={`${btn('field', 'md')} shrink-0`}
                        >
                          {couponValidating ? '確認中...' : '適用する'}
                        </button>
                      )}
                    </div>
                    {couponResult && (
                      <p
                        role={couponResult.valid ? 'status' : 'alert'}
                        className={`mt-2.5 text-body ${
                          couponResult.valid ? 'text-brand-700' : 'text-critical-600'
                        }`}
                      >
                        {couponResult.valid ? 'クーポンを適用しました。' : couponResult.message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 配送先住所 */}
              <div className="mt-8 rounded-xl bg-surface p-5 shadow-paper md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <span className="block">
                    <span className="block text-eyebrow uppercase font-num text-ink-muted">
                      SHIPPING TO
                    </span>
                    <span className="mt-2 block font-mincho text-h3 text-ink">
                      お届け先
                      <span className="ml-1 text-critical-600" aria-hidden="true">
                        *
                      </span>
                      <span className="sr-only">（必須）</span>
                    </span>
                  </span>
                  {/* h-8(32px) + .hit(±6px) = 実効 44px。見た目の丈は変えない。 */}
                  <Link
                    href="/account/addresses"
                    className="hit inline-flex h-8 items-center rounded text-caption text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                  >
                    住所帳を管理
                  </Link>
                </div>

                {addressesLoaded && addresses.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {addresses.map((a) => (
                      <label
                        key={a.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-body transition-colors duration-fast ${
                          selectedAddressId === a.id
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-line-strong hover:border-line-input'
                        }`}
                      >
                        <input
                          type="radio"
                          name="address-choice"
                          className="mt-1.5 accent-brand-600"
                          checked={selectedAddressId === a.id}
                          onChange={() => {
                            setSelectedAddressId(a.id);
                            setAddressError('');
                          }}
                        />
                        <span className="min-w-0">
                          <span className="font-medium text-ink">{a.recipient_name}</span>
                          {a.is_default && (
                            <span className="ml-2 text-caption text-brand-700">既定</span>
                          )}
                          <br />
                          <span className="text-caption text-ink-muted">
                            〒<span className="tnum">{a.postal_code}</span> {a.prefecture}
                            {a.city}
                            {a.address_line}
                            <br />
                            <span className="tnum">{a.phone}</span>
                          </span>
                        </span>
                      </label>
                    ))}
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-body transition-colors duration-fast ${
                        selectedAddressId === 'manual'
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-line-strong hover:border-line-input'
                      }`}
                    >
                      <input
                        type="radio"
                        name="address-choice"
                        className="mt-1.5 accent-brand-600"
                        checked={selectedAddressId === 'manual'}
                        onChange={() => setSelectedAddressId('manual')}
                      />
                      <span className="text-ink-soft">別の住所を入力する</span>
                    </label>
                  </div>
                )}

                {(addresses.length === 0 || selectedAddressId === 'manual') && (
                  <>
                    <textarea
                      id="address"
                      ref={addressRef}
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        if (addressError) setAddressError('');
                      }}
                      rows={3}
                      placeholder="例）東京都渋谷区〇〇1-2-3"
                      aria-invalid={Boolean(addressError)}
                      aria-describedby={addressError ? 'address-error' : undefined}
                      className={`${textareaClass} mt-4 py-2.5 ${
                        addressError ? 'border-critical-400' : ''
                      }`}
                    />
                    {addressError && (
                      <p id="address-error" role="alert" className="mt-1.5 text-body text-critical-600">
                        {addressError}
                      </p>
                    )}
                  </>
                )}
              </div>
                </>
              )}
            </div>

            {/* 右: お支払い金額のサマリー。スクロールに追従させ、CTA を常に視界へ置く。 */}
            <aside className="mt-10 lg:col-span-5 lg:mt-0 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
              <div className="rounded-xl bg-surface p-6 shadow-lift md:p-7">
                <SectionHead title="お支払い金額" eyebrow="SUMMARY" />

                <dl className="mt-6 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-body text-ink-muted">
                      小計（<span className="tnum">{itemCount}</span>点）
                    </dt>
                    <dd>
                      <Price value={subtotal} size="base" as="span" className="tnum" />
                    </dd>
                  </div>
                  {appliedCoupon && (
                    <div className="flex items-baseline justify-between gap-4 text-brand-700">
                      <dt className="text-body font-medium">
                        クーポン割引（{appliedCoupon.code}）
                      </dt>
                      <dd className="tnum text-body font-medium">
                        -¥{discount.toLocaleString()}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-body text-ink-muted">送料</dt>
                    <dd className="text-body font-medium text-ink">無料</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
                    <dt className="text-body font-medium text-ink-soft">合計</dt>
                    <dd className="tnum text-num-lg text-ink">
                      <span className="mr-[0.1em] align-baseline text-[0.68em] font-medium text-ink-muted">
                        ¥
                      </span>
                      {total.toLocaleString()}
                    </dd>
                  </div>
                </dl>

                {/* 押してから弾かれる順序にしないための予告。
                    デスクトップではお届け先が左カラム（CTA の遥か下）にあるため、
                    「まだ確定できない」ことと入力欄への近道を CTA の直上に置く。 */}
                {!guestCheckout && addressMissing && (
                  <div className="mt-6 rounded-lg bg-sunken px-4 py-4">
                    <p className="text-caption text-ink-soft">
                      ご注文にはお届け先の入力が必要です。
                    </p>
                    <button
                      type="button"
                      onClick={focusAddress}
                      className={`${btn('secondary', 'sm')} mt-2.5`}
                    >
                      お届け先を入力する
                    </button>
                  </div>
                )}

                {/* 確定失敗の復帰導線。トーストではなく操作の直上に残す。 */}
                {orderError && (
                  <div role="alert" className="mt-6 rounded-lg bg-critical-50 px-4 py-4">
                    <p className="text-body text-critical-600">{orderError}</p>
                    <button
                      type="button"
                      onClick={handleOrder}
                      disabled={submitting}
                      className={`${btn('secondary', 'sm')} mt-2.5`}
                    >
                      もう一度試す
                    </button>
                  </div>
                )}

                {/* 買える品が 1 つも無い（全行が在庫切れ・販売停止）ときは、押しても
                    サーバーに弾かれるだけなので確定させない。 */}
                {!canCheckout && (
                  <p role="status" className="mt-6 rounded-lg bg-sunken px-4 py-4 text-caption text-ink-soft">
                    ご注文いただける品がありません。在庫切れの品を外すか、別の道具をお選びください。
                  </p>
                )}

                {guestCheckout ? (
                  <>
                    {/* ゲストにログインを求めるのはここだけ。カートに入れる時点では求めない
                        （そこで求めると、買う気になった瞬間の意思がほぼ戻ってこない）。
                        中身が引き継がれることを明示しないと、押す前に離脱する。 */}
                    <Link
                      href="/login?redirect=/cart"
                      aria-disabled={!canCheckout}
                      className={`${btn('primary', 'lg')} mt-6 w-full ${
                        canCheckout ? '' : 'pointer-events-none opacity-50'
                      }`}
                    >
                      ログインしてご注文へ
                    </Link>
                    <Link
                      href="/register?redirect=/cart"
                      className={`${btn('secondary', 'md')} mt-3 w-full`}
                    >
                      はじめての方は会員登録
                    </Link>
                    <p className="mt-3 text-caption text-ink-muted">
                      カートの中身はそのまま引き継がれます。送料は全国一律無料です。
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleOrder}
                      disabled={submitting || !canCheckout}
                      className={`${btn('primary', 'lg')} mt-6 w-full`}
                    >
                      {submitting ? '注文処理中...' : '注文を確定する'}
                    </button>
                    <p className="mt-3 text-caption text-ink-muted">
                      送料は全国一律無料です。お届け先を確認のうえご注文ください。
                    </p>
                  </>
                )}
              </div>
            </aside>
          </div>
        )}

        <ConfirmDialog
          open={removeTarget !== null}
          title={removeTarget ? `「${removeTarget.product.name}」を削除しますか？` : ''}
          description="この商品をカートから取り除きます。"
          confirmLabel="削除する"
          danger
          busy={removing}
          onConfirm={confirmRemove}
          onCancel={() => {
            if (!removing) setRemoveTarget(null);
          }}
        />
      </div>
    </>
  );
}
