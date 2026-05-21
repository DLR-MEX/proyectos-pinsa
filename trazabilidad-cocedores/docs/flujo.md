# Flujo de Datos

> Descripción completa del flujo de información end-to-end: desde el escaneo NFC hasta la actualización del dashboard, pasando por estados, alertas y movimientos.

---

## 1. Flujo de datos end-to-end (vista general)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO COMPLETO                                     │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │ Operario     │
    │ (lector NFC) │
    └──────┬───────┘
           │ Scan tag carrito + tag cocedor
           ▼
    ┌──────────────┐     POST /api/movimiento     ┌──────────────────────────┐
    │  Lector NFC   │ ────────────────────────────> │    Express Server         │
    │  (portátil)   │                             │    (server.js)            │
    └──────────────┘                             └────────────┬─────────────┘
                                                            │
                                                            ▼
                                            ┌──────────────────────────────┐
                                            │      Validación              │
                                            │  - cocedor existe?           │
                                            │  - estado permite evento?    │
                                            │  - rate limit OK?            │
                                            └──────────────┬───────────────┘
                                                           │
                              ┌────────────────────────────┼────────────────────────────┐
                              │                            │                            │
                              ▼                            ▼                            ▼
                    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
                    │ snapshotStore   │          │movimientosStore │          │ alertasStore    │
                    │ updateCocedor() │          │recordMovimiento│          │ (si aplica)     │
                    │ setTemperatura()│          │                │          │                 │
                    └────────┬────────┘          └────────┬────────┘          └────────┬────────┘
                             │                            │                            │
                             │     EventEmitter           │     EventEmitter           │     EventEmitter
                             │     onChange               │     onMov                  │     onAlert / onResolve
                             ▼                            ▼                            ▼
                    ┌─────────────────────────────────────────────────────────────────────────────┐
                    │                              SSE Hub (sseHub.js)                              │
                    │                                                                               │
                    │  broadcastSnapshot(data) ──> event: snapshot                                │
                    │  broadcastMov(data)      ──> event: mov                                     │
                    │  broadcastAlert(data)    ──> event: alert                                   │
                    └─────────────────────────────────┬─────────────────────────────────────────────┘
                                                      │
                                                      │ SSE stream (HTTP persistente)
                                                      ▼
                    ┌─────────────────────────────────────────────────────────────────────────────┐
                    │                           FRONTEND (Navegador)                                  │
                    │                                                                               │
                    │  stream.js recibe eventos  ──>  Actualiza stores locales  ──>  Re-render UI  │
                    │                                                                               │
                    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
                    │  │cocedoresStage│  │ultimosMovs   │  │ alertasPanel│                      │
                    │  │ (SVG grid)   │  │ (lista)      │  │ (notificaciones)│                  │
                    │  └──────────────┘  └──────────────┘  └──────────────┘                      │
                    └─────────────────────────────────────────────────────────────────────────────┘
```

**Resumen**: El operario escanea un tag → el servidor valida y actualiza 3 stores → cada store emite eventos → el SSE Hub transmite a todos los navegadores conectados → el frontend actualiza la UI en tiempo real.

---

## 2. Ciclo de vida de un carrito

Un carrito de atún atraviesa 5 etapas de trazabilidad:

```
EVISCERADO ──scan──> ENTRADA COCEDOR ──auto──> EN PROCESO ──fin timer──> LISTO
    │                        │                    │                         │
    │                        │                    │                         │
    │                        ▼                    ▼                         ▼
    │                   ┌─────────┐        ┌─────────┐               ┌─────────┐
    │                   │registrar │        │temp+time│               │esperando│
    │                   │mov NFC   │        │monitor  │               │descarga │
    │                   │event: IN │        │alertas  │               │         │
    │                   └─────────┘        └─────────┘               └────┬────┘
    │                                                                    │
    │                    ▲                                              │
    └────────────────────┘scan (event: OUT)                          │
           SALIDA COCEDOR <─────────────────────────────────────────────┘
                 │
                 │ scan
                 ▼
           ┌──────────┐
           │ EMPAQUE  │
           │ (destino)│
           └──────────┘
