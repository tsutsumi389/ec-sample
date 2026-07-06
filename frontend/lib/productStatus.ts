import type { BadgeVariant } from '@/components/Badge';
import type { ProductStatus } from '@/lib/types';

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
}

/** status を単一の源として、表示ラベル・色をここに集約する。 */
export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  draft: { adminLabel: '下書き', variant: 'neutral', storefrontLabel: null },
  coming_soon: { adminLabel: '近日発売', variant: 'info', storefrontLabel: '近日発売' },
  on_sale: { adminLabel: '公開中', variant: 'success', storefrontLabel: null },
  suspended: { adminLabel: '一時停止', variant: 'warning', storefrontLabel: '販売停止中' },
  discontinued: { adminLabel: '販売終了', variant: 'neutral', storefrontLabel: '販売終了' },
  archived: { adminLabel: 'アーカイブ', variant: 'neutral', storefrontLabel: null },
};

/** 管理画面で選択できる状態（archived は削除操作でのみ遷移するため除外）。 */
export const ADMIN_SELECTABLE_STATUSES: ProductStatus[] = [
  'draft',
  'coming_soon',
  'on_sale',
  'suspended',
  'discontinued',
];
