# Rock Is Dead — Tienda online

Tienda online de ropa de hombre con panel de administración propio. Stack: **Next.js 16** (App Router) + **Supabase** (Postgres, Auth, Storage) + **Mercado Pago Checkout Pro** + **transferencia bancaria** + **Resend** para emails.

> Estado: **funcionalidad completa, diseño provisorio**. La interfaz usa estilos mínimos (Tailwind) para poder trabajar el diseño aparte.

---

## Qué incluye

### Tienda
- Home con banners (editables), categorías, destacados y novedades.
- Listado con filtros por categoría, precio, solo con stock y orden (relevancia, precio, nombre, novedades), búsqueda y paginación.
- Detalle de producto con galería y **selector de variantes a medida** (Talle, Color, Largo, Calce… cualquier opción). Muestra stock por combinación y precio propio por variante.
- Carrito persistente (invitado por cookie o usuario logueado; se fusionan al iniciar sesión) con validación de stock.
- Checkout **como invitado o con cuenta**: datos, método de envío (configurable), dirección (nueva o guardada) y pago:
  - **Mercado Pago Checkout Pro**: redirección al pago, retorno con sincronización inmediata y webhook firmado.
  - **Transferencia**: datos bancarios, descuento opcional (%) y subida de comprobante (imagen o PDF).
- Página de pedido con número, resumen, estado, historial, reintento de pago y subida de comprobante.
- Mi cuenta: datos personales, contraseña, **historial de pedidos** con detalle, direcciones guardadas. Los pedidos hechos como invitado se vinculan al confirmar la cuenta con el mismo email.
- Botón de WhatsApp (click-to-chat).

