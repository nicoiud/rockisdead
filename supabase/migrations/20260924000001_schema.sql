-- =====================================================================
-- Rock Is Dead — esquema principal
-- Tablas, tipos, índices y triggers.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.user_role as enum ('customer', 'staff', 'admin');
create type public.product_status as enum ('draft', 'active', 'inactive');
create type public.order_status as enum (
  'pending_payment',   -- pendiente (Mercado Pago)
  'pending_transfer',  -- pendiente de transferencia
  'paid',              -- pagado
  'preparing',         -- en preparación
  'shipped',           -- enviado
  'delivered',         -- entregado
  'cancelled',         -- cancelado
  'rejected'           -- pago rechazado
);
create type public.payment_method as enum ('mercado_pago', 'transfer');
create type public.payment_status as enum ('pending', 'in_review', 'approved', 'rejected', 'refunded', 'cancelled');
create type public.stock_reason as enum ('initial', 'manual', 'sale', 'cancel', 'import', 'bulk');

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  document text,                        -- DNI/CUIT (útil para envíos y facturación)
  role public.user_role not null default 'customer',
  -- Permisos para rol staff: products, orders, reports, analytics, users, settings
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  recipient text not null,
  phone text,
  street text not null,
  number text not null,
  apartment text,
  city text not null,
  province text not null,
  postal_code text not null,
  notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category_id uuid references public.categories (id) on delete set null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  compare_at_price numeric(12, 2) check (compare_at_price >= 0),
  status public.product_status not null default 'draft',
  featured boolean not null default false,
  -- Opciones de variantes definidas por producto, en orden:
  -- [{"name": "Talle", "values": ["S","M","L"]}, {"name": "Color", "values": ["Negro"]}]
  options jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_status_idx on public.products (status);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create or replace function public.products_set_published_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end $$;
create trigger products_published before insert or update of status on public.products
  for each row execute function public.products_set_published_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  path text,                            -- ruta en Storage (null si es URL externa)
  alt text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, position);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  -- {"Talle": "L", "Color": "Negro"}; {} para producto sin variantes
  options jsonb not null default '{}'::jsonb,
  title text not null default '',       -- "L / Negro" (calculado por la app)
  sku text unique,
  price numeric(12, 2) check (price >= 0),              -- null = usa el precio del producto
  compare_at_price numeric(12, 2) check (compare_at_price >= 0),
  stock int not null default 0,
  active boolean not null default true,
  position int not null default 0,
  image_id uuid references public.product_images (id) on delete set null,
  low_stock_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, options)
);
create index product_variants_product_idx on public.product_variants (product_id, position);
create trigger product_variants_touch before update on public.product_variants
  for each row execute function public.touch_updated_at();

create table public.stock_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  delta int not null,
  stock_after int not null,
  reason public.stock_reason not null,
  order_id uuid,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_created_idx on public.stock_movements (created_at desc);

-- ---------------------------------------------------------------------
-- Carrito (invitado por cookie o usuario logueado)
-- ---------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger carts_touch before update on public.carts
  for each row execute function public.touch_updated_at();

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

-- ---------------------------------------------------------------------
-- Envíos
-- ---------------------------------------------------------------------
create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  free_over numeric(12, 2) check (free_over >= 0),   -- envío gratis desde este subtotal
  requires_address boolean not null default true,   -- false = retiro en local
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pedidos y pagos
-- ---------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  customer_name text not null,
  phone text,
  document text,
  status public.order_status not null,
  payment_method public.payment_method not null,
  subtotal numeric(12, 2) not null,
  shipping_cost numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  shipping_method_id uuid references public.shipping_methods (id) on delete set null,
  shipping_method_name text,
  shipping_address jsonb,
  notes text,
  tracking_code text,
  access_token text not null default encode(gen_random_bytes(16), 'hex'),
  stock_applied boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id);
create index orders_email_idx on public.orders (lower(email));
create index orders_status_idx on public.orders (status);
create index orders_created_idx on public.orders (created_at desc);
create index orders_paid_idx on public.orders (paid_at);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  variant_title text,
  sku text,
  quantity int not null check (quantity > 0),
  unit_price numeric(12, 2) not null,
  image_url text
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  amount numeric(12, 2) not null,
  receipt_path text,                    -- comprobante de transferencia (bucket receipts)
  receipt_uploaded_at timestamptz,
  mp_preference_id text,
  mp_payment_id text unique,
  mp_status text,
  mp_status_detail text,
  raw jsonb,
  review_note text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------------------------------------------------------------------
