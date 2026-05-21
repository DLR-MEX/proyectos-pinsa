# childrooms-render

Dashboard de **monitoreo de cámaras de refrigeración industrial** para **PINSA Congelados, Planta Mazatlán**.

- **6 cámaras** (`cam1`..`cam6`) de refrigeración industrial · `cam1`–`cam4` activas, `cam5`–`cam6` deshabilitadas.
- **Variables por cámara**: temperatura (°C), humedad (%), potencia consumida (kW).
- **Equipos centrales**: 3 compresores, 2 condensadores, 1 bomba de líquido.
- **Modo simulado por defecto** (`MOCK_DATA=true`): motor físico-realista con histéresis termostática, ciclos de puerta abierta, defrost programado y carga térmica pasiva.
- **Modo producción** (`MOCK_DATA=false`): cliente MQTT sobre Ubidots con validación física de rangos.
- **Render 3D** con Babylon.js: vista general de cámaras + vista detalle interior por cámara.

> **Proyecto relacionado en el repositorio**:  
> [`trazabilidad-cocedores`](../trazabilidad-cocedores/README.md) — Dashboard de trazabilidad NFC de carritos de atún en cocedores cilíndricos (puerto **5002**).

---

## Stack

| Capa | Tecnología |
|------|------------|
| Runtime | Node ≥20 ESM (`"type": "module"`) |
| Web | Express 4 + helmet + cors + express-rate-limit |
| Realtime | SSE propio con coalescing 200 ms + backpressure |
| MQTT (prod) | `mqtt` 5.10 sobre TLS → Ubidots |
| Logging | winston + winston-daily-rotate-file |
| Frontend | Vanilla JS ES modules + CSS plano |
| 3D | Babylon.js 9 (CDN) |
| Charts | ECharts 5.5 (CDN) + canvas inline + SVG |
| Tests | vitest |

Puerto default **5001**.

---

## Cómo arrancar

```bash
cp .env.example .env       # luego ajustar si hace falta
npm install
npm start                  # producción
npm run dev                # node --watch (auto-reload)
npm test                   # vitest
```

Abre <http://localhost:5001> en el navegador.

---

## Variables de entorno (`.env`)

Copia `.env.example` → `.env` y edita lo que necesites.

