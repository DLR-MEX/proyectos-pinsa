# Arquitectura

> Visión técnica completa de `trazabilidad-cocedores`: capas, módulos, flujo de datos y decisiones de diseño.

---

## 1. Vista General de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Navegador)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Router  │ │  SSE     │ │  Header  │ │  Babylon.js /    │ │
│  │   SPA    │ │  Client  │ │  (logo,  │ │  SVG / Canvas    │ │
│  │          │ │          │ │  user,   │ │  Charts          │ │
│  └────┬─────┘ └────┬─────┘ │  clock)  │ └──────────────────┘ │
│       └─────────────┘      └──────────┘                        │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP + SSE
┌────────────────────┴────────────────────────────────────────┐
│                      EXPRESS SERVER                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │  REST API  │  │  SSE Hub   │  │  helmet/cors/rate-  │   │
│  │  /api/*    │  │  /api/stream│  │  limit               │   │
│  └─────┬──────┘  └─────┬──────┘  └──────────────────────┘   │
│        └────────────────┘                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                      DATA LAYER (In-Memory)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │snapshotStore │  │movimientos   │  │  alertasStore    │   │
│  │  (cocedores) │  │  Store        │  │                  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                     │             │
│         └─────────────────┼─────────────────────┘             │
│                           │                                   │
│              ┌────────────┴────────────┐                    │
│              │     EventEmitter          │                    │
│              │   (onChange, onMov...)    │                    │
│              └────────────┬────────────┘                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                      SIMULADOR / DRIVER                     │
│  ┌────────────────┐          ┌────────────────────────┐     │
│  │  mockSimulator │          │  (Futuro: Driver PLC/  │     │
│  │  (ticks + NFC) │          │   MQTT / SCADA real)   │     │
│  └────────────────┘          └────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**Flujo de datos**: El simulador (o driver real) es la **única fuente de verdad** para cambios de estado. Modifica `snapshotStore`, `movimientosStore` y `alertasStore`. Estos emiten eventos que el `SSE Hub` captura y transmite a los navegadores. El frontend se suscribe a `/api/stream` y actualiza la UI en tiempo real.

---

## 2. Backend

### 2.1 Entry Point — `src/index.js`

```
┌─────────────┐     start()      ┌─────────────────┐
│   index.js   │ ───────────────> │  mockSimulator  │
│  (entry)     │                  │  (motor datos)  │
└──────┬───────┘                  └─────────────────┘
       │
       │ startServer()
       ▼
┌─────────────────┐     addClient()    ┌──────────┐
│    server.js     │ ────────────────> │ SSE Hub  │
│  (Express app)   │                    │(sockets) │
└─────────────────┘                    └──────────┘
       │
       │ on('SIGINT'|'SIGTERM')
       ▼
┌─────────────────┐
│   shutdown()    │
│  sim.stop()     │
│  sseHub.shutdown│
│  server.close() │
└─────────────────┘
```

Responsabilidades:
- Orquestar el arranque ordenado: simulador → servidor.
- Manejar señales de proceso (`SIGINT`, `SIGTERM`) para cierre limpio.
- Capturar `uncaughtException` y `unhandledRejection` para evitar crashes silenciosos.
- Hard exit a los 5 segundos si algo se atasca.

### 2.2 Servidor Express — `src/server.js`

```
┌─────────────────────────────────────────────────────────────┐
│                       Express App                             │
├─────────────────────────────────────────────────────────────┤
│  Middleware global:                                          │
│    helmet (CSP) → cors → express.json(64kb)                 │
│    rate-limit (600/min GET, 60/min POST/PUT)               │
├─────────────────────────────────────────────────────────────┤
│  Estáticos: /public (etag, maxAge 1h, index: false)        │
│  / → index.html con __BUILD_VERSION__ reemplazado         │
├─────────────────────────────────────────────────────────────┤
│  Rutas API:                                                  │
│    GET  /api/health    ──> uptime, sse_clients, build     │
│    GET  /api/config    ──> catálogos estáticos             │
│    GET  /api/data      ──> snapshot actual                  │
│    GET  /api/stream    ──> SSE (snapshot + hydrate)       │
│    GET  /api/movimientos ──> ledger paginado               │
│    POST /api/movimiento  ──> registrar NFC                 │
│    PUT  /api/cocedor/:id/estado ──> cambiar estado         │
│    GET  /api/carritos /:id ──> catálogo + timeline        │
│    GET  /api/movimientos.csv ──> export CSV                │
│    GET  /api/ciclos.csv    ──> export ciclos CSV           │
│    GET  /api/alertas       ──> activas + histórico         │
│    POST /api/sim/event     ──> debug: forzar arrancar/descargar
├─────────────────────────────────────────────────────────────┤
│  Wiring SSE (al final):                                    │
│    store.onChange  → sseHub.broadcastSnapshot()            │
│    movs.onMov      → sseHub.broadcastMov()                │
│    alerts.onAlert  → sseHub.broadcastAlert()              │
│    alerts.onResolve→ sseHub.broadcastAlert({resolved:true})│
└─────────────────────────────────────────────────────────────┘
```

**Hidratación inmediata**: Cuando un cliente se conecta a `/api/stream`, el servidor envía inmediatamente:
1. `event: snapshot` — estado completo actual
2. `event: hydrate` — últimos 12 movimientos + alertas activas + KPIs del día

Esto permite que el frontend pinte datos al instante sin esperar al próximo tick del simulador.

### 2.3 Configuración Central — `src/config.js`

Todas las constantes leídas de `process.env` con defaults razonables para correr sin `.env`:

| Constante | Valor | Propósito |
|-----------|-------|-----------|
| `MOCK_DATA` | `true` | Modo simulación vs driver real |
| `WEB_HOST` | `0.0.0.0` | Bind del servidor |
| `WEB_PORT` | `5002` | Puerto HTTP |
| `LOG_LEVEL` | `info` | Nivel de logs |
| `SIM_TICK_MS` | `2500` | Intervalo de ticks del simulador (temperatura + timers) |
| `SIM_NFC_MIN_MS` | `8000` | Intervalo mínimo entre eventos NFC sintéticos |
| `SIM_NFC_MAX_MS` | `18000` | Intervalo máximo entre eventos NFC sintéticos |
| `SSE_THROTTLE_MS` | `200` | Coalescing de snapshots SSE |
| `ALERT_DEBOUNCE_MS` | `250` | Debounce para alertas |
| `MOV_RING_LIMIT` | `5000` | Tamaño del ledger en memoria (~24h a 1 evento/15s) |
| `ALERTS_RING_LIMIT` | `500` | Tamaño del buffer de alertas |
| `RATE_READ_PER_MIN` | `600` | Límite de lecturas HTTP/min |
| `RATE_WRITE_PER_MIN` | `60` | Límite de escrituras HTTP/min |

---

## 3. Módulos de Estado (Data Layer)

### 3.1 snapshotStore — Estado de Cocedores

```
┌────────────────────────┐
│     snapshotStore       │
├────────────────────────┤
│  Map<id, CocedorState> │
│  lastUpdate: timestamp │
│  EventEmitter          │
├────────────────────────┤
│  getCocedorState(id)   │
│  updateCocedor(id, fn) │
│  setTemperatura(id, v)│
│  pushCarrito(id, c)    │
│  popAllCarritos(id)    │
│  getAll() ← memoized   │
│  onChange(callback)    │
└────────────────────────┘
```

- **Memoización**: `getAll()` está memoizado por `lastUpdate`. Si no hubo cambios desde la última llamada, devuelve el mismo objeto (referencia estable). Útil para comparaciones de igualdad en el frontend y para evitar serialización redundante en SSE.
- **Thread-safe in-memory**: Todo es síncrono y single-thread (Node.js event loop). No hay race conditions porque Express maneja requests secuencialmente en un solo hilo.

### 3.2 movimientosStore — Ledger NFC

```
┌─────────────────────────────┐
│      movimientosStore        │
├─────────────────────────────┤
│  Ring buffer in-memory       │
│  (max 5000 entries ~24h)    │
│  EventEmitter: onMov         │
├─────────────────────────────┤
│  recordMovimiento({...})    │
│  listMovimientos({filters}) │
│  ultimosMovimientos(n)        │
│  totalCiclosHoy()             │
│  totalCarritosHoy()           │
│  tiempoPromedioCiclosHoy()    │
│  eficienciaHoy()              │
│  movimientosCsv({...})        │
│  ciclosCsv({...})             │
└─────────────────────────────┘
```

- **Ring buffer**: Cuando se alcanza el límite, los entries más antiguos se sobreescriben. Esto evita crecimiento ilimitado de memoria en servidores de larga duración.
- **Cálculos de KPIs**: Derivados en tiempo real del ledger (ciclos completados hoy, carritos procesados, tiempo promedio, eficiencia porcentual).
- **Export CSV**: Generación síncrona con headers (`text/csv; charset=utf-8`) y `Content-Disposition: attachment`.

### 3.3 alertasStore — Alertas y Resolución

```
┌─────────────────────────────┐
│       alertasStore           │
├─────────────────────────────┤
│  activas: Map<id, Alerta>    │
│  historico: Ring buffer      │
│  debounceTimers: Map<id, t> │
├─────────────────────────────┤
│  fireAlert({...})           │
│  resolveAlert(id)           │
│  activas()                  │
│  historico({limit})         │
│  EventEmitter: onAlert, onResolve
└─────────────────────────────┘
```

- **Debounce**: Si una condición de alerta fluctúa rápidamente (ej. temperatura cercana al límite), el debounce de `ALERT_DEBOUNCE_MS` evita spam de alertas.
- **Ciclo de vida**: Una alerta se crea con `fireAlert()` y se resuelve explícitamente con `resolveAlert()`. Ambos eventos se propagan por SSE para que el frontend muestre/elimine la notificación.

---

## 4. Simulador — `src/mockSimulator.js`

```
┌──────────────────────────────────────────────────────────┐
│                    mockSimulator                         │
├──────────────────────────────────────────────────────────┤
│  Estado inicial seed:                                    │
│    - 8/11 cocedores activos                             │
│    - 3 EN_PROCESO, 1 LISTO, 2 ESPERA, 1 MANTENIMIENTO, │
│      1 DESACTIVADO, resto ESPERA                        │
│    - Carritos pre-poblados en cocedores EN_PROCESO      │
├──────────────────────────────────────────────────────────┤
│  Timers:                                                 │
│    _tickTimer  (SIM_TICK_MS = 2500ms)                   │
│      └─> actualiza temperaturas, timers, estados         │
│    _nfcTimer   (aleatorio 8-18s)                         │
│      └─> genera evento NFC sintético (IN/OUT)           │
├──────────────────────────────────────────────────────────┤
│  Motor de temperatura:                                   │
│    - Oscila alrededor del setpoint de la receta         │
│    - Simula ruido térmico realista                      │
│    - Genera alerta si |temp - setpoint| > tolTemp        │
├──────────────────────────────────────────────────────────┤
│  Eventos NFC sintéticos:                                 │
│    - IN:  carrito entra a cocedor en ESPERA            │
│    - OUT: carrito sale de cocedor en LISTO              │
│    - Selección aleatoria de carrito/cocedor/operario    │
│    - Genera movimiento en movimientosStore               │
└──────────────────────────────────────────────────────────┘
```

### Seed inicial

El simulador crea un estado realista al arrancar para que el dashboard no se vea vacío al primer load:

```
Cocedor 1:  EN_PROCESO  (con carritos pre-cargados, timer ~40 min restantes)
Cocedor 2:  EN_PROCESO  (con carritos pre-cargados, timer ~25 min restantes)
Cocedor 3:  EN_PROCESO  (con carritos pre-cargados, timer ~55 min restantes)
Cocedor 4:  LISTO       (ciclo terminado, esperando descarga)
Cocedor 5:  ESPERA      (vacío)
Cocedor 6:  ESPERA      (vacío)
Cocedor 7:  MANTENIMIENTO
Cocedor 8:  DESACTIVADO
Cocedor 9:  ESPERA      (vacío)
Cocedor 10: ESPERA      (vacío)
Cocedor 11: ESPERA      (vacío)
```

### Ciclo de tick (cada 2.5 segundos)

```
foreach cocedor in EN_PROCESO:
  ├─> decrementar timer restante
  ├─> actualizar temperatura (setpoint + ruido gaussiano)
  ├─> si temp > setpoint + tolTemp → fireAlert(TEMP_ALTA)
  ├─> si temp < setpoint - tolTemp → fireAlert(TEMP_BAJA)
  └─> si timer <= 0:
        cambiar estado a LISTO
        fireAlert(CICLO_COMPLETADO)
        recordCiclo()
```

---

## 5. Infraestructura

### 5.1 SSE Hub — `src/sseHub.js`

```
┌─────────────────────────────────────────────────────────────┐
│                      SSE Hub                               │
├─────────────────────────────────────────────────────────────┤
│  clients: Set<Client>                                      │
│    Client = { id, res (stream), lastWrite, droppedCount }  │
├─────────────────────────────────────────────────────────────┤
│  addClient(req, res)     ──> configura headers SSE          │
│  removeClient(id)        ──> limpia conexión               │
│  broadcastSnapshot(data) ──> coalescing 200ms              │
│  broadcastMov(data)      ──> instantáneo                   │
│  broadcastAlert(data)    ──> instantáneo                   │
│  clientCount()           ──> métrica health                │
│  shutdown()              ──> cierra todas las conexiones   │
├─────────────────────────────────────────────────────────────┤
│  Backpressure:                                             │
│    - Si res.write() devuelve false, marca cliente lento    │
│    - Si un cliente acumula >N mensajes pendientes, dropea  │
│    - Métrica droppedCount expuesta en logs                  │
└─────────────────────────────────────────────────────────────┘
```

**¿Por qué SSE y no WebSocket?**

| Aspecto | SSE | WebSocket |
|---------|-----|-----------|
| Dirección | Unidireccional (servidor → cliente) | Bidireccional |
| Overhead | HTTP puro, sin handshake extra | Protocolo upgrade + framing |
| Reconexión | Nativa (EventSource reconecta auto) | Manual |
| Escalabilidad | Simpler: un stream por cliente | Más complejo para broadcast |
| Firewall/proxy | Siempre pasa por HTTP/80/443 | Puede bloquearse |

Dado que el flujo es **100 % push unidireccional** (servidor → navegador), SSE es más ligero y robusto que WebSocket.

**Coalescing de 200ms**: Si el simulador genera múltiples cambios en un intervalo corto (ej. varios ticks de temperatura), el hub agrupa los snapshots y envía solo el último estado completo cada 200ms. Esto reduce carga de red y CPU de serialización.

### 5.2 Logger — `src/logger.js`

```
┌─────────────────────────────────────────────────────────────┐
│                      winston Logger                          │
├─────────────────────────────────────────────────────────────┤
│  Transports:                                               │
│    1. Console (coloreado, nivel según LOG_LEVEL)          │
│    2. DailyRotateFile                                      │
│         path: logs/YYYY-MM/YYYY-MM-DD.log                  │
│         maxSize: 20MB                                       │
│         maxFiles: 30 días                                   │
├─────────────────────────────────────────────────────────────┤
│  Categorías:                                               │
│    - 'main'    (index.js)                                  │
│    - 'server'  (server.js, requests)                       │
│    - 'sim'     (mockSimulator.js)                          │
│    - 'sse'     (sseHub.js)                                 │
│    - 'store'   (snapshotStore, movimientosStore)             │
│    - 'alertas' (alertasStore)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Frontend

### 6.1 Estructura de módulos

```
public/js/
│
├── app.js                    # Entry point: inicializa router, conecta SSE, monta layout
├── stream.js                 # Cliente SSE: reconexión automática, parseo de eventos
├── router.js                 # SPA router: hash-based navigation (#/cocedores, #/alertas, ...)
├── sidebar.js                # Navegación lateral, estado activo, mobile toggle
│
├── headerClock.js            # Reloj y fecha en el header + estado conexión SSE
├── headerUser.js             # Dropdown de usuario: 3 perfiles + localStorage + evento
│
├── kpiBar.js                 # Barra de KPIs superiores: ciclos, carritos, eficiencia, etc.
├── cocedoresStage.js         # Vista principal: grid de 11 cocedores con SVG
├── mapaPlanta.js             # Vista top-down de la disposición física
│
├── scene3dCocedores.js       # Escena Babylon.js: vista 3D general de todos los cocedores
├── scene3dDetalleCocedor.js  # Escena Babylon.js: vista 3D detalle de un cocedor individual
│
├── svgCocedor.js             # Generador de SVG para representación de un cocedor
├── svgIcons.js               # Iconos SVG inline (estados, alertas, operarios)
├── dom.js                    # Helpers DOM (query, create, append, etc.)
│
├── viewCocedores.js          # Panel de cocedores (listado + detalle inline)
├── viewDetalleCocedor.js     # Vista detallada de un cocedor específico
├── viewCarritos.js           # Catálogo de carritos con búsqueda y filtros
├── viewTrazabilidad.js       # Timeline de trazabilidad de un carrito
├── viewAlertas.js            # Panel de alertas activas e histórico
├── viewReportes.js           # Exportación CSV y resumen de ciclos
├── viewConfig.js             # Configuración de recetas, operarios, etc.
│
├── cocedorDetalle.js         # Detalle de cocedor: temperatura, timer, carritos
├── entradaCarrito.js         # Formulario de entrada manual de carrito
├── trazabilidad.js           # Lógica de trazabilidad: búsqueda de carrito por ID
├── ultimosMovimientos.js     # Lista de últimos movimientos en el dashboard
├── donutEstado.js            # Gráfico donut de distribución de estados (SVG/canvas)
├── kpisDia.js                # Cálculo y render de KPIs del día
└── vistaInterna.js           # Vista interna de un cocedor (slots de carritos)
```

### 6.2 Patrones de diseño

- **ES Modules nativos**: Sin bundler. Cada archivo es un módulo con `export`/`import`. El navegador los carga directamente.
- **Vanilla JS**: Sin frameworks. El DOM se manipula con helpers en `dom.js` y APIs nativas (`document.createElement`, `element.classList`, etc.).
- **CSS plano**: Sin preprocessores. Variables CSS en `variables.css` para colores, tipografía, spacing.
- **Componentes funcionales**: Cada módulo exporta funciones que renderizan una sección de UI. No hay clases ni estado local persistente; el estado vive en el DOM o en el stream SSE.
- **Router hash-based**: Navegación sin recarga de página. Ej: `#/cocedor/cs02` monta la vista de detalle del cocedor 2.

### 6.3 Conexión SSE en el frontend

```
┌─────────────┐        ┌─────────────────┐        ┌──────────────┐
│   browser   │  --->  │  EventSource    │  --->  │  stream.js   │
│             │        │  /api/stream    │        │  (parser)    │
└─────────────┘        └─────────────────┘        └──────┬───────┘
                                                         │
       ┌─────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ event:       │  │ event:       │  │ event:       │
│ snapshot     │  │ hydrate      │  │ mov          │
│ (estado      │  │ (últimos     │  │ (nuevo       │
│  completo)   │  │  movs +      │  │  movimiento) │
│              │  │  alertas)    │  │              │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                 Actualizar DOM                       │
│  - Re-render cocedoresStage con nuevo estado         │
│  - Actualizar KPIs en kpiBar                        │
│  - Insertar movimiento en ultimosMovimientos          │
│  - Mostrar/ocultar alertas                            │
└─────────────────────────────────────────────────────┘
```

**Reconexión exponencial**: `stream.js` implementa backoff exponencial (500ms, 1s, 2s, 4s, 8s, 15s) para no saturar el servidor si cae la conexión.

**Connection status**: `headerClock.setConnStatus('ok' | 'connecting' | 'err')` actualiza el indicador visual en el header:
- ● verde (`ok`): conexión SSE activa, datos en tiempo real.
- ● ámbar (`connecting`): reconectando tras desconexión.
- ● rojo (`err`): sin conexión después de múltiples reintentos.

### 6.4 Header

El header (`header.css`) contiene los siguientes componentes de izquierda a derecha:

| Componente | Módulo | Descripción |
|------------|--------|-------------|
| Logo PINSA | `index.html` | Imagen del logo institucional (`pinsa-logo.png`) |
| Título | `index.html` | "Trazabilidad Cocedores" — `--font-ui` uppercase |
| Planta | `index.html` | "Planta Mazatlán" — texto dim, clickable |
| Connection dot | `headerClock.js` | Indicador SSE con 3 estados (ok/warn/err) |
| Reloj + fecha | `headerClock.js` | Tick cada 1s con `fmtDate()` y `fmtTime()` de `dom.js` |
| Campana | `header.css` | Botón con badge animado (`.bell-badge.visible`) para alertas pendientes |
| User dropdown | `headerUser.js` | Avatar + nombre, menú con 3 perfiles + logout |

#### User dropdown — `headerUser.js`

```
┌─────────────────────────────────────────────────────────┐
│  headerUser.js                                          │
├─────────────────────────────────────────────────────────┤
│  Estado: _currentUser (string)                          │
│  Persistencia: localStorage('pinsa_usuario')            │
├─────────────────────────────────────────────────────────┤
│  getUsuarioActual()   → nombre actual                   │
│  setUsuarioActual(n)  → actualiza DOM + localStorage    │
│                        + dispatch 'usuario-cambiado'    │
│  initHeaderUser()     → bind click handlers + restore   │
├─────────────────────────────────────────────────────────┤
│  Usuarios predefinidos:                                 │
│    - LUIS R.   (default)                                │
│    - MARIA G.                                           │
│    - CARLOS T.                                          │
└─────────────────────────────────────────────────────────┘
```

Al cambiar de usuario, se dispara el evento `usuario-cambiado` en `window`:

```js
window.addEventListener('usuario-cambiado', (e) => {
  console.log(e.detail.usuario); // 'LUIS R.' | 'MARIA G.' | 'CARLOS T.'
});
```

### 6.5 Render 3D (Babylon.js)

#### Vista general — `scene3dCocedores.js`

Los 11 cocedores se representan como volúmenes 3D (cilindros simplificados) en perspectiva.

- **Color dinámico** según estado: EN_PROCESO = azul, LISTO = verde, ESPERA = ámbar, MANTENIMIENTO = gris, DESACTIVADO = gris-dim.
- **Interacción**: click sobre cualquier cocedor abre la vista detalle (`#/cocedor/:id`).
- Cámara orbital `ArcRotateCamera` con auto-rotación opcional.
- **Prewarm**: la geometría 3D se construye al boot, no en idle, para que el primer click responda en <100ms.
- **Tracking de cleanup**: cada mesh se trackea y se hace `dispose()` antes de reconstruir, evitando duplicación al recibir nuevos snapshots SSE.

#### Vista detalle — `scene3dDetalleCocedor.js`

Un cocedor individual mostrado en detalle con carritos visibles en su interior.

- **Readout**: muestra temperatura actual, modo y setpoint.
- **Carritos posicionados**: cada carrito se ubica en su slot (1-28) dentro del cilindro.
- **Interacción**: click en un carrito abre su timeline de trazabilidad.
- **Cleanup tracking**: idéntico a la vista general.

### 6.6 Vistas del frontend

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

## 7. Tokens Visuales

`public/css/variables.css` define la paleta y tipografía base. Tema **blanco corporativo**.

### Paleta principal

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

### Tipografía

- `--font-ui`: `'Rajdhani', 'Barlow Condensed', system-ui, sans-serif`
- `--font-data`: `'JetBrains Mono', 'Orbitron', ui-monospace, monospace`

Ambas cargadas vía Google Fonts (preconnect + display=swap).

### Estados de cocedor (tokens semánticos)

| Estado | Token | Valor |
|--------|-------|-------|
| EN_PROCESO | `--c-status-proceso` | `var(--c-blue-2)` |
| LISTO | `--c-status-listo` | `var(--c-green)` |
| ESPERA | `--c-status-espera` | `var(--c-amber)` |
| MANTENIMIENTO | `--c-status-mtto` | `var(--c-silver)` |
| DESACTIVADO | `--c-status-desact` | `var(--c-steel-dim)` |

### Sombras

```
--shadow-panel: 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)
--shadow-card:  0 4px 12px rgba(0,0,0,0.08)
```

---

## 8. Decisiones de Diseño Clave

### 8.1 ¿Por qué no React/Vue/Angular?

- **Simplicidad**: El proyecto no tiene estado complejo de usuario, formularios extensos ni navegación profunda. Un SPA con vanilla JS y router hash-based es suficiente.
- **Sin build step**: No necesita Vite, Webpack, ni transpilación. `npm install` instala solo runtime dependencies.
- **Performance**: Sin virtual DOM, sin reconciliación. Actualizaciones directas al DOM con referencias cacheadas.
- **Mantenibilidad**: Menos abstracciones = menos curva de aprendizaje para desarrolladores de planta o terceros.

### 8.2 ¿Por qué no Chart.js / ECharts?

- Los gráficos requeridos son simples: donut de estados, barras de temperatura, líneas de timeline.
- SVG inline y canvas nativo cubren todos los casos con ~100 líneas de JS cada uno.
- Evita descargar librerías de ~200KB+ para 3 gráficos.

### 8.3 ¿Por qué in-memory y no base de datos?

- **Volumen**: 11 cocedores × 28 carritos = ~308 entidades. Movimientos: ~5000/24h. Esto cabe cómodamente en memoria.
- **Velocidad**: Lecturas/escrituras son O(1) en Map/Array. Sin latencia de red a Redis/Postgres.
- **Persistencia futura**: La carpeta `data/` está reservada para persistencia JSON atómica (write-to-temp + rename) cuando se requiera histórico >24h.
- **Simplicidad**: Un solo proceso Node.js, sin dependencias externas de infraestructura.

### 8.4 ¿Por qué rate-limit por Express y no por nginx?

- **Autocontenido**: El servicio puede correr detrás de cualquier proxy (nginx, traefik, cloudflare) o sin proxy en red local de planta.
- **Flexibilidad**: Permite diferentes límites para lecturas (600/min) y escrituras (60/min), algo que nginx hace con más configuración.

### 8.5 ¿Por qué Babylon.js para 3D?

- **Visualización industrial**: Los cocedores son objetos físicos (cilindros) que se benefician de representación 3D para mostrar estado y posición de carritos.
- **CDN**: Babylon.js se carga desde CDN, sin necesidad de bundler.
- **Performance**: WebGL nativo, sin overhead de wrappers.
- **Consistencia**: Mismo stack 3D que `childrooms-render` (Babylon.js 9).

---

## 9. Escalabilidad y Futuro

| Escenario | Estrategia |
|-----------|------------|
| **Driver real (PLC/SCADA)** | Reemplazar `mockSimulator.js` por adapter que escucha MQTT o lee OPC-UA. La interfaz con `snapshotStore` se mantiene idéntica. |
| **Persistencia >24h** | Agregar writer a `data/` (JSON atómico) o conectar a SQLite/Postgres en `movimientosStore`. |
| **Múltiples instancias** | Extraer `snapshotStore` a un servicio Redis compartido. SSE requiere sticky sessions o migrar a WebSocket con pub/sub. |
| **Más cocedores** | Ajustar `COCEDORES` en `cocedoresMap.js` y el grid CSS en `cocedoresStage.js`. |
| **Autenticación** | Agregar middleware JWT en `server.js` y login view en frontend. |
| **Usuarios reales** | Conectar `headerUser.js` a backend de autenticación (actualmente es visual/local). |

---

## 10. Glosario

| Término | Significado |
|---------|-------------|
| **Cocedor** | Cilindro industrial donde se cuecen carritos de atún. 11 unidades en planta. |
| **Carrito** | Contenedor metálico con atún que se introduce en el cocedor. Capacidad: 28 por cocedor. |
| **Tag NFC** | Identificador RFID/NFC adherido al carrito. Escaneado por lector portátil. |
| **Receta** | Parámetros de cocción: setpoint de temperatura, duración, tolerancias. Varía por talla del atún. |
| **Talla** | Tamaño del atún (ej. 12-14 lbs). Determina la receta. |
| **Slot** | Posición numérica del carrito dentro del cocedor (1-28). |
| **Ciclo** | Un ciclo de cocción completo: carga → proceso → descarga. |
| **Lote** | Identificador de producción (ej. L-240515-01). Agrupa carritos de la misma entrada. |
| **SSE** | Server-Sent Events. Protocolo HTTP para push unidireccional. |
| **Coalescing** | Agrupar múltiples eventos en uno solo para reducir tráfico. |
| **Backpressure** | Mecanismo para evitar saturar a clientes lentos. |
| **Prewarm** | Construcción anticipada de geometría 3D al boot para respuesta inmediata al primer click. |
| **Cleanup tracking** | Registro de meshes 3D para hacer `dispose()` antes de reconstruir, evitando duplicación. |
