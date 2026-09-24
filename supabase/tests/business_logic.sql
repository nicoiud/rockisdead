-- Prueba de la lógica de negocio. Correr sobre una base con migraciones + seed.
\set ON_ERROR_STOP 1
begin;

do $$
declare
  v_ship uuid; v_pickup uuid; v_var uuid; v_var2 uuid; r record; v_stock int; v_changed boolean;
  v_total numeric; v_err text;
begin
  select id into v_ship from shipping_methods where requires_address order by price limit 1;
  select id into v_pickup from shipping_methods where not requires_address limit 1;
  select id into v_var from product_variants where sku = 'RDS-M-NEG';
  select id into v_var2 from product_variants where sku = 'BRO-XXL';

  -- 1) Pedido MP: precio desde la base, variante con override
  select * into r from create_order(jsonb_build_object(
    'email', 'Cliente@Mail.com ', 'customer_name', 'Juan', 'payment_method', 'mercado_pago',
    'shipping_method_id', v_ship, 'shipping_address', '{"street":"x"}'::jsonb,
    'items', jsonb_build_array(
      jsonb_build_object('variant_id', v_var, 'quantity', 2),
      jsonb_build_object('variant_id', v_var2, 'quantity', 1))));
  select total, subtotal, shipping_cost into v_total from orders where id = r.order_id;
  assert (select subtotal from orders where id = r.order_id) = 32000*2 + 72000, 'subtotal';
  assert (select shipping_cost from orders where id = r.order_id) = 4500, 'envío (subtotal < free_over)';
  assert (select status from orders where id = r.order_id) = 'pending_payment', 'estado inicial MP';
  assert (select email from orders where id = r.order_id) = 'cliente@mail.com', 'email normalizado';
  assert r.order_number >= 1001, 'numeración';
  -- stock NO se descuenta al crear
  assert (select stock from product_variants where id = v_var) = 10, 'stock intacto al crear';

  -- 2) Pago aprobado => descuenta stock, idempotente
  v_changed := mark_order_paid(r.order_id, 'MP aprobado');
  assert v_changed, 'mark paid true';
  assert (select stock from product_variants where id = v_var) = 8, 'stock descontado';
  assert (select stock from product_variants where id = v_var2) = 4, 'stock descontado 2';
  v_changed := mark_order_paid(r.order_id, 'webhook duplicado');
  assert not v_changed, 'idempotente';
  assert (select stock from product_variants where id = v_var) = 8, 'no descuenta 2 veces';
  assert (select count(*) from stock_movements where order_id = r.order_id and reason = 'sale') = 2, 'movimientos venta';

  -- 3) Avanza estados y luego cancela => repone stock
  perform set_order_status(r.order_id, 'shipped', 'Despachado');
  assert (select stock from product_variants where id = v_var) = 8, 'enviar no toca stock';
  perform set_order_status(r.order_id, 'cancelled', 'Cancelado');
  assert (select stock from product_variants where id = v_var) = 10, 'cancelar repone';
  assert (select count(*) from order_status_history where order_id = r.order_id) = 4, 'historial';

  -- 4) Transferencia con descuento y envío gratis por monto
  update store_settings set transfer_discount_pct = 10;
  select * into r from create_order(jsonb_build_object(
    'email', 'a@b.com', 'customer_name', 'Ana', 'payment_method', 'transfer',
    'shipping_method_id', v_ship, 'shipping_address', '{"street":"x"}'::jsonb,
    'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 5))));
  assert (select status from orders where id = r.order_id) = 'pending_transfer', 'estado transferencia';
  assert (select discount from orders where id = r.order_id) = 16000, 'descuento 10%';
  assert (select shipping_cost from orders where id = r.order_id) = 0, 'envío gratis >= 150000';
  assert r.order_total = 160000 - 16000, 'total con descuento';

  -- 5) Sin stock
  begin
    perform create_order(jsonb_build_object(
      'email', 'a@b.com', 'customer_name', 'Ana', 'payment_method', 'transfer', 'shipping_method_id', v_pickup,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 99))));
    raise exception 'debió fallar';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err like 'OUT_OF_STOCK:Remera Dead Skull (M / Negro)', v_err;
  end;

  -- 6) Retiro en local sin dirección está permitido; envío a domicilio sin dirección no
  perform create_order(jsonb_build_object(
    'email', 'a@b.com', 'customer_name', 'Ana', 'payment_method', 'transfer', 'shipping_method_id', v_pickup,
    'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1))));
  begin
    perform create_order(jsonb_build_object(
      'email', 'a@b.com', 'customer_name', 'Ana', 'payment_method', 'transfer', 'shipping_method_id', v_ship,
      'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1))));
    raise exception 'debió fallar';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'ADDRESS_REQUIRED', v_err;
  end;

  -- 7) Producto no publicado no se puede comprar
  update products set status = 'draft' where slug = 'gorra-dead-logo';
  begin
    perform create_order(jsonb_build_object(
      'email', 'a@b.com', 'customer_name', 'Ana', 'payment_method', 'transfer', 'shipping_method_id', v_pickup,
      'items', jsonb_build_array(jsonb_build_object('variant_id', (select id from product_variants where sku='GDL-U'), 'quantity', 1))));
    raise exception 'debió fallar';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err like 'PRODUCT_UNAVAILABLE:%', v_err;
  end;

  -- 8) Stock manual / masivo
  v_stock := set_stock(v_var, 3, 'manual', 'conteo');
  assert v_stock = 3, 'set_stock';
  perform bulk_set_stock(array[v_var, v_var2], 'add', 2, 'reposición');
  assert (select stock from product_variants where id = v_var) = 5, 'bulk add';

  -- 9) Precios masivos: +10% redondeado a 500, guardando precio anterior como tachado
  perform bulk_adjust_prices(array[(select id from products where slug='remera-dead-skull')], 'percent', 10, 'both', 500, true);
  assert (select price from products where slug='remera-dead-skull') = 35000, 'precio +10% redondeado';
  assert (select compare_at_price from products where slug='remera-dead-skull') = 32000, 'precio tachado';
  perform bulk_adjust_prices(array[(select id from products where slug='buzo-rid-oversize')], 'amount', -2000, 'variants', 0, false);
  assert (select price from product_variants where sku='BRO-XXL') = 70000, 'variante con override';
  assert (select price from product_variants where sku='BRO-M') is null, 'variante sin override queda null';

  -- 10) Reportes
  select * into r from create_order(jsonb_build_object(
    'email', 'c@d.com', 'customer_name', 'Beto', 'payment_method', 'mercado_pago', 'shipping_method_id', v_pickup,
    'items', jsonb_build_array(jsonb_build_object('variant_id', v_var, 'quantity', 1))));
  perform mark_order_paid(r.order_id);
  assert (select orders from report_sales_totals(now() - interval '1 day', now() + interval '1 day')) = 1, 'totales';
  assert (select count(*) from report_sales_series(now() - interval '7 day', now() + interval '1 day', 'day')) = 1, 'serie';
  assert (select units from report_top_products(now() - interval '1 day', now() + interval '1 day') limit 1) = 1, 'top';
  assert (select count(*) from report_sales_by_category(now() - interval '1 day', now() + interval '1 day')) = 1, 'categorías';

  insert into page_views (path, visitor_id, source) values ('/', 'v1', 'direct'), ('/', 'v1', 'direct'), ('/productos', 'v2', 'social');
  select * into r from report_visits_totals(now() - interval '1 day', now() + interval '1 day');
  assert r.views = 3 and r.visitors = 2 and r.orders = 1 and r.conversion = 50, 'visitas: ' || r::text;
  assert (select count(*) from report_visits_totals(now() - interval '1 day', now() + interval '1 day', '/produc*')) = 1, 'wildcard';
  assert (select views from report_visits_totals(now() - interval '1 day', now() + interval '1 day', '/produc*')) = 1, 'wildcard views';
  assert (select count(*) from report_visit_sources(now() - interval '1 day', now() + interval '1 day')) = 2, 'fuentes';

  raise notice 'OK lógica de negocio';