```

### Etapas detalladas

| Etapa | Evento NFC | Descripción | Quién lo genera |
|-------|-----------|-------------|----------------|
| **Eviscerado** | `EVISCERADO` | El carrito se crea en la línea de eviscerado. Se le asigna lote, talla y subtalla. | Simulador o sistema externo |
| **Entrada cocedor** | `IN` | El operario escanea el tag del carrito y el tag del cocedor destino. El carrito entra al slot disponible. | Lector NFC real o simulador |
| **En proceso** | — | El carrito permanece dentro del cocedor mientras el ciclo corre. Temperatura y timer se monitorean. | Simulador (ticks automáticos) |
| **Salida cocedor** | `OUT` | El ciclo terminó (estado LISTO). El operario escanea para sacar el carrito. | Lector NFC real o simulador |
| **Empaque** | `EMPAQUE` | El carrito llega a su destino final según la receta (Deshuesado, Enlatado, Lomo). | Simulador o sistema externo |

### Ejemplo de movimientos de un carrito

```json
[
  { "ts": 1715701200000, "evento": "EVISCERADO", "carritoId": "CAR-000150", "lote": "L-240515-01", "talla": "14-16", "subtalla": "A" },
  { "ts": 1715702400000, "evento": "IN", "carritoId": "CAR-000150", "cocedorId": "cs02", "lote": "L-240515-01", "operario": "MARIA G.", "talla": "14-16", "subtalla": "A" },
  { "ts": 1715706000000, "evento": "OUT", "carritoId": "CAR-000150", "cocedorId": "cs02", "lote": "L-240515-01", "operario": "MARIA G.", "talla": "14-16", "subtalla": "A" },
  { "ts": 1715706600000, "evento": "EMPAQUE", "carritoId": "CAR-000150", "lote": "L-240515-01", "talla": "14-16", "subtalla": "A", "destino": "Deshuesado" }
]
```

---

## 3. Ciclo de vida de un cocedor

```
                    operario marca
                        "en mantenimiento"
  ┌─────────┐    ───────────────────────────>    ┌───────────────┐
  │  ESPERA │                                      │ MANTENIMIENTO │
  │(vacío)  │    <───────────────────────────    │ (no disponible)│
  └───┬─────┘         operario marca "listo"       └───────┬───────┘
      │                                                   │
      │ operario marca "listo"                            │ operario marca "listo"
      ▼                                                   ▼
  ┌─────────────┐                                    ┌─────────┐
  │ EN_PROCESO  │                                    │  ESPERA  │
  │(carga+timer)│                                    │(disponible)│
  └──────┬──────┘                                    └─────────┘
         │
         │ timer finaliza
         ▼
     ┌────────┐    operario descarga    ┌─────────┐
     │ LISTO  │ ──────────────────────> │  ESPERA │
     │(espera)│                         │(vacío)  │
     └────────┘                         └─────────┘
```

### Transiciones de estado

| Estado actual | Evento | Nuevo estado | Condiciones |
|---------------|--------|------------|-------------|
| `ESPERA` | Operario marca "listo" / carga carritos | `EN_PROCESO` | Cocedor vacío, operario asignado, receta seleccionada |
| `EN_PROCESO` | Timer alcanza 0 | `LISTO` | Todos los carritos completaron el tiempo de cocción |
| `LISTO` | Operario descarga | `ESPERA` | Todos los carritos fueron retirados |
| `ESPERA` | Operario marca "mantenimiento" | `MANTENIMIENTO` | Operario con permisos |
| `MANTENIMIENTO` | Operario marca "listo" | `ESPERA` | Mantenimiento completado |
| `ESPERA` | Administrador desactiva | `DESACTIVADO` | Fuera de servicio prolongado |
| `DESACTIVADO` | Administrador activa | `ESPERA` | Reparación completada |

**Restricciones**:
- Un cocedor en `MANTENIMIENTO` o `DESACTIVADO` no puede recibir carritos.
- Un cocedor `EN_PROCESO` no puede cambiar a otro estado excepto `LISTO` (automático) o `MANTENIMIENTO` (forzado, detiene ciclo).
- Un cocedor `LISTO` debe descargarse completamente antes de volver a `ESPERA`.

---

## 4. Eventos NFC (detalle)

### 4.1 ¿Quién genera los eventos NFC?

```
Modo MOCK_DATA=true (simulación):
┌─────────────────┐     aleatorio 8-18s     ┌────────────────────────┐
│  mockSimulator  │ ───────────────────────> │  Evento NFC sintético  │
│  (automático)   │                        │  IN / OUT / EVISCERADO │
└─────────────────┘                        └───────────┬────────────┘
                                                       │
                                                       ▼
                                               ┌───────────────┐
                                               │ server.js     │
                                               │ POST /api/... │
                                               └───────────────┘

