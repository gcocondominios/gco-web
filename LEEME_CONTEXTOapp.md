# GCO App — Contexto Vivo, Contrato Puente (`opsSnapshot`) y Registro de Cambios

> **Propósito de este archivo:** Servir como puente de contexto actualizado entre **GCO App (Operaciones/Terreno)** y **GCO Control (`panel-gco/`, Financiero/Next.js)** cada vez que cualquiera de los dos proyectos evolucione por separado.
> **Última actualización:** 2026-11-25 (`app/` v`20261124h` · Service Worker `gco-app-v23` · `backend/Code.gs` sincronizado en Drive).

---

## 1. URLs, Carpetas y Recursos en la Nube
- **App Operativa (PWA):** `https://gcoadmin.cl/app/` (`app/index.html`, `app/app.js`, `app/style.css`, `app/qrcode.min.js`, `app/sw.js`, `app/manifest.json`)
- **Panel Financiero Privado (Next.js):** `https://gcoadmin.cl/panel-gco/`
- **Repositorio GitHub público de despliegue:** `https://github.com/gcocondominios/gco-web` (rama `main`)
- **Carpeta sincronizada Drive:** `G:\Mi unidad\gco app` (`app/`, `backend/Code.gs`, `img/`, `LEEME_CONTEXTO.md`)
- **Google Sheet operativo ID:** `1OkAPyqDNSO6qDn4dFhvFah4FEf_C-romOjG_7jGrf44`
- **Carpeta Drive de respaldos (PDFs y fotos) ID:** `11DegM99fSRV05yqGreOlYCZZlHcKHGao`
- **Apps Script Web App URL:** `https://script.google.com/macros/s/AKfycbw_hB2YcR0HZeOVRY_ss7egIQWqATVgZe3RtJXXvsY-ZvsYFVjUgInhJNN1I9EKYT0aTA/exec`

### Propiedades del Script en Apps Script (`Configuración del proyecto > Propiedades del script`)
Ningún secreto vive hardcodeado en `Code.gs`:
- `APP_SECRET` *(obligatoria)*: firma tokens HMAC, hashes de contraseñas y autentica `action=opsSnapshot` desde `panel-gco/`.
- `GEMINI_API_KEY` *(obligatoria para IA)*: análisis de PDFs, resúmenes ejecutivos, comparador de cotizaciones y mejora de redacción de rondas.
- `EMAIL_ALERTAS_ADMIN` *(opcional)*: correo que recibe alertas semanales de vencimientos, nuevos tickets, stock crítico de bodega, rondas guardadas, decisiones de cotizaciones y nuevas solicitudes de acceso (si está vacío usa el correo del propietario del script).

---

## 2. Reglas Inmutables de Arquitectura y Privacidad
1. **Cero datos financieros en `app/`:** Cartolas bancarias, recaudación, morosidad, convenios, RUTs y deudas por unidad viven **exclusivamente en `panel-gco/`** (Supabase RLS). `app/` nunca importa ni muestra finanzas.
2. **Integración estrictamente unidireccional (`app/` → `panel-gco/`):** `panel-gco/` solo consulta `GET ?action=opsSnapshot&secret=<APP_SECRET>` en modo lectura.
3. **Aislamiento de roles en `app/` y `Code.gs`:**
   - **Visitante web (`DEMO`):** Sin sesión solo puede ver `DEMO`, nunca edificios reales.
   - **QR público (edificio real `?edificio=X&equipo=Y`):** Solo ve la ficha de ese equipo, historial con PDFs **sin `costoClp`**, tickets **sin `emailVecino`**, y **sin `ordenesPendientes`**. Puede reportar incidencias con fotos.
   - **Técnico (`tecnico`):** Restringido a su edificio y solo a sus equipos asignados (`Equipos_Asignados` o coincidencia con `Empresa_Mantenedora`).
   - **Operaciones (`operaciones`):** Entra directo al selector de comunidades reales (`#view-ops-home`, sin `DEMO`), con panel acotado a 4 pestañas (`Tickets`, `Órdenes`, `Equipos`, `Bodega`), registro de mantenciones e Informe de Ronda PDF. El servidor devuelve arreglos vacíos para `usuarios`, `cotizaciones`, `documentos`, `avisos` y `auditoria`.
   - **Comité (`comite`):** Bloqueado a su comunidad (sin `DEMO`). Ve Equipos, Calendario, Docs, Cotizaciones + Comparador IA, Acuerdos, GCO IA y Acta PDF (Ley 21.442). No recibe `emailVecino` privado de otros residentes.
   - **Admin (`admin`):** Control total multi-comunidad (`ALL`), edición/eliminación de mantenciones y equipos, gestión de usuarios, Bitácora (`Auditoria`), Control Center (`Últimas Rondas`) y acceso directo a `panel-gco/`.
