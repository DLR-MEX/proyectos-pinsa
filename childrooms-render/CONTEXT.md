# childrooms-render

Dashboard de **monitoreo de cámaras de refrigeración industrial** para **PINSA Congelados, Planta Mazatlán**.

- **6 cámaras** (`cam1`..`cam6`) · `cam1`–`cam4` activas, `cam5`–`cam6` deshabilitadas.
- **Variables por cámara**: temperatura (°C), humedad (%), potencia consumida (kW).
- **Equipos centrales**: 3 compresores, 2 condensadores, 1 bomba de líquido.
- **Modo simulado por defecto** (`MOCK_DATA=true`): motor físico-realista con histéresis termostática, puertas abiertas, defrost programado y carga térmica pasiva.
- **Modo producción** (`MOCK_DATA=false`): cliente MQTT sobre Ubidots con validación física de rangos.
- **Render 3D** con Babylon.js: vista general de cámaras + vista detalle interior por cámara con colorbar dinámica (TEMP/HUM).

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

Puerto default **5001**. Convive con `trazabilidad-cocedores` en **5002** y `Malinalco-render` en **5000**.

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

### Variables de entorno (`.env`)

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

---

## Estructura del proyecto

```
childrooms-render/
├── src/                          backend Node
│   ├── index.js                  entry + factory driver (mock/MQTT) + SSE wiring + shutdown
│   ├── server.js                 rutas REST y SSE + helmet + CSP + cors + rate-limit
│   ├── config.js                 constantes físicas + dotenv (rangos, umbrales, MQTT)
│   ├── chambersMap.js            6 cámaras + equipos + variables + resolución O(1)
│   ├── snapshotStore.js          EventEmitter + memoize getAll() por lastUpdate
│   ├── historyStore.js           buffers en memoria de variables y alarmas + CSV builders
│   ├── thresholdsStore.js        umbrales JSON atómico (tmp+rename) + validación
│   ├── mockDriver.js             motor: ticks 2.5s con histéresis, puertas, defrost
│   ├── mqttClient.js             cliente Ubidots con validación física y soporte /lv
│   ├── sseHub.js                 hub SSE con backpressure + heartbeat 25s
│   └── logger.js                 winston DailyRotateFile → logs/YYYY-MM/YYYY-MM-DD.log
│
├── public/                       frontend estático
│   ├── index.html                shell SPA con 6 vistas
│   ├── css/
│   │   ├── variables.css         tokens: paleta navy/cyan, tipografía, radius
│   │   ├── header.css            header sticky con título + reloj + estado conexión
│   │   ├── sidebar.css           sidebar con 5 items + badge alarmas + salud sistema
│   │   ├── kpi.css               5 cards KPI + sparklines
│   │   ├── chambers.css          grid cámaras + status panels + render 3D
│   │   ├── side-panels.css       paneles laterales (alarmas + info sistema)
│   │   ├── bottom.css            tendencias + equipos + eventos/consumo
│   │   ├── views.css             estilos compartidos vistas (header, tabs, tablas)
│   │   ├── detalle.css           vista detalle cámara: stage 3D + info + equipos
│   │   └── responsive.css        media queries
│   ├── js/
│   │   ├── app.js                orquestador: SSE → snapshot → render por vista
│   │   ├── stream.js             EventSource con reconexión exponencial
│   │   ├── router.js             router por data-view + localStorage última vista
│   │   ├── sidebar.js            nav + badge alarmas + estado sistema
│   │   ├── scene3d.js            escena Babylon dashboard general
│   │   ├── chamberDetailView.js  vista detalle 3D interior + colorbar + prewarm
│   │   ├── colorScales.js        generadores de colores según umbrales temp/hum
│   │   ├── colorbar.js           barra horizontal de escala de colores
│   │   ├── chambers.js           cards cámaras + paneles estado + tuberías SVG
│   │   ├── kpi.js                5 KPIs: activas, temp, hum, consumo, COP
│   │   ├── alarms.js             tabla alarmas activas/histórico + severidad
│   │   ├── sysInfo.js            panel "Información del sistema"
│   │   ├── equipos.js            lista equipos principales
│   │   ├── trends.js             canvas multi-línea temperaturas (vista Resumen)
│   │   ├── eventos.js            sparkline consumo + timeline eventos
│   │   ├── historyHydration.js   hidrata sparklines desde histórico al boot
│   │   ├── trendsView.js         vista Tendencias con ECharts (zoom/pan)
│   │   ├── configView.js         editor umbrales con sliders/inputs
│   │   └── reportsView.js        tarjetas exportación CSV con filtros fecha
│   └── images/
│
├── data/                         thresholds.json (persistencia atómica)
├── logs/                         rotados por día
├── tests/                        vitest
├── package.json
├── .env.example
└── .gitignore
```

