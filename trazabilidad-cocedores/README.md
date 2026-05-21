# trazabilidad-cocedores

Dashboard de **trazabilidad NFC de carritos de atún** en cocedores cilíndricos para **PINSA Congelados, Planta Mazatlán**.

- **11 cocedores** lineales · capacidad **28 carritos** c/u.
- **Lector NFC portátil**: el operario escanea tag del carrito + tag del cocedor.
- **100 % simulado** por defecto (sin MQTT/SCADA/PLC). El simulador genera movimientos, temperaturas y alertas con `MOCK_DATA=true`.

---

## Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node ≥20 ESM |
| Web | Express 4 + helmet + cors + express-rate-limit |
| Realtime | SSE propio con coalescing 200 ms + backpressure |
| Logging | winston + winston-daily-rotate-file |
| Frontend | Vanilla JS ES modules + CSS plano |
| 3D | Babylon.js 9 (CDN) — cocedores 3D |
| Charts | inline SVG + canvas (sin Chart.js/ECharts) |
| Tests | vitest |

Puerto default **5002** (hermano `childrooms-render` refrigeración usa 5001, `Malinalco-render` usa 5000).

---

## Cómo arrancar

```bash
cp .env.example .env
npm install
npm start         # producción
npm run dev       # node --watch (auto-reload)
npm test          # vitest
```

Abre <http://localhost:5002> en el navegador.

---

## Variables de entorno (`.env`)

Copia `.env.example` → `.env` y edita lo que necesites.

