# GCO App — Contexto de Proyecto y Guía para Continuar

Este archivo resume el estado actual del proyecto **GCO Gestión de Condominios** (actualizado al cierre de la jornada, commit `d2a33fb`) para retomarlo mañana en el otro computador donde está el código fuente de `panel-gco/`.

---

## 1. URLs y Recursos en la Nube
- **App Operativa en vivo:** `https://gcoadmin.cl/app/` (`app.js?v=20261123c`, PWA `gco-app-v14`)
- **Panel Financiero Privado:** `https://gcoadmin.cl/panel-gco/`
- **Repositorio GitHub:** `https://github.com/gcocondominios/gco-web` (rama `main`, último commit `d2a33fb`)
- **Carpeta local sincronizada:** `G:\Mi unidad\gco app` (`app/` frontend, `backend/Code.gs` servidor, `img/` íconos/logo)
- **Google Sheet ID:** `1OkAPyqDNSO6qDn4dFhvFah4FEf_C-romOjG_7jGrf44`
- **Google Drive Folder ID:** `11DegM99fSRV05yqGreOlYCZZlHcKHGao`
- **Apps Script Web App URL:** `https://script.google.com/macros/s/AKfycbw_hB2YcR0HZeOVRY_ss7egIQWqATVgZe3RtJXXvsY-ZvsYFVjUgInhJNN1I9EKYT0aTA/exec`

---

## 2. Regla de Seguridad y Separación de Perfiles (Decisión de Arquitectura)
- **Cero datos financieros en `app/`:** Toda la información financiera sensible (cartolas bancarias, recaudación, morosidad, RUTs, deudas por unidad y convenios) vive **exclusivamente en `panel-gco/`** (Supabase). `app/` **nunca** importa ni muestra finanzas.
- **Integración estrictamente unidireccional (`app/` → `panel-gco/`):** `panel-gco/` consume el endpoint `action=opsSnapshot` de `Code.gs` para reflejar automáticamente datos estructurales y operativos (**comunidades, número de unidades, salas/equipos, carta Gantt / fechas de vencimiento, documentos por vencer y tickets abiertos**).
- **Perfiles y Matriz de Accesos en `app/`:**
  - **Visitante web (`DEMO`):** Quien entra desde la web (`?edificio=DEMO` o `/app/` sin sesión) **solo puede ver la demo** (`DEMO`), nunca edificios reales.
  - **Vecino / QR público (edificios reales):** Al escanear el QR de un equipo (`?edificio=X&equipo=Y`) ve **únicamente ese equipo**: estado en vivo, **historial reciente de mantenciones con PDFs** (sin costos) y botón para **reportar fallas con fotos**. No puede ver el directorio general ni otros edificios.
  - **Técnico (`tecnico`):** Restringido a **su comunidad** y **solo a sus equipos asignados** (por columna `Equipos_Asignados` en `Usuarios`, ej. `BMB-01,EST-AGUA`, o coincidencia con `Empresa_Mantenedora`). Al escanear el QR de *su* equipo puede registrar mantenciones y cerrar órdenes; si escanea otro equipo, queda en solo lectura y el servidor bloquea la escritura. Sin acceso a rondas globales ni a `DEMO`.
  - **Operaciones (`operaciones`):** Ve **todos los edificios reales (sin `DEMO`)** con panel simplificado de 4 pestañas (`Tickets`, `Órdenes`, `Equipos`, `Bodega`), registro de mantenciones e **Informe de Ronda PDF**.
  - **Comité (`comite`):** Bloqueado a **su comunidad** (sin `DEMO` ni otros edificios). Ve Equipos, Calendario, Docs, Cotizaciones + Comparador IA, Acuerdos, GCO IA y Acta PDF (Ley 21.442).
  - **Admin (`admin`):** Control total sobre **todos los edificios reales + `DEMO`**, gestión de usuarios (con campo `Equipos asignados` para técnicos), Bitácora, Control Center y acceso a `panel-gco/`.

---