---

## Modelo de datos

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

## Vistas (router por `data-view`)

| Vista | Ruta interna | Contenido |
|-------|--------------|-----------|
| **Resumen** | `resumen` | KPI bar + render 3D general + alarmas activas + info sistema + tendencias + equipos + eventos/consumo |
| **Alarmas** | `alarmas` | Panel andon: tabs activas/histórico, tabla con severidad |
| **Tendencias** | `tendencias` | Gráfica ECharts interactiva (zoom/pan) de temperatura/humedad/consumo |
| **Reportes** | `reportes` | 7 tarjetas de exportación CSV con filtro de fechas |
| **Detalle cámara** | `camara-detalle` | Render 3D interior + readout + info/equipos/alarmas de esa cámara |
| **Configuración** | `configuracion` | Editor de umbrales min/ideal/max por cámara y generales |

---

## Render 3D (Babylon.js)

### Dashboard — vista general (`scene3d.js`)

Las 4 cámaras activas renderizadas en perspectiva 3D con indicadores de estado.

- Cada cámara se representa como un volumen 3D (cubo o cilindro simplificado).
- **Color dinámico** según temperatura o humedad relativa a los umbrales configurados.
- **Modo heatmap**: toggle TEMP/HUM que recolorea todas las cámaras y la colorbar.
- **Interacción**: click sobre cualquier cámara abre la vista detalle.
- Cámara `ArcRotateCamera` orbital con auto-rotación opcional.
- **Colorbar horizontal**: escala continua del valor seleccionado (TEMP o HUM).

### Vista detalle — interior de cámara (`chamberDetailView.js`)

Una única cámara mostrada en detalle con interior visible.

- **Prewarm eager**: la geometría 3D del detalle se construye al boot, no en idle, para que el primer click responda en <100ms.
- **Readout**: muestra valor actual, modo (TEMP/HUM) y setpoint.
- **Colorbar**: barra horizontal propia para la vista detalle.
- **Tracking de cleanup**: cada mesh se trackea y se hace `dispose()` antes de reconstruir, evitando duplicación al recibir nuevos snapshots SSE.

---

## Estados de equipos

| Estado | Color | Significado |
|--------|-------|-------------|
| `ON` | verde `#00C896` | Equipo en operación normal |
| `OFF` | gris `#8B9DAE` | Equipo detenido o apagado |
| `DESHABILITADA` | gris-dim `#5A6B7A` | Cámara fuera de servicio |

Los indicadores del render 3D usan una paleta de calor según temperatura/humedad relativa a los umbrales configurados.

---

## Simulador

`mockDriver.js` es la fuente sintética de eventos cuando `MOCK_DATA=true`.

**Ticks de temperatura (cada 2.5s):**

- **Histéresis termostática**: compresor enciende cuando `temp >= setpoint + 3°C`, se apaga cuando `temp <= setpoint - 3°C`.
- Enfriamiento: `-0.45°C/tick` (compresor ON).
- Calentamiento pasivo: `+0.18°C/tick` (puerta cerrada, compresor OFF).
- Puerta abierta: `+0.55°C/tick` adicional durante 4-12 ticks (aleatorio cada 120-360 ticks).
- Defrost: `+0.85°C/tick` durante 10 ticks (aleatorio cada 360-600 ticks).
- Banda de seguridad: `[setpoint-8, setpoint+10]`.

**Humedad:**
- Target 84% (ON), 95% (puerta), 93% (defrost), 84% (OFF).
- Aproximación asintótica con jitter.

**Potencia:**
- ON: base + delta×0.35 kW.
- Defrost: 1.8 kW (resistencias).
- OFF: 0.45 kW (ventiladores residuo).
- Aproximación asintótica para suavizar la gráfica.

