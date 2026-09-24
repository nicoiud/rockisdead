-- =====================================================================
-- Rock Is Dead — seguridad (RLS, permisos y Storage)
--
-- Modelo:
--  * El cliente (anon/authenticated) solo puede LEER catálogo público y
--    sus propios datos (perfil, direcciones, pedidos).
--  * Toda escritura sensible (checkout, pagos, admin) pasa por el servidor
--    con la service role key, previa verificación de sesión y rol.
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_movements enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.page_views enable row level security;
alter table public.store_settings enable row level security;
alter table public.private_settings enable row level security;

-- Perfil propio
create policy "profiles: leer propio" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "profiles: editar propio" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Un cliente solo puede modificar estos campos (no rol, permisos ni estado)
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, document) on public.profiles to authenticated;

-- Direcciones propias
create policy "addresses: propias" on public.addresses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Catálogo público
create policy "categories: lectura" on public.categories
  for select using (active or public.is_staff());
create policy "products: lectura" on public.products
  for select using (status = 'active' or public.is_staff());
create policy "product_images: lectura" on public.product_images
  for select using (exists (
    select 1 from public.products p where p.id = product_id and (p.status = 'active' or public.is_staff())
  ));
create policy "product_variants: lectura" on public.product_variants
  for select using (exists (
    select 1 from public.products p where p.id = product_id and (p.status = 'active' or public.is_staff())
  ));
create policy "shipping_methods: lectura" on public.shipping_methods
  for select using (active or public.is_staff());
create policy "store_settings: lectura" on public.store_settings
  for select using (true);

-- Pedidos propios (solo lectura)
create policy "orders: propios" on public.orders
  for select to authenticated using (user_id = auth.uid());
create policy "order_items: propios" on public.order_items
  for select to authenticated using (exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
  ));
create policy "payments: propios" on public.payments
  for select to authenticated using (exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
  ));
create policy "order_status_history: propios" on public.order_status_history
  for select to authenticated using (exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
  ));

-- carts, cart_items, stock_movements, page_views, private_settings:
-- sin políticas => inaccesibles para anon/authenticated (solo service role).

-- Vistas: customer_stats solo service role
revoke all on public.customer_stats from anon, authenticated;

-- ---------------------------------------------------------------------
-- Funciones: nadie salvo el servidor puede ejecutarlas vía API
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('products', 'products', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']),
  ('store', 'store', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']),
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- El staff sube imágenes de productos y de la tienda directo desde el navegador
create policy "storage: staff escribe products/store" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('products', 'store') and public.is_staff());
create policy "storage: staff actualiza products/store" on storage.objects
  for update to authenticated
  using (bucket_id in ('products', 'store') and public.is_staff());
create policy "storage: staff borra products/store" on storage.objects
  for delete to authenticated
  using (bucket_id in ('products', 'store') and public.is_staff());
-- receipts: solo service role (los comprobantes se suben vía servidor y se ven con URLs firmadas)
