# Pruebas de ajuste del render 3D — Detalle Cocedor

Archivo de bitácora: todo lo intentado en `scene3dDetalleCocedor.js` para ajustar los paneles de carritos dentro del GLB `CAMARA+CARRITOS.glb`.

---

## Modelo GLB: CAMARA+CARRITOS.glb

- **1 sola malla fusionada** — 760,838 vértices, ~63 MB
- Bounding box nativo: sX=1.899, sY=0.601, sZ=0.606
- `isXLongest = true` → eje X es el largo del cocedor, sin rotación
- Corte **longitudinal en la parte superior** (no lateral) — la mitad superior está abierta
- Los carritos del interior son parte de la geometría fusionada (no se pueden colorear individualmente)

---

## 1 — Cambio de archivo GLB

| Intento | Valor |
|---------|-------|
| Original | `cocedora-cortada.glb` |
| **Final** | `CAMARA+CARRITOS.glb` |

---

## 2 — Ángulo de cámara (alpha)

La cámara `ArcRotateCamera` necesita apuntar al lado del corte (parte superior abierta).

| Intento | alpha | Resultado |
|---------|-------|-----------|
| Plan inicial | `Math.PI * 0.58` (~104°) | Muestra exterior sólido, no el interior |
| Prueba | `Math.PI * 0` (end-on) | Vista frontal, interior parcial |
| **Final** | `-Math.PI * 0.42` (~-76°) | Muestra el interior del corte correctamente |

También se quitaron `lowerAlphaLimit` y `upperAlphaLimit` para permitir órbita libre.

---

## 3 — Posición Y de los paneles (panelY)

Los paneles (cajas de slot) deben quedar **dentro del corte superior** del GLB. El corte es en la parte de arriba, no en el lateral.

| Intento | panelY | Cómo se calculó | Resultado |
|---------|--------|-----------------|-----------|
| Intento 1 | `-0.985` | `FLOOR_Y + 0.28 + SLOT_H/2` donde `FLOOR_Y = -BODY_R*0.80 = -1.92` | Calibrado para modelo antiguo (corte lateral) — paneles muy abajo, salen por la parte inferior |
| Intento 2 (eval live) | `0` | Posición neutra evaluada en browser | Paneles visibles pero muy altos, algunos salen por la parte abierta hacia arriba |
| **Final (eval live)** | `-0.40` | Medido moviendo paneles en browser eval hasta quedar dentro de la apertura | Paneles correctamente dentro del volumen del corte superior ✓ |

**Método de calibración usado**: `mcp__chrome-devtools__evaluate_script` para mover los paneles en tiempo real:
```js
window.__bScene.meshes.filter(m => m.name.startsWith('slot_')).forEach(m => m.position.y = -0.40);
```

---

## 4 — Flickering de carritos

| Intento | Técnica | Resultado |
|---------|---------|-----------|
| Versión original | `buildCarritos()` borraba y recreaba todas las mallas en cada update SSE | Parpadeo constante en cada snapshot |
| **Final** | `_initSlotPanels()` crea 28 mallas UNA VEZ al init; `updateDetalleScene()` solo cambia `.isVisible` y colores del material | Sin parpadeo ✓ |

---

## 5 — Geometría extra eliminada

Se eliminó todo lo que se generaba proceduralmente y aparecía fuera del modelo:

| Removido | Razón |
|----------|-------|
| Piso (floor) | Aparecía debajo del GLB |
| Rieles horizontales | Sobresalían por los extremos |
| Canaleta de drenaje | Fuera del volumen del corte |
| Lámparas con postes | Atravesaban la geometría del GLB |
| Instrumentos (manómetros, válvulas) | Procedurales, difíciles de alinear |
| Carritos complejos (posts, ruedas, bandejas, cilindros de atún, tags NFC) | Cada elemento aparecía parcialmente fuera del GLB |

**Lo que quedó**: 28 cajas simples (`MeshBuilder.CreateBox`) — una por slot.

---

## 6 — Visibilidad de slots vacíos

| Intento | Comportamiento | Problema |
|---------|---------------|----------|
| `box.isVisible = false` para slots sin carrito | Solo se mostraban los ocupados | Solo se veían ~6-8 paneles, parecía que faltaban carts |
| **Final** | Todos los 28 siempre visibles; vacíos = gris oscuro alpha=0.16; ocupados = color de estado alpha=0.74 | 28 paneles siempre presentes ✓ |

---

## 7 — Luz fill (SpotLight)

| Intento | Posición | Dirección | Resultado |
|---------|----------|-----------|-----------|
| Original | Extremo del modelo (+Z) | Apunta a lo largo del eje | Ilumina poco el interior del corte superior |
| **Final** | `(0, BODY_R*2.5, 0)` — justo encima | `(0, -1, 0)` — hacia abajo | Ilumina el interior a través de la apertura superior ✓ |

---

## 8 — Restricciones de escala del GLB

El factor de escala se calcula automáticamente midiendo el bounding box del modelo a escala 1:

```
scaleX = BODY_H / sX = 9.0 / 1.899 ≈ 4.74
scaleY = (BODY_R * 2 * PAD) / sY = (2.40 * 2 * 1.18) / 0.601 ≈ 9.43
scaleZ = (BODY_R * 2 * PAD) / sZ = (2.40 * 2 * 1.18) / 0.606 ≈ 9.35
```

El radio interno real del GLB escalado es `BODY_R * PAD = 2.40 * 1.18 = 2.832` (unidades mundo), **no** `BODY_R = 2.40`. Esto es importante al calcular posiciones XZ de los paneles.

---

## Estado actual (2026-05-21)

- `panelY = -0.40` — paneles dentro del corte superior ✓
- 28 paneles siempre visibles (vacíos gris dim, ocupados color estado) ✓
- Sin flickering ✓
- Cámara `alpha = -Math.PI * 0.42`, órbita libre (sin límites alpha) ✓
- Fill light cenital desde `(0, 6, 0)` hacia abajo ✓