4. **Cero CDN de ejecución en `app/`:** Tanto Tailwind CSS (`app/style.css`, 29 KB minificado) como `app/qrcode.min.js` (19.5 KB) están compilados/locales y precacheados en `app/sw.js` (`gco-app-v23`) para arranque instantáneo y operación offline.

---

## 3. Contrato JSON Oficial del Puente (`action=opsSnapshot`)

Endpoint:
```text
GET https://script.google.com/macros/s/AKfycbw_hB2YcR0HZeOVRY_ss7egIQWqATVgZe3RtJXXvsY-ZvsYFVjUgInhJNN1I9EKYT0aTA/exec?action=opsSnapshot&secret=<APP_SECRET>
```

### Estructura garantizada de respuesta (`{ ok: true, ... }`)
- `generadoEn` (`string`, `yyyy-MM-dd HH:mm`)
- `comunidades[]`: reúne tanto comunidades en `Comunidades` como en `Equipos` (incluye comunidades recién creadas sin equipos todavía). Campos: `edificioId`, `nombre`, `direccion`, `comuna`, `totalUnidades`, `estacionamientos`, `bodegas`, `plataformaFinanciera`, `comiteRepresentantes`, `comiteVigencia`, `personalTurnos`, `contactosEmergencia`, `responsablesGco`, `notasGenerales`, `ultimaActualizacion`.
- `resumenGlobal`: **excluye `DEMO` automáticamente cuando existe al menos 1 comunidad real** (para que los totales en la pestaña *Sync* y `gco_sync_logs` de `panel-gco/` coincidan exactamente con la pestaña *Operaciones*). Campos:
  - `totalComunidades`, `totalEquipos`, `mantencionesAtrasadas`, `mantencionesPorVencer` *(solo equipos amarillos con fecha próxima)*, `mantencionesPorProgramar` *(equipos nuevos sin primera mantención)*, `ticketsPendientes`, `ordenesPendientes`, `cotizacionesPendientes`, `docsPorVencer`
  - `porComunidad[]`: `id`, `nombre` *(prioriza nombre oficial de `Comunidades`)*, `equipos`, `atrasadas`, `porVencer`, `porProgramar`, `ticketsAbiertos`, `ordenesAbiertas`, `cotizacionesPendientes`, `docsAlerta`, `scoreUrgencia`
  - `ultimasRondas[]`: últimas 15 rondas en terreno (`id`, `fecha`, `edificioId`, `edificioNombre`, `operador`, `totalEspacios`, `conformes`, `observaciones`, `urgentes`, `detalle`, `linkPdf`, `carpetaDrive`)
- `cartaGanttEquipos[]`: `edificioId`, `equipoId`, `nombre`, `empresa`, `periodicidadDias`, `ultimaVisita`, `proximaVisita`, `diasRestantes`, `estado`, `color` (`verde` / `amarillo` / `rojo`).
- `documentosVencimientos[]`: certificaciones, pólizas, contratos, reglamentos y actas de comité (`id`, `edificioId`, `categoria`, `titulo`, `fechaVencimiento`, `estadoVencimiento`, `colorVencimiento`, `diasRestantes`, `linkPdf`). **Nota:** excluye `Informe de Ronda` repetitivos para no ensuciar la tabla de Certificaciones de `panel-gco/`; las rondas viajan aparte en `ultimasRondas[]`.
- `ticketsAbiertos[]`: incidencias no resueltas (hasta 40 más recientes). Campos saneados para `panel-gco/`:
  - `fotoAntesUrl`: **siempre una sola URL válida** (la primera foto si el ticket trae múltiples adjuntos) + `fotosAntesUrls[]` con todas las URLs.
  - `fotoDespuesUrl` + `fotosDespuesUrls[]` con el mismo formato limpio.
  - `depto`: sin prefijo `"Depto "` duplicado (ej. `"402"` en vez de `"Depto 402"`).
  - `emailVecino`: siempre `""` por privacidad Ley 19.628.
- `ultimasRondas[]` *(también disponible en nivel raíz del snapshot)*: listo para que `panel-gco/` pueda mostrar la bitácora de rondas con enlace a PDF y carpeta Drive sin cambios adicionales en `Code.gs`.

