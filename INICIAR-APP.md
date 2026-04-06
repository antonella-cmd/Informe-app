# 🚀 Cómo iniciar MetricsHub

## Paso 1 — Instalar Node.js (solo la primera vez)
Descargá e instalá desde: https://nodejs.org (botón verde "LTS")
Reiniciá la computadora después de instalarlo.

## Paso 2 — Instalar PostgreSQL (solo la primera vez)
Descargá desde: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
Durante la instalación, cuando pida password poné: Antonella03!

## Paso 3 — Crear la base de datos (solo la primera vez)
Abrí "SQL Shell (psql)" desde el menú de Windows y ejecutá:

```
CREATE DATABASE adsdash;
CREATE USER adsdash_user WITH PASSWORD 'Antonella03!';
GRANT ALL PRIVILEGES ON DATABASE adsdash TO adsdash_user;
```

## Paso 4 — Descomprimir el proyecto
Descomprimí el archivo metricshub-app.zip donde quieras (ej: Escritorio)

## Paso 5 — Iniciar el Backend
Abrí una terminal (cmd) en la carpeta adsdash/backend y ejecutá:
```
npm install
npm run dev
```
Tenés que ver: 🚀 AdsDash API running on port 4000

## Paso 6 — Iniciar el Frontend
Abrí OTRA terminal en la carpeta adsdash/frontend y ejecutá:
```
npm install
npm run dev
```
Tenés que ver: ➜ Local: http://localhost:5173/

## Paso 7 — Abrir la app
Abrí tu navegador y entrá a:
👉 http://localhost:5173

---
¡Listo! Registrate con tu email y empezá a agregar clientes.
