# Arquitectura

> Visión técnica completa de `childrooms-render`: capas, módulos, flujo de datos y decisiones de diseño.

---

## 1. Vista General de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Navegador)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Router  │ │  SSE     │ │  Views   │ │  Babylon.js /    │ │
│  │   SPA    │ │  Client  │ │  (Vanilla│ │  ECharts         │ │
│  └────┬─────┘ └────┬─────┘ │   JS)    │ └──────────────────┘ │
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
│  │snapshotStore │  │ historyStore │  │ thresholdsStore  │   │
│  │  (cámaras)   │  │  (variables  │  │  (JSON atómico)  │   │
│  │              │  │   + alarmas) │  │                  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                     │             │
│         └─────────────────┼─────────────────────┘             │
│                           │                                   │
│              ┌────────────┴────────────┐                    │
│              │     EventEmitter          │                    │
│              │   (on 'change')           │                    │
│              └────────────┬────────────┘                    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────┐
│                      DRIVER (Factory)                       │
│  ┌────────────────┐          ┌────────────────────────┐     │
│  │  mockDriver    │          │  MqttClient            │     │
│  │  (ticks 2.5s)  │          │  (Ubidots TLS)         │     │
│  └────────────────┘          └────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**Flujo de datos**: El driver (simulador o MQTT real) es la **única fuente de verdad** para cambios de estado. Modifica `snapshotStore`, que emite eventos `'change'`. `index.js` escucha esos eventos y:
1. Los reenvía inmediatamente como `event: data` por SSE.
2. Agrupa snapshots en ventanas de 200 ms y los difunde como `event: snapshot`.
3. Alimenta `historyStore` para el histórico de tendencias.

El frontend se suscribe a `/api/stream` y actualiza la UI en tiempo real.

---

## 2. Backend

### 2.1 Entry Point — `src/index.js`

```
┌─────────────┐     factory()      ┌─────────────────┐
│   index.js   │ ───────────────> │  mockDriver o   │
│  (entry)     │                  │  MqttClient     │
└──────┬───────┘                  └─────────────────┘
       │
       │ startServer()
       ▼
┌─────────────────┐     register()    ┌──────────┐
│    server.js     │ ────────────────> │ SSE Hub  │
│  (Express app)   │                    │(sockets) │
└─────────────────┘                    └──────────┘
       │
       │ on('SIGINT'|'SIGTERM')
       ▼
┌─────────────────┐
│   shutdown()    │
│  driver.close() │
│  sseHub.stop()  │
│  server.close() │
└─────────────────┘
```

Responsabilidades:
- Orquestar el arranque ordenado: driver → servidor.
- Manejar señales de proceso (`SIGINT`, `SIGTERM`) para cierre limpio.
- Capturar `uncaughtException` y `unhandledRejection` para evitar crashes silenciosos.
- Hard exit a los 5 segundos si algo se atasca.
- Coalescing de snapshots: cuando `snapshotStore` emite `'change'`, inicia un timer de 200 ms. Si llegan más cambios dentro de esa ventana, solo se envía el último snapshot consolidado.

### 2.2 Servidor Express — `src/server.js`

```
┌─────────────────────────────────────────────────────────────┐
│                       Express App                             │
├─────────────────────────────────────────────────────────────┤
│  Middleware global:                                          │
│    helmet (CSP) → cors → express.json(64kb)                 │
│    rate-limit (600/min GET, 60/min POST/PUT)               │
├─────────────────────────────────────────────────────────────┤
│  Estáticos: /public (Cache-Control: no-store)               │
│  / → index.html con __BUILD_VERSION__ reemplazado         │
├─────────────────────────────────────────────────────────────┤
│  Rutas API:                                                  │
│    GET  /api/health         ──> uptime, mqtt_connected,     │
│                                 sse_clients, build          │
│    GET  /api/config         ──> catálogos estáticos         │
│    GET  /api/data           ──> snapshot actual             │
│    GET  /api/stream         ──> SSE (snapshot + data)       │
│    GET  /api/thresholds     ──> umbrales activos            │
│    PUT  /api/thresholds     ──> guardar umbrales            │
│    POST /api/thresholds/reset ──> restaurar defaults        │
│    GET  /api/history.csv    ──> export variables CSV        │
│    GET  /api/alarms.csv     ──> export alarmas CSV          │
│    GET  /api/history.json   ──> variables + alarmas JSON    │
│    POST /api/alarms/event   ──> registrar alarma            │
│    GET  /api/alarms/history ──> leer alarmas                │
│    DELETE /api/alarms/history ──> limpiar alarmas           │
├─────────────────────────────────────────────────────────────┤
│  Wiring SSE (al final):                                    │
│    store.on('change')  → sseHub.broadcast('data')          │
│    index.js coalesce   → sseHub.broadcast('snapshot')      │
└─────────────────────────────────────────────────────────────┘
```