Modo MOCK_DATA=false (producción futura):
┌─────────────────┐     scan físico         ┌────────────────────────┐
│  Lector NFC     │ ─────────────────────> │  POST /api/movimiento  │
│  (operario)     │  {tagCarrito,           │  desde driver MQTT/    │
│                 │   tagCocedor}           │  middleware HTTP       │
└─────────────────┘                        └────────────────────────┘
```

### 4.2 Flujo de un evento NFC (IN)

```
1. Operario escanea tag del carrito
   └─> El lector envía: { tagCarrito: "CAR-000150", tagCocedor: "cs02", operario: "op002" }

2. server.js recibe POST /api/movimiento
   └─> Valida: cocedor existe? estado permite entrada? carrito existe?

3. snapshotStore.updateCocedor("cs02", (cocedor) => {
   └─> Agrega carrito al primer slot disponible
   └─> Si cocedor estaba en ESPERA y ahora tiene carritos:
       └─> Cambia estado a EN_PROCESO
       └─> Asigna inicioCiclo = ahora
       └─> Calcula finProyectado = inicioCiclo + receta.durMin
   })

4. movimientosStore.recordMovimiento({...})
   └─> Agrega al ring buffer
   └─> Emite: onMov(newEntry)

5. alertasStore (si aplica)
   └─> Si cocedor estaba vacío hace >X tiempo: fireAlert(INACTIVIDAD)

6. SSE Hub broadcast
   └─> broadcastSnapshot(snapshotStore.getAll())  [coalesced 200ms]
   └─> broadcastMov(newEntry)                       [instantáneo]
   └─> broadcastAlert(alerta)                       [instantáneo]

7. Frontend
   └─> stream.js recibe event: snapshot → cocedoresStage.re-render()
   └─> stream.js recibe event: mov       → ultimosMovimientos.prepend()
   └─> stream.js recibe event: alert     → alertasPanel.show()
```

### 4.3 Flujo de un evento NFC (OUT)

```
1. Operario escanea tag del carrito en cocedor LISTO

2. server.js valida: cocedor en LISTO? carrito existe dentro?

3. snapshotStore.updateCocedor("cs02", (cocedor) => {
   └─> Remueve carrito del slot
   └─> Si cocedor queda vacío:
       └─> Cambia estado a ESPERA
       └─> Limpia loteActual, operario, timers
   })

4. movimientosStore.recordMovimiento({ evento: "OUT", ... })

5. snapshotStore emite onChange → SSE broadcastSnapshot()
   movimientosStore emite onMov → SSE broadcastMov()

