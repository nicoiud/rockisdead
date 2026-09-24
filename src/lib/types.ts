export type UserRole = "customer" | "staff" | "admin";
export type ProductStatus = "draft" | "active" | "inactive";
export type OrderStatus =
  | "pending_payment"
  | "pending_transfer"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "rejected";
export type PaymentMethod = "mercado_pago" | "transfer";
export type PaymentStatus = "pending" | "in_review" | "approved" | "rejected" | "refunded" | "cancelled";
export type StockReason = "initial" | "manual" | "sale" | "cancel" | "import" | "bulk";

export const PERMISSIONS = ["products", "orders", "reports", "analytics", "users", "settings"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  document: string | null;
  role: UserRole;
  permissions: string[];
  active: boolean;
  created_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string | null;
  recipient: string;
  phone: string | null;
  street: string;
  number: string;
  apartment: string | null;
  city: string;
  province: string;
  postal_code: string;
  notes: string | null;
  is_default: boolean;
}

export type ShippingAddress = Omit<Address, "id" | "user_id" | "is_default" | "label">;

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  active: boolean;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  price: number;
  compare_at_price: number | null;
  status: ProductStatus;
  featured: boolean;
  options: ProductOption[];
  tags: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  path: string | null;
  alt: string | null;
  position: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  options: Record<string, string>;
  title: string;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  active: boolean;
  position: number;
  image_id: string | null;
}

export interface ProductOverview {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  price: number;
  compare_at_price: number | null;
  status: ProductStatus;
  featured: boolean;
  tags: string[];
  options: ProductOption[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
  variant_count: number;
  total_stock: number;
  min_stock: number;
  min_price: number;
  max_price: number;
  image_url: string | null;
  image_url_2: string | null;
}

export interface ShippingMethod {
  id: string;
  name: string;
  description: string | null;
  price: number;
  free_over: number | null;
  requires_address: boolean;
  active: boolean;
  sort_order: number;
}

export interface Order {
  id: string;
  number: number;
  user_id: string | null;
  email: string;
  customer_name: string;
  phone: string | null;
  document: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  shipping_method_id: string | null;
  shipping_method_name: string | null;
  shipping_address: ShippingAddress | null;
  notes: string | null;
  tracking_code: string | null;
  access_token: string;
  stock_applied: boolean;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  unit_price: number;
  image_url: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  receipt_path: string | null;
  receipt_uploaded_at: string | null;
  mp_preference_id: string | null;
  mp_payment_id: string | null;
  mp_status: string | null;
  mp_status_detail: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface OrderStatusHistory {
  id: number;
  order_id: string;
  status: OrderStatus;
  note: string | null;
  created_at: string;
}

export interface Banner {
  image: string;
  title?: string;
  subtitle?: string;
  link?: string;
}

export interface StoreSettings {
  store_name: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  address: string | null;
  bank_name: string | null;
  bank_holder: string | null;
  bank_cuit: string | null;
  bank_cbu: string | null;
  bank_alias: string | null;
  transfer_instructions: string | null;
  transfer_discount_pct: number;
  mp_public_key: string | null;
  mp_enabled: boolean;
  transfer_enabled: boolean;
  notify_email: boolean;
  notify_whatsapp: boolean;
  admin_email: string | null;
  low_stock_threshold: number;
  banners: Banner[];
}

/** Resultado estándar de server actions usadas con useActionState. */
export type ActionState = { ok?: boolean; error?: string; message?: string } | null;