**Hidratación inmediata**: Cuando un cliente se conecta a `/api/stream`, el servidor envía inmediatamente:
1. `event: snapshot` — estado completo actual

Esto permite que el frontend pinte datos al instante sin esperar al próximo tick del driver.

**Asset versioning**: `BUILD_VERSION = Date.now().toString(36)` se calcula al arrancar y se inyecta en `index.html`. Cada `<link>` y `<script>` lleva `?v=<build>`, invalidando el caché del browser sin recarga manual.

### 2.3 Configuración Central — `src/config.js`

Todas las constantes leídas de `process.env` con defaults razonables:

| Constante | Valor | Propósito |
|-----------|-------|-----------|
| `MOCK_DATA` | `true` | Modo simulación vs MQTT real |
| `WEB_HOST` | `0.0.0.0` | Bind del servidor |
| `WEB_PORT` | `5001` | Puerto HTTP |
| `LOG_LEVEL` | `info` | Nivel de logs |
| `MQTT_BROKER` | `industrial.api.ubidots.com` | Broker TLS |
| `MQTT_PORT` | `8883` | Puerto TLS |
| `UBIDOTS_DEVICE` | `childrooms` | Dispositivo Ubidots |
| `TEMP_MIN` / `TEMP_MAX` | `-25` / `15` | Rango físico temperatura |
| `HUM_MIN` / `HUM_MAX` | `70` / `100` | Rango físico humedad |
| `POWER_MAX` | `25` | Potencia máxima kW |
| `TEMP_ALERT_LOW` / `HIGH` | `-22` / `5` | Umbrales de alarma temp |
| `HUM_ALERT_LOW` / `HIGH` | `78` / `97` | Umbrales de alarma hum |
| `ALERT_WARN_MIN` | `5` | Minutos para warning |
| `ALERT_ERROR_MIN` | `30` | Minutos para error |
| `MOCK_INTERVAL_MS` | `2500` | Intervalo de ticks del simulador |

---

## 3. Módulos de Estado (Data Layer)

### 3.1 snapshotStore — Estado de Cámaras

```
┌────────────────────────┐
│     snapshotStore       │
├────────────────────────┤
│  Map<key, {value,ts}>  │
│  key = "DEVICE/var"    │
│  lastUpdate: timestamp │
│  EventEmitter          │
├────────────────────────┤
│  update(dev,var,v,ts)  │
│  setEquipoState(cam,…) │
│  getEquipoState(cam)   │
│  pushEvent(evt)        │
│  get(dev,var)          │
│  getAll() ← memoized   │
│  on('change', cb)      │
└────────────────────────┘
```

- **Memoización**: `getAll()` está memoizado por `lastUpdate`. Si no hubo cambios desde la última llamada, devuelve el mismo objeto (referencia estable). Útil para comparaciones de igualdad en el frontend y para evitar serialización redundante en SSE.
- **Thread-safe in-memory**: Todo es síncrono y single-thread (Node.js event loop).
- **Equipos runtime**: `setEquipoState()` actualiza el estado on/off de compresor/evaporador por cámara sin mutar `CHAMBERS` (congelado), guardando en un `Map` privado.

### 3.2 historyStore — Buffers Históricos

```
┌─────────────────────────────┐
│      historyStore            │
├─────────────────────────────┤
│  Variables: Map<var,[]>      │
│  Ring FIFO (8640 muestras)  │
│  Dedup 5s por variable      │
├─────────────────────────────┤
│  Alarms: Array[] (500 max)  │
│  Validación estricta        │
├─────────────────────────────┤
│  recordVariable(v,val,ts)   │
│  recordAlarm(alarm)         │
│  buildVariablesCsv(...)     │
│  buildAlarmsCsv(...)        │
│  getVariableSamples(...)    │
│  getAlarmHistory()          │
│  clearAlarmHistory()        │
└─────────────────────────────┘
```

- **Dedup 5s**: Si una variable recibe updates más rápido que cada 5 segundos, solo se guarda la primera muestra de esa ventana. Esto evita saturar el buffer si el driver envía datos a alta frecuencia.
- **Ring buffer**: 8640 muestras × 5s = ~12h de historia por variable. Con 22 variables y ~16 bytes por muestra → ~3 MB de RAM en estado estable.
- **Validación de alarmas**: `recordAlarm()` rechta payloads malformados (camId inexistente, tipo vacío, severidad desconocida).

