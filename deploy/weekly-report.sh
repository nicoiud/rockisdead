#!/bin/sh
# Dispara el reporte semanal de ventas por email. Se agenda con cron en la VM
# (ver DEPLOY.md), reemplaza al cron de Vercel que no existe fuera de Vercel.
set -eu
: "${CRON_SECRET:?Falta CRON_SECRET}"
: "${SITE_URL:=http://localhost:3000}"
curl -fsS -X GET "$SITE_URL/api/cron/weekly-report" -H "Authorization: Bearer $CRON_SECRET"