6. Frontend actualiza grid de cocedores y lista de movimientos
```

---

## 5. Alertas

### 5.1 Condiciones que disparan alertas

```
┌──────────────────────────────────────────────────────────────┐
│                    CONDICIONES DE ALERTA                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  TEMPERATURA                                                  │
│  ├── temp > setpoint + tolTemp  ──>  ALERTA: TEMP_ALTA       │
│  └── temp < setpoint - tolTemp  ──>  ALERTA: TEMP_BAJA      │
│                                                               │
│  TIEMPO                                                       │
│  └── timer > durMin + tolTiempo ──>  ALERTA: TIEMPO_EXCEDIDO│
│                                                               │
│  CICLO                                                        │
│  └── timer llega a 0            ──>  ALERTA: CICLO_COMPLETADO│
│      (resuelta automáticamente al descargar)                  │
│                                                               │
│  INACTIVIDAD                                                  │
│  └── cocedor ESPERA sin uso > X minutos                       │
│      (configurable)                                           │
│                                                               │
│  NFC                                                          │
│  └── carrito escaneado en cocedor incorrecto                  │
│      (ej. IN en cocedor EN_PROCESO sin capacidad)            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Ciclo de vida de una alerta

```
┌─────────────┐     condición detectada      ┌─────────────┐
│  Sistema    │ ───────────────────────────> │   ACTIVA    │
│  (simulador │                              │  (rojo)     │
│   o valid.) │                              │             │
└─────────────┘                              └──────┬──────┘
                                                    │
                                                    │ broadcastAlert()
                                                    ▼
                                           ┌─────────────────┐
                                           │ Frontend muestra │
                                           │ notificación     │
                                           │ roja + sonido    │
                                           └─────────────────┘
                                                    │
                              operario resuelve     │ auto-resuelve
                              (descarga, ajuste)    │ (timer)
                              o condición desaparece│
                                                    │
                                                    ▼
                                           ┌─────────────┐
                                           │  RESUELTA   │
                                           │  (verde)    │
                                           └──────┬──────┘
                                                  │
                                                  │ broadcastAlert({resolved:true})
                                                  ▼
                                         ┌─────────────────┐
                                         │ Frontend oculta  │
                                         │ notificación     │
                                         │ o muestra verde  │
                                         └─────────────────┘
                                                  │
                                                  ▼
                                         ┌─────────────┐
                                         │  HISTÓRICO  │
                                         │ (alertasStore│
                                         │  ring buffer)│
                                         └─────────────┘
```

### 5.3 Ejemplo de alerta

```json
{
  "id": "alert-1715702400000-cs02-temp",
  "tipo": "TEMP_ALTA",
  "cocedorId": "cs02",
  "mensaje": "Temperatura 245°C excede setpoint 232°C + tolerancia 8°C",
  "timestamp": 1715702400000,
  "resolved": false,
  "resolvedAt": null,
  "resolutor": null
}
```

Al resolverse:

```json
{
  "id": "alert-1715702400000-cs02-temp",
  "tipo": "TEMP_ALTA",
  "cocedorId": "cs02",
  "mensaje": "...",
  "timestamp": 1715702400000,
  "resolved": true,
  "resolvedAt": 1715703000000,
  "resolutor": "LUIS R."
}
```

---

## 6. Movimientos (ledger)

### 6.1 Estructura del ring buffer

```
┌─────────────────────────────────────────────────────────────┐
│              movimientosStore (ring buffer)                 │
├─────────────────────────────────────────────────────────────┤
│  Capacidad máxima: 5000 entries (~24h a 1 evento/15s)     │
│                                                               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐     ┌─────┐      │
│  │  1  │ │  2  │ │  3  │ │  4  │ │  5  │ ... │ 5000│      │
│  └──┬──┘ └─────┘ └─────┘ └─────┘ └─────┘     └─────┘      │
│     │                                                        │
│     └─> head (más reciente)                                  │
│     └─> tail (más antiguo, se sobreescribe cuando lleno)    │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Campos de un movimiento

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ts` | number (ms) | Timestamp Unix del evento |
| `evento` | string | `IN` \| `OUT` \| `EVISCERADO` \| `EMPAQUE` |
| `carritoId` | string | Identificador del carrito (ej. `CAR-000150`) |
| `cocedorId` | string? | Solo para `IN`/`OUT`. Identificador del cocedor (ej. `cs02`) |
| `lote` | string | Lote de producción (ej. `L-240515-01`) |
| `operario` | string | Nombre del operario (ej. `MARIA G.`) |
| `talla` | string | Talla del atún (ej. `14-16`) |
| `subtalla` | string | Subtalla (ej. `A`) |
| `destino` | string? | Solo para `EMPAQUE`. Destino final (`Deshuesado` \| `Enlatado` \| `Lomo`) |
| `slot` | number? | Solo para `IN`. Posición dentro del cocedor (1-28) |