### 3.3 thresholdsStore — Umbrales Persistidos

```
┌─────────────────────────────┐
│      thresholdsStore         │
├─────────────────────────────┤
│  data/thresholds.json        │
│  Write atómico (tmp+rename) │
│  Cola serializada (promise) │
├─────────────────────────────┤
│  load()                     │
│  save(payload)              │
│  validatePayload(payload)   │
│  thresholdsFor(camId)       │
│  resetDefaults()            │
└─────────────────────────────┘
```

- **Persistencia atómica**: Los writes se hacen a un archivo `.tmp` y luego `rename` al destino final. Esto evita archivos corruptos si el proceso muere a mitad de escritura.
- **Serialización**: `_writeQueue` asegura que dos `PUT` concurrentes no se pisen.
- **Defaults inteligentes**: Cada cámara se inicializa con `min = setpoint - 6`, `ideal = setpoint`, `max = setpoint + 6`.

---

## 4. Drivers

### 4.1 Simulador — `src/mockDriver.js`

```
┌──────────────────────────────────────────────────────────┐
│                    mockDriver                            │
├──────────────────────────────────────────────────────────┤
│  Estado inicial:                                         │
│    - 4 cámaras enabled (cam1–cam4)                      │
│    - Temp ~setpoint+2, compresor ON                     │
├──────────────────────────────────────────────────────────┤
│  Timers:                                                 │
│    setInterval(2500ms)                                   │
├──────────────────────────────────────────────────────────┤
│  Motor de temperatura (por cámara):                      │
│    - Histéresis termostática:                            │
│      ON  cuando temp >= setpoint + 3°C                  │
│      OFF cuando temp <= setpoint - 3°C                  │
│    - Enfriamiento: -0.45°C/tick (compresor ON)          │
│    - Calentamiento pasivo: +0.18°C/tick (puerta cerrada)│
│    - Puerta abierta: +0.55°C/tick extra (4-12 ticks)    │
│    - Defrost: +0.85°C/tick (10 ticks, compresor OFF)    │
│    - Banda de seguridad: [setpoint-8, setpoint+10]      │
├──────────────────────────────────────────────────────────┤
│  Humedad:                                                │
│    - Target 84% (ON), 95% (puerta), 93% (defrost)       │
│    - Aproximación asintótica + jitter                   │
├──────────────────────────────────────────────────────────┤
│  Potencia:                                               │
│    - ON:  base + delta*0.35 kW                           │
│    - Defrost: 1.8 kW (resistencias)                      │
│    - OFF: 0.45 kW (ventiladores residuo)                 │
│    - Aproximación asintótica para suavizar gráfica      │
├──────────────────────────────────────────────────────────┤
│  Eventos automáticos:                                    │
│    - Puerta abierta/cerrada                             │
│    - Defrost iniciado/finalizado                        │
│    - Arranque/paro de compresor                         │
│    - Alta temperatura (con cooldown 60 ticks)           │
│    - Eventos de sistema aleatorios                      │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Cliente MQTT — `src/mqttClient.js`

```
┌──────────────────────────────────────────────────────────┐
│                    MqttClient                            │
├──────────────────────────────────────────────────────────┤
│  Conexión: mqtts://industrial.api.ubidots.com:8883      │
│  Auth: username = UBIDOTS_TOKEN, password = ''          │
│  Reconnect: 5s | Connect timeout: 15s                   │
├──────────────────────────────────────────────────────────┤
│  Subscribe: /v1.6/devices/{device}/+                    │
│  Soporte legacy: /{var}/lv (valor escalar)              │
├──────────────────────────────────────────────────────────┤
│  Validación física por tipo:                             │
│    - Temperatura: [-30, 20]                             │
│    - Humedad: [70, 100]                                 │
│    - Potencia: [0, 25]                                  │
│    - Otras: Number.isFinite                             │
│  Rechaza valores fuera de rango con warning en log      │
├──────────────────────────────────────────────────────────┤
│  Propagación: store.update(DEVICE, var, value, ts)      │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Infraestructura

### 5.1 SSE Hub — `src/sseHub.js`

