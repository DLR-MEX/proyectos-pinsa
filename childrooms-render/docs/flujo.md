# Flujo de Datos

> Descripción completa del flujo de información end-to-end: desde el driver (simulador o MQTT) hasta la actualización del dashboard, pasando por estados, alarmas y eventos.

---

## 1. Flujo de datos end-to-end (vista general)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO COMPLETO                                     │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐
    │  Driver         │
    │  (mockDriver o  │
    │   MqttClient)   │
    └──────┬──────────┘
           │ store.update(dev, var, value, ts)
           ▼
    ┌──────────────────────────────┐
    │      Validación              │
    │  - rango físico OK?          │
    │  - variable conocida?        │
    └──────────────┬───────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │      SnapshotStore           │
    │  update() / setEquipoState() │
    └──────────────┬───────────────┘
                   │ EventEmitter 'change'
                   ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                         index.js                                 │
    │  ┌─────────────────────────────────────────────────────────────┐ │
    │  │  1. history.recordVariable(var, value, ts)                  │ │
    │  │  2. sseHub.broadcast('data', {device,variable,value,ts,    │ │
    │  │                         chamberId, metric})                │ │
    │  │  3. Coalesce 200ms → sseHub.broadcast('snapshot',          │ │
    │  │                       store.getAll())                      │ │
    │  └─────────────────────────────────────────────────────────────┘ │
    └─────────────────────────────┬───────────────────────────────────┘
                                  │
                                  │ SSE stream (HTTP persistente)
                                  ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                        FRONTEND (Navegador)                      │
    │                                                                  │
    │  stream.js recibe eventos  ──>  Actualiza stores locales  ──>  │
    │  Re-render UI                                                   │
    │                                                                  │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │  scene3d.js  │  │    kpi.js    │  │ chambers.js  │          │
    │  │  (Babylon)   │  │   (5 KPIs)   │  │(status cards)│          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
    │  │   alarms.js  │  │  trends.js   │  │  eventos.js  │          │
    │  │(alarm list)  │  │(sparklines)  │  │(power+events)│          │
    │  └──────────────┘  └──────────────┘  └──────────────┘          │
    └─────────────────────────────────────────────────────────────────┘
```

**Resumen**: El driver genera cambios → el store valida y actualiza → emite eventos → `index.js` reenvía `data` inmediato y `snapshot` coalescido → SSE Hub transmite a navegadores → frontend actualiza UI en tiempo real.

---

## 2. Ciclo de vida de una cámara

Una cámara de refrigeración atraviesa ciclos continuos de enfriamiento, estabilización y eventos ocasionales:

```
┌─────────┐   temp >= setpoint+3   ┌─────────┐   temp <= setpoint-3   ┌─────────┐
│ COMPRESOR│ ─────────────────────> │ COMPRESOR│ ─────────────────────> │ COMPRESOR│
│   OFF   │                        │   ON    │                        │   OFF   │
│ (calent.│                        │ (enfría)│                        │(estable)│
│ pasiva) │                        │         │                        │         │
└────┬────┘                        └────┬────┘                        └────┬────┘
     │                                  │                                  │
     │ Puerta abierta                   │ Defrost programado               │
     │ (temp sube rápido)               │ (compresor OFF,                  │
     │                                  │  resistencias ON)                │
     ▼                                  ▼                                  ▼
