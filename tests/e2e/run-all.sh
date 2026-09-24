#!/bin/bash
# Pruebas end-to-end contra Supabase local (supabase start) y la app en :3000.
# Requisitos: .env.local apuntando a Supabase local, MP_API_URL=http://localhost:4010,
# CRON_SECRET=test-cron-secret, la app corriendo (npm run dev / npm start) y el mock
# de Mercado Pago corriendo (node tests/e2e/mp-mock.mjs).
# ATENCIÓN: borra todos los datos de la base local.
set -e
cd "$(dirname "$0")"
DB="${E2E_DB_URL:-postgres://postgres:postgres@localhost:54322/postgres}"
SUPABASE_URL="${E2E_SUPABASE_URL:-http://localhost:54321}"
SERVICE_KEY="${SUPABASE_SECRET_KEY:?Definí SUPABASE_SECRET_KEY (service role de supabase local)}"
MAILPIT="${E2E_MAILPIT_URL:-http://localhost:54324}"

psql "$DB" -q -c "delete from auth.users; truncate orders, carts, page_views, stock_movements, products, categories, shipping_methods, addresses cascade;" >/dev/null
psql "$DB" -q -c "update store_settings set transfer_discount_pct=0; update private_settings set mp_webhook_secret=null, mp_access_token=null;" >/dev/null
psql "$DB" -q -f ../../supabase/seed.sql >/dev/null
psql "$DB" -q -c "update store_settings set admin_email='admin@rid.test', whatsapp='5491100000000';" >/dev/null
curl -s -X DELETE "$MAILPIT/api/v1/messages" >/dev/null
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"admin@rid.test","password":"admin-clave-123","email_confirm":true,"user_metadata":{"full_name":"Admin RID"}}' >/dev/null
psql "$DB" -q -c "update profiles set role='admin' where email='admin@rid.test'" >/dev/null

for t in 01-guest-transfer 02-customer 03-admin 04-mercadopago 05-staff; do
  echo "===== $t"
  node "$t.mjs"
done