```
┌─────────────────────────────────────────────────────────────┐
│                      SSE Hub                               │
├─────────────────────────────────────────────────────────────┤
│  clients: Map<res, {saturated, dropped}>                  │
├─────────────────────────────────────────────────────────────┤
│  register(res)           ──> configura headers SSE          │
│  broadcast(name, payload)──> omite saturados               │
│  clientCount()           ──> métrica health                │
│  stop()                  ──> cierra todas las conexiones   │
├─────────────────────────────────────────────────────────────┤
│  Backpressure:                                             │
│    - Si res.write() devuelve false → marca saturado        │
│    - Si dropped >= 8 → desconecta cliente                  │
│  Heartbeat: cada 25s envía `: heartbeat <ts>`              │
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

**Coalescing de 200ms**: Si el driver genera múltiples cambios en un intervalo corto (ej. varias variables en el mismo tick), `index.js` agrupa los snapshots y envía solo el último estado completo cada 200ms. Esto reduce carga de red y CPU de serialización.

### 5.2 Logger — `src/logger.js`

```
┌─────────────────────────────────────────────────────────────┐
│                      winston Logger                          │
├─────────────────────────────────────────────────────────────┤
│  Transports:                                               │
│    1. Console (coloreado, nivel según LOG_LEVEL)          │
│    2. DailyRotateFile                                      │
│         path: logs/YYYY-MM/YYYY-MM-DD.log                  │
├─────────────────────────────────────────────────────────────┤
│  Categorías:                                               │
│    - 'main'    (index.js)                                  │
│    - 'server'  (server.js, requests)                       │
│    - 'mock'    (mockDriver.js)                             │
│    - 'mqtt'    (mqttClient.js)                             │
│    - 'sse'     (sseHub.js)                                 │
│    - 'store'   (snapshotStore, historyStore)               │
│    - 'thresholds' (thresholdsStore)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Frontend

### 6.1 Estructura de módulos

```
public/js/
│
├── app.js                    # Entry point: config, router, SSE, inicializa módulos
├── stream.js                 # Cliente SSE: reconexión exponencial 500ms..15s
├── router.js                 # SPA router: data-view + localStorage última vista
├── sidebar.js                # Navegación lateral, badge alarmas, estado sistema
│
├── scene3d.js                # Escena Babylon.js: vista general de cámaras
├── chamberDetailView.js      # Vista detalle 3D interior + colorbar + prewarm
├── colorScales.js            # Generadores de colores según umbrales temp/hum
├── colorbar.js               # Barra horizontal de escala de colores
│
├── chambers.js               # Cards de cámaras + paneles de estado + tuberías SVG
├── kpi.js                    # 5 KPIs: activas, temp promedio, humedad, consumo, COP
├── alarms.js                 # Tabla de alarmas activas/histórico + severidad
├── sysInfo.js                # Panel "Información del sistema"
├── equipos.js                # Lista de equipos principales
├── trends.js                 # Canvas multi-línea de temperaturas (vista Resumen)
├── eventos.js                # Sparkline consumo + timeline eventos
├── historyHydration.js       # Hidrata sparklines desde /api/history.json al boot
│
├── trendsView.js             # Vista Tendencias con ECharts (zoom/pan)
├── configView.js             # Editor de umbrales con sliders/inputs
├── reportsView.js            # Tarjetas de exportación CSV con filtros de fecha
└── router.js                 # Cambio de vistas + pausa/reanuda animaciones
```

### 6.2 Patrones de diseño

