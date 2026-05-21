# Instalación

> Guía completa para instalar, configurar y verificar `trazabilidad-cocedores` en entornos de desarrollo y producción.

---

## 1. Requisitos

| Requisito | Versión mínima | Notas |
|-----------|---------------|-------|
| Node.js | ≥ 20.0.0 | ESM nativo requerido. `node --watch` disponible desde v18+. |
| npm | ≥ 9.0.0 | Viene con Node.js 20. |
| Git | Cualquier | Para clonar el repositorio. |
| Navegador | Chrome 90+, Firefox 88+, Edge 90+, Safari 14+ | Soporte ES modules y EventSource (SSE). |

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
cd proyectos-pinsa/trazabilidad-cocedores
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
✓ tests/some.test.js (2 tests) 2ms
Test Files  1 passed (1)
    Tests  2 passed (2)
```

> Si los tests fallan, revisa que `node --version` sea ≥ 20 y que `npm install` haya terminado sin errores.

### Paso 5: Arrancar en modo desarrollo

```bash
npm run dev
```

En la terminal deberías ver:

```
[INFO] simulator starting
[INFO] simulator running
[INFO] HTTP listening on http://0.0.0.0:5002 (build abc123)
```

### Paso 6: Verificar en navegador

Abre <http://localhost:5002>. Deberías ver el dashboard con cocedores, KPIs y alertas.

```
┌──────────────────────────────────────────────────────────┐
│                    Verificación visual                     │
├──────────────────────────────────────────────────────────┤
│  1. Header: "PINSA · Trazabilidad NFC — Cocedores"      │
│  2. Reloj en vivo en la esquina superior derecha         │
│  3. KPIs: Ciclos completados, Carritos procesados, etc. │
│  4. Grid de 11 cocedores con colores de estado           │
│  5. Últimos movimientos: lista de eventos NFC recientes  │
│  6. Badge de conexión: "En tiempo real" (punto verde)   │
└──────────────────────────────────────────────────────────┘
```

### Paso 7: Verificar API

```bash
curl http://localhost:5002/api/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "uptime": 42,
  "sse_clients": 1,
  "build": "abc123"
}
```

También prueba:

```bash
curl http://localhost:5002/api/config | head -20
curl http://localhost:5002/api/data | head -50
```

---

## 3. Variables de entorno completas

### Variables de usuario (editar en `.env`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MOCK_DATA` | `true` | `true` = usa simulador. `false` = espera driver real (no implementado). |
| `WEB_HOST` | `0.0.0.0` | Dirección IP de bind. `0.0.0.0` escucha en todas las interfaces. `127.0.0.1` solo local. |
| `WEB_PORT` | `5002` | Puerto HTTP. Asegúrate que no esté ocupado. |
| `LOG_LEVEL` | `info` | Nivel de logs: `debug` (todo), `info` (default), `warn`, `error`. |

### Constantes del simulador (editar en `src/config.js`)

Estas no se leen de `.env` por diseño (son constantes del dominio), pero puedes modificarlas en el código fuente si necesitas ajustar el comportamiento del simulador:

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `SIM_TICK_MS` | `2500` | Intervalo entre ticks del simulador (ms). En cada tick se actualizan temperaturas, timers y estados. |
| `SIM_NFC_MIN_MS` | `8000` | Tiempo mínimo entre eventos NFC sintéticos (ms). |
| `SIM_NFC_MAX_MS` | `18000` | Tiempo máximo entre eventos NFC sintéticos (ms). El intervalo real es aleatorio entre min y max. |
| `SSE_THROTTLE_MS` | `200` | Coalescing de snapshots SSE. Agrupa cambios en ventanas de 200ms. |
| `ALERT_DEBOUNCE_MS` | `250` | Debounce para alertas. Evita spam de alertas rápidas. |

