import type { BadgeVariant } from '@/components/Badge';
import type { ProductStatus } from '@/lib/types';

/**
 * 「残り N点」で購入を急がせる在庫の上限。
 * StockLabel の分岐と、札を出すかどうかを決める呼び出し側の判定が**同じ数**を見るための唯一の源。
 * 以前は 5 が StockLabel・ProductCard・AssistantProductCard・商品詳細の4箇所に散っていて、
 * 変えると「札が出る条件」と「札の文言」がずれた。
 */
export const LOW_STOCK_THRESHOLD = 5;

/** 在庫と status を組み合わせた導出。status だけでは決まらないので個別に持つ。 */
type StockFacts = { status: ProductStatus; stock: number };

/** 販売中なのに在庫が尽きている（＝買えないが、状態としては on_sale）。 */
export function isSoldOut(product: StockFacts): boolean {
  return product.status === 'on_sale' && product.stock <= 0;
}

/** 残りわずか。急ぐ理由がある状態だけ色を使うため、在庫切れは含めない。 */
export function isLowStock(product: StockFacts): boolean {
  return (
    product.status === 'on_sale' && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD
  );
}

interface StatusMeta {
  /** 管理画面の状態カラム用ラベル（全状態）。 */
  adminLabel: string;
  /** バッジ色。 */
  variant: BadgeVariant;
  /**
   * 店頭（商品カード・詳細）に表示するバッジ文言。
   * null の場合は店頭でバッジを出さない（on_sale など）。
   */
  storefrontLabel: string | null;
  /**
   * 図版を沈ませる（買えないことを色でも伝える）状態か。
   * 「在庫切れは全面ディム、販売停止中は通常濃度」という非対称を無くすための唯一の源。
   * coming_soon は"これから買える"ので沈ませない（沈むのは買えなくなった状態だけ）。
   */
  dimmed: boolean;
}

/**
 * status を単一の源として、表示ラベル・色・図版の沈み方をここに集約する。
 * variant は Badge の新体系（brand / accent / neutral）で指定する。
 * 販売に関わる状態は brand、注意を促す状態は accent、それ以外は neutral。
 *
 * ⚠ 呼び出し側で variant をハードコードしないこと。商品カード（図版の上）と
 *   関連商品（本文中）で同じ状態が別色になっていたのは、カード側が variant を
 *   捨てて invert を直書きしていたため。写真の上での可読性は Badge の
 *   `elevated`（縁＋影）で担保し、色はこの表の値をそのまま使う。
 */
export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  draft: { adminLabel: '下書き', variant: 'neutral', storefrontLabel: null, dimmed: false },
  coming_soon: { adminLabel: '近日発売', variant: 'brand', storefrontLabel: '近日発売', dimmed: false },
  on_sale: { adminLabel: '公開中', variant: 'brand', storefrontLabel: null, dimmed: false },
  suspended: { adminLabel: '一時停止', variant: 'accent', storefrontLabel: '販売停止中', dimmed: true },
  discontinued: { adminLabel: '販売終了', variant: 'neutral', storefrontLabel: '販売終了', dimmed: true },
  archived: { adminLabel: 'アーカイブ', variant: 'neutral', storefrontLabel: null, dimmed: true },
};

/**
 * 在庫切れ（status は on_sale のまま stock が 0）の札。
 * status ではないので PRODUCT_STATUS_META には入らないが、**文言と色の源はここ1箇所**にする。
 * 以前はカードが invert（濃緑ベタ・白抜き）、関連商品行が neutral（無地）と別色だった。
 * 図版の上に重ねるときは Badge の `elevated`（縁＋影）だけを足し、色は変えない。
 */
export const SOLD_OUT_BADGE = { label: '在庫切れ', variant: 'neutral' as BadgeVariant };

/** 管理画面で選択できる状態（archived は削除操作でのみ遷移するため除外）。 */
export const ADMIN_SELECTABLE_STATUSES: ProductStatus[] = [
  'draft',
  'coming_soon',
  'on_sale',
  'suspended',
  'discontinued',
];
