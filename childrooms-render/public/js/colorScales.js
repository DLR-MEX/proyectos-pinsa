// Paleta de temperatura — el verde es la "zona ideal" (ideal ± 3°C).
// Fuera del ideal pero dentro de min..max → tonos ámbar/azul. Fuera → rojo/azul intenso.
//
// Para mantener la firma original (tempColorFloats(value)), el módulo guarda
// los thresholds globales aplicados y recalcula los stops del colorscale en
// función de ellos. Para una cámara concreta usa thresholdsFor(camId).

// Stops normalizados [0..1] con tonos apagados industriales. La "banda verde"
// queda en t ≈ 0.45..0.55; antes (frío) tonos azulados, después (caliente) ámbar→rojo.
export const TEMP_COLORSCALE = Object.freeze([
  [0.00, [40,  60,  110]],
  [0.10, [50,  100, 150]],
  [0.20, [60,  140, 170]],
  [0.30, [70,  160, 160]],
  [0.40, [80,  170, 130]],
  [0.45, [100, 175, 110]],
  [0.50, [110, 180, 100]],
  [0.55, [130, 180, 90 ]],
  [0.60, [170, 175, 95 ]],
  [0.70, [200, 160, 80 ]],
  [0.85, [195, 110, 60 ]],
  [1.00, [150, 50,  55 ]],
]);

// Umbral único general — aplica a todas las cámaras. Ya no hay override por cámara.
// La paleta visual y el slider se extienden ±5 unidades por encima/debajo de min/max.
export const PALETTE_EXT = 5;

let _general = { temp: { min: -22, ideal: -10, max: 5 }, hum: { min: 80, ideal: 88, max: 95 } };

export function setThresholds(payload) {
  if (payload?.general) _general = payload.general;
  // Cualquier override por cámara llegado del backend se ignora intencionadamente.
}

export function thresholdsFor(/* camId */) {
  return _general;
}

// Paleta canónica por cámara — fuente única de verdad para gráficas/leyendas.
export const CAM_IDS    = ['cam1', 'cam2', 'cam3', 'cam4', 'cam5', 'cam6'];
export const CAM_COLORS = ['#5BB8F5', '#00C896', '#F5A623', '#FF4B4B', '#8B9DAE', '#5A6B7A'];

// Coeficiente de Carnot estimado para el cálculo de COP del sistema (kW útiles
// por kW eléctricos) cuando todas las cámaras enabled están operando.
export const COP_NOMINAL_KW_PER_CAM = 12.5;

export function interpolateColorscale(colorscale, t) {
  t = Math.max(0, Math.min(1, t));
  let i = 0;
  for (; i < colorscale.length - 1; i++) {
    if (t <= colorscale[i + 1][0]) break;
  }
  const [t0, c0] = colorscale[i];
  const [t1, c1] = colorscale[Math.min(i + 1, colorscale.length - 1)];
  const p = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
  return [
    c0[0] + p * (c1[0] - c0[0]),
    c0[1] + p * (c1[1] - c0[1]),
    c0[2] + p * (c1[2] - c0[2]),
  ];
}

// La humedad reusa el mismo colorscale: ideal±3% = verde central; abajo de min
// = azul intenso (resecado); arriba de max = rojo (saturación / hongos).
export const HUMIDITY_COLORSCALE = TEMP_COLORSCALE;

// Mapea un valor → t en [0..1] tal que `ideal` cae en 0.5 (verde) y
// la banda verde (ideal ± 3 unidades) queda en el centro de la paleta.
// El dominio total se extiende ±PALETTE_EXT sobre [min, max] para que la
// paleta y la colorbar muestren claramente las zonas de alerta exteriores.
function valueToT(value, range) {
  const { min, ideal, max } = range;
  const lo = min - PALETTE_EXT;
  const hi = max + PALETTE_EXT;
  if (value <= ideal) {
    const span = (ideal - lo) || 1;
    return Math.max(0, Math.min(0.5, (value - lo) / span * 0.5));
  }
  const span = (hi - ideal) || 1;
  return Math.max(0.5, Math.min(1, 0.5 + (value - ideal) / span * 0.5));
}

export function tempColorFloats(value, camId) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return [0.18, 0.20, 0.22];
  }
  const t = valueToT(value, thresholdsFor(camId).temp);
  const [r, g, b] = interpolateColorscale(TEMP_COLORSCALE, t);
  return [r / 255, g / 255, b / 255];
}

export function humColorFloats(value, camId) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return [0.18, 0.20, 0.22];
  }
  const t = valueToT(value, thresholdsFor(camId).hum);
  const [r, g, b] = interpolateColorscale(HUMIDITY_COLORSCALE, t);
  return [r / 255, g / 255, b / 255];
}

export function colorFloatsForMode(mode, value, camId) {
  return mode === 'hum' ? humColorFloats(value, camId) : tempColorFloats(value, camId);
}

export function colorscaleToGradient(colorscale, direction = 'to right') {
  const stops = colorscale
    .map(([t, [r, g, b]]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)}) ${(t * 100).toFixed(0)}%`)
    .join(', ');
  return `linear-gradient(${direction}, ${stops})`;
}
