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
