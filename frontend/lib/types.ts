export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
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