┌─────────┐                        ┌─────────┐                        ┌─────────┐
│ +0.55°C │                        │ +0.85°C │                        │ +0.18°C │
│ /tick   │                        │ /tick   │                        │ /tick   │
│ 4-12 ticks                        │ 10 ticks │                        │ continuo │
└─────────┘                        └─────────┘                        └─────────┘
```

### Etapas detalladas

| Etapa | Condición | Descripción | Quién lo genera |
|-------|-----------|-------------|----------------|
| **Enfriamiento** | `temp >= setpoint + 3°C` | Compresor encendido. Temp baja ~0.45°C/tick. | Simulador o sensor real |
| **Estabilización** | `temp <= setpoint - 3°C` | Compresor apagado. Temp sube lentamente por carga térmica pasiva (~0.18°C/tick). | Simulador o sensor real |
| **Puerta abierta** | Aleatorio cada 120-360 ticks | Operario o robot entra a la cámara. Temp sube ~0.55°C/tick adicional durante 4-12 ticks. | Simulador |
| **Defrost** | Aleatorio cada 360-600 ticks | Ciclo de deshielo. Compresor OFF, resistencias ON. Temp sube ~0.85°C/tick durante 10 ticks. | Simulador |
| **Alta temperatura** | `temp > setpoint + 5°C` | Alerta de warning si persiste. Se emite evento con cooldown de 60 ticks para evitar spam. | Simulador o lógica de alertas |

---

## 3. Eventos del simulador (detalle)

### 3.1 ¿Quién genera los eventos?

```
Modo MOCK_DATA=true (simulación):
┌─────────────────┐     tick cada 2.5s      ┌────────────────────────┐
│  mockDriver     │ ──────────────────────> │  Cambio de variable    │
│  (automático)   │                        │  temp / hum / power    │
└─────────────────┘                        └───────────┬────────────┘
                                                       │
                                                       ▼
                                               ┌───────────────┐
                                               │ snapshotStore │
                                               │ update()      │
                                               └───────────────┘

Modo MOCK_DATA=false (producción):
┌─────────────────┐     MQTT pub/sub        ┌────────────────────────┐
│  Sensor/PLC     │ ─────────────────────> │  MqttClient             │
│  (Ubidots)      │                        │  onMessage → validate   │
│                 │                        │  → store.update()       │
└─────────────────┘                        └────────────────────────┘
```

### 3.2 Flujo de un tick del simulador

```
1. Por cada cámara enabled:
   a) ¿Puerta debe abrirse? (tick >= nextDoorOpenAt)
      └─> doorOpenTicks = 4-12
      └─> pushEvent("Puerta abierta en Cámara N")

   b) ¿Defrost debe iniciarse? (tick >= nextDefrostAt)
      └─> defrostTicks = 10
      └─> pushEvent("Deshielo iniciado en Cámara N")

   c) Lógica termostato:
      └─> Si defrost: compressorOn = false
      └─> Si temp >= setpoint + 3: compressorOn = true
      └─> Si temp <= setpoint - 3: compressorOn = false
      └─> evaporatorOn = compressorOn && !defrost

   d) Evolución temperatura:
      └─> Si defrost:  temp += 0.85 + jitter
      └─> Si comp ON: temp -= 0.45 + jitter
      └─> Si comp OFF: temp += 0.18 + jitter
      └─> Si puerta abierta: temp += 0.55
      └─> clamp(temp, setpoint-8, setpoint+10)

   e) Evolución humedad:
      └─> target = 84 (ON) / 95 (puerta) / 93 (defrost) / 84 (OFF)
      └─> hum += (target - hum) * 0.20 + jitter
      └─> clamp(hum, 78, 97)

   f) Evolución potencia:
      └─> target = base + delta*0.35 (ON) / 1.8 (defrost) / 0.45 (OFF)
      └─> power += (target - power) * 0.45 + jitter
      └─> clamp(power, 0.15, 25)

   g) Eventos de compresor:
      └─> Si cambió estado: pushEvent("Compresor Cámara N - Arranque/Paro")
      └─> Si temp > setpoint + 5 y cooldown OK:
          pushEvent("Alta temperatura en Cámara N", severity='warn')

   h) Publicar en store:
      └─> store.setEquipoState(camId, 'compresor', on)
      └─> store.setEquipoState(camId, 'evaporador', on)
      └─> store.update(DEVICE, camN_temperature, temp, now)
      └─> store.update(DEVICE, camN_humidity, hum, now)
      └─> store.update(DEVICE, camN_power_kw, power, now)

2. Variables de sistema:
   └─> sys_temp_ext  = 28 + sin(dayPhase)*5 + jitter  [22, 38]
   └─> sys_hum_ext   = 62 - sin(dayPhase)*8 + jitter  [40, 80]
   └─> sys_p_succion  = f(compresores ON)             [1.4, 3.2]
   └─> sys_p_descarga = f(compresores ON)             [11, 19]
   └─> sys_eficiencia = 86 - compresores*2.2 + jitter [65, 92]
   └─> publicar todas en store

