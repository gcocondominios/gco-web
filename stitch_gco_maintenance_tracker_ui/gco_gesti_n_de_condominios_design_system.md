---
name: "GCO Gestión de Condominios — Design System"
description: "Minimalismo corporativo moderno para aplicaciones móviles de gestión de condominios, seguimiento de mantenciones y tickets de residentes."
---

## Overview

El sistema de diseño de **GCO Gestión de Condominios** (`gcoadmin.cl/app`) está concebido para transmitir confianza institucional, claridad inmediata y calma operativa. Tanto residentes como administradores acceden —frecuentemente mediante un código QR junto al equipo— buscando confirmar en segundos si un activo crítico está operativo, cuándo fue su última mantención y si existe algún reporte abierto.

La estética combina **minimalismo corporativo moderno** con una sensación de **app nativa**: tarjetas flotantes en blanco puro (`#FFFFFF`) sobre un lienzo gris muy claro (`#F4F6F9`), bordes suavemente redondeados (`16px`), sombras ambientales sutiles y amplio espacio en blanco. La tipografía en azul marino corporativo (`#0F2942`) asegura una lectura sin esfuerzo, mientras que el sistema de semáforo semántico (Verde Esmeralda, Ámbar y Rojo Coral) comunica el estado de cada equipo de un vistazo, siempre acompañado de íconos y etiquetas textuales.

## Colors

La paleta se ancla en el **azul institucional** (`#1D5B96`) para acciones principales y el **azul marino corporativo** (`#0F2942`) para encabezados y tipografía de alta legibilidad, sobre superficies claras y neutras. Los colores de estado semántico se reservan exclusivamente para indicadores de semáforo, insignias de estado y alertas operativas; nunca se usan de forma decorativa.

- **Primary (`#1D5B96`):** Botones de acción principal (descarga de informes técnicos) y acentos de marca.
- **Secondary (`#0F2942`):** Títulos, encabezados y texto principal sobre fondos claros.
- **Surface (`#F4F6F9`) y Surface Card (`#FFFFFF`):** Fondo general de la aplicación y tarjetas flotantes elevadas.
- **Semáforo Semántico:** Verde Esmeralda (`#10B981`) para "Operativo / Al día", Ámbar (`#F59E0B`) para "En proceso / Próxima revisión" y Rojo Coral (`#EF4444`) para "Urgente / Fuera de servicio", emparejados con contenedores suaves (`*-container`) y texto de alto contraste (`on-*-container`).

```yaml
colors:
  primary: "#1D5B96"
  on-primary: "#FFFFFF"
  primary-container: "#EAF1FF"
  on-primary-container: "#00325A"
  secondary: "#0F2942"
  on-secondary: "#FFFFFF"
  surface: "#F4F6F9"
  on-surface: "#0F2942"
  surface-card: "#FFFFFF"
  on-surface-card: "#0F2942"
  surface-variant: "#EFF1F4"
  on-surface-variant: "#49607C"
  surface-subtle: "#F9FAFC"
  outline: "#DEE3ED"
  outline-subtle: "#E8ECF2"
  success: "#10B981"
  on-success: "#393939"
  success-container: "#D1FAE5"
  on-success-container: "#005236"
  warning: "#F59E0B"
  on-warning: "#2A1700"
  warning-container: "#FEF3C7"
  on-warning-container: "#653E00"
  error: "#EF4444"
  on-error: "#1C1C1C"
  error-container: "#FFEDEB"
  on-error-container: "#930013"
```

## Typography

La jerarquía tipográfica equilibra precisión técnica con cercanía residencial. **Plus Jakarta Sans** aporta geometría moderna y autoridad en encabezados y títulos de activos; **Rubik** garantiza legibilidad óptima en cuerpo, fechas y etiquetas de estado en pantallas móviles; y **Red Hat Mono** se reserva para códigos de equipo, folios y cifras tabulares.

