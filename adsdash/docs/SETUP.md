# MetricsHub — Guía Completa de Instalación y Configuración
## Plataforma de analítica para agencias · Google Ads + Meta Ads

---

## Índice

1. [Arquitectura del proyecto](#1-arquitectura)
2. [Requisitos previos](#2-requisitos)
3. [Configurar la base de datos](#3-base-de-datos)
4. [Configurar Google Ads API](#4-google-ads-api)
5. [Configurar Meta Ads API](#5-meta-ads-api)
6. [Instalar y correr el backend](#6-backend)
7. [Instalar y correr el frontend](#7-frontend)
8. [Flujo de uso: agregar un cliente](#8-flujo-de-uso)
9. [Despliegue en producción](#9-produccion)
10. [Preguntas frecuentes](#10-faq)

---

## 1. Arquitectura

```
adsdash/
├── backend/                  ← Node.js + Express API
│   ├── server.js             ← Entry point
│   ├── db.js                 ← PostgreSQL pool + schema
│   ├── routes/
│   │   ├── auth.js           ← Login / registro
│   │   ├── clients.js        ← CRUD de clientes
│   │   ├── googleAds.js      ← Endpoints Google
│   │   ├── metaAds.js        ← Endpoints Meta
│   │   ├── dashboard.js      ← Datos combinados
│   │   └── reports.js        ← Informes guardados
│   ├── services/
│   │   ├── googleAds.js      ← Google Ads API v17
│   │   └── metaAds.js        ← Meta Marketing API v20
│   ├── middleware/
│   │   ├── auth.js           ← requireAuth
│   │   └── clientAccess.js   ← requireClientAccess
│   ├── .env.example
│   └── package.json
│
└── frontend/                 ← React + Vite
    ├── src/
    │   ├── App.jsx           ← Routing
    │   ├── main.jsx
    │   ├── index.css         ← Variables globales
    │   ├── context/
    │   │   └── AuthContext.jsx
    │   ├── services/
    │   │   └── api.js        ← Axios client
    │   ├── components/
    │   │   └── Layout.jsx    ← Sidebar + outlet
    │   └── pages/
    │       ├── LoginPage.jsx
    │       ├── AgencyHome.jsx      ← Vista multi-cliente
    │       ├── ClientPage.jsx      ← Dashboard por cliente
    │       ├── ConnectionsPage.jsx ← Conectar OAuth
    │       └── ReportsPage.jsx     ← Informes (extender)
    ├── index.html
    ├── vite.config.js
    └── package.json
```

**Flujo de datos:**
```
Usuario → Frontend (React)
              ↓ fetch
         Backend (Express)
         ↙           ↘
Google Ads API    Meta Marketing API
         ↘           ↙
          PostgreSQL
         (caché diario)
```

---

## 2. Requisitos previos

Instalá estas herramientas antes de empezar:

| Herramienta      | Versión mínima | Descarga |
|-----------------|----------------|----------|
| Node.js         | 18+            | nodejs.org |
| npm             | 9+             | incluido con Node |
| PostgreSQL      | 14+            | postgresql.org |
| Git             | cualquiera     | git-scm.com |

Verificá que estén instalados:
```bash
node --version    # v18.x o superior
npm --version     # 9.x o superior
psql --version    # psql 14.x o superior
```

---

## 3. Base de datos

### 3.1 Crear la base de datos PostgreSQL

```bash
# Entrá a psql como superusuario
psql -U postgres

# Dentro de psql:
CREATE DATABASE adsdash;
CREATE USER adsdash_user WITH PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE adsdash TO adsdash_user;
\q
```

### 3.2 Obtener la connection string

Tu `DATABASE_URL` tendrá este formato:
```
postgresql://adsdash_user:tu_password_seguro@localhost:5432/adsdash
```

Las tablas se crean automáticamente al arrancar el backend (`bootstrapSchema()`).
No necesitás correr migraciones manualmente.

---

## 4. Google Ads API

Esta es la parte más larga. Seguí estos pasos con cuidado.

### 4.1 Crear proyecto en Google Cloud Console

1. Ir a https://console.cloud.google.com
2. Crear proyecto nuevo: `MetricsHub` (o el nombre que quieras)
3. En el menú lateral → **APIs y servicios** → **Biblioteca**
4. Buscar **"Google Ads API"** y hacer clic en **Habilitar**

### 4.2 Crear credenciales OAuth 2.0

1. **APIs y servicios** → **Credenciales** → **+ Crear credenciales** → **ID de cliente OAuth**
2. Tipo de aplicación: **Aplicación web**
3. Nombre: `MetricsHub Local`
4. En **URIs de redireccionamiento autorizados** agregar:
   ```
   http://localhost:4000/api/auth/google/callback
   ```
   (En producción agregar también tu dominio real)
5. Hacer clic en **Crear**
6. Copiar el **ID de cliente** y el **Secreto de cliente** → van a `.env`

### 4.3 Solicitar Developer Token

⚠️ Este paso es obligatorio y puede tardar 1–3 días hábiles.

1. Ir a https://ads.google.com → cuenta de administrador
2. Herramientas → **Centro de API** → Solicitar acceso básico
3. Completar el formulario (nombre de empresa, uso previsto, etc.)
4. Una vez aprobado, el token aparece en **Centro de API**
5. Copiarlo → variable `GOOGLE_DEVELOPER_TOKEN` en `.env`

> 💡 **Truco:** Para desarrollo podés usar el token de acceso de prueba (Test Account)
> que no necesita aprobación pero solo funciona con cuentas de prueba.

### 4.4 Crear Manager Account (MCC) — recomendado para agencias

Un MCC te permite administrar múltiples cuentas de clientes desde un solo lugar.

1. Ir a https://ads.google.com/intl/es/home/tools/manager-accounts/
2. Crear cuenta de administrador
3. Vincular las cuentas de los clientes al MCC
4. El ID del MCC (formato `123-456-7890`) va en `GOOGLE_MCC_ID`

### 4.5 Variables de entorno Google

```env
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
GOOGLE_DEVELOPER_TOKEN=xxxxxxxxxxxxxxxxxxxx
GOOGLE_MCC_ID=123-456-7890
```

---

## 5. Meta Ads API

### 5.1 Crear una Meta App

1. Ir a https://developers.facebook.com/apps
2. Clic en **Crear app**
3. Tipo: **Otro** → **Empresa**
4. Nombre: `MetricsHub`
5. En el dashboard de la app ir a **Agregar productos**
6. Buscar **Marketing API** y hacer clic en **Configurar**

### 5.2 Configurar OAuth

1. En el panel izquierdo → **Facebook Login** → **Configuración**
2. En **URI de redirección de OAuth válidos** agregar:
   ```
   http://localhost:4000/api/auth/meta/callback
   ```
3. Guardar cambios

### 5.3 Obtener credenciales

1. **Configuración** → **Básica**
2. Copiar **ID de la app** → `META_APP_ID`
3. Mostrar y copiar **Clave secreta de la app** → `META_APP_SECRET`

### 5.4 Solicitar permisos de producción

Para acceder a cuentas de clientes reales necesitás permisos avanzados:

1. En **Revisión de la app** → **Solicitar permisos**
2. Solicitar: `ads_read`, `ads_management`, `business_management`
3. Para cada permiso completar la demostración en video (screencast)
4. El proceso tarda 5–10 días hábiles

> 💡 **Para desarrollo:** Podés usar el **Usuario de prueba** de la app
> y la cuenta publicitaria de prueba sin pasar por revisión.

### 5.5 Variables de entorno Meta

```env
META_APP_ID=1234567890123456
META_APP_SECRET=abcdef1234567890abcdef1234567890
META_REDIRECT_URI=http://localhost:4000/api/auth/meta/callback
```

---

## 6. Backend

### 6.1 Instalar dependencias

```bash
cd adsdash/backend
npm install
```

### 6.2 Configurar variables de entorno

```bash
cp .env.example .env
# Editá .env con tus valores reales
nano .env   # o usá VS Code, vim, etc.
```

El `.env` completo debe verse así:
```env
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=genera_esto_con_openssl_rand_hex_32

DATABASE_URL=postgresql://adsdash_user:password@localhost:5432/adsdash

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
GOOGLE_DEVELOPER_TOKEN=...
GOOGLE_MCC_ID=...

META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=http://localhost:4000/api/auth/meta/callback
```

Generar SESSION_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6.3 Arrancar el servidor

```bash
# Modo desarrollo (reinicia automáticamente con nodemon)
npm run dev

# Deberías ver:
# ✅ Database schema bootstrapped
# 🚀 AdsDash API running on port 4000
```

### 6.4 Verificar que funciona

```bash
curl http://localhost:4000/api/health
# {"status":"ok","ts":"2025-04-01T..."}
```

---

## 7. Frontend

### 7.1 Instalar dependencias

```bash
cd adsdash/frontend
npm install
```

### 7.2 Variables de entorno (opcional)

```bash
# Solo necesario si el backend corre en otro puerto/host
echo "VITE_API_URL=http://localhost:4000/api" > .env
```

### 7.3 Arrancar el servidor de desarrollo

```bash
npm run dev

# Deberías ver:
# ➜  Local:   http://localhost:5173/
```

Abrí http://localhost:5173 en el navegador.

---

## 8. Flujo de uso: agregar un cliente

Una vez que todo esté corriendo, este es el flujo completo:

### Paso 1 — Crear cuenta de agencia
1. Ir a http://localhost:5173/login
2. Hacer clic en **Registrarse**
3. Completar nombre, email y contraseña
4. Entrás directo al dashboard

### Paso 2 — Crear un cliente
1. En el dashboard, clic en **+ Nuevo cliente**
2. Ingresar el nombre del cliente
3. El cliente aparece en la lista

### Paso 3 — Conectar Google Ads
1. Clic en el cliente → **⚙ Conexiones**
2. Clic en **Conectar Google Ads**
3. Se abre la pantalla de OAuth de Google
4. El cliente (o vos con acceso) selecciona su cuenta
5. Al autorizar, redirige de vuelta con `?connected=google`

### Paso 4 — Conectar Meta Ads
1. En la misma pantalla, clic en **Conectar Meta Ads**
2. Se abre el login de Facebook
3. Autorizar los permisos solicitados
4. Redirige de vuelta con `?connected=meta`

### Paso 5 — Ver el dashboard
1. Volvé al cliente
2. Los datos de Google Ads y Meta Ads aparecen unificados
3. Podés cambiar el rango de fechas con los selectores
4. La tabla de campañas permite filtrar por plataforma y ordenar

---

## 9. Despliegue en producción

### Opción A — Railway (recomendado, más fácil)

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Crear proyecto
railway init

# Agregar PostgreSQL
railway add postgresql

# Configurar variables de entorno
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=...
# (agregar todas las vars del .env)

# Deploy
railway up
```

### Opción B — VPS (DigitalOcean, Vultr, etc.)

```bash
# En el servidor
git clone https://github.com/tu-usuario/adsdash.git
cd adsdash/backend
npm install --production

# Configurar PM2 para mantener el proceso vivo
npm install -g pm2
pm2 start server.js --name adsdash-api
pm2 save
pm2 startup

# Frontend: build estático
cd ../frontend
npm install
npm run build
# Servir la carpeta dist/ con Nginx o Caddy
```

### Nginx config básico (frontend + proxy al API)

```nginx
server {
    listen 80;
    server_name tudominio.com;

    # Frontend estático
    location / {
        root /var/www/adsdash/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy al API
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Checklist de producción

- [ ] `NODE_ENV=production` en las variables de entorno
- [ ] `SESSION_SECRET` aleatorio y seguro (32+ chars)
- [ ] HTTPS habilitado (certbot / Let's Encrypt)
- [ ] URIs de callback actualizados en Google Cloud Console y Meta
- [ ] `FRONTEND_URL` apuntando al dominio real
- [ ] PostgreSQL con backups automáticos
- [ ] Logs con PM2 o similar

---

## 10. Preguntas frecuentes

**¿Cuánto cuesta usar las APIs?**
Tanto la Google Ads API como la Meta Marketing API son **gratuitas**. Solo pagás por las campañas que corrés.

**¿Necesito pagar a Google por el Developer Token?**
No. El token es gratuito pero requiere aprobación. En modo de prueba podés empezar inmediatamente.

**¿Puedo conectar múltiples cuentas de Google del mismo cliente?**
Sí, modificando `platform_connections` para permitir múltiples filas por plataforma (quitar el UNIQUE constraint y actualizar los servicios para iterar sobre ellas).

**¿Los datos se actualizan en tiempo real?**
Las APIs de Google y Meta tienen retrasos de 2–3 horas. No hay verdadero "tiempo real". Podés agregar un job de caché nocturno con `node-cron` para guardar snapshots diarios en `metrics_snapshots` y reducir las llamadas a la API.

**¿Cómo agrego más plataformas (TikTok Ads, LinkedIn Ads)?**
1. Crear `services/tiktokAds.js` siguiendo el patrón de `metaAds.js`
2. Agregar las rutas en `routes/`
3. Registrar en `server.js`
4. Agregar la tarjeta en `ConnectionsPage.jsx`

**¿Puedo generar PDFs de los informes?**
Sí, agregar `puppeteer` al backend para hacer screenshot del report y exportarlo como PDF.

---

## Librerías clave usadas

| Librería             | Para qué |
|---------------------|----------|
| `google-ads-api`    | Cliente oficial Google Ads API v17 |
| `google-auth-library` | OAuth2 con Google |
| `node-fetch`        | Llamadas HTTP a Meta Graph API |
| `recharts`          | Gráficos en React |
| `date-fns`          | Manipulación de fechas |
| `bcryptjs`          | Hash de contraseñas |
| `express-session`   | Sesiones de usuario |
| `pg`                | Cliente PostgreSQL |

---

*Desarrollado con MetricsHub Agency Platform · 2025*
