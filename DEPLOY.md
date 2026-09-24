# Poner Rock Is Dead online (Supabase + VM gratis + dominio)

Guía paso a paso para levantar la tienda tal cual está, sin diseño todavía.
Nada de esto lo puedo hacer por vos (piden tu identidad/tarjeta), pero cada
paso es concreto y no requiere saber programar.

**Antes de empezar:** necesitás una tarjeta de crédito/débito para verificar
identidad en Oracle Cloud (no te cobra nada si te quedás en la capa gratis) y
para comprar el dominio (eso sí tiene costo, ~USD 10-15/año).

---

## 1. Dominio

Cualquier registrador sirve (Namecheap, GoDaddy, NIC.ar para `.com.ar`). Yo
recomiendo **Cloudflare Registrar** porque cobra el precio de costo (sin
markup) y ya vas a usar Cloudflare para el DNS.

1. Comprá el dominio (ej. `rockisdead.com.ar` o `rockisdead.store`).
2. Creá una cuenta gratis en [cloudflare.com](https://cloudflare.com) y
   agregá el dominio como "sitio" (Add a Site → plan Free). Si lo compraste
   en otro registrador, Cloudflare te da 2 servidores de nombres (NS) para
   cargar en ese registrador; el cambio tarda de minutos a un par de horas.
3. Una vez que Cloudflare dice "Active", andá a **DNS > Records** y creá:
   - Tipo `A`, nombre `@`, valor `<IP pública de tu VM>`, proxy **activado**
     (nube naranja).
   - Tipo `A`, nombre `www`, mismo valor, proxy activado.

   (La IP la conseguís en el paso 3. Podés dejar esto para después y volver
   acá.)

El proxy de Cloudflare (nube naranja) es gratis, oculta la IP real de tu VM
y filtra ataques automáticamente — dejalo activado.

---

## 2. Supabase (base de datos, login, archivos)

1. Creá una cuenta en [supabase.com](https://supabase.com) y un proyecto
   nuevo (plan Free). Elegí una contraseña de base de datos y guardala.
2. En **Project Settings > API** copiá:
   - `Project URL` → va en `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` (o `publishable`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `service_role key` (o `secret`) → `SUPABASE_SECRET_KEY` (**nunca la
     compartas ni la subas a git**)
3. Aplicá el esquema de la base. Necesitás la CLI de Supabase (no hace falta
   instalar nada global, `npx` la descarga sola):
   ```bash
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF   # está en la URL del proyecto
   npx supabase db push
   ```
4. Opcional, para no cargar el catálogo a mano: pegá el contenido de
   `supabase/seed.sql` en **SQL Editor** del panel de Supabase y ejecutalo.
   Después lo editás o borrás todo desde el admin.
5. **Authentication > URL Configuration**:
   - *Site URL*: `https://tudominio.com`
   - *Redirect URLs*: agregar `https://tudominio.com/**`
6. Registrate como usuario en la tienda una vez que esté online (paso 6) y
   marcate como admin desde **SQL Editor**:
   ```sql
   update public.profiles set role = 'admin' where email = 'tu@email.com';
   ```

---

## 3. La VM (Oracle Cloud, capa gratis)

1. Creá una cuenta en [cloud.oracle.com](https://cloud.oracle.com) (pide
   tarjeta para verificar identidad; la capa "Always Free" no cobra).
2. **Compute > Instances > Create Instance**:
   - *Image*: Ubuntu (la más reciente LTS).
   - *Shape*: click en **Change shape** → pestaña **Ampere** →
     `VM.Standard.A1.Flex` → dejá 1 OCPU / 2-6 GB RAM (o subí hasta 4/24 si
     hay disponibilidad; es gratis igual). Si te dice "Out of capacity",
     reintentá en un rato o probá otra región al crear la cuenta.
   - *Networking*: dejá que cree una VCN nueva, con IP pública.
   - *SSH keys*: elegí "Generate a key pair" y **descargá la clave privada**
     (`ssh-key-....key`). Es la única vez que se muestra.
   - Create.
3. Anotá la **IP pública** que te asigna (aparece en la página de la
   instancia). Volvé al paso 1 y cargá esa IP en los registros DNS de
   Cloudflare.
4. Abrí los puertos: en la instancia → **Subnet** → **Security List** por
   defecto → **Add Ingress Rules**: `0.0.0.0/0`, puerto `80`, y otra igual
   para el `443`.
5. Conectate por SSH (reemplazá `<IP>`):
   ```bash
   chmod 600 ssh-key-....key
   ssh -i ssh-key-....key ubuntu@<IP>
   ```
6. En la VM, cloná el repo (o solo copiá la carpeta `deploy/`) y corré la
   preparación:
   ```bash
   git clone https://github.com/TU_USUARIO/rockisdead.git
   cd rockisdead/deploy
   ./setup-vm.sh
   ```
   Seguí las instrucciones que imprime (cerrar y reabrir la sesión SSH una
   vez, para que el usuario quede en el grupo `docker`).
7. Armá la carpeta de despliegue:
   ```bash
   mkdir -p ~/rockisdead && cd ~/rockisdead
   cp ~/rockisdead-src/deploy/docker-compose.yml .
   cp ~/rockisdead-src/deploy/Caddyfile .
   cp ~/rockisdead-src/deploy/weekly-report.sh .
   cp ~/rockisdead-src/deploy/.env.example .env
   nano .env       # completar con los valores de Supabase, MP, Resend, etc.
   nano Caddyfile  # cambiar "tudominio.com" por tu dominio real
   ```
   (Ajustá las rutas según dónde hayas clonado el repo.)

---

## 4. GitHub Actions (compila y despliega automáticamente)

En el repo de GitHub, **Settings > Secrets and variables > Actions**, cargar:

| Secret | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | igual que en `.env` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | igual que en `.env` |
| `NEXT_PUBLIC_SITE_URL` | `https://tudominio.com` |
| `VM_HOST` | la IP pública de la VM |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | el **contenido** del archivo `ssh-key-....key` (pegarlo completo) |

Con eso, cada `git push` a `main` compila la imagen en GitHub (gratis, no
usa recursos de la VM) y la despliega sola por SSH. También se puede
disparar a mano desde la pestaña **Actions > Build and deploy > Run workflow**.

**Primer despliegue manual** (antes de tener Actions configurado, o para
probar sin esperar):
```bash
# En tu máquina, con Docker instalado:
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://tudominio.com \
  -t ghcr.io/TU_USUARIO/rockisdead:latest .
docker login ghcr.io -u TU_USUARIO   # con un Personal Access Token con permiso "write:packages"
docker push ghcr.io/TU_USUARIO/rockisdead:latest
```
Luego, en la VM: `cd ~/rockisdead && docker compose --env-file .env pull && docker compose --env-file .env up -d`.

> Nota: el paquete en GHCR se crea privado por defecto. Para que la VM lo
> pueda descargar sin loguearse, hacelo público: en GitHub, tu perfil →
> **Packages** → el paquete `rockisdead` → **Package settings** → *Change
> visibility* → Public. (O si preferís mantenerlo privado, `docker login
> ghcr.io` también en la VM con un token de lectura.)

---

## 5. Reporte semanal (cron)

En la VM:
```bash
crontab -e
```
Agregar una línea (lunes 9 hs):
```
0 9 * * 1 CRON_SECRET=EL_MISMO_DEL_.env SITE_URL=https://tudominio.com /home/ubuntu/rockisdead/weekly-report.sh
```

---

## 6. Probar todo

1. Entrá a `https://tudominio.com` — debería cargar la tienda (Cloudflare
   emite el candado; Caddy también tiene su propio certificado detrás, así
   que anda aunque desactives el proxy naranja más adelante).
2. Registrate, confirmá el email (revisá la config de SMTP de Supabase si no
   llega — por defecto Supabase tiene un límite bajo de emails de prueba;
   para producción configurá un SMTP propio en **Authentication > Emails**,
   podés usar Resend).
3. Marcate como admin (paso 2.6) y entrá a `/admin`.
4. Cargá los datos bancarios, Mercado Pago (o dejalo solo con transferencia
   al principio) y hacé un pedido de prueba.

---

## Actualizar la tienda

Con Actions configurado: `git push` a `main` y listo, se actualiza sola en
1-2 minutos.

Manual: `docker compose --env-file .env pull app && docker compose --env-file .env up -d app`
en la VM.

## Agregar una segunda tienda (otra marca)

1. Otro proyecto de Supabase (repetir el paso 2).
2. Otro dominio o subdominio, apuntado a la misma IP (paso 1).
3. En `deploy/docker-compose.yml`, copiar el bloque `app:` como `app-otramarca:`
   con su propio `env_file` (ej. `.env.otramarca`).
4. En `Caddyfile`, agregar el bloque del nuevo dominio apuntando a
   `app-otramarca:3000` (ver el ejemplo comentado al final del archivo).
5. `docker compose --env-file .env up -d`.

La misma VM alcanza para varias tiendas chicas; si crecen, se migra cada una
a su propia VM sin cambiar nada del código.