- **ES Modules nativos**: Sin bundler. Cada archivo es un módulo con `export`/`import`. El navegador los carga directamente.
- **Vanilla JS**: Sin frameworks. El DOM se manipula con APIs nativas.
- **CSS plano**: Sin preprocessores. Variables CSS en `variables.css` para colores, tipografía, spacing.
- **Componentes funcionales**: Cada módulo exporta funciones que renderizan una sección de UI. El estado vive en el DOM o en el stream SSE.
- **Router por data-view**: Navegación sin recarga de página. `data-view` en el `<body>` o secciones determina qué vista está activa.

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
┌──────────────┐  ┌──────────────┐
│ event:       │  │ event:       │
│ snapshot     │  │ data         │
│ (estado      │  │ (cambio      │
│  completo)   │  │  individual) │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌─────────────────────────────────────────────────────┐
│                 Actualizar DOM                       │
│  - Re-render escena 3D con nuevo estado              │
│  - Actualizar KPIs en kpi.js                        │
│  - Actualizar paneles de estado (chambers.js)       │
│  - Actualizar lista de alarmas (alarms.js)          │
│  - Actualizar info de sistema (sysInfo.js)          │
│  - Push muestras a tendencias (trends.js)           │
└─────────────────────────────────────────────────────┘
```

**Reconexión exponencial**: `stream.js` implementa backoff exponencial (500ms, 1s, 2s, 4s, 8s, 15s) para no saturar el servidor si cae la conexión.

---

## 7. Decisiones de Diseño Clave

### 7.1 ¿Por qué no React/Vue/Angular?

- **Simplicidad**: El proyecto no tiene estado complejo de usuario ni formularios extensos. Un SPA con vanilla JS es suficiente.
- **Sin build step**: No necesita Vite ni Webpack. `npm install` instala solo runtime dependencies.
- **Performance**: Sin virtual DOM. Actualizaciones directas al DOM.
- **Mantenibilidad**: Menos abstracciones = menos curva de aprendizaje para desarrolladores de planta o terceros.

### 7.2 ¿Por qué ECharts?

- La vista **Tendencias** requiere zoom, pan, selector de rango y múltiples series. ECharts cubre estos casos con ~30 líneas de configuración.
- Las gráficas del dashboard (Resumen) usan canvas nativo para sparklines simples, evitando cargar ECharts en la vista principal.

### 7.3 ¿Por qué in-memory y no base de datos?

- **Volumen**: 6 cámaras × 3 variables + 6 de sistema = 24 series. ~12h de historia a 5s = ~8640 puntos/serie. Esto cabe cómodamente en memoria (~3 MB).
- **Velocidad**: Lecturas/escrituras son O(1) en Map/Array. Sin latencia de red.
- **Persistencia**: La carpeta `data/` guarda solo `thresholds.json`. El histórico se exporta vía CSV cuando se necesita retención prolongada.
- **Simplicidad**: Un solo proceso Node.js, sin dependencias externas de infraestructura.

### 7.4 ¿Por qué rate-limit por Express y no por nginx?

- **Autocontenido**: El servicio puede correr detrás de cualquier proxy (nginx, traefik, cloudflare) o sin proxy en red local de planta.
- **Flexibilidad**: Permite diferentes límites para lecturas (600/min) y escrituras (60/min).

### 7.5 ¿Por qué dos eventos SSE (`snapshot` + `data`)?

- **`data`**: Ligero, instantáneo, un cambio por variable. Ideal para actualizar gauges, sparklines y alarmas sin reconstruir todo el DOM.
- **`snapshot`**: Estado completo consolidado cada 200ms. Ideal para sincronizar la escena 3D, KPIs derivados y paneles de estado que dependen de múltiples variables.

---

## 8. Escalabilidad y Futuro

| Escenario | Estrategia |
|-----------|------------|
| **Persistencia >12h** | Agregar writer a `data/` (JSON atómico) o conectar a SQLite/Postgres en `historyStore`. |
| **Múltiples instancias** | Extraer `snapshotStore` a un servicio Redis compartido. SSE requiere sticky sessions o migrar a WebSocket con pub/sub. |
| **Más cámaras** | Añadir entry en `CHAMBERS` (con `id`, `setpoint`, `enabled`, `mqttPrefix`). El front se reconstruye al recargar `/api/config`. |
| **Autenticación** | Agregar middleware JWT en `server.js` y login view en frontend. |
| **Notificaciones push** | Service Worker + Push API para alertas críticas. |

---

## 9. Glosario

| Término | Significado |
|---------|-------------|
| **Cámara** | Cuarto frío industrial donde se almacena producto congelado. 6 unidades en planta (4 activas). |
| **Setpoint** | Temperatura objetivo configurada para una cámara. |
| **Histéresis** | Banda de temperatura alrededor del setpoint dentro de la cual el compresor no cambia de estado. Evita ciclos rápidos (short-cycling). |
| **Defrost** | Ciclo de deshielo programado donde el compresor se apaga y resistencias elevan la temperatura para eliminar hielo del evaporador. |
| **Compresor** | Equipo que comprime el refrigerante para extraer calor de la cámara. |
| **Evaporador** | Intercambiador de calor dentro de la cámara donde el refrigerante se evapora absorbiendo calor. |
| **COP** | Coeficiente de Rendimiento (Coefficient of Performance). Relación entre calor removido y energía consumida. |
| **SSE** | Server-Sent Events. Protocolo HTTP para push unidireccional. |
| **Coalescing** | Agrupar múltiples eventos en uno solo para reducir tráfico. |
| **Backpressure** | Mecanismo para evitar saturar a clientes lentos. |
| **Ubidots** | Plataforma IoT en la nube usada para ingestar datos de sensores industriales. |
