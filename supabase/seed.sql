-- =====================================================================
-- Datos iniciales / de ejemplo. Se pueden borrar desde el admin.
-- =====================================================================

update public.store_settings set
  store_name = 'Rock Is Dead',
  contact_email = 'hola@rockisdead.com.ar',
  instagram = 'rockisdead',
  bank_name = 'Banco a configurar',
  bank_holder = 'Titular a configurar',
  bank_alias = 'ROCK.IS.DEAD',
  transfer_instructions = 'Transferí el total y subí el comprobante. Confirmamos el pago dentro de las 24 hs hábiles.',
  banners = '[{"image": "", "title": "Rock Is Dead", "subtitle": "Nueva colección", "link": "/productos"}]'::jsonb
where id = 1;

insert into public.categories (name, slug, sort_order) values
  ('Remeras', 'remeras', 1),
  ('Camisas', 'camisas', 2),
  ('Buzos', 'buzos', 3),
  ('Camperas', 'camperas', 4),
  ('Pantalones', 'pantalones', 5),
  ('Accesorios', 'accesorios', 6)
on conflict (slug) do nothing;

insert into public.shipping_methods (name, description, price, free_over, requires_address, sort_order) values
  ('Retiro en el local', 'Coordinamos por WhatsApp', 0, null, false, 1),
  ('Envío a domicilio CABA', 'Moto, 24/48 hs hábiles', 4500, 150000, true, 2),
  ('Correo Argentino a todo el país', '3 a 7 días hábiles', 7500, 200000, true, 3);

-- Productos de ejemplo --------------------------------------------------
do $$
declare
  v_cat uuid;
  v_prod uuid;
  v_size text;
  v_color text;
  v_pos int;
begin
  -- Remera con talle y color
  select id into v_cat from public.categories where slug = 'remeras';
  insert into public.products (name, slug, description, category_id, price, status, featured, options, tags)
  values (
    'Remera Dead Skull', 'remera-dead-skull',
    'Remera de algodón peinado 24/1 con estampa frontal.',
    v_cat, 32000, 'active', true,
    '[{"name":"Talle","values":["S","M","L","XL"]},{"name":"Color","values":["Negro","Blanco"]}]',
    array['nuevo']
  ) returning id into v_prod;
  v_pos := 0;
  foreach v_size in array array['S','M','L','XL'] loop
    foreach v_color in array array['Negro','Blanco'] loop
      insert into public.product_variants (product_id, options, title, sku, stock, position)
      values (v_prod, jsonb_build_object('Talle', v_size, 'Color', v_color), v_size || ' / ' || v_color,
              'RDS-' || v_size || '-' || upper(left(v_color, 3)), 10, v_pos);
      v_pos := v_pos + 1;
    end loop;
  end loop;

  -- Buzo solo talle, con precio distinto en XXL
  select id into v_cat from public.categories where slug = 'buzos';
  insert into public.products (name, slug, description, category_id, price, compare_at_price, status, featured, options)
  values (
    'Buzo Rock Is Dead Oversize', 'buzo-rid-oversize',
    'Buzo de frisa invisible, calce oversize.',
    v_cat, 68000, 75000, 'active', true,
    '[{"name":"Talle","values":["M","L","XL","XXL"]}]'
  ) returning id into v_prod;
  v_pos := 0;
  foreach v_size in array array['M','L','XL','XXL'] loop
    insert into public.product_variants (product_id, options, title, sku, stock, price, position)
    values (v_prod, jsonb_build_object('Talle', v_size), v_size, 'BRO-' || v_size, 5,
            case when v_size = 'XXL' then 72000 else null end, v_pos);
    v_pos := v_pos + 1;
  end loop;

  -- Accesorio sin variantes
  select id into v_cat from public.categories where slug = 'accesorios';
  insert into public.products (name, slug, description, category_id, price, status, options)
  values ('Gorra Dead Logo', 'gorra-dead-logo', 'Gorra trucker con logo bordado.', v_cat, 25000, 'active', '[]')
  returning id into v_prod;
  insert into public.product_variants (product_id, options, title, sku, stock)
  values (v_prod, '{}', '', 'GDL-U', 20);
end $$;
