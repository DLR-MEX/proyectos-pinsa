# Arquitectura — childrooms-render

## Flujo general

```
                   ┌──────────────────────────────────────┐
                   │  Driver (factory en index.js)        │
   MOCK_DATA=true  │  ─ mockDriver: 2.5s tick simulado    │
                   │  ─ MqttClient: subscribe Ubidots     │
                   └──────────────┬───────────────────────┘
                                  │ store.update(dev, var, value, ts)
                                  ▼
                   ┌──────────────────────────────────────┐
                   │  SnapshotStore (EventEmitter)        │
                   │  Map "device/variable" → {value,ts}  │
                   └──────────────┬───────────────────────┘
                                  │ emit('change', evt)
                                  ▼
                   ┌──────────────────────────────────────┐
                   │  index.js — dos broadcasts:          │
                   │    • 'data'     inmediato (ligero)   │
                   │    • 'snapshot' coalesce 200ms       │
                   └──────────────┬───────────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────────┐
                   │  SseHub.broadcast()                  │
                   │  heartbeat 25s                       │
                   └──────────────┬───────────────────────┘
                                  │ HTTP/SSE
                                  ▼
                   ┌──────────────────────────────────────┐
                   │  Browser: stream.js → app.js         │
                   │  Reconexión exponencial 500ms..15s   │
                   └──────────────────────────────────────┘
```

## Eventos SSE

| Evento     | Payload                                     | Frecuencia                |
|------------|---------------------------------------------|---------------------------|
| `snapshot` | shape de `store.getAll()`                   | hidratación + cada 200ms  |
| `data`     | `{device, variable, value, ts, chamberId, metric}` | inmediato por cambio |
| heartbeat  | `: heartbeat <ts>`                          | cada 25s                  |

## Asset versioning

`BUILD_VERSION = Date.now().toString(36)` se calcula al arrancar y se inyecta
en `index.html` reemplazando `__BUILD_VERSION__`. Cada `<link>` y `<script>`
lleva `?v=<build>`, lo que invalida el cache del browser sin recargar
manualmente.

## Logging

`winston` con `winston-daily-rotate-file`. Estructura:

```
logs/
  2026-05/
    2026-05-20.log
```

Formato de línea: `YYYY-MM-DD HH:mm:ss,SSS [LEVEL] name: msg`.

## Factory del driver

```js
// src/index.js
const driver = MOCK_DATA
  ? startMockDriver(store)
  : new MqttClient(store);
```

Ambos cumplen el contrato mínimo `{connected: boolean, close()}`. El servidor
usa `driver.connected` para exponer `/api/health.mqtt_connected`.

## Frontend module map

```
app.js (orquestador)
 ├─ stream.js          EventSource + reconexión
 ├─ chambers.js        cards + tuberías SVG + status panels
 ├─ kpi.js             5 KPIs derivados
 ├─ sidebar.js         nav + badge alarmas + estado sistema
 ├─ alarms.js          tabla de alarmas activas
 ├─ sysInfo.js         panel "Información del sistema"
 ├─ equipos.js         lista de equipos principales
 ├─ trends.js          canvas multi-line de temperaturas
 └─ eventos.js         sparkline consumo + timeline eventos
```

## Modelo de dominio (`chambersMap.js`)

- **6 cámaras** (`cam1..cam6`): cam1-cam4 enabled, cam5-cam6 disabled.
- **Variables por cámara**: `temperature`, `humidity`, `power_kw`.
- **Equipos compartidos**: 3 compresores, 2 condensadores, 1 bomba.
- **Variables de sistema** (`sys_*`): temperatura/humedad exterior, setpoint
  general, presiones de succión/descarga, eficiencia.
- `resolveVariable(name)` convierte un nombre de variable MQTT en
  `{chamber, variable}` o `{system: true, variable}`.

## Cómo agregar una cámara

1. Añadir entry en `CHAMBERS` (con `id`, `setpoint`, `enabled`, `mqttPrefix`).
2. El front se reconstruye con las nuevas tarjetas al recargar `/api/config`.
3. Si está enabled, también aparece su status-panel debajo.
4. Las tuberías se redibujan automáticamente en cualquier ResizeObserver tick.

## Cómo agregar una variable de sistema

1. Añadir entry a `SYS_VARIABLES` en `chambersMap.js`.
2. Inicializar valor en `mockDriver.js` (`sysState`) y simular jitter.
3. Mapear `<dd data-sys="…">` en `index.html` + extender `sysInfo.js`.