-- Visitas
-- ---------------------------------------------------------------------
create table public.page_views (
  id bigint generated always as identity primary key,
  path text not null,
  product_id uuid references public.products (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  visitor_id text not null,
  referrer text,
  source text not null default 'direct',   -- direct | search | social | email | ads | referral
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);
create index page_views_created_idx on public.page_views (created_at);
create index page_views_path_idx on public.page_views (path);
create index page_views_product_idx on public.page_views (product_id);

-- ---------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------
create table public.store_settings (
  id int primary key default 1 check (id = 1),
  store_name text not null default 'Rock Is Dead',
  logo_url text,
  contact_email text,
  contact_phone text,
  whatsapp text,                        -- número en formato internacional, ej 5491122334455
  instagram text,
  address text,
  bank_name text,
  bank_holder text,
  bank_cuit text,
  bank_cbu text,
  bank_alias text,
  transfer_instructions text,
  transfer_discount_pct numeric(5, 2) not null default 0 check (transfer_discount_pct >= 0 and transfer_discount_pct < 100),
  mp_public_key text,
  mp_enabled boolean not null default true,
  transfer_enabled boolean not null default true,
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default true,
  admin_email text,
  low_stock_threshold int not null default 3,
  -- [{"image": "...", "title": "...", "subtitle": "...", "link": "/productos"}]
  banners jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- Secretos: nunca expuestos al cliente (sin políticas RLS => solo service role)
create table public.private_settings (
  id int primary key default 1 check (id = 1),
  mp_access_token text,
  mp_webhook_secret text,
  updated_at timestamptz not null default now()
);
create trigger private_settings_touch before update on public.private_settings
  for each row execute function public.touch_updated_at();

insert into public.store_settings (id) values (1);
insert into public.private_settings (id) values (1);

-- ---------------------------------------------------------------------
-- Alta automática de perfil al registrarse
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

-- Resumen de producto para listados (respeta RLS de products)
create view public.product_overview with (security_invoker = true) as
select
  p.id,
  p.name,
  p.slug,
  p.description,
  p.category_id,
  c.name as category_name,
  c.slug as category_slug,
  p.price,
  p.compare_at_price,
  p.status,
  p.featured,
  p.tags,
  p.options,
  p.published_at,
  p.created_at,
  p.updated_at,
  coalesce(v.variant_count, 0) as variant_count,
  coalesce(v.total_stock, 0) as total_stock,
  coalesce(v.min_stock, 0) as min_stock,
  coalesce(v.min_price, p.price) as min_price,
  coalesce(v.max_price, p.price) as max_price,
  img.url as image_url,
  img2.url as image_url_2
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (
  select
    count(*)::int as variant_count,
    sum(greatest(pv.stock, 0))::int as total_stock,
    min(pv.stock)::int as min_stock,
    min(coalesce(pv.price, p.price)) as min_price,
    max(coalesce(pv.price, p.price)) as max_price
  from public.product_variants pv
  where pv.product_id = p.id and pv.active
) v on true
left join lateral (
  select pi.url from public.product_images pi
  where pi.product_id = p.id order by pi.position, pi.created_at limit 1
) img on true
left join lateral (
  select pi.url from public.product_images pi
  where pi.product_id = p.id order by pi.position, pi.created_at offset 1 limit 1
) img2 on true;

-- Clientes con métricas de compra (solo service role)
create view public.customer_stats as
select
  pr.id,
  pr.email,
  pr.full_name,
  pr.phone,
  pr.role,
  pr.active,
  pr.created_at,
  coalesce(o.orders_count, 0) as orders_count,
  coalesce(o.total_spent, 0) as total_spent,
  o.last_order_at
from public.profiles pr
left join lateral (
  select
    count(*)::int as orders_count,
    sum(total) as total_spent,
    max(created_at) as last_order_at
  from public.orders
  where user_id = pr.id and status in ('paid', 'preparing', 'shipped', 'delivered')
) o on true;