| Var | Default | Uso |
|-----|---------|-----|
| `MOCK_DATA` | `true` | `true` = simulador local. `false` = conecta a Ubidots vía MQTT. |
| `UBIDOTS_TOKEN` | _(vacío)_ | Token de API Ubidots. Requerido si `MOCK_DATA=false`. |
| `UBIDOTS_DEVICE` | `childrooms` | Label del dispositivo en Ubidots. |
| `MQTT_BROKER` | `industrial.api.ubidots.com` | Broker MQTT TLS. |
| `MQTT_PORT` | `8883` | Puerto MQTT (TLS). |
| `WEB_HOST` | `0.0.0.0` | Bind del servidor HTTP. |
| `WEB_PORT` | `5001` | Puerto HTTP. |
| `LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |

Para el detalle completo de variables, constantes del simulador y buffers, ver [docs/instalacion.md](docs/instalacion.md).

---

## Estructura rápida

```
childrooms-render/
├── src/
│   ├── index.js              entry + factory driver (mock/MQTT) + SSE wiring + shutdown
│   ├── server.js             rutas /api/* + helmet + CSP + cors + rate-limit
│   ├── config.js             constantes físicas + dotenv
│   ├── chambersMap.js        6 cámaras + equipos + variables + resolución O(1)
│   ├── snapshotStore.js      EventEmitter + memoize getAll() por lastUpdate
│   ├── historyStore.js       buffers en memoria de variables y alarmas + CSV builders
│   ├── thresholdsStore.js    umbrales JSON atómico (tmp+rename) + validación
│   ├── mockDriver.js         motor: ticks 2.5s con histéresis, puertas, defrost
│   ├── mqttClient.js         cliente Ubidots con validación física y soporte /lv
│   ├── sseHub.js             hub SSE con backpressure + heartbeat 25s
│   └── logger.js             winston DailyRotateFile → logs/YYYY-MM/YYYY-MM-DD.log
├── public/
│   ├── index.html            shell SPA con 5 vistas
│   ├── css/                  variables, header, sidebar, kpi, chambers, panels, views, detalle, responsive
│   ├── js/                   app, stream, router, scene3d, chamberDetailView, chambers, kpi, sidebar, alarms, sysInfo, equipos, trends, eventos, colorScales, colorbar, trendsView, configView, reportsView, historyHydration
│   └── images/
├── data/                     thresholds.json (persistencia atómica)
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
| [docs/flujo.md](docs/flujo.md) | Flujo de datos end-to-end, ciclo de vida de una cámara, eventos del simulador, alarmas, interacción operario |

---

## Modelo de datos resumido

### Cámara (estado runtime)

```js
{
  id: 'cam1',
  label: 'Cámara 1',
  setpoint: -18,
  enabled: true,
  equipos: { compresor: true, evaporador: true },
  temp:  { value: -17.8, ts: 1715702400000 },
  hum:   { value: 86.5,  ts: 1715702400000 },
  power: { value: 5.42,  ts: 1715702400000 }
}
```

### Variable de sistema

```js
{
  sys_temp_ext:   { value: 28.4, ts },
  sys_hum_ext:    { value: 62.1, ts },
  sys_setpoint:   { value: -2.0, ts },
  sys_p_succion:  { value: 2.1,  ts },
  sys_p_descarga: { value: 15.7, ts },
  sys_eficiencia: { value: 78.3, ts }
}
```

### Evento

```js
{
  ts: 1715702400000,
  severity: 'warn',   // 'info' | 'warn' | 'error'
  label: 'Puerta abierta en Cámara 1'
}
```

---

## API HTTP

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/` | GET | `index.html` con build version stamped |
| `/api/health` | GET | `{ok, uptime, mqtt_connected, sse_clients, build}` |
| `/api/config` | GET | device + cámaras + equipos + variables + rangos + umbrales + plantName |
| `/api/data` | GET | Snapshot actual |
| `/api/stream` | GET | SSE con eventos `snapshot` (200ms coalesced) y `data` (instantáneo) |
| `/api/thresholds` | GET | Umbrales operativos (general + por cámara) |
| `/api/thresholds` | PUT | Guardar umbrales (validados, atómicos) |
| `/api/thresholds/reset` | POST | Restaurar defaults |
| `/api/history.csv` | GET | `?vars=&from=&to` — CSV de variables históricas |
| `/api/alarms.csv` | GET | `?from=&to` — CSV de alarmas |
| `/api/history.json` | GET | `{variables, alarms}` en JSON |
| `/api/alarms/event` | POST | Registrar alarma manualmente |
| `/api/alarms/history` | GET / DELETE | Leer o limpiar histórico de alarmas |

Rate-limit: 600/min lecturas, 60/min escrituras.

---

## Estados de equipos

| Estado | Color | Significado |
|--------|-------|-------------|
| `ON` | verde `#00C896` | Equipo en operación normal |
| `OFF` | gris `#8B9DAE` | Equipo detenido o apagado |
| `DESHABILITADA` | gris-dim `#5A6B7A` | Cámara fuera de servicio (no se suscribe ni simula) |

Los indicadores del render 3D usan una paleta de calor según temperatura/humedad relativa a los umbrales configurados.

---

## Vistas del frontend

| Vista | Ruta interna | Contenido |
|-------|--------------|-----------|
| **Resumen** | `resumen` | KPI bar + render 3D general + alarmas activas + info del sistema + tendencias + equipos + eventos/consumo |
| **Alarmas** | `alarmas` | Panel andon: tabs activas/histórico, tabla con severidad |
| **Tendencias** | `tendencias` | Gráfica ECharts interactiva (zoom/pan) de temperatura/humedad/consumo |
| **Reportes** | `reportes` | 7 tarjetas de exportación CSV con filtro de fechas |
| **Detalle cámara** | `camara-detalle` | Render 3D interior + readout + info/equipos/alarmas de esa cámara |
| **Configuración** | `configuracion` | Editor de umbrales min/ideal/max por cámara y generales |

---

## MQTT swap (de mock a producción)

1. Editar `.env`:
   - `MOCK_DATA=false`
   - `UBIDOTS_TOKEN=<token>`
   - `UBIDOTS_DEVICE=<device-label>`
2. Reiniciar `npm start`. El log mostrará `MQTT connected ✓`.
3. `GET /api/health` debe devolver `mqtt_connected: true`.

### Variables Ubidots esperadas

Por cámara `cam1..cam6`:
- `cam{N}_temperature` (°C)
- `cam{N}_humidity` (%)
- `cam{N}_power_kw` (kW)

Sistema:
- `sys_temp_ext`, `sys_hum_ext`, `sys_setpoint`
- `sys_p_succion`, `sys_p_descarga`, `sys_eficiencia`

---

## Tests

```bash
npm test
```

Cubre `chambersMap` (`resolveVariable`, `VALID_KEYS`) y `SnapshotStore` (`update`/`get`/`getAll`/eventos).

---

## Licencia

Propietaria — **PINSA Congelados, Planta Mazatlán**.