| Var | Default | Uso |
|-----|---------|-----|
| `MOCK_DATA` | `true` | Usa el simulador. Si `false`, espera driver real (no implementado todavía). |
| `WEB_HOST` | `0.0.0.0` | Bind del servidor HTTP |
| `WEB_PORT` | `5002` | Puerto HTTP |
| `LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |

Para el detalle completo de variables, constantes del simulador y buffers, ver [docs/instalacion.md](docs/instalacion.md).

---

## Estructura rápida

```
trazabilidad-cocedores/
├── src/
│   ├── index.js              entry + factory simulator + Express + SseHub + shutdown
│   ├── server.js             rutas /api/* + helmet + CSP + cors + rate-limit
│   ├── config.js             constantes + dotenv
│   ├── cocedoresMap.js       11 cocedores + recetas + estados + operarios
│   ├── snapshotStore.js      EventEmitter + memoize getAll() por lastUpdate
│   ├── movimientosStore.js   ledger NFC ring 24h + CSV builders
│   ├── alertasStore.js       alertas activas + histórico + debounce
│   ├── mockSimulator.js      motor: ticks de temperatura + eventos NFC sintéticos
│   ├── sseHub.js             hub SSE con backpressure (write() return + dropped count)
│   └── logger.js             winston DailyRotateFile
├── public/
│   ├── index.html
│   ├── css/
│   │   ├── variables.css     tokens: paleta blanca corporativa, tipografía, radius
│   │   ├── header.css        header sticky: logo, reloj, user, campana, conexión
│   │   ├── sidebar.css       navegación lateral
│   │   ├── dashboard.css     dashboard principal + KPIs
│   │   ├── views.css         estilos compartidos de vistas
│   │   └── detalleCocedor.css vista detalle de cocedor
│   ├── js/
│   │   ├── app.js            entry: SSE → snapshot → render por vista
│   │   ├── stream.js         EventSource con reconexión exponencial
│   │   ├── router.js         SPA router por hash (#/cocedores, #/alertas, ...)
│   │   ├── sidebar.js        navegación lateral
│   │   ├── headerClock.js    reloj + fecha en header + estado conexión SSE
│   │   ├── headerUser.js     dropdown de usuario (3 perfiles + localStorage)
│   │   ├── kpiBar.js         barra de KPIs superiores
│   │   ├── cocedoresStage.js vista principal: grid de 11 cocedores SVG
│   │   ├── scene3dCocedores.js    escena Babylon.js: vista 3D general
│   │   ├── scene3dDetalleCocedor.js escena Babylon.js: detalle 3D individual
│   │   ├── cocedorDetalle.js panel detalle de cocedor: temp, timer, carritos
│   │   ├── viewCocedores.js  vista de listado de cocedores
│   │   ├── viewCarritos.js   catálogo de carritos con búsqueda y filtros
│   │   ├── viewTrazabilidad.js timeline de trazabilidad de un carrito
│   │   ├── viewAlertas.js    panel de alertas activas e histórico
│   │   ├── viewReportes.js   exportación CSV y resumen de ciclos
│   │   ├── viewConfig.js     configuración de recetas, operarios, etc.
│   │   ├── viewDetalleCocedor.js vista detallada de un cocedor
│   │   ├── entradaCarrito.js formulario de entrada manual de carrito
│   │   ├── trazabilidad.js   búsqueda de carrito por ID
│   │   ├── svgCocedor.js     generador SVG para representación de cocedor
│   │   ├── svgIcons.js       iconos SVG inline
│   │   ├── donutEstado.js    gráfico donut de distribución de estados
│   │   ├── kpisDia.js        cálculo y render de KPIs del día
│   │   ├── ultimosMovimientos.js lista de últimos movimientos
│   │   ├── vistaInterna.js   vista interna de cocedor (slots de carritos)
│   │   └── dom.js            helpers DOM
│   └── images/
├── data/                     persistencia JSON atómica (futuro)
├── logs/                     rotados por día
├── tests/                    vitest
├── docs/                     documentación detallada (ver abajo)
└── package.json
```

---

## Documentación

Para entender en profundidad el sistema, consulta los siguientes documentos:

| Documento | Qué encontrarás |
|-----------|-----------------|
| [docs/arquitectura.md](docs/arquitectura.md) | Diagramas de capas, módulos backend/frontend, stack detallado con justificaciones, flujo SSE, decisiones de diseño |
| [docs/instalacion.md](docs/instalacion.md) | Requisitos, instalación paso a paso, variables de entorno completas, troubleshooting, verificación post-instalación |
| [docs/flujo.md](docs/flujo.md) | Flujo de datos end-to-end, ciclo de vida del carrito y del cocedor, eventos NFC, alertas, movimientos, interacción operario |

---

## Header

El header incluye los siguientes elementos (de izquierda a derecha):

| Elemento | Módulo | Descripción |
|----------|--------|-------------|
| **Logo PINSA** | `index.html` | Imagen del logo institucional |
| **Título del sistema** | `index.html` | "Trazabilidad Cocedores" |
| **Nombre de planta** | `index.html` | "Planta Mazatlán" |
| **Connection status** | `headerClock.js` | Indicador SSE: ● verde (en tiempo real), ● ámbar (conectando), ● rojo (sin conexión) |
| **Reloj + fecha** | `headerClock.js` | Hora actual y fecha, se actualiza cada segundo |
| **Campana de notificaciones** | `header.css` | Botón con badge animado para alertas pendientes |
| **User dropdown** | `headerUser.js` | Avatar + nombre clickable, menú con 3 perfiles (LUIS R., MARIA G., CARLOS T.) + logout. Persistencia en `localStorage`. |

### User switching

El dropdown de usuario permite cambiar entre 3 perfiles predefinidos. El usuario seleccionado se guarda en `localStorage` bajo la clave `pinsa_usuario` y se restaura al recargar la página.

Al cambiar de usuario se dispara el evento `usuario-cambiado` con el nombre:

```js
window.addEventListener('usuario-cambiado', (e) => {
  console.log(e.detail.usuario); // 'LUIS R.' | 'MARIA G.' | 'CARLOS T.'
});
```

---

## Vistas del frontend

| Vista | Ruta hash | Contenido |
|-------|-----------|-----------|
| **Cocedores** | `#/cocedores` | Grid de 11 cocedores SVG con estados y KPIs |
| **Alertas** | `#/alertas` | Panel de alertas activas e histórico |
| **Carritos** | `#/carritos` | Catálogo de carritos con búsqueda y filtros |
| **Trazabilidad** | `#/trazabilidad` | Timeline de trazabilidad de un carrito específico |
| **Reportes** | `#/reportes` | Exportación CSV y resumen de ciclos |
| **Configuración** | `#/config` | Configuración de recetas, operarios, etc. |
| **Detalle cocedor** | `#/cocedor/:id` | Vista detallada de un cocedor individual |

---

## Render 3D (Babylon.js)

### Vista general (`scene3dCocedores.js`)

Los 11 cocedores se representan como volúmenes 3D en perspectiva. Cada cocedor muestra su estado actual mediante color (EN_PROCESO = azul, LISTO = verde, ESPERA = ámbar, etc.). Click sobre un cocedor abre la vista detalle.

- Cámara orbital `ArcRotateCamera` con rotación automática.
- Prewarm: geometría construida al boot para respuesta inmediata.
- Tracking de cleanup: cada mesh se hace `dispose()` antes de reconstruir.

### Vista detalle (`scene3dDetalleCocedor.js`)

Un cocedor individual mostrado en detalle con carritos visibles en su interior.

- Readout: muestra temperatura actual, setpoint, timer.
- Carritos posicionados por slot (1-28).
- Click en un carrito abre su timeline de trazabilidad.

---

## Tokens visuales

`public/css/variables.css` define la paleta y tipografía base. Tema **blanco corporativo**.

**Paleta principal:**

```
--c-bg:        #F4F6F8   fondo general (off-white)
--c-surface:   #FFFFFF   paneles
--c-surface-2: #EDF1F5   surfaces alternos (header, sidebar)
--c-surface-3: #E2E8F0   hover states
--c-blue:      #00539F   PINSA brand
--c-blue-2:    #2E80D8   azul activo / links
--c-blue-3:    #5BB8F5   hover / info
--c-green:     #00C896   ON / normal / LISTO
--c-amber:     #F5A623   warning / ESPERA
--c-red:       #FF4B4B   alarma / error
--c-ice:       #0F172A   texto principal (oscuro sobre claro)
--c-text-mid:  #475569   texto secundario
--c-text-dim:  #64748B   texto terciario
--c-silver:    #94A3B8   bordes suaves
--c-steel:     #64748B   iconos secundarios
```

**Tipografía:**

- `--font-ui`: `'Rajdhani', 'Barlow Condensed', system-ui, sans-serif`
- `--font-data`: `'JetBrains Mono', 'Orbitron', ui-monospace, monospace`

Ambas cargadas vía Google Fonts (preconnect + display=swap).

---

## Modelo de datos resumido

### Cocedor

```js
{
  id: 'cs02',
  label: 'Cocedor 2',
  capacidad: 28,
  status: 'EN_PROCESO' | 'LISTO' | 'ESPERA' | 'MANTENIMIENTO' | 'DESACTIVADO',
  loteActual: 'L-240515-01',
  operario: 'MARIA G.',
  inicioCiclo: <ts>,
  finProyectado: <ts>,
  temperatura: { value: 230, ts },
  receta: { setpoint: 230, durMin: 60, tolTemp: 8, tolTiempo: 5 },
  carritos: [ { id, slot, talla, subtalla, lote, ingresoTs } ]
}
```

### Movimiento NFC

```js
{
  ts, evento: 'IN' | 'OUT' | 'EVISCERADO' | 'EMPAQUE',
  carritoId, cocedorId?, lote, operario, talla, subtalla, destino
}
```

---

## API HTTP

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/` | GET | index.html con build version stamped |
| `/api/health` | GET | `{ok, uptime, sse_clients, build}` |
| `/api/config` | GET | Cocedores + recetas + operarios + estados válidos |
| `/api/data` | GET | Snapshot actual |
| `/api/stream` | GET | SSE con eventos `snapshot` (200ms throttle) y `mov` (instantáneo) |
| `/api/carritos` | GET | Catálogo paginable |
| `/api/carritos/:id` | GET | Detalle + timeline movimientos |
| `/api/movimiento` | POST | Registra lectura NFC `{tagCarrito, tagCocedor, operario, evento?}` |
| `/api/cocedor/:id/estado` | PUT | Cambia status (MTTO, DESACTIVADO, etc.) |
| `/api/movimientos.csv` | GET | `?from=&to=&cocedor=&carrito=` |
| `/api/ciclos.csv` | GET | Ciclos completados |
| `/api/alertas` | GET / POST / DELETE | Alertas activas + histórico |
| `/api/sim/event` | POST | (debug) Forzar evento NFC desde frontend |

Rate-limit: 600/min lecturas, 60/min escrituras.

---

## Estados del cocedor

| Estado | Color | Significado |
|--------|-------|-------------|
| `EN_PROCESO` | azul `#2E80D8` | Cocción activa, hay carritos dentro y timer corriendo |
| `LISTO` | verde `#00C896` | Ciclo terminado, esperando descarga |
| `ESPERA` | amber `#F5A623` | Vacío y disponible para recibir |
| `MANTENIMIENTO` | gris `#94A3B8` | Marcado por operario, no disponible |
| `DESACTIVADO` | gris-dim `#CBD5E1` | Fuera de servicio |

---

## Etapas de trazabilidad por carrito

```
Eviscerado  →  Entrada cocedor  →  En proceso  →  Salida cocedor  →  Empaque
```

---

## SSE — eventos en vivo

| Evento | Contenido | Throttle |
|--------|-----------|----------|
| `snapshot` | Estado completo del sistema (cocedores + movimientos + alertas) | 200 ms coalescing |
| `mov` | Nuevo movimiento NFC registrado | Instantáneo |
| `alert` | Nueva alerta o resolución de alerta | Instantáneo |
| heartbeat | `: heartbeat <ts>` | cada 25s |

---

## Licencia

Propietaria — **PINSA Congelados, Planta Mazatlán**.