### Panel de administración (`/admin`)
| Sección | Funcionalidad |
|---|---|
| **Dashboard** | Ventas hoy / 7 / 30 días con gráfico vs. período anterior, ticket promedio, pendientes de pago, stock bajo, visitas y conversión. |
| **Pedidos** | Filtros por estado (incluye “comprobante a revisar”), método de pago, fechas, cliente (nombre, email, #, teléfono) y monto. Detalle con productos, cliente, dirección, comprobante (URL firmada), pagos e historial. Cambio de estado con aviso al cliente, código de seguimiento, notas internas, **confirmar o rechazar transferencias**, link de WhatsApp. **Exportar a CSV y Excel**. |
| **Productos** | Listado con búsqueda (nombre/SKU) y filtros (categoría, estado, stock bajo/agotado, rango de precio, destacados). Editor con imágenes múltiples (subida, orden, imagen por variante), opciones y variantes a medida, SKU/precio/stock por variante. |
| **Acciones masivas** | Sobre la selección o sobre **todos los productos del filtro**: publicar, ocultar, borrador, cambiar categoría, destacar, ajustar precios (% / monto / fijar, redondeo, guardar precio tachado), quitar tachado, ajustar stock, activar/desactivar variantes, etiquetas, eliminar. |
| **Edición masiva (grilla)** | Planilla editable en modo **productos + variantes**, **solo productos** o **solo variantes**. Aplicar un valor a las filas seleccionadas (o sumar stock), resaltado de cambios y guardado único. |
| **Importar / Exportar** | CSV o Excel, **una fila por variante**, cualquier cantidad de opciones. Crea y actualiza productos, variantes, imágenes y categorías, con **vista previa y errores por fila**, y opción **“publicar todos”**. La exportación usa el mismo formato: se edita en Excel y se vuelve a importar. |
| **Categorías** | Alta, edición, orden, visibilidad y baja. |
| **Stock** | Ajuste manual (sumar/fijar con motivo) e **historial de movimientos** (venta, cancelación, manual, masivo, importación) con filtros. |
| **Ventas** | Filtros por período (presets o personalizado), categoría, producto y método de pago. KPIs con **comparativa contra el período anterior**, gráfico en el tiempo (ventas, pedidos o unidades), más vendidos, ingresos por categoría y por método de pago. |
| **Visitas** | Filtros por período, página (admite `/productos*`), producto, logueados/invitados y origen. Visitas, visitantes únicos, páginas más vistas, **origen del tráfico** (directo, buscadores, redes, email, publicidad, otros sitios) y **conversión**. |
| **Usuarios** | Clientes con filtros (fecha de alta, cantidad de compras, activo/inactivo, orden por gasto), detalle con historial de pedidos, activar/desactivar cuenta. **Administradores y staff** con permisos por sección. |
| **Configuración** | Datos de la tienda y logo, datos bancarios, credenciales de Mercado Pago, medios de pago habilitados, descuento por transferencia, **métodos de envío y costos** (con envío gratis desde un monto), notificaciones, umbral de stock bajo y banners de la home. |

### Automatizaciones
- **Stock**: se descuenta automáticamente al confirmarse el pago (MP o transferencia) y se repone si el pedido se cancela. Todo es idempotente: un webhook repetido no descuenta dos veces.
- **Emails** (Resend): aviso al admin por cada pedido nuevo y por cada comprobante subido; al cliente, confirmación del pedido (con datos bancarios si es transferencia) y cada cambio de estado.
- **Alerta de stock bajo** al admin (una vez por variante hasta que se reponga).
- **Reporte semanal de ventas** por email al admin (Vercel Cron, lunes 9:00 hs).

---

## Modelo de datos

Migraciones en `supabase/migrations/`. Mapeo con el spec:

| Spec | Tabla |
|---|---|
| usuarios | `profiles` (+ `auth.users`) con `role` (customer / staff / admin) y `permissions` |
| productos | `products` + `product_images` + **`product_variants`** (stock, SKU y precio por variante) |
| categorías | `categories` |
| pedidos / detalle_pedido | `orders` / `order_items` (+ `order_status_history`) |
| pagos | `payments` |
| visitas | `page_views` |
| carrito | `carts` + `cart_items` |
| — | `addresses`, `shipping_methods`, `stock_movements`, `store_settings`, `private_settings` |

La lógica crítica (crear pedido validando stock y precios, confirmar pago, descontar/reponer stock, operaciones masivas y reportes) está en funciones SQL transaccionales (`20260924000002_functions.sql`). La seguridad (`20260924000003_security.sql`) usa RLS: el navegador solo puede leer el catálogo publicado y los datos propios del usuario; todo lo demás pasa por el servidor, que valida sesión y permisos.

**Estados de pedido:** pendiente de pago (MP) · pendiente de transferencia · pagado · en preparación · enviado · entregado · cancelado · pago rechazado.

---

## Desarrollo local

Requisitos: Node 20.9+, Docker y la [CLI de Supabase](https://supabase.com/docs/guides/local-development).

```bash
npm install
npx supabase start          # levanta Postgres, Auth, Storage y Mailpit; aplica migraciones y seed
npx supabase status -o env  # muestra URL y claves locales
cp .env.example .env.local  # completar con los valores de arriba
npm run dev                 # http://localhost:3000
```

Los emails de Auth (confirmación, recuperar contraseña) se ven en Mailpit: http://localhost:54324. Sin `RESEND_API_KEY`, los emails de pedidos se muestran en la consola.

### Crear el primer administrador
Registrate en `/registro` (o creá el usuario desde el dashboard de Supabase) y ejecutá en el SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'tu@email.com';
```

Después, desde **Admin > Usuarios** se agregan más administradores o staff con permisos por sección.

---

## Puesta en producción

### 1. Supabase
1. Crear un proyecto en [supabase.com](https://supabase.com) (plan free).
2. Aplicar las migraciones:
   ```bash
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase db push
   ```
   Opcional: ejecutar `supabase/seed.sql` en el SQL Editor para cargar categorías, envíos y productos de ejemplo.
3. **Authentication > URL Configuration**: *Site URL* = `https://tudominio.com` y en *Redirect URLs* agregar `https://tudominio.com/**`.
4. **Authentication > Emails > SMTP**: configurar un SMTP propio (Resend ofrece SMTP) para no depender del límite del SMTP de prueba de Supabase.

### 2. Vercel
1. Importar el repositorio de GitHub.
2. Cargar las variables de entorno de `.env.example` (con `NEXT_PUBLIC_SITE_URL` = dominio final).
3. El cron del reporte semanal ya está definido en `vercel.json`; solo requiere `CRON_SECRET`.

### 3. Mercado Pago
1. En [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app) crear una aplicación (Checkout Pro).
2. Cargar el **Access Token** (y Public Key) en **Admin > Configuración > Medios de pago** (o en `MP_ACCESS_TOKEN`).
3. En *Webhooks* configurar la URL `https://tudominio.com/api/webhooks/mercadopago` con el evento **Pagos**, y copiar la **clave secreta** en la configuración del admin para validar la firma.
4. Para probar: credenciales de prueba + `MP_SANDBOX=true` y usuarios de prueba de MP.

### 4. Resend (emails)
Verificar el dominio en [resend.com](https://resend.com), crear una API key y completar `RESEND_API_KEY` y `EMAIL_FROM`. En Admin > Configuración cargar el **email del admin** para los avisos.

---

## Importación masiva: formato

Una fila por variante. Descargá la plantilla desde **Admin > Productos > Importar**.

```
handle,nombre,descripcion,categoria,precio,precio_anterior,estado,destacado,etiquetas,imagenes,opcion1_nombre,opcion1_valor,opcion2_nombre,opcion2_valor,sku,precio_variante,precio_anterior_variante,stock,variante_activa
remera-skull,Remera Skull,Algodón,Remeras,30000,,publicado,si,"nuevo, verano",https://.../1.jpg | https://.../2.jpg,Talle,M,Color,Negro,RS-M-NEG,,,10,si
remera-skull,,,,,,,,,,Talle,L,Color,Negro,RS-L-NEG,,,8,si
```

- Mismo `handle` = mismo producto. Si el handle existe se actualiza; si no, se crea.
- **Celda vacía = no se modifica.** Para actualizar solo stock alcanza con `handle`, `sku` y `stock`.
- Opciones ilimitadas: `opcion3_nombre`, `opcion3_valor`, etc.
- `estado`: publicado / borrador / oculto. `destacado` y `variante_activa`: si / no.
- Precios en formato argentino (`12.345,50`) o simple (`12345.5`).

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm test` | Tests unitarios (variantes, importación/exportación, fechas, origen de tráfico, firma de MP) |
| `npm run test:e2e` | Pruebas end-to-end con navegador real contra Supabase local (ver `tests/e2e/run-all.sh`; **borra la base local**) |

Pruebas SQL de la lógica de negocio y permisos: `psql "$DB_URL" -f supabase/tests/business_logic.sql`.

---

## Decisiones y notas

- **El stock se descuenta al confirmar el pago**, como pide el spec (no se reserva al crear el pedido). Si dos personas compran la última unidad a la vez y ambas pagan, el stock puede quedar negativo: se ve en rojo en el admin para resolverlo manualmente.
- Un pedido de Mercado Pago solo se marca pagado si el monto cobrado coincide con el total del pedido.
- Los comprobantes de transferencia se guardan en un bucket **privado** y el admin los ve con URLs temporales.
- Las visitas del staff y de bots no se cuentan.
- Hosting: el plan **Hobby de Vercel es solo para uso personal y no comercial** según sus términos; para una tienda corresponde el plan Pro o un hosting alternativo compatible con Next.js. El plan free de Supabase alcanza para empezar (500 MB de base, 1 GB de archivos).

### Pendientes a definir (del spec)
- Facturación electrónica (AFIP/ARCA): no incluida.
- Integración con correos/logísticas (cotización automática de envíos): hoy los costos son fijos por método.
- App mobile: la tienda es responsive; no hay app nativa.