### Buffers y límites (editar en `src/config.js`)

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `MOV_RING_LIMIT` | `5000` | Tamaño máximo del ledger de movimientos en memoria. A ~1 evento cada 15s, cubre ~24h. |
| `ALERTS_RING_LIMIT` | `500` | Tamaño máximo del buffer de alertas históricas. |
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
pm2 start src/index.js --name trazabilidad-cocedores
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
│  [ ] http://localhost:5002 carga el dashboard             │
│  [ ] /api/health devuelve {ok: true, ...}                  │
│  [ ] /api/config devuelve catálogo de cocedores/recetas    │
│  [ ] /api/data devuelve snapshot con 11 cocedores          │
│  [ ] El reloj en el header actualiza cada segundo          │
│  [ ] El badge "En tiempo real" muestra punto verde        │
│  [ ] Hay movimientos apareciendo en "Últimos movimientos" │
│  [ ] Los cocedores cambian de estado (azul, verde, amber)  │
│  [ ] No hay errores 404 en la consola del navegador        │
│  [ ] La carpeta logs/ se crea y tiene archivos .log      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Troubleshooting

### Problema: `EADDRINUSE` — Puerto 5002 ocupado

**Síntoma:**

```
Error: listen EADDRINUSE: address already in use :::5002
```

**Solución:**

```bash
# Encontrar quién usa el puerto
# Linux/Mac:
lsof -i :5002
# Windows:
netstat -ano | findstr :5002

# Matar el proceso (Linux/Mac):
kill -9 <PID>

# O cambiar el puerto en .env:
WEB_PORT=5003
```

### Problema: El dashboard se ve vacío (sin cocedores)

**Síntoma:** Grid de cocedores vacío, KPIs en 0.

**Causas posibles:**
1. El simulador no arrancó. Revisa logs: ¿ves `[INFO] simulator running`?
2. El frontend no recibió el evento `snapshot`. Revisa consola del navegador (F12 → Network → EventStream).
3. `MOCK_DATA=false` pero no hay driver real. Pon `MOCK_DATA=true` en `.env`.

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
# El frontend cachea assets por 1h (maxAge: '1h')
# Forzar recarga sin caché:
#   Ctrl + Shift + R  (Windows/Linux)
#   Cmd + Shift + R   (Mac)

# O borrar caché del navegador para localhost:5002
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
trázabilidad-cocedores/
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
│   ├── config.js         # Constantes y variables de entorno
│   ├── cocedoresMap.js   # Catálogo estático
│   ├── snapshotStore.js  # Estado en memoria de cocedores
│   ├── movimientosStore.js  # Ledger NFC
│   ├── alertasStore.js   # Alertas activas/histórico
│   ├── mockSimulator.js   # Motor de simulación
│   ├── sseHub.js         # Hub de SSE
│   └── logger.js         # Configuración de winston
│
├── public/               # Frontend estático
│   ├── index.html
│   ├── css/              # Estilos
│   ├── js/               # Módulos JS
│   └── images/           # Assets
│
├── data/                 # Persistencia JSON (futuro)
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
│  [ ] WEB_PORT=5002 (o el puerto expuesto por el proxy)     │
│  [ ] MOCK_DATA=true (hasta que haya driver real)          │
│  [ ] Firewall: solo puertos necesarios abiertos             │
│  [ ] Proxy inverso (nginx/traefik) con SSL/TLS             │
│  [ ] PM2/systemd para keep-alive y logs de proceso         │
│  [ ] Rotación de logs de sistema (logrotate)               │
│  [ ] Backup de carpeta data/ si se habilita persistencia   │
│  [ ] Monitoreo: /api/health para uptime checks              │
└─────────────────────────────────────────────────────────────┘
```

### Ejemplo de configuración nginx

```nginx
server {
    listen 80;
    server_name trazabilidad.pinsa.local;

    location / {
        proxy_pass http://127.0.0.1:5002;
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
curl http://localhost:5002/api/health | jq
```