## 3. Qué ya está construido y publicado en `app/` + `Code.gs`
- **Carga automática de `DEMO`:** Entrar a `https://gcoadmin.cl/app/` sin `?edificio=` carga `Edificio DEMO` por defecto (o el edificio de la sesión activa).
- **Modo Offline:** Caché local (`localStorage`), cola de escritura offline (`gco_offline_queue_v1`) y Service Worker (`app/sw.js`, `gco-app-v14`).
- **Módulo 1 — Ficha Maestra (`Comunidades`):** Nombre, dirección, comuna, unidades, estacionamientos, bodegas, plataforma financiera, Comité/vigencia, turnos, contactos de emergencia y responsables GCO.
- **Módulo 2 — Equipos, QR, Calendario Preventivo e Informe de Ronda PDF:**
  - Semáforo adaptativo (5/15/30 días), historial transparente con PDFs, checklist móvil, firma digital, comprobante PDF con QR, vista `Calendario` y botón `+ Orden`.
  - **Informe de Ronda de Jornada (PDF para Comité):** Selección de espacios/equipos revisados, estado (`Conforme`, `Observación`, `Urgente`), 6 chips rápidos de hallazgos, **dictado por voz (`es-CL`)**, botón **“Mejorar con IA”** (`polishReportAi` en `Code.gs` que redacta en tono profesional sin inventar datos), **hasta 10 fotos comprimidas por espacio** (grilla 3 columnas en PDF) y borrador persistido en `localStorage`.
- **Módulo 3 — Incidencias y SLA:** Reporte con fotos comprimidas, correo automático al resolver e indicador `SLA` (`Hoy`, `SLA Xd` desde 3 y 7 días).
- **Módulos 4, 5 y 6 — Compras, Bodega y Documentos:** Órdenes, cotizaciones PDF + aprobación Comité + **Comparador con IA**, inventario (`Bodega`) y **Repositorio Documental (`Docs`)** con semáforo de vencimientos.
- **Módulo 8 — Comité, Avisos y Auditoría:** Portal Comité con Acta PDF (Ley 21.442), **Acuerdos del Comité**, **Tablón de Avisos** y **Bitácora (`Auditoria`)**.
- **Módulo 10 — Control Center y `GCO Intelligence`:** Tablero multi-comunidad (`Control`), análisis de documentos PDF, resumen ejecutivo y consulta libre (`askBuildingAi`) restringidos a `admin` y `comite`.

---

## 4. Contrato JSON listo para conectar `panel-gco/` mañana
En el otro computador, al abrir el **código fuente Next.js de `panel-gco/`**, llamar desde el cliente o servidor a:
```text
GET https://script.google.com/macros/s/AKfycbw_hB2YcR0HZeOVRY_ss7egIQWqATVgZe3RtJXXvsY-ZvsYFVjUgInhJNN1I9EKYT0aTA/exec?action=opsSnapshot&secret=<APP_SECRET>
```

La respuesta JSON entrega exactamente:
- `comunidades[]`: `edificioId`, `nombre`, `direccion`, `comuna`, `totalUnidades`, `estacionamientos`, `bodegas`, `plataformaFinanciera`, `comiteRepresentantes`, `comiteVigencia`, `personalTurnos`, `contactosEmergencia`, `responsablesGco`.
- `cartaGanttEquipos[]`: `edificioId`, `equipoId`, `nombre`, `empresa`, `periodicidadDias`, `ultimaVisita`, `proximaVisita`, `diasRestantes`, `estado`, `color` (`verde`/`amarillo`/`rojo`).
- `documentosVencimientos[]`: `id`, `edificioId`, `categoria`, `titulo`, `fechaVencimiento`, `estadoVencimiento`, `colorVencimiento`, `linkPdf`.
- `ticketsAbiertos[]`: incidencias pendientes (`id`, `fecha`, `edificioId`, `equipoId`, `depto`, `descripcion`, `estado`).
- `resumenGlobal`: KPIs consolidados (`totalComunidades`, `totalEquipos`, `mantencionesAtrasadas`, `mantencionesPorVencer`, `ticketsPendientes`, `docsPorVencer`, `porComunidad[]`).

### Recordatorio de despliegue en Google Apps Script
Al abrir el Sheet (`Extensiones > Apps Script`), pegar [Code.gs](file:///G:/Mi%20unidad/gco%20app/backend/Code.gs), guardar y publicar mediante **Implementar > Administrar implementaciones > Editar (lápiz) > Nueva versión > Implementar** (para mantener intacta la URL del Web App).