3. Evento de sistema ocasional (cada ~100-200 ticks):
   └─> pushEvent(aleatorio de lista predefinida)
```

### 3.3 Flujo de un mensaje MQTT (producción)

```
1. Sensor publica: /v1.6/devices/childrooms/cam1_temperature
   payload: {"value": -17.5, "timestamp": 1715702400000}

2. mqttClient.#onMessage(topic, payload):
   a) Extrae variable = 'cam1_temperature'
   b) Valida que variable esté en VALID_KEYS
   c) Parsea JSON (o /lv legacy)
   d) Valida físicamente: -30 <= temp <= 20
   e) Si todo OK: store.update('childrooms', 'cam1_temperature', -17.5, ts)
   f) Si falla: log warning, descarta mensaje

3. snapshotStore emite 'change' → index.js reenvía por SSE
```

---

## 4. Alarmas

### 4.1 Condiciones que disparan alarmas

```
┌──────────────────────────────────────────────────────────────┐
│                    CONDICIONES DE ALARMA                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  TEMPERATURA                                                  │
│  ├── temp > setpoint + tolTemp  ──>  ALERTA: TEMP_ALTA       │
│  └── temp < setpoint - tolTemp  ──>  ALERTA: TEMP_BAJA      │
│                                                               │
│  HUMEDAD                                                      │
│  ├── hum > HUM_ALERT_HIGH       ──>  ALERTA: HUM_ALTA        │
│  └── hum < HUM_ALERT_LOW        ──>  ALERTA: HUM_BAJA       │
│                                                               │
│  TIEMPO                                                       │
│  ├── condición persiste > ALERT_WARN_MIN min  ──> WARNING    │
│  └── condición persiste > ALERT_ERROR_MIN min ──> ERROR      │
│                                                               │
│  EQUIPO                                                       │
│  └── compresor OFF inesperado  ──>  ALERTA: EQ_PARO          │
│                                                               │
│  COMUNICACIÓN                                                 │
│  └── Sin datos de cámara por > X segundos  ──> OFFLINE       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Ciclo de vida de una alarma

```
┌─────────────┐     condición detectada      ┌─────────────┐
│  Sistema    │ ───────────────────────────> │   ACTIVA    │
│  (simulador │                              │  (warning)  │
│   o sensor) │                              │             │
└─────────────┘                              └──────┬──────┘
                                                    │
                                                    │ broadcastAlert()
                                                    ▼
                                           ┌─────────────────┐
                                           │ Frontend muestra │
                                           │ badge rojo/amber │
                                           │ en sidebar + lista│
                                           └─────────────────┘
                                                    │
                              condición desaparece │ auto-resuelve
                                                    │
                                                    ▼
                                           ┌─────────────┐
                                           │  RESUELTA   │
                                           │  (verde)    │
                                           └──────┬──────┘
                                                  │
                                                  ▼
                                          ┌─────────────────┐
                                          │ Frontend oculta  │
                                          │ badge o muestra  │
                                          │ histórico        │
                                          └─────────────────┘
                                                  │
                                                  ▼
                                          ┌─────────────┐
                                          │  HISTÓRICO  │
                                          │(historyStore│
                                          │  array)     │
                                          └─────────────┘
```

### 4.3 Ejemplo de alarma

```json
{
  "ts": 1715702400000,
  "camId": "cam1",
  "cam": "Cámara 1",
  "type": "Alta temperatura",
  "sev": "warn",
  "resolvedAt": null,
  "acknowledgedAt": null
}
```

Al resolverse:

```json
{
  "ts": 1715702400000,
  "camId": "cam1",
  "cam": "Cámara 1",
  "type": "Alta temperatura",
  "sev": "warn",
  "resolvedAt": 1715703000000,
  "acknowledgedAt": 1715702800000
}
```

---

## 5. Histórico (buffers en memoria)

### 5.1 Estructura del buffer de variables

