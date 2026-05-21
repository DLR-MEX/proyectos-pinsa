# proyectos-pinsa

> Repositorio de servicios y aplicaciones internas para **PINSA Congelados, Planta Mazatlán**.
> Cada carpeta raíz es un proyecto independiente con su propio stack, servidor y ciclo de vida.

---

## Filosofía de Arquitectura

Este monorepo agrupa servicios autónomos que comparten una misma filosofía de desarrollo:

| Principio | Decisión |
|-----------|----------|
| **Simplicidad** | Vanilla JS + CSS plano en frontend. Sin frameworks pesados (React, Angular, Vue). |
| **Performance** | Sin bundlers innecesarios. ESM nativo en Node.js y navegador. |
| **Realtime ligero** | SSE (Server-Sent Events) en lugar de WebSockets para push unidireccional. |
| **Sin dependencias de charts** | SVG inline + Canvas nativo para visualizaciones. |
| **Simulación-first** | Cada servicio corre 100 % simulado por defecto (`MOCK_DATA=true`), sin necesidad de hardware/PLC/SCADA para desarrollo y demos. |
| **Stack coherente** | Node ≥20, Express, helmet, winston, vitest. |

---

## Proyectos Actuales

```
proyectos-pinsa/
│
├── trazabilidad-cocedores/     Dashboard de trazabilidad NFC de carritos de atún
│                               en cocedores cilíndricos. Puerto 5002.
│
└── (futuros: cocedores-pinsa refrigeración — puerto 5001,
              Malinalco-render — puerto 5000)
```

### 1. trazabilidad-cocedores

**Dashboard de trazabilidad NFC de carritos de atún** en cocedores cilíndricos.

- **11 cocedores** lineales · capacidad **28 carritos** c/u.
- **Lector NFC portátil**: el operario escanea tag del carrito + tag del cocedor.
- **100 % simulado** por defecto (sin MQTT/SCADA/PLC). El simulador genera movimientos, temperaturas y alertas con `MOCK_DATA=true`.

**Stack**: Node ≥20 ESM · Express 4 · SSE propio · winston · Vanilla JS ES modules · inline SVG/canvas · vitest

📄 [Ver documentación completa →](./trazabilidad-cocedores/)

---

## Convenciones del Monorepo

- Cada proyecto tiene su propio `package.json`, `README.md` y opcionalmente carpeta `docs/`.
- Los puertos están reservados para evitar colisiones en desarrollo local:
  - `5000` — Malinalco-render
  - `5001` — cocedores-pinsa (refrigeración)
  - `5002` — trazabilidad-cocedores
- No hay dependencias compartidas en la raíz; cada servicio es autocontenido.
- Todos usan `node --watch` para desarrollo (`npm run dev`).
- Tests con `vitest` (`npm test`).

---

## Cómo Empezar

```bash
# 1. Clonar el repositorio
git clone <url> proyectos-pinsa
cd proyectos-pinsa

# 2. Entrar al proyecto deseado
cd trazabilidad-cocedores

# 3. Instalar y arrancar
npm install
npm run dev   # o npm start para producción
```

---

## Contribuir

- Cada proyecto es independiente; trabaja dentro de su carpeta.
- Respeta el stack y estilo del proyecto existente.
- Documenta cambios significativos en el `README.md` o `docs/` del proyecto.

---

## Licencia

Propietaria — **PINSA Congelados**.