### 6.3 Exportación CSV

Los endpoints `/api/movimientos.csv` y `/api/ciclos.csv` generan archivos CSV para descarga directa.

**Ejemplo de movimientos.csv:**

```csv
timestamp,evento,carritoId,cocedorId,lote,operario,talla,subtalla,destino
2024-05-15T08:00:00Z,EVISCERADO,CAR-000150,,L-240515-01,MARIA G.,14-16,A,
2024-05-15T08:20:00Z,IN,CAR-000150,cs02,L-240515-01,MARIA G.,14-16,A,
2024-05-15T09:20:00Z,OUT,CAR-000150,cs02,L-240515-01,MARIA G.,14-16,A,
2024-05-15T09:30:00Z,EMPAQUE,CAR-000150,,L-240515-01,MARIA G.,14-16,A,Deshuesado
```

**Ejemplo de ciclos.csv:**

```csv
cocedorId,inicioCiclo,finCiclo,duracionMin,carritosCount,lote,operario,receta
02,2024-05-15T08:20:00Z,2024-05-15T09:20:00Z,60,24,L-240515-01,MARIA G.,14-16
```

---

## 7. Interacción del operario (paso a paso)

### 7.1 Escenario: Cargar carritos en un cocedor

```
Paso 1: Operario ve dashboard
        └─> Identifica cocedor en ESPERA (color ámbar)

Paso 2: Operario selecciona cocedor en la UI
        └─> Se abre panel de detalle con botón "Cargar"

Paso 3: Operario escanea tag del carrito con lector NFC
        └─> El lector envía señal al sistema (simulado o real)

Paso 4: Sistema valida
        └─> ¿Carrito existe? SÍ
        └─> ¿Cocedor existe y está en ESPERA? SÍ
        └─> ¿Hay slots disponibles? SÍ (capacidad 28)

Paso 5: Sistema actualiza estado
        └─> snapshotStore: agrega carrito al slot, cambia a EN_PROCESO
        └─> movimientosStore: registra evento IN
        └─> Inicia timer de cocción según receta de la talla

Paso 6: Dashboard actualiza en tiempo real
        └─> El cocedor cambia de ámbar a azul (EN_PROCESO)
        └─> Aparece el carrito en la lista del cocedor
        └─> Timer empieza a contar regresivamente
        └─> "Últimos movimientos" muestra el evento IN
```

### 7.2 Escenario: Descargar carritos de un cocedor listo

```
Paso 1: Operario ve dashboard
        └─> Identifica cocedor en LISTO (color verde)
        └─> Timer muestra "00:00" o "Completado"

Paso 2: Operario se acerca al cocedor con lector NFC

Paso 3: Operario escanea tag de un carrito dentro del cocedor
        └─> Lector envía: { carritoId, cocedorId, evento: "OUT" }

Paso 4: Sistema valida
        └─> ¿Carrito está en este cocedor? SÍ
        └─> ¿Cocedor está en LISTO? SÍ

Paso 5: Sistema actualiza
        └─> snapshotStore: remueve carrito del slot
        └─> movimientosStore: registra evento OUT
        └─> Si era el último carrito: cambia cocedor a ESPERA

Paso 6: Dashboard actualiza
        └─> Carrito desaparece del cocedor
        └─> Si quedan carritos: sigue en LISTO
        └─> Si quedó vacío: cambia a ESPERA (ámbar)
        └─> "Últimos movimientos" muestra el evento OUT
```

### 7.3 Escenario: Marcar cocedor en mantenimiento