end $$;

rollback;

-- ---------------------------------------------------------------------
-- Permisos: rol anon
-- ---------------------------------------------------------------------
begin;
update products set status = 'draft' where slug = 'gorra-dead-logo';
set local role anon;
do $$
begin
  assert (select count(*) from products) = 2, 'anon solo ve productos activos';
  assert (select count(*) from product_overview) = 2, 'vista respeta RLS';
  assert (select count(*) from orders) = 0, 'anon no ve pedidos';
  assert (select count(*) from private_settings) = 0, 'anon no ve secretos';
  begin
    perform create_order('{}'::jsonb);
    raise exception 'anon no debería poder crear pedidos directo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform set_stock(gen_random_uuid(), 1, 'manual');
    raise exception 'anon no debería poder tocar stock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from customer_stats;
    raise exception 'anon no debería ver clientes';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK permisos anon';
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Permisos: cliente autenticado solo ve lo suyo y no puede hacerse admin
-- ---------------------------------------------------------------------
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'u1@x.com', '{"full_name":"Uno"}'),
  ('00000000-0000-0000-0000-000000000002', 'u2@x.com', '{}');
insert into orders (user_id, email, customer_name, status, payment_method, subtotal, total)
values ('00000000-0000-0000-0000-000000000001', 'u1@x.com', 'Uno', 'paid', 'transfer', 1, 1),
       ('00000000-0000-0000-0000-000000000002', 'u2@x.com', 'Dos', 'paid', 'transfer', 1, 1);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
begin
  assert (select full_name from profiles where id = auth.uid()) = 'Uno', 'perfil creado por trigger';
  assert (select count(*) from profiles) = 1, 'solo su perfil';
  assert (select count(*) from orders) = 1, 'solo sus pedidos';
  update profiles set phone = '123' where id = auth.uid();
  begin
    update profiles set role = 'admin' where id = auth.uid();
    raise exception 'no debería poder cambiar su rol';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK permisos cliente';
end $$;
rollback;
