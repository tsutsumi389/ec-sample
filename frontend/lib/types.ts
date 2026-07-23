export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export type ProductStatus =
  | 'draft'
  | 'coming_soon'
  | 'on_sale'
  | 'suspended'
  | 'discontinued'
  | 'archived';

export interface ProductImage {
  id: number;
  image_url: string;
  sort_order: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string | null;
  description: string;
  price: number;
  sale_price: number | null;
  /** 実売価格（sale_price があればそれ、なければ price）。表示・計算の基準。 */
  effective_price: number;
  stock: number;
  status: ProductStatus;
  /** 購入可能か（status==on_sale かつ在庫あり）。 */
  purchasable: boolean;
  image_url: string;
  images: ProductImage[];
  category_id: number | null;
  avg_rating: number | null;
  review_count: number;
  created_at: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
}

/**
 * サジェストの「商品ダイレクト候補」。検索を確定せずに商品詳細へ直接飛べるよう、
 * 表示に必要な最小限のフィールドだけを持つ（Product 全体ではない）。
 */
export interface SuggestProduct {
  id: number;
  name: string;
  image_url: string | null;
  price: number;
  sale_price: number | null;
  /** 実売価格（sale_price があればそれ、なければ price）。表示の基準。 */
  effective_price: number;
}

/**
 * GET /products/suggest のレスポンス。
 * - `suggestions`: 商品名にマッチした検索語候補の配列（従来どおり）。
 * - `products`: 商品ダイレクト候補（最大3件）。古いバックエンドでは欠損し得るため、
 *   受信側は `res.products ?? []` で必ず欠損に耐えること。
 */