```yaml
typography:
  display-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 42px
    letterSpacing: -0.5px
  display-lg-mobile:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
    letterSpacing: -0.4px
  headline-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 30px
    letterSpacing: -0.3px
  headline-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 20px
    fontWeight: 700
    lineHeight: 26px
    letterSpacing: -0.2px
  title-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: -0.1px
  title-sm:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0px
  body-md:
    fontFamily: "Rubik"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Rubik"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 19px
    letterSpacing: 0px
  label-lg:
    fontFamily: "Rubik"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0px
  label-md:
    fontFamily: "Rubik"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.1px
  label-sm:
    fontFamily: "Rubik"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.2px
  mono-sm:
    fontFamily: "Red Hat Mono"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.3px
```

## Layout & Spacing

El diseño sigue una **grilla fluida mobile-first** (ancho de referencia `390px`, adaptable hasta `440px` centrado en escritorio) con márgenes laterales generosos de `16px` (`page-margin`) y una separación vertical consistente de `16px` a `20px` entre tarjetas flotantes. Toda la escala de espaciado se construye sobre múltiplos de `4px` y `8px` para mantener alineación estricta entre grillas de metadatos, filas de acordeón y botones.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 12px
  gutter-lg: 16px
  gutter-xl: 20px
  section: 24px
  page-margin: 16px
```

## Elevation & Depth

La jerarquía visual se construye mediante **tarjetas flotantes limpias** (`surface-card` `#FFFFFF`) sobre el fondo neutro (`surface` `#F4F6F9`), reforzadas por un borde casi imperceptible (`outline-subtle` `1px`) y una sombra ambiental difusa y fría (`0 4px 20px -2px rgba(15, 41, 66, 0.06)`). Los elementos internos agrupados (como la grilla de metadatos clave o los detalles expandidos del historial) utilizan contraste tonal suave (`surface-subtle` o `surface-variant`) en lugar de bordes pesados o sombras anidadas.

## Shapes

Las tarjetas principales, contenedores de alertas y modales deslizantes emplean esquinas redondeadas suaves de `16px` (`lg`). Los elementos internos —como botones de acción principal, filas de acordeón y cajas de metadatos— bajan un paso a `12px` (`md`) para mantener una curvatura concéntrica armónica. Las insignias de estado, etiquetas de edificio y píldoras de semáforo utilizan forma de cápsula completa (`full` `9999px`).

```yaml
rounded:
  sm: 6px
  DEFAULT: 10px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
```

## Motion & Micro-interaction

Las transiciones son ágiles, discretas y funcionales. Los cambios de estado en botones y filas interactivas responden en `120ms`, mientras que la expansión de filas del historial y la apertura del modal deslizante de reporte utilizan curvas de desaceleración suaves (`220ms`) para acompañar el gesto táctil sin distraer. Se respeta `prefers-reduced-motion` y no se animan propiedades de layout costosas ni bucles decorativos.

```yaml
motion:
  state-change:
    duration: 120ms
    delay: 0ms
    timingFunction: ease-out
  accordion-toggle:
    duration: 200ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  sheet-enter:
    duration: 240ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
```

## Voice & Content Strategy

- **Tono de voz:** Claro, cercano, tranquilizador y profesional. Evita tecnicismos innecesarios para los vecinos (por ejemplo, prefiere *"Luz interior de cabina parpadeando"* y *"Mantención al día"* frente a códigos internos sin contexto).
- **Capitalización:** Tipo oración (*Sentence case*) en descripciones, botones y filas de historial; uso reservado de mayúsculas únicamente en la palabra clave del semáforo (*OPERATIVO*).
- **Terminología:** "Equipo" para el activo, "Mantención" (Preventiva / Correctiva), "Empresa responsable" / "Proveedor", "Incidencias activas" y "Reportar un problema".
- **Fechas y tiempos:** Formato corto español legible (`12 Nov 2026`, `12 Dic 2026`) y tiempos relativos concisos (`Hace 2 horas`).

## Components

Component implementations live as individual HTML sticker sheet files in
`components/`. Each file contains the canonical, styled HTML components with
`<!-- COMPONENT: name -->` comment markers. Read each file before use.

- **Accordion** → `@components/accordion.html`: `accordion-single`, `accordion-group`
- **Badge** → `@components/badge.html`: `badge-numeric`, `badge-dot`
- **Button** → `@components/button.html`: `button-primary`, `button-icon`, `button-with-icon`
- **Card** → `@components/card.html`: `card-elevated`, `card-action`, `card-interactive`, `card-interactive-2`
