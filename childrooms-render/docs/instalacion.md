# Instalación

> Guía completa para instalar, configurar y verificar `childrooms-render` en entornos de desarrollo y producción.

---

## 1. Requisitos

| Requisito | Versión mínima | Notas |
|-----------|---------------|-------|
| Node.js | ≥ 20.0.0 | ESM nativo requerido. `node --watch` disponible desde v18+. |
| npm | ≥ 9.0.0 | Viene con Node.js 20. |
| Git | Cualquier | Para clonar el repositorio. |
| Navegador | Chrome 90+, Firefox 88+, Edge 90+, Safari 14+ | Soporte ES modules, EventSource (SSE) y WebGL (Babylon.js). |

**Verificar requisitos:**

```bash
node --version    # Debe decir v20.x.x o superior
npm --version     # Debe decir 9.x.x o superior
```

Si Node.js < 20, descarga la versión LTS desde [nodejs.org](https://nodejs.org/).

---

## 2. Instalación paso a paso

### Paso 1: Clonar el repositorio

```bash
git clone <url-del-repo> proyectos-pinsa
cd proyectos-pinsa/childrooms-render
```

### Paso 2: Instalar dependencias

```bash
npm install
```

Esto instala:
- `express` — servidor web
- `helmet` — headers de seguridad (CSP, HSTS, etc.)
- `cors` — Cross-Origin Resource Sharing
- `express-rate-limit` — rate limiting por IP
- `mqtt` — cliente MQTT para Ubidots
- `winston` + `winston-daily-rotate-file` — logging con rotación diaria
- `dotenv` — variables de entorno
- `vitest` — framework de tests (devDependency)

**Tamaño estimado**: ~15 MB de `node_modules`.

### Paso 3: Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tu editor favorito. Ver la tabla completa en la siguiente sección.

### Paso 4: Verificar instalación

```bash
npm test
```

Debe mostrar algo como:

```
 ✓ tests/chambersMap.test.js (2 tests) 2ms
 ✓ tests/snapshotStore.test.js (4 tests) 3ms
 ✓ tests/historyStore.test.js (3 tests) 2ms
 ✓ tests/thresholdsStore.test.js (2 tests) 1ms

Test Files  4 passed (4)
    Tests  11 passed (11)
```

> Si los tests fallan, revisa que `node --version` sea ≥ 20 y que `npm install` haya terminado sin errores.

### Paso 5: Arrancar en modo desarrollo

```bash
npm run dev
```

En la terminal deberías ver:

```
[INFO] Mock driver started (MOCK_DATA=true)
[INFO] Server listening on http://0.0.0.0:5001 (build=abc123)
```

### Paso 6: Verificar en navegador

Abre <http://localhost:5001>. Deberías ver el dashboard con cámaras, KPIs y el render 3D.

```
┌──────────────────────────────────────────────────────────┐
│                    Verificación visual                     │
├──────────────────────────────────────────────────────────┤
│  1. Header: "PINSA · Sistema de Refrigeración Industrial" │
│  2. Reloj en vivo en la esquina superior derecha         │
│  3. KPIs: Cámaras activas, Temp promedio, Hum, kW, COP  │
│  4. Render 3D con 4 cámaras visibles                     │
│  5. Paneles de estado debajo del render                  │
│  6. Badge de conexión: "EN LÍNEA" (punto verde)         │
│  7. Sidebar con 5 items + badge de alarmas              │
│  8. Gráfica de tendencias de temperatura                 │
│  9. Lista de equipos principales                         │
│ 10. Eventos recientes + sparkline de consumo             │
└──────────────────────────────────────────────────────────┘
```

### Paso 7: Verificar API

```bash
curl http://localhost:5001/api/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "uptime": 42,
  "mqtt_connected": true,
  "sse_clients": 1,
  "build": "abc123"
}
```

También prueba:

```bash
curl http://localhost:5001/api/config | head -30
curl http://localhost:5001/api/data | head -50
```

---

## 3. Variables de entorno completas

### Variables de usuario (editar en `.env`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MOCK_DATA` | `true` | `true` = usa simulador local. `false` = conecta a Ubidots vía MQTT. |
| `UBIDOTS_TOKEN` | _(vacío)_ | Token de API Ubidots. **Requerido** si `MOCK_DATA=false`. |
| `UBIDOTS_DEVICE` | `childrooms` | Label del dispositivo en Ubidots. |
| `MQTT_BROKER` | `industrial.api.ubidots.com` | Broker MQTT sobre TLS. |
| `MQTT_PORT` | `8883` | Puerto del broker (TLS). |
| `WEB_HOST` | `0.0.0.0` | Dirección IP de bind. `0.0.0.0` escucha en todas las interfaces. `127.0.0.1` solo local. |
| `WEB_PORT` | `5001` | Puerto HTTP. Asegúrate que no esté ocupado. |
| `LOG_LEVEL` | `info` | Nivel de logs: `debug` (todo), `info` (default), `warn`, `error`. |
| `CORS_ORIGIN` | _(vacío)_ | Origen CORS permitido. `*` para cualquiera, o lista separada por comas. Si está vacío, CORS no se activa. |

### Constantes físicas (editar en `src/config.js`)

Estas no se leen de `.env` por diseño (son constantes del dominio), pero puedes modificarlas en el código fuente:

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `TEMP_MIN` / `TEMP_MAX` | `-25` / `15` | Rango físico válido de temperatura (°C). |
| `TEMP_VALID_MIN` / `TEMP_VALID_MAX` | `-30` / `20` | Rango de validación para datos MQTT. |
| `HUM_MIN` / `HUM_MAX` | `70` / `100` | Rango físico válido de humedad (%). |
| `POWER_MAX` | `25` | Potencia máxima válida (kW). |
| `TEMP_ALERT_LOW` / `HIGH` | `-22` / `5` | Umbrales de alarma de temperatura. |
| `HUM_ALERT_LOW` / `HIGH` | `78` / `97` | Umbrales de alarma de humedad. |
| `ALERT_WARN_MIN` | `5` | Minutos para que una condición genere warning. |
| `ALERT_ERROR_MIN` | `30` | Minutos para que una condición genere error. |

### Constantes del simulador (editar en `src/config.js`)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `MOCK_INTERVAL_MS` | `2500` | Intervalo entre ticks del simulador (ms). |

### Buffers y límites (editar en `src/config.js` y archivos de stores)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `MAX_SAMPLES_PER_VAR` | `8640` | Muestras por variable en `historyStore` (~12h a 5s). |
| `MAX_ALARMS` | `500` | Alarmas históricas en memoria. |
| `DEDUP_INTERVAL_MS` | `5000` | Dedup de muestras en `historyStore`. |
| `RATE_READ_PER_MIN` | `600` | Límite de requests GET por minuto por IP. |
| `RATE_WRITE_PER_MIN` | `60` | Límite de requests POST/PUT por minuto por IP. |

---

## 4. Modos de ejecución

### Modo desarrollo (recomendado para coding)

```bash
npm run dev
```

- Usa `node --watch` (disponible en Node ≥ 18).
- Reinicio automático al cambiar archivos `.js`, `.css`, `.html`.
- Logs en consola con colores.

### Modo producción

```bash
npm start
```

- Ejecuta `node src/index.js` sin watch.
- Asegúrate de configurar `LOG_LEVEL=info` o `warn` para reducir ruido.
- Considera usar `pm2` o `systemd` para gestión de procesos:

```bash
# Ejemplo con pm2
npm install -g pm2
pm2 start src/index.js --name childrooms-render
pm2 save
pm2 startup
```

### Modo test

```bash
npm test
```

- Ejecuta `vitest run` (una sola pasada, no watch).
- Útil para CI/CD.

---

## 5. Verificación post-instalación (checklist)

```
┌─────────────────────────────────────────────────────────────┐
│              Checklist de Verificación                       │
├─────────────────────────────────────────────────────────────┤
│  [ ] node --version >= v20.0.0                              │
│  [ ] npm install completó sin errores                       │
│  [ ] Archivo .env existe (copiado de .env.example)         │
│  [ ] npm test pasa (todos los tests en verde)              │
│  [ ] npm run dev arranca sin errores                       │
│  [ ] http://localhost:5001 carga el dashboard             │
│  [ ] /api/health devuelve {ok: true, ...}                  │
│  [ ] /api/config devuelve catálogo de cámaras/variables    │
│  [ ] /api/data devuelve snapshot con 4 cámaras activas     │
│  [ ] El reloj en el header actualiza cada segundo          │
│  [ ] El badge "EN LÍNEA" muestra punto verde              │
│  [ ] Hay eventos apareciendo en "Eventos recientes"        │
│  [ ] Las cámaras cambian de color en el render 3D          │
│  [ ] No hay errores 404 en la consola del navegador        │
│  [ ] La carpeta logs/ se crea y tiene archivos .log      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Troubleshooting

### Problema: `EADDRINUSE` — Puerto 5001 ocupado

**Síntoma:**

```
Error: listen EADDRINUSE: address already in use :::5001
```

**Solución:**

```bash
# Encontrar quién usa el puerto
# Linux/Mac:
lsof -i :5001
# Windows:
netstat -ano | findstr :5001

# Matar el proceso (Linux/Mac):
kill -9 <PID>

# O cambiar el puerto en .env:
WEB_PORT=5003
```

### Problema: El dashboard se ve vacío (sin cámaras)

**Síntoma:** Render 3D vacío, KPIs en 0.

**Causas posibles:**
1. El driver no arrancó. Revisa logs: ¿ves `Mock driver started` o `MQTT connected`?
2. El frontend no recibió el evento `snapshot`. Revisa consola del navegador (F12 → Network → EventStream).
3. `MOCK_DATA=false` pero no hay token Ubidots. Pon `MOCK_DATA=true` en `.env`.

### Problema: MQTT no se conecta

**Síntoma:** `mqtt_connected: false` en `/api/health`.

**Causas posibles:**
1. `UBIDOTS_TOKEN` está vacío o es inválido.
2. Firewall bloquea puerto 8883 (MQTT over TLS).
3. `UBIDOTS_DEVICE` no coincide con el label en la plataforma.

**Solución:**

```bash
# Verificar token
curl -X GET https://industrial.api.ubidots.com/api/v1.6/devices/ \
  -H "X-Auth-Token: <TU_TOKEN>"

# Verificar conectividad al broker
nc -zv industrial.api.ubidots.com 8883
# o en Windows:
Test-NetConnection -ComputerName industrial.api.ubidots.com -Port 8883
```

### Problema: Logs no se escriben en archivo

**Síntoma:** Solo ves logs en consola, nada en `logs/`.

**Solución:**

```bash
# Verificar permisos de escritura
mkdir -p logs
chmod 755 logs   # Linux/Mac

# En Windows, asegúrate de que el proceso tenga permisos de escritura
# en la carpeta del proyecto.
```

### Problema: Cambios en el código no se reflejan

**Síntoma:** Editaste un archivo `.js` pero el navegador sigue viendo la versión vieja.

**Solución:**

```bash
# El frontend usa Cache-Control: no-store, pero el navegador puede cachear
# assets por la query string ?v=BUILD_VERSION.
# Forzar recarga sin caché:
#   Ctrl + Shift + R  (Windows/Linux)
#   Cmd + Shift + R   (Mac)

# O borrar caché del navegador para localhost:5001
```

### Problema: `Cannot find module` al arrancar

**Síntoma:**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'express'
```

**Solución:**

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### Problema: Tests fallan

**Síntoma:** `npm test` muestra errores.

**Solución:**

```bash
# Verificar versión de Node
node --version   # Debe ser >= v20

# Reinstalar
rm -rf node_modules
npm install
npm test
```

Si persiste, revisa el error específico en `tests/` y ajusta según el mensaje.

### Problema: SSE se desconecta constantemente

**Síntoma:** El badge de conexión alterna entre verde y rojo.

**Causas:**
1. **Proxy intermedio**: Si usas nginx o similar, asegúrate de que no haga buffering de SSE:
   ```nginx
   proxy_buffering off;
   proxy_cache off;
   ```
2. **Timeout del navegador**: EventSource reconecta automáticamente. Si falla repetidamente, revisa que el servidor no esté caído.
3. **Firewall/antivirus**: Algunos firewalls corporativos bloquean conexiones persistentes HTTP.

---

## 7. Estructura de archivos relevantes

```
childrooms-render/
│
├── .env.example          # Template de variables de entorno
├── .env                  # Tu configuración local (no commitear)
├── .gitignore            # Ignora node_modules, logs, data, .env
│
├── package.json          # Dependencias y scripts
├── package-lock.json     # Lock de versiones
│
├── src/
│   ├── index.js          # Entry point
│   ├── server.js         # Express app + rutas
│   ├── config.js         # Constantes físicas y variables de entorno
│   ├── chambersMap.js    # Catálogo estático de cámaras y variables
│   ├── snapshotStore.js  # Estado en memoria de cámaras
│   ├── historyStore.js   # Buffers históricos + CSV builders
│   ├── thresholdsStore.js # Umbrales persistidos JSON
│   ├── mockDriver.js     # Motor de simulación
│   ├── mqttClient.js     # Cliente Ubidots MQTT
│   ├── sseHub.js         # Hub de SSE
│   └── logger.js         # Configuración de winston
│
├── public/               # Frontend estático
│   ├── index.html
│   ├── css/              # Estilos
│   ├── js/               # Módulos JS
│   └── images/           # Assets
│
├── data/                 # Persistencia JSON (thresholds)
├── logs/                 # Logs rotados por día
│   └── YYYY-MM/
│       └── YYYY-MM-DD.log
│
├── tests/                # Tests con vitest
│   └── (archivos .test.js)
│
└── docs/                 # Documentación
    ├── arquitectura.md
    ├── instalacion.md
    └── flujo.md
```

---

## 8. Despliegue en producción (checklist)

```
┌─────────────────────────────────────────────────────────────┐
│              Checklist de Producción                         │
├─────────────────────────────────────────────────────────────┤
│  [ ] NODE_ENV=production (aunque no se use explícitamente)  │
│  [ ] LOG_LEVEL=info o warn                                  │
│  [ ] WEB_HOST=0.0.0.0 (o IP específica del servidor)       │
│  [ ] WEB_PORT=5001 (o el puerto expuesto por el proxy)     │
│  [ ] MOCK_DATA=false (si hay conexión MQTT real)           │
│  [ ] UBIDOTS_TOKEN configurado y válido                     │
│  [ ] Firewall: solo puertos necesarios abiertos             │
│  [ ] Proxy inverso (nginx/traefik) con SSL/TLS             │
│  [ ] PM2/systemd para keep-alive y logs de proceso         │
│  [ ] Rotación de logs de sistema (logrotate)               │
│  [ ] Backup de carpeta data/ (thresholds.json)             │
│  [ ] Monitoreo: /api/health para uptime checks              │
└─────────────────────────────────────────────────────────────┘
```

### Ejemplo de configuración nginx

```nginx
server {
    listen 80;
    server_name refrigeracion.pinsa.local;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }
}
```

> **Importante**: `proxy_buffering off` y `proxy_cache off` son obligatorios para que SSE funcione correctamente detrás de nginx.

---

## 9. Comandos útiles

```bash
# Arrancar en desarrollo
npm run dev

# Arrancar en producción
npm start

# Ejecutar tests
npm test

# Ver logs en tiempo real (Linux/Mac)
tail -f logs/$(date +%Y-%m)/$(date +%F).log

# Ver logs en tiempo real (Windows PowerShell)
Get-Content logs\$(Get-Date -Format "yyyy-MM")\$(Get-Date -Format "yyyy-MM-dd").log -Wait

# Ver versión del build
curl http://localhost:5001/api/health | jq
```
