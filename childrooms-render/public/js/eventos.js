// Sparkline animado de consumo + timeline de eventos recientes.
// La animación usa requestAnimationFrame para hacer un scroll horizontal
// continuo (el último sample se desplaza desde la derecha al margen final).

const POWER_BUF = [];                                       // { t, v }
const MAX_POWER = 60;

let _lastDrawTs = 0;
let _rafHandle  = null;
let _paused     = false;

export function pushPowerSample(snapshot) {
  const total = snapshot.chambers
    .filter(c => c.enabled && c.power)
    .reduce((s, c) => s + c.power.value, 0);
  POWER_BUF.push({ t: Date.now(), v: total });
  if (POWER_BUF.length > MAX_POWER) POWER_BUF.shift();
}

// Rellena el buffer del sparkline de consumo desde snapshots reconstruidos
// del histórico — suma de power_kw de las cámaras habilitadas por timestamp.
export function hydratePowerFromSnapshots(snapshots, enabledMap) {
  POWER_BUF.length = 0;
  for (const snap of snapshots) {
    const total = Object.entries(snap.cams)
      .filter(([id]) => enabledMap?.[id] !== false)
      .map(([, c]) => c.power)
      .filter(v => v != null)
      .reduce((s, x) => s + x, 0);
    POWER_BUF.push({ t: snap.ts, v: total });
  }
  if (POWER_BUF.length > MAX_POWER) POWER_BUF.splice(0, POWER_BUF.length - MAX_POWER);
}

// Inicia el render loop una sola vez. Se redibuja a 30 FPS para tener
// scroll fluido aunque solo lleguen samples cada 2.5s. Se pausa cuando la
// vista activa no es Resumen para no quemar CPU en una pestaña invisible.
export function startPowerAnimation() {
  if (_rafHandle != null) return;
  const tick = (ts) => {
    if (!_paused && ts - _lastDrawTs > 33) {
      drawPower();
      _lastDrawTs = ts;
    }
    _rafHandle = requestAnimationFrame(tick);
  };
  _rafHandle = requestAnimationFrame(tick);
}

export function stopPowerAnimation() {
  if (_rafHandle != null) cancelAnimationFrame(_rafHandle);
  _rafHandle = null;
}

export function setPowerAnimationPaused(paused) {
  _paused = !!paused;
}

export function drawPower() {
  const canvas = document.getElementById('power-canvas');
  if (!canvas || POWER_BUF.length < 2) return;

  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const W = Math.floor(rect.width  - 28);
  const H = 80;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Fondo + micro-grid horizontal.
  ctx.fillStyle = 'rgba(11,24,37,0.55)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(139,157,174,0.10)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Mapear por TIEMPO, no por índice. Los samples más recientes scrollean
  // hacia la izquierda según pasa "el tiempo en pantalla" (150s visibles).
  const now = Date.now();
  const T_WINDOW = 150 * 1000;
  const tMin = now - T_WINDOW;

  // Y-range basado en lo visible (no en el buffer entero). Evita que un pico
  // antiguo fuera de pantalla aplaste la escala.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < POWER_BUF.length; i++) {
    const p = POWER_BUF[i];
    if (p.t < tMin) continue;
    if (p.v < lo) lo = p.v;
    if (p.v > hi) hi = p.v;
  }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  const vMin = Math.max(0, lo - 1);
  const vMax = hi + 1;
  const range = vMax - vMin || 1;

  // Área rellena con gradiente.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(245,166,35,0.30)');
  grad.addColorStop(1, 'rgba(245,166,35,0.02)');
  ctx.beginPath();
  ctx.moveTo(0, H);
  POWER_BUF.forEach((p) => {
    const x = ((p.t - tMin) / T_WINDOW) * W;
    const y = H - ((p.v - vMin) / range) * (H - 12) - 2;
    ctx.lineTo(x, y);
  });
  const last = POWER_BUF[POWER_BUF.length - 1];
  const lastX = ((last.t - tMin) / T_WINDOW) * W;
  ctx.lineTo(lastX, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Línea.
  ctx.beginPath();
  ctx.strokeStyle = '#F5A623';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  POWER_BUF.forEach((p, i) => {
    const x = ((p.t - tMin) / T_WINDOW) * W;
    const y = H - ((p.v - vMin) / range) * (H - 12) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Punto destacado del último sample (pulse).
  if (last) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    const x = lastX;
    const y = H - ((last.v - vMin) / range) * (H - 12) - 2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(245,166,35,${0.25 + 0.35 * pulse})`;
    ctx.arc(x, y, 5 + 1.5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#FFB44A';
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function updateEventos(snapshot) {
  const list = document.getElementById('eventos-list');
  if (!list) return;

  const events = snapshot.events ?? [];

  if (events.length === 0) {
    list.innerHTML = `<li class="evento-item evento-empty">
      <span></span>
      <span></span>
      <span class="evento-label" style="color:var(--c-text-dim)">Sin eventos recientes</span>
    </li>`;
    return;
  }

  list.innerHTML = events.map(ev => {
    const d    = new Date(ev.ts);
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const sev  = ev.severity === 'warn' ? 'warn' : 'info';
    return `
      <li class="evento-item">
        <div class="evento-dot ${sev}"></div>
        <span class="evento-time">${time}</span>
        <span class="evento-label">${ev.label}</span>
      </li>
    `;
  }).join('');
}