```
┌─────────────────────────────────────────────────────────────┐
│              historyStore (variables)                        │
├─────────────────────────────────────────────────────────────┤
│  Capacidad máxima: 8640 muestras (~12h a 5s de dedup)      │
│                                                               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         ┌─────┐          │
│  │  1  │ │  2  │ │  3  │ │  4  │  ...    │8640 │          │
│  └──┬──┘ └─────┘ └─────┘ └─────┘         └─────┘          │
│     │                                                        │
│     └─> head (más reciente)                                  │
│     └─> tail (más antiguo, se descarta cuando lleno)        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Campos de una muestra

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ts` | number (ms) | Timestamp Unix de la muestra |
| `value` | number | Valor numérico de la variable |

### 5.3 Exportación CSV

Los endpoints `/api/history.csv` y `/api/alarms.csv` generan archivos CSV para descarga directa.

**Ejemplo de history.csv:**

```csv	ts_ms,iso,cam1_temperature,cam1_humidity,cam1_power_kw
1715702400000,2024-05-15T08:00:00.000Z,-17.50,86.5,5.42
1715702405000,2024-05-15T08:00:05.000Z,-17.85,86.2,5.51
```

**Ejemplo de alarms.csv:**

```csv
firstSeen_iso,resolvedAt_iso,acknowledgedAt_iso,cam_id,cam,type,severity
2024-05-15T08:00:00.000Z,,,cam1,Cámara 1,Alta temperatura,warn
```

---

## 6. Interacción del operario (paso a paso)

### 6.1 Escenario: Ver estado general de la planta

```
Paso 1: Operario abre el dashboard en http://localhost:5001
        └─> Véase la vista "Resumen" por defecto

Paso 2: Frontend carga configuración vía GET /api/config
        └─> Cámaras, equipos, rangos, umbrales, plantName

Paso 3: Frontend se conecta a SSE /api/stream
        └─> Recibe snapshot inicial inmediato
        └─> Pinta render 3D, KPIs, paneles de estado

Paso 4: Cada 2.5s (o cada mensaje MQTT) llegan nuevos datos
        └─> snapshot coalescido actualiza escena 3D
        └─> evento 'data' actualiza sparklines y gauges

Paso 5: Operario identifica anomalías:
        └─> Cámara con color rojo en el render 3D
        └─> Badge de alarmas en el sidebar > 0
        └─> KPI de temperatura promedio fuera de rango
```

### 6.2 Escenario: Ver detalle de una cámara

```
Paso 1: Operario hace click en una cámara del render 3D
        └─> O hace click en un status-panel debajo del render

Paso 2: Router cambia a vista "camara-detalle"
        └─> Pausa render 3D general
        └─> Activa render 3D interior de la cámara seleccionada

Paso 3: Frontend muestra:
        └─> Render 3D interior con colorbar de temp/hum
        └─> Readout con valor actual, modo (TEMP/HUM) y setpoint
        └─> Panel de información de la cámara
        └─> Lista de equipos (compresor, evaporador) con estado ON/OFF
        └─> Tabla de alarmas activas de esa cámara

Paso 4: Operario puede cambiar entre modo TEMP y HUM
        └─> Click en toggle de heatmap
        └─> El render 3D interior y la colorbar se actualizan

Paso 5: Operario vuelve al resumen con "← Volver"
        └─> Pausa render de detalle, reanuda render general
```

### 6.3 Escenario: Exportar histórico en CSV

```
Paso 1: Operario navega a vista "Reportes"

Paso 2: Selecciona rango de fechas (opcional)
        └─> Inputs "Desde" / "Hasta"
        └─> Botón "Limpiar" para exportar todo

Paso 3: Operario hace click en una tarjeta de reporte
        └─> Ej: "Temperaturas por cámara"

Paso 4: Frontend construye URL:
        └─> GET /api/history.csv?vars=cam1_temperature,cam2_temperature,...
        └─> Si hay fechas: &from=<ts>&to=<ts>

Paso 5: Navegador descarga archivo CSV directamente
```

### 6.4 Escenario: Ajustar umbrales de alerta