### Notas para futuras mejoras en `panel-gco/` (sin romper compatibilidad)
- En `panel-gco/` (UI de configuración), el texto del campo de clave puede mencionar *"Propiedades del script (`APP_SECRET`)"* en lugar de *"configurado en `backend/Code.gs`"*.
- `panel-gco/` ya puede consumir opcionalmente `ultimasRondas[]`, `resumenGlobal.ordenesPendientes` y `ticketsAbiertos[].fotosAntesUrls[]` si se desea mostrar una sub-pestaña de Rondas o galería multi-foto en `Operaciones`.

---

## 4. Registro de Últimas Mejoras Implementadas en GCO App (Nov 2026)

### 2026-11-25 — Alineación de Puente `opsSnapshot` con `panel-gco`
- **`Code.gs`:**
  - `buildControlCenterSummary_` ahora separa `porVencer` vs `porProgramar` (equipos sin primera mantención) y prioriza el nombre oficial desde la hoja `Comunidades`.
  - `handleGetOpsSnapshot_` excluye `DEMO` de `resumenGlobal` cuando existen comunidades reales, incluye comunidades sin equipos todavía, limpia `fotoAntesUrl` (primer link + `fotosAntesUrls[]`), quita el prefijo duplicado `"Depto "`, vacía `emailVecino`, filtra `Informe de Ronda` de `documentosVencimientos` y expone `ultimasRondas[]`.

### 2026-11-24 (Ronda 2 — Hardening y PDFs completos)
- **Acta PDF de Comité (`handleSaveCommitteePdf_` + `handleGetCommitteeData_`):** ahora incluye tabla real de `ultimasMantenciones`, resumen de inversión, `tickets` recientes y seguimiento de `acuerdos`. Se ocultó `emailVecino` al perfil `comite`.
- **Comprobante PDF con QR real (`handleSaveReceiptPdf_`):** genera el PNG del código QR en cliente (`buildQrDataUrl`) y lo incrusta escaneable dentro del PDF generado por Apps Script.
- **Sin CDN externos:** `qrcode.min.js` local en `app/qrcode.min.js` y precacheado en `sw.js` (`gco-app-v23`).
- **UX y anti-duplicados:** reseteo de estado/tipo entre mantenciones seguidas (`resetMaintenanceModalControls`), opción `"Todas las comunidades"` en `#admin-building-select`, guardas de comunidad activa antes de crear ítems, bloqueo anti-doble-clic en resolver tickets / votar cotizaciones / completar órdenes / bodega, `try/catch` en todos los inputs de archivos/fotos y cola offline (`syncOfflineQueue`) con refresco de token y tope de 3 reintentos por error de validación.
- **Alertas y Auditoría:** `enviarAlertasVencimiento` (lunes) ahora excluye `DEMO` e incluye Equipos + Documentos por vencer/vencidos + Tickets abiertos con +7 días (SLA). Correos automáticos al aprobar/rechazar cotizaciones y al registrarse cuentas pendientes (+ correo al usuario cuando se aprueba su cuenta).

### 2026-11-24 (Ronda 1 — Auditoría integral de 10 puntos y operación en terreno)
- **Organización automática en Google Drive:** subcarpetas por comunidad y equipo (`Mantenciones/<Equipo>/`, `Tickets/<Equipo>/`, `Cotizaciones/`, `Documentos/Actas Comité/`, `Rondas/<YYYY-MM-DD>/Fotos/`).
- **Módulo de Rondas sin diálogo de impresora (iPhone):** respaldo progresivo de fotos, generación de PDF real en Drive, registro en pestaña `Rondas`, creación automática de Órdenes desde hallazgos, correo resumen automático, barra de progreso, botón `Todo OK (1 toque)`, auto-detección de urgencia y edición de espacios.
- **Tailwind CSS precompilado:** eliminado `cdn.tailwindcss.com`, compilado a `app/style.css` (29 KB).
- **Concurrencia y seguridad:** `LockService.getScriptLock()` en escrituras `doPost`, secretos migrados a `PropertiesService`, cierre en 1 toque de Órdenes al guardar Mantención, buscador instantáneo de equipos (`#dir-search-input`), píldora de comunidad clickeable, alertas inmediatas de nuevo Ticket y stock crítico en Bodega, y edición/eliminación admin de Mantenciones y Equipos.

---

## 5. Checklist Rápido de Despliegue
1. **Apps Script (`Code.gs`):** copiar `G:\Mi unidad\gco app\backend\Code.gs` → guardar → **Implementar → Administrar implementaciones → Editar (lápiz) → Nueva versión → Implementar**.
2. **GitHub (`gcocondominios/gco-web`, rama `main`):** sincronizar la carpeta `app/` completa (`index.html`, `app.js`, `style.css`, `qrcode.min.js`, `sw.js`, `manifest.json`) + `LEEME_CONTEXTO.md`.