```
Paso 1: Operario selecciona cocedor en dashboard

Paso 2: Clic en "Marcar mantenimiento"
        └─> UI envía: PUT /api/cocedor/cs07/estado
            body: { estado: "MANTENIMIENTO" }

Paso 3: Sistema valida
        └─> ¿Estado es válido? SÍ
        └─> ¿Transición permitida? SÍ (ESPERA → MANTENIMIENTO)

Paso 4: Sistema actualiza
        └─> snapshotStore: cambia estado, detiene timer si estaba EN_PROCESO
        └─> alertasStore: fireAlert(MANTENIMIENTO_INICIADO)

Paso 5: Dashboard actualiza
        └─> Cocedor cambia a gris (#8B9DAE)
        └─> Aparece icono de herramienta/mantenimiento
        └─> No permite cargar carritos
        └─> Alerta amarilla en panel de alertas
```

---

## 8. KPIs en tiempo real

Los KPIs del día se calculan directamente desde `movimientosStore` y se envían en el evento `hydrate` del SSE:

```
┌─────────────────────────────────────────────────────────────┐
│                       KPIs del Día                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Ciclos completados                                          │
│  └── Contar eventos OUT donde cocedor pasó de LISTO a ESPERA│
│                                                               │
│  Carritos procesados                                         │
│  └── Contar eventos IN del día actual                        │
│                                                               │
│  Tiempo promedio de ciclos (min)                             │
│  └── Promedio de (finCiclo - inicioCiclo) para ciclos hoy   │
│                                                               │
│  Eficiencia (%)                                              │
│  └── (ciclos completados / capacidad teórica) × 100         │
│      Capacidad teórica = 11 cocedores × ciclos posibles/día │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Actualización**: Cada vez que llega un evento `mov` o `snapshot`, el frontend recalcula y re-renderiza la barra de KPIs (`kpiBar.js`).

---

## 9. Secuencia temporal de un ciclo completo

```
Timeline (minutos)
────────────────────────────────────────────────────────────────

  0     5    10    15    20    25    30    35    40    45    50
  │     │     │     │     │     │     │     │     │     │     │
  ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼     ▼

  [====ESPERA====]
                 ▲
                 │ IN (carrito 1)
  [========EN_PROCESO========]
                             ▲
                             │ IN (carrito 2)
  [================EN_PROCESO================]
                                             ▲
                                             │ timer=0
  [====================LISTO====================]
                                               ▲
                                               │ OUT (carrito 1)
  [====LISTO====]
               ▲
               │ OUT (carrito 2)
  [====ESPERA====]
                 (listo para nuevo ciclo)

────────────────────────────────────────────────────────────────
Eventos generados durante este ciclo:
  - snapshot updates: cada 2.5s (temperatura)
  - mov IN: 2 eventos
  - mov OUT: 2 eventos
  - alerta CICLO_COMPLETADO: 1 evento
  - alertas TEMP (si temp fluctúa): 0-N eventos
```

---

## 10. Glosario de flujos

| Término | Significado en este contexto |
|---------|------------------------------|
| **Tick** | Intervalo de 2.5 segundos donde el simulador actualiza temperaturas y timers. |
| **Evento NFC** | Lectura de un tag NFC que genera un movimiento (`IN`, `OUT`, etc.). |
| **Snapshot** | Estado completo de todos los cocedores en un momento dado. Se transmite por SSE. |
| **Hidratación** | Envío inicial de datos a un cliente SSE recién conectado (snapshot + últimos movs + alertas + KPIs). |
| **Coalescing** | Agrupar múltiples cambios de snapshot en uno solo para reducir tráfico de red. |
| **Ring buffer** | Estructura de datos circular donde los entries más antiguos se sobreescriben al alcanzar capacidad máxima. |
| **Receta** | Conjunto de parámetros de cocción asociados a una talla de atún. |
| **Ciclo** | Proceso completo de cocción: carga → proceso → descarga. |
| **Slot** | Posición numérica (1-28) que ocupa un carrito dentro del cocedor. |
| **Lote** | Identificador de producción que agrupa carritos de la misma entrada a planta. |