```
Paso 1: Operario navega a vista "Configuración"

Paso 2: Frontend carga umbrales actuales vía GET /api/thresholds
        └─> Muestra sliders/inputs para min / ideal / max
        └─> Umbrales generales + por cámara

Paso 3: Operario edita valores
        └─> Validación en frontend (min < ideal < max)

Paso 4: Operario hace click en "Guardar cambios"
        └─> PUT /api/thresholds con payload validado

Paso 5: Backend valida, guarda atómicamente en data/thresholds.json
        └─> Responde con nuevos umbrales

Paso 6: Frontend aplica nuevos umbrales inmediatamente
        └─> Colorbar se recalcula
        └─> Alarmas se evalúan con nuevos límites
```

---

## 7. KPIs en tiempo real

Los KPIs se calculan directamente desde el snapshot actual:

```
┌─────────────────────────────────────────────────────────────┐
│                       KPIs del Sistema                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Cámaras activas                                             │
│  └── CHAMBERS.filter(c => c.enabled).length                 │
│                                                               │
│  Temperatura promedio                                        │
│  └── average de temp.value de cámaras enabled               │
│                                                               │
│  Humedad promedio                                            │
│  └── average de hum.value de cámaras enabled                │
│                                                               │
│  Consumo actual (kW)                                         │
│  └── sum de power.value de cámaras enabled                  │
│                                                               │
│  COP (Coeficiente de Rendimiento)                            │
│  └── f(sys_eficiencia, consumo total)                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Actualización**: Cada vez que llega un evento `snapshot`, el frontend recalcula y re-renderiza la barra de KPIs (`kpi.js`). Los sparklines (mini-gráficas) se actualizan con cada muestra nueva.

---

## 8. Secuencia temporal de un ciclo de refrigeración

```
Timeline (ticks de 2.5s)
────────────────────────────────────────────────────────────────

  0    20    40    60    80   100   120   140   160   180   200
  │     │     │     │     │     │     │     │     │     │     │
  ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼

  [====COMP ON====]
                 ▲
                 │ temp <= setpoint-3
  [====COMP OFF====]
                    ▲
                    │ Puerta abierta
  [====COMP OFF + PUERTA====]
                            ▲
                            │ Puerta cerrada
  [====COMP OFF====]
                          ▲
                          │ temp >= setpoint+3
  [====COMP ON====]
                 ▲
                 │ Defrost inicia
  [====DEFROST====]
                  ▲
                  │ Defrost finaliza
  [====COMP ON====]

────────────────────────────────────────────────────────────────
Eventos generados durante este ciclo:
  - snapshot updates: cada 2.5s (coalescido a 200ms)
  - event: 'data' por cada variable cambiada
  - eventos de sistema: puerta abierta/cerrada, defrost ini/fin
  - posible alerta: alta temp si excede tolerancia
```

---

## 9. Glosario de flujos

| Término | Significado en este contexto |
|---------|------------------------------|
| **Tick** | Intervalo de 2.5 segundos donde el simulador actualiza temperaturas, humedad, potencia y estados. |
| **Snapshot** | Estado completo de todas las cámaras y variables de sistema en un momento dado. Se transmite por SSE. |
| **Data (evento SSE)** | Cambio individual de una variable. Más ligero que snapshot, se transmite instantáneamente. |
| **Hidratación** | Envío inicial de snapshot a un cliente SSE recién conectado para que pinte sin esperar. |
| **Coalescing** | Agrupar múltiples cambios de snapshot en uno solo para reducir tráfico de red. |
| **Dedup** | Descartar muestras de una misma variable que lleguen más rápido que el intervalo configurado (5s). |
| **Histéresis** | Banda de temperatura alrededor del setpoint donde el compresor mantiene su estado anterior. |
| **Defrost** | Ciclo de deshielo donde se apaga el compresor y se encienden resistencias para eliminar hielo. |
| **COP** | Coeficiente de Rendimiento. Eficiencia del sistema de refrigeración. |
| **Ring buffer** | Estructura de datos circular donde los entries más antiguos se descartan al alcanzar capacidad máxima. |
