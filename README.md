# FacturaRápido 🧾

App para escanear tickets de Walmart, La Comer, Costco y Chedraui y gestionar tus facturas quincenales.

---

## Configuración paso a paso
 
### 1. Supabase

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto gratis
2. En el menú lateral ve a **SQL Editor**
3. Pega el contenido de `supabase-schema.sql` y ejecuta
4. Ve a **Project Settings → API** y copia:
   - `Project URL` → es tu `VITE_SUPABASE_URL`
   - `anon public key` → es tu `VITE_SUPABASE_ANON_KEY`

### 2. Anthropic API Key

1. Ve a [console.anthropic.com](https://console.anthropic.com)
2. Crea una API key
3. Cópiala → es tu `VITE_ANTHROPIC_API_KEY`

### 3. GitHub + GitHub Pages

1. Crea un repo en GitHub llamado **`facturapido`** (debe coincidir con el `base` en vite.config.js)
2. Sube todos los archivos de este proyecto
3. Ve a **Settings → Secrets and variables → Actions** y agrega estos 3 secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ANTHROPIC_API_KEY`
4. Ve a **Settings → Pages** y en "Source" selecciona **GitHub Actions**
5. Haz un push a `main` — el workflow se ejecuta automáticamente y despliega la app

Tu app estará en: `https://TU_USUARIO.github.io/facturapido/`

### 4. Instalar como app en el celular

- **iPhone**: Abre la URL en Safari → botón compartir → "Agregar a pantalla de inicio"
- **Android**: Abre la URL en Chrome → menú ⋮ → "Agregar a pantalla de inicio"

---

## Estructura del proyecto

```
facturapido/
├── src/
│   ├── App.jsx          # App principal
│   ├── main.jsx         # Entry point
│   └── supabase.js      # Cliente Supabase
├── public/
│   └── manifest.json    # PWA manifest
├── .github/
│   └── workflows/
│       └── deploy.yml   # Auto-deploy a GitHub Pages
├── index.html
├── vite.config.js
├── package.json
├── supabase-schema.sql  # SQL para crear las tablas
└── .env.example         # Plantilla de variables de entorno
```

## Variables de entorno

Copia `.env.example` como `.env` para desarrollo local:

```bash
cp .env.example .env
# Llena las 3 variables en .env
npm install
npm run dev
```

> ⚠️ Nunca subas el archivo `.env` a GitHub — ya está en `.gitignore`