export interface SuggestResponse {
  suggestions: string[];
  products?: SuggestProduct[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

export interface Review {
  id: number;
  product_id: number;
  user_id: number;
  user_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface WishlistItem {
  id: number;
  product: Product;
  created_at: string;
}

/**
 * 商品ページの購入前Q&A（質問とAI回答）。
 * source==='fallback' は自動回答をご用意できなかった場合の定型文。
 * answerable===false は「商品情報からは判断できない」旨のAI回答。
 */
export interface ProductQuestion {
  id: string;
  question: string;
  answer: string;
  source: 'llm' | 'fallback';
  answerable: boolean;
  asker_name: string;
  created_at: string;
}

export interface Address {
  id: number;
  recipient_name: string;
  postal_code: string;
  prefecture: string;
  city: string;
  address_line: string;
  phone: string;
  is_default: boolean;
  created_at: string;
}

export type CouponDiscountType = 'percent' | 'fixed';

export interface Coupon {
  id: number;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface CouponValidation {
  valid: boolean;
  discount_amount: number;
  message: string;
}

export interface CartItem {
  id: number;
  product: Product;
  quantity: number;
  subtotal: number;
}

export interface Cart {
  items: CartItem[];
  total_amount: number;
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: number;
  user_id: number;
  total_amount: number;
  discount_amount: number;
  coupon_code: string | null;
  status: OrderStatus;
  shipping_address: string;
  created_at: string;
  items?: OrderItem[];
}

export interface ReorderItem {
  product_id: number;
  product_name: string;
  quantity: number;
  /** 追加できなかった理由・一部のみ追加した理由。通常の追加成功時は null。 */
  reason: string | null;
}

export interface ReorderResult {
  cart: Cart;
  added: ReorderItem[];
  skipped: ReorderItem[];
}

export interface AdminOrderUser {
  id: number;
  email: string;
  name: string;
}

export interface AdminOrder extends Order {
  user: AdminOrderUser;
  items?: OrderItem[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface RecommendationItem {
  product: Product;
  reason: string | null;
}

export interface RecommendationResponse {
  source: 'llm' | 'fallback';
  items: RecommendationItem[];
}

/**
 * ホーム（GET /home）のレーン描画形式。
 * バックエンドはこの3つ以外を返さない契約。
 */
export type HomeSectionLayout = 'hero' | 'ranked' | 'lane';

/**
 * ホームの1レーン。
 * - `key` は同一レスポンス内で一意（React の key に使える）。`billboard` / `top10` /
 *   `byw:{product_id}` / `category:{category_id}` などの名前空間を持つ。
 * - `title` は layout==='hero' のときのみ null になり得る。
 * - `subtitle` は Phase 1 では常に null。
 */
export interface HomeSection {
  key: string;
  title: string | null;
  subtitle: string | null;
  layout: HomeSectionLayout;
  items: RecommendationItem[];
}

/**
 * GET /home のレスポンス。
 * - source==='personalized': 行動履歴（ログイン or recently_viewed_ids）由来のレーンを含む
 * - source==='popular': 非パーソナライズのみ（コールドスタート）
 * `sections` は空配列になり得る（商品が1件も無い場合）。
 */
export interface HomeResponse {
  source: 'personalized' | 'popular';
  sections: HomeSection[];
}

export type AssistantSource = 'llm' | 'fallback';

export type AssistantRole = 'user' | 'assistant';

/**
 * チャット内で提案される商品。既存レコメンドの item 型（product + reason）と同型。
 */
export type AssistantProduct = RecommendationItem;

/**
 * POST /assistant/chat のレスポンス。
 * source==='fallback' はキーワード検索フォールバックの応答。
 */
export interface AssistantChatResponse {
  conversation_id: string;
  source: AssistantSource;
  reply: string;
  products: AssistantProduct[];
}

/**
 * GET /assistant/conversations/{id}/messages の1メッセージ。
 * 履歴復元用。バックエンドの追加フィールドを許容するため型は緩めに受ける。
 */
export interface AssistantMessage {
  role: AssistantRole;
  content: string;
  source?: AssistantSource | null;
  products?: AssistantProduct[] | null;
}

// ---------- A/Bテスト（実験）と行動ログ ----------

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface ExperimentVariant {
  id: number;
  key: string;
  name: string;
  /** 配分比率。合計100である必要はなく、比として扱われる。 */
  weight: number;
  /** 対照群。リフト計算の基準になる枝で、実験内でちょうど1つ。 */
  is_control: boolean;
  /** 枝ごとの設定値。レイアウトや文言はここから読む。 */
  config: Record<string, unknown> | null;
}

export interface Experiment {
  id: number;
  key: string;
  name: string;
  description: string | null;
  status: ExperimentStatus;
  /** 実験対象に含める訪問者の割合（%）。 */
  traffic_allocation: number;
  /** 主要指標にするイベント名。 */
  primary_metric: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  variants: ExperimentVariant[];
}

export interface VariantResult {
  variant_key: string;
  name: string;
  is_control: boolean;
  exposures: number;
  conversions: number;
  conversion_rate: number;
  value_sum: number;
  value_per_user: number;
  /** 対照群比のリフト（%）。対照群自身は null。 */
  lift: number | null;
  lift_ci_low: number | null;
  lift_ci_high: number | null;
  p_value: number | null;
  is_significant: boolean;
}

export interface FunnelStep {
  name: string;
  /** variant_key -> 到達訪問者数。 */
  counts: Record<string, number>;
}

export interface SrmCheck {
  expected: Record<string, number>;
  observed: Record<string, number>;
  p_value: number | null;
  /** true なら割り当てか計測に不具合の疑いがあり、結果を信用してはいけない。 */
  is_mismatch: boolean;
}

export interface ExperimentResult {
  experiment: Experiment;
  metric: string;
  total_exposures: number;
  variants: VariantResult[];
  funnel: FunnelStep[];
  srm: SrmCheck;
}

/** 実験作成時の枝の入力値。 */
export interface ExperimentVariantInput {
  key: string;
  name: string;
  weight: number;
  is_control: boolean;
  config: Record<string, unknown> | null;
}
