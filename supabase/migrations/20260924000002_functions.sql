-- =====================================================================
-- Rock Is Dead — lógica de negocio en la base (transaccional)
-- Todas estas funciones se ejecutan SOLO desde el servidor (service role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de rol (usados por RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin') and active
  );
$$;

-- ---------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------

-- Ajuste relativo de stock con registro de movimiento. Devuelve el stock nuevo.
create or replace function public.adjust_stock(
  p_variant uuid,
  p_delta int,
  p_reason public.stock_reason,
  p_note text default null,
  p_actor uuid default null,
  p_order uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
begin
  if p_delta = 0 then
    select stock into v_stock from public.product_variants where id = p_variant;
    return v_stock;
  end if;

  update public.product_variants
     set stock = stock + p_delta,
         -- si se repone por encima del umbral, se habilita una nueva alerta
         low_stock_notified_at = case when p_delta > 0 then null else low_stock_notified_at end
   where id = p_variant
  returning stock into v_stock;

  if not found then
    raise exception 'VARIANT_NOT_FOUND';
  end if;

  insert into public.stock_movements (variant_id, delta, stock_after, reason, order_id, note, created_by)
  values (p_variant, p_delta, v_stock, p_reason, p_order, p_note, p_actor);

  return v_stock;
end $$;

-- Fija el stock absoluto (calcula el delta y lo registra).
create or replace function public.set_stock(
  p_variant uuid,
  p_stock int,
  p_reason public.stock_reason,
  p_note text default null,
  p_actor uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_current int;
begin
  select stock into v_current from public.product_variants where id = p_variant for update;
  if not found then
    raise exception 'VARIANT_NOT_FOUND';
  end if;
  return public.adjust_stock(p_variant, p_stock - v_current, p_reason, p_note, p_actor);
end $$;

-- Descuenta el stock de un pedido (idempotente).
create or replace function public.apply_order_stock(p_order uuid, p_actor uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_applied boolean;
  r record;
begin
  select stock_applied into v_applied from public.orders where id = p_order for update;
  if v_applied is null or v_applied then
    return;
  end if;

  for r in
    select oi.variant_id, sum(oi.quantity)::int as qty
      from public.order_items oi
      join public.product_variants pv on pv.id = oi.variant_id
     where oi.order_id = p_order
     group by oi.variant_id
  loop
    perform public.adjust_stock(r.variant_id, -r.qty, 'sale', null, p_actor, p_order);
  end loop;

  update public.orders set stock_applied = true where id = p_order;
end $$;

-- Devuelve al stock lo descontado por un pedido (idempotente).
create or replace function public.restore_order_stock(p_order uuid, p_actor uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_applied boolean;
  r record;
begin
  select stock_applied into v_applied from public.orders where id = p_order for update;
  if v_applied is null or not v_applied then
    return;
  end if;

  for r in
    select oi.variant_id, sum(oi.quantity)::int as qty
      from public.order_items oi
      join public.product_variants pv on pv.id = oi.variant_id
     where oi.order_id = p_order
     group by oi.variant_id
  loop
    perform public.adjust_stock(r.variant_id, r.qty, 'cancel', null, p_actor, p_order);
  end loop;

  update public.orders set stock_applied = false where id = p_order;
end $$;

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------

-- Crea un pedido de forma atómica validando stock y calculando precios en el servidor.
-- p = {
--   user_id, email, customer_name, phone, document, notes,
--   payment_method: 'mercado_pago' | 'transfer',
--   shipping_method_id, shipping_address (jsonb),
--   items: [{variant_id, quantity}]
-- }
create or replace function public.create_order(p jsonb)
returns table (order_id uuid, order_number bigint, order_token text, order_total numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_method public.payment_method := (p ->> 'payment_method')::public.payment_method;
  v_item jsonb;
  v_qty int;
  v_row record;
  v_subtotal numeric(12, 2) := 0;
  v_shipping numeric(12, 2) := 0;
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_ship record;
  v_settings record;
  v_order public.orders%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
begin
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'EMPTY_CART';
  end if;

  select * into v_settings from public.store_settings where id = 1;
  if v_method = 'mercado_pago' and not v_settings.mp_enabled then
    raise exception 'PAYMENT_METHOD_DISABLED';
  end if;
  if v_method = 'transfer' and not v_settings.transfer_enabled then
    raise exception 'PAYMENT_METHOD_DISABLED';
  end if;

  -- Validar ítems y congelar precios
  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select pv.id as variant_id, pv.title, pv.sku, pv.stock, pv.active as variant_active,
           coalesce(pv.price, pr.price) as unit_price,
           pr.id as product_id, pr.name as product_name, pr.status,
           coalesce(
             (select url from public.product_images where id = pv.image_id),
             (select url from public.product_images where product_id = pr.id order by position, created_at limit 1)
           ) as image_url
      into v_row
      from public.product_variants pv
      join public.products pr on pr.id = pv.product_id
     where pv.id = (v_item ->> 'variant_id')::uuid;

    if not found or not v_row.variant_active or v_row.status <> 'active' then
      raise exception 'PRODUCT_UNAVAILABLE:%', coalesce(v_row.product_name, v_item ->> 'variant_id');
    end if;
    if v_row.stock < v_qty then
      raise exception 'OUT_OF_STOCK:%', v_row.product_name || coalesce(' (' || nullif(v_row.title, '') || ')', '');
    end if;

    v_subtotal := v_subtotal + v_row.unit_price * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_row.product_id,
      'variant_id', v_row.variant_id,
      'product_name', v_row.product_name,
      'variant_title', nullif(v_row.title, ''),
      'sku', v_row.sku,
      'quantity', v_qty,
      'unit_price', v_row.unit_price,
      'image_url', v_row.image_url
    );
  end loop;

  -- Envío
  select * into v_ship from public.shipping_methods
   where id = (p ->> 'shipping_method_id')::uuid and active;
  if not found then
    raise exception 'INVALID_SHIPPING_METHOD';
  end if;
  if v_ship.requires_address and (p -> 'shipping_address') is null then
    raise exception 'ADDRESS_REQUIRED';
  end if;
  v_shipping := case
    when v_ship.free_over is not null and v_subtotal >= v_ship.free_over then 0
    else v_ship.price
  end;

  -- Descuento por transferencia (sobre productos)
  if v_method = 'transfer' and v_settings.transfer_discount_pct > 0 then
    v_discount := round(v_subtotal * v_settings.transfer_discount_pct / 100, 2);
  end if;

  v_total := v_subtotal - v_discount + v_shipping;

  insert into public.orders (
    user_id, email, customer_name, phone, document, status, payment_method,
    subtotal, shipping_cost, discount, total,
    shipping_method_id, shipping_method_name, shipping_address, notes
  ) values (
    nullif(p ->> 'user_id', '')::uuid,
    lower(trim(p ->> 'email')),
    trim(p ->> 'customer_name'),
    nullif(trim(p ->> 'phone'), ''),
    nullif(trim(p ->> 'document'), ''),
    case when v_method = 'transfer' then 'pending_transfer'::public.order_status else 'pending_payment'::public.order_status end,
    v_method,
    v_subtotal, v_shipping, v_discount, v_total,
    v_ship.id, v_ship.name,
    case when v_ship.requires_address then p -> 'shipping_address' else null end,
    nullif(trim(p ->> 'notes'), '')
  ) returning * into v_order;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_title, sku, quantity, unit_price, image_url)
    values (
      v_order.id,
      (v_line ->> 'product_id')::uuid,
      (v_line ->> 'variant_id')::uuid,
      v_line ->> 'product_name',
      v_line ->> 'variant_title',
      v_line ->> 'sku',
      (v_line ->> 'quantity')::int,
      (v_line ->> 'unit_price')::numeric,
      v_line ->> 'image_url'
    );
  end loop;

  insert into public.payments (order_id, method, status, amount)
  values (v_order.id, v_method, 'pending', v_total);

  insert into public.order_status_history (order_id, status, note, created_by)
  values (v_order.id, v_order.status, 'Pedido creado', nullif(p ->> 'user_id', '')::uuid);

  return query select v_order.id, v_order.number, v_order.access_token, v_order.total;
end $$;

-- Cambia el estado de un pedido manejando stock e historial.
-- Devuelve el estado anterior (null si no cambió).
create or replace function public.set_order_status(
  p_order uuid,
  p_status public.order_status,
  p_note text default null,
  p_actor uuid default null
) returns public.order_status
language plpgsql security definer set search_path = public as $$
declare
  v_old public.order_status;
begin
  select status into v_old from public.orders where id = p_order for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_old = p_status then
    return null;
  end if;

  if p_status in ('paid', 'preparing', 'shipped', 'delivered') then
    perform public.apply_order_stock(p_order, p_actor);
    update public.orders set paid_at = coalesce(paid_at, now()) where id = p_order;
  elsif p_status in ('cancelled', 'rejected') then
    perform public.restore_order_stock(p_order, p_actor);
  end if;

  update public.orders set status = p_status where id = p_order;

  insert into public.order_status_history (order_id, status, note, created_by)
  values (p_order, p_status, p_note, p_actor);

  return v_old;
end $$;

-- Marca un pedido como pagado solo si estaba pendiente/rechazado (idempotente).
-- Devuelve true si efectivamente cambió a pagado.
create or replace function public.mark_order_paid(
  p_order uuid,
  p_note text default null,
  p_actor uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_status public.order_status;
begin
  select status into v_status from public.orders where id = p_order for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status not in ('pending_payment', 'pending_transfer', 'rejected', 'cancelled') then
    return false;
  end if;
  perform public.set_order_status(p_order, 'paid', p_note, p_actor);
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Operaciones masivas de catálogo
-- ---------------------------------------------------------------------

-- Ajuste masivo de precios.
-- p_mode: 'percent' (value = %, puede ser negativo) | 'amount' (suma) | 'set' (fija)
-- p_target: 'products' | 'variants' | 'both'
-- p_round: redondeo a múltiplo (ej 100 => $12.345 -> $12.300). 0/null = sin redondeo
create or replace function public.bulk_adjust_prices(
  p_products uuid[],
  p_mode text,
  p_value numeric,
  p_target text default 'both',
  p_round numeric default 0,
  p_compare_at boolean default false
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_n int;
begin
  if p_mode not in ('percent', 'amount', 'set') then
    raise exception 'INVALID_MODE';
  end if;

  if p_target in ('products', 'both') then
    update public.products p
       set price = public._bulk_price(p.price, p_mode, p_value, p_round),
           compare_at_price = case when p_compare_at then p.price else p.compare_at_price end
     where p.id = any (p_products);
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  if p_target in ('variants', 'both') then
    update public.product_variants v
       set price = public._bulk_price(v.price, p_mode, p_value, p_round),
           compare_at_price = case when p_compare_at then v.price else v.compare_at_price end
     where v.product_id = any (p_products) and v.price is not null;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end if;

  return v_count;
end $$;

create or replace function public._bulk_price(p_price numeric, p_mode text, p_value numeric, p_round numeric)
returns numeric
language plpgsql immutable as $$
declare
  v numeric;
begin
  v := case p_mode
    when 'percent' then p_price * (1 + p_value / 100)
    when 'amount' then p_price + p_value
    else p_value
  end;
  if p_round is not null and p_round > 0 then
    v := round(v / p_round) * p_round;
  end if;
  return greatest(round(v, 2), 0);
end $$;

-- Stock masivo sobre variantes. p_mode: 'set' | 'add'
create or replace function public.bulk_set_stock(
  p_variants uuid[],
  p_mode text,
  p_value int,
  p_note text default null,
  p_actor uuid default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  foreach v_id in array p_variants loop
    if p_mode = 'set' then
      perform public.set_stock(v_id, p_value, 'bulk', p_note, p_actor);
    else
      perform public.adjust_stock(v_id, p_value, 'bulk', p_note, p_actor);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Reportes
-- Estados que cuentan como venta: pagado en adelante.
-- Fecha de venta: paid_at. Zona horaria: Argentina.
-- ---------------------------------------------------------------------

create or replace function public._is_sale(s public.order_status) returns boolean
language sql immutable as $$
  select s in ('paid', 'preparing', 'shipped', 'delivered');
$$;

-- Serie de ventas por período.
create or replace function public.report_sales_series(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day',          -- day | week | month
  p_category uuid default null,
  p_product uuid default null,
  p_method public.payment_method default null
) returns table (bucket date, orders bigint, units bigint, revenue numeric)
language sql stable security definer set search_path = public as $$
  with filtered as (
    select o.id, o.paid_at, oi.quantity, oi.unit_price
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      left join public.products pr on pr.id = oi.product_id
     where public._is_sale(o.status)
       and o.paid_at >= p_from and o.paid_at < p_to
       and (p_method is null or o.payment_method = p_method)
       and (p_product is null or oi.product_id = p_product)
       and (p_category is null or pr.category_id = p_category)
  )
  select
    date_trunc(p_bucket, paid_at at time zone 'America/Argentina/Buenos_Aires')::date as bucket,
    count(distinct id) as orders,
    sum(quantity)::bigint as units,
    sum(quantity * unit_price) as revenue
  from filtered
  group by 1
  order by 1;
$$;

-- Totales de un período (facturación incluye envío y descuentos).
create or replace function public.report_sales_totals(
  p_from timestamptz,
  p_to timestamptz,
  p_category uuid default null,
  p_product uuid default null,
  p_method public.payment_method default null
) returns table (orders bigint, units bigint, revenue numeric, billed numeric, avg_ticket numeric)
language sql stable security definer set search_path = public as $$
  with lines as (
    select o.id, o.total, oi.quantity, oi.unit_price
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      left join public.products pr on pr.id = oi.product_id
     where public._is_sale(o.status)
       and o.paid_at >= p_from and o.paid_at < p_to
       and (p_method is null or o.payment_method = p_method)
       and (p_product is null or oi.product_id = p_product)
       and (p_category is null or pr.category_id = p_category)
  ),
  per_order as (
    select id, max(total) as total from lines group by id
  )
  select
    (select count(*) from per_order) as orders,
    coalesce((select sum(quantity) from lines), 0)::bigint as units,
    coalesce((select sum(quantity * unit_price) from lines), 0) as revenue,
    coalesce((select sum(total) from per_order), 0) as billed,
    coalesce((select round(avg(total), 2) from per_order), 0) as avg_ticket;
$$;

create or replace function public.report_top_products(
  p_from timestamptz,
  p_to timestamptz,
  p_category uuid default null,
  p_method public.payment_method default null,
  p_limit int default 10
) returns table (product_id uuid, product_name text, units bigint, revenue numeric)
language sql stable security definer set search_path = public as $$
  select
    oi.product_id,
    coalesce(pr.name, max(oi.product_name)) as product_name,
    sum(oi.quantity)::bigint as units,
    sum(oi.quantity * oi.unit_price) as revenue
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.products pr on pr.id = oi.product_id
  where public._is_sale(o.status)
    and o.paid_at >= p_from and o.paid_at < p_to
    and (p_method is null or o.payment_method = p_method)
    and (p_category is null or pr.category_id = p_category)
  group by oi.product_id, pr.name
  order by units desc, revenue desc
  limit p_limit;
$$;

create or replace function public.report_sales_by_category(
  p_from timestamptz,
  p_to timestamptz,
  p_method public.payment_method default null
) returns table (category_id uuid, category_name text, units bigint, revenue numeric)
language sql stable security definer set search_path = public as $$
  select
    c.id as category_id,
    coalesce(c.name, 'Sin categoría') as category_name,
    sum(oi.quantity)::bigint as units,
    sum(oi.quantity * oi.unit_price) as revenue
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  left join public.products pr on pr.id = oi.product_id
  left join public.categories c on c.id = pr.category_id
  where public._is_sale(o.status)
    and o.paid_at >= p_from and o.paid_at < p_to
    and (p_method is null or o.payment_method = p_method)
  group by c.id, c.name
  order by revenue desc;
$$;

create or replace function public.report_sales_by_method(
  p_from timestamptz,
  p_to timestamptz
) returns table (payment_method public.payment_method, orders bigint, billed numeric)
language sql stable security definer set search_path = public as $$
  select o.payment_method, count(*) as orders, sum(o.total) as billed
  from public.orders o
  where public._is_sale(o.status) and o.paid_at >= p_from and o.paid_at < p_to
  group by o.payment_method;
$$;

-- ---------------------------------------------------------------------
-- Visitas
-- p_audience: 'all' | 'logged' | 'guest'
-- ---------------------------------------------------------------------
create or replace function public._visits_filtered(
  p_from timestamptz,
  p_to timestamptz,
  p_path text,
  p_product uuid,
  p_audience text,
  p_source text
) returns setof public.page_views
language sql stable security definer set search_path = public as $$
  select * from public.page_views pv
  where pv.created_at >= p_from and pv.created_at < p_to
    and (p_path is null or pv.path = p_path or (right(p_path, 1) = '*' and pv.path like left(p_path, -1) || '%'))
    and (p_product is null or pv.product_id = p_product)
    and (p_audience is null or p_audience = 'all'
         or (p_audience = 'logged' and pv.user_id is not null)
         or (p_audience = 'guest' and pv.user_id is null))
    and (p_source is null or pv.source = p_source);
$$;

create or replace function public.report_visits_series(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day',
  p_path text default null,
  p_product uuid default null,
  p_audience text default 'all',
  p_source text default null
) returns table (bucket date, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select
    date_trunc(p_bucket, created_at at time zone 'America/Argentina/Buenos_Aires')::date as bucket,
    count(*) as views,
    count(distinct visitor_id) as visitors
  from public._visits_filtered(p_from, p_to, p_path, p_product, p_audience, p_source)
  group by 1
  order by 1;
$$;

create or replace function public.report_visits_totals(
  p_from timestamptz,
  p_to timestamptz,
  p_path text default null,
  p_product uuid default null,
  p_audience text default 'all',
  p_source text default null
) returns table (views bigint, visitors bigint, logged_views bigint, guest_views bigint, orders bigint, conversion numeric)
language sql stable security definer set search_path = public as $$
  with v as (
    select * from public._visits_filtered(p_from, p_to, p_path, p_product, p_audience, p_source)
  ),
  s as (
    select count(*) as orders from public.orders o
    where public._is_sale(o.status) and o.paid_at >= p_from and o.paid_at < p_to
      and (p_product is null or exists (
        select 1 from public.order_items oi where oi.order_id = o.id and oi.product_id = p_product))
  )
  select
    (select count(*) from v),
    (select count(distinct visitor_id) from v),
    (select count(*) from v where user_id is not null),
    (select count(*) from v where user_id is null),
    s.orders,
    case when (select count(distinct visitor_id) from v) = 0 then 0
         else round(s.orders::numeric * 100 / (select count(distinct visitor_id) from v), 2) end
  from s;
$$;

create or replace function public.report_top_pages(
  p_from timestamptz,
  p_to timestamptz,
  p_audience text default 'all',
  p_source text default null,
  p_limit int default 15
) returns table (path text, product_id uuid, product_name text, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select v.path, v.product_id, max(pr.name), count(*), count(distinct v.visitor_id)
  from public._visits_filtered(p_from, p_to, null, null, p_audience, p_source) v
  left join public.products pr on pr.id = v.product_id
  group by v.path, v.product_id
  order by count(*) desc
  limit p_limit;
$$;

create or replace function public.report_visit_sources(
  p_from timestamptz,
  p_to timestamptz,
  p_path text default null,
  p_product uuid default null,
  p_audience text default 'all'
) returns table (source text, views bigint, visitors bigint)
language sql stable security definer set search_path = public as $$
  select source, count(*), count(distinct visitor_id)
  from public._visits_filtered(p_from, p_to, p_path, p_product, p_audience, null)
  group by source
  order by count(*) desc;
$$;