**Eventos automáticos:**
- Puerta abierta/cerrada.
- Defrost iniciado/finalizado.
- Arranque/paro de compresor.
- Alta temperatura (cooldown 60 ticks anti-spam).
- Eventos de sistema aleatorios.

**Variables de sistema:**
- `sys_temp_ext` ciclo del día simulado (~30 min): `28 + sin(dayPhase)×5 + jitter`.
- Presiones de succión/descarga reaccionan al número de compresores activos.
- Eficiencia del sistema: `86 - compresores×2.2 + jitter`.

---

## Tokens visuales

`public/css/variables.css` define la paleta y tipografía base.

**Paleta principal:**

```
--c-bg:        #0B1825   fondo navy
--c-surface:   #14283F   paneles
--c-surface-2: #1B3553   surfaces alternos
--c-blue:      #00539F   PINSA brand
--c-green:     #00C896   ON / normal
--c-amber:     #F5A623   warning / puerta abierta
--c-red:       #FF4B4B   alarma high / error
--c-cyan:      #5BB8F5   hover / info
--c-ice:       #E3F1FF   texto principal
--c-text-dim:  #8B9DAE   texto secundario
```

**Tipografía:**

- `--font-ui`: `'Rajdhani', 'Barlow Condensed', sans-serif`
- `--font-data`: `'JetBrains Mono', 'Orbitron', monospace`

Ambas cargadas vía Google Fonts (preconnect + display=swap).

---

## SSE — eventos en vivo

| Evento | Contenido | Throttle |
|--------|-----------|----------|
| `snapshot` | Estado completo del sistema (cámaras + equipos + sistema + eventos) | 200 ms coalescing |
| `data` | Cambio individual de variable: `{device, variable, value, ts, chamberId, metric}` | Instantáneo |
| heartbeat | `: heartbeat <ts>` | cada 25s |

El hub SSE (`sseHub.js`) maneja backpressure: cuando `res.write()` devuelve `false`, se marca al cliente como saturado y se dropean frames hasta que drene. Si acumula >8 frames dropped, se desconecta.

---

## Fases implementadas

- **Fase 0** — Bootstrap: `package.json`, estructura, `config`, `logger`
- **Fase 1** — Backend simulado: stores + simulador + SSE + API REST + CSV export
- **Fase 2** — Rebrand visual: header, sidebar con 5 items, tokens
- **Fase 3** — Dashboard funcional: KPI bar, render 3D, colorbar, paneles de estado, alarmas, info sistema, tendencias, equipos, eventos/consumo
- **Fase 4** — Vista detalle cámara: render 3D interior + readout + info/equipos/alarmas
- **Fase 5** — Vistas adicionales: Alarmas, Tendencias (ECharts), Reportes, Configuración
- **Fase 6** — Persistencia de umbrales: thresholdsStore JSON atómico + editor visual

---

## Próximos pasos (no implementados)

- Persistencia de histórico en SQLite o JSON atómico (>12h de retención).
- Login por operario (actualmente "operador" es metadata visual).
- Tests vitest adicionales sobre mockDriver y mqttClient.
- Notificaciones push para alarmas críticas.
- Integración con sistema de tickets de mantenimiento.
- Soporte para más cámaras sin modificar código (config-driven UI).

---

## Notas operativas

- El servidor lee `index.html` **una sola vez al boot** (cachea en memoria y reemplaza `__BUILD_VERSION__`). Cambios al HTML requieren reinicio. Cambios a JS/CSS no — basta Ctrl+F5.
- La CSP de helmet permite `cdn.babylonjs.com` (scripts + connect + img) y `cdn.jsdelivr.net` (ECharts), además de `fonts.googleapis.com` (styles).
- Babylon.js descarga texturas auxiliares y sourcemaps en runtime; por eso `connect-src` incluye el CDN.
- El simulador arranca con `setInterval` + `unref()` para no bloquear el shutdown ordenado en SIGINT/SIGTERM.
- Los logs rotan diariamente en `logs/YYYY-MM/YYYY-MM-DD.log`.
- Los umbrales se guardan atómicamente en `data/thresholds.json` (tmp+rename) para tolerar crashes a mitad de escritura.
