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
| Charts | inline SVG + canvas (sin Chart.js/ECharts) |
| Tests | vitest |

Puerto default **5002** (hermano `cocedores-pinsa` refrigeración usa 5001, `Malinalco-render` usa 5000).

---

## Cómo arrancar

```bash
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
trázabilidad-cocedores/
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
│   ├── css/                  variables, header, sidebar, panels, dashboard, responsive
│   ├── js/                   app, stream, router, sidebar, kpiBar, cocedoresStage, ...
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
| `MANTENIMIENTO` | gris `#8B9DAE` | Marcado por operario, no disponible |
| `DESACTIVADO` | gris-dim `#5A6B7A` | Fuera de servicio |

---

## Etapas de trazabilidad por carrito

```
Eviscerado  →  Entrada cocedor  →  En proceso  →  Salida cocedor  →  Empaque
```

---

## Licencia

Propietaria — **PINSA Congelados, Planta Mazatlán**.
