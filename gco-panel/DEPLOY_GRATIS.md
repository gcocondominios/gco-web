# Cómo publicar GCO Control en `gcoadmin.cl/panel-gco/` ($0/mes)

Esta app ya está compilada como **módulo estático privado**, igual que tu carpeta actual `gcoadmin.cl/app/`.

## Carpeta lista para subir
La carpeta generada se encuentra en:
```
c:\Proyectos\Automatizaciones GCO\panel-gco-para-gcoadmin\panel-gco\
```

---

## Paso 1: Subir el módulo oculto a `gcoadmin.cl`

1. En tu repositorio o hosting actual de `gcoadmin.cl` (donde ya tienes `index.html`, `img/` y `app/`), copia la carpeta **`panel-gco/`** completa en la raíz, al lado de `app/`:
   ```text
   gcoadmin.cl/
   ├── index.html          (NO se toca — sigue 100% pública y sin enlaces al panel)
   ├── img/
   ├── app/                (Tu app QR actual)
   └── panel-gco/          <-- Pega esta carpeta aquí
       ├── index.html
       ├── logo.png
       ├── robots.txt
       └── _next/
   ```
2. Una vez subida/publicada, el módulo privado quedará accesible en:
   **`https://gcoadmin.cl/panel-gco/`**
3. **Oculto para buscadores y público:**
   - No aparece en ningún menú ni botón de `gcoadmin.cl/index.html`.
   - Incluye `<meta name="robots" content="noindex, nofollow, noarchive">` y `robots.txt` con `Disallow: /`.

---

## Paso 2: Activar login seguro y sincronización entre PC y celular (Supabase Free $0)

Para que tú y tus socios compartan los mismos datos y el acceso sea solo con usuario y contraseña:

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com) (región São Paulo).
2. En **SQL Editor → New Query**, pega el contenido de `gco-panel/supabase/schema.sql` y pulsa **Run**.
3. En **Authentication → Users → Add User**, crea las cuentas de tus socios (`gco.condominios@gmail.com`, etc.).
4. Crea el archivo `gco-panel/.env.local` con tus credenciales de Supabase:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-ANON-KEY
   NEXT_PUBLIC_GCO_ALLOWED_EMAILS=gco.condominios@gmail.com,admpintoggcc@gmail.com,admmontemare@gmail.com
   ```
5. Re-genera la carpeta `panel-gco` con tus claves de Supabase incluidas:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "c:\Proyectos\Automatizaciones GCO\gco-panel\scripts\build-gcoadmin.ps1"
   ```
6. Reemplaza la carpeta `panel-gco/` en tu hosting de `gcoadmin.cl`.

---

## También compatible con Vercel Hobby ($0)

Si más adelante prefieres un subdominio dedicado (`panel.gcoadmin.cl`), también puedes conectar la carpeta `gco-panel` directamente a Vercel Hobby sin cambios.
