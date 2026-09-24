import type { OrderStatus, PaymentMethod, PaymentStatus, ProductStatus, StockReason, Permission } from "./types";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pendiente de pago",
  pending_transfer: "Pendiente de transferencia",
  paid: "Pagado",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  rejected: "Pago rechazado",
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
export const SALE_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];
export const PENDING_STATUSES: OrderStatus[] = ["pending_payment", "pending_transfer"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  mercado_pago: "Mercado Pago",
  transfer: "Transferencia",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  in_review: "Comprobante a revisar",
  approved: "Aprobado",
  rejected: "Rechazado",
  refunded: "Devuelto",
  cancelled: "Cancelado",
};

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Borrador",
  active: "Publicado",
  inactive: "Oculto",
};

export const STOCK_REASON_LABEL: Record<StockReason, string> = {
  initial: "Inicial",
  manual: "Ajuste manual",
  sale: "Venta",
  cancel: "Cancelación",
  import: "Importación",
  bulk: "Edición masiva",
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  products: "Productos y stock",
  orders: "Pedidos",
  reports: "Ventas / reportes",
  analytics: "Visitas",
  users: "Usuarios",
  settings: "Configuración",
};

export const SOURCE_LABEL: Record<string, string> = {
  direct: "Directo",
  search: "Buscadores",
  social: "Redes sociales",
  email: "Email",
  ads: "Publicidad",
  referral: "Otros sitios",
};
