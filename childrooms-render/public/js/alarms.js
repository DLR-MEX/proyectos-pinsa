// Alarmas — detección + persistencia + andon (acknowledge).
// Las activas siguen mostrándose hasta que la condición desaparece; al
// reconocerse, dejan de "parpadear" pero permanecen visibles.

const HISTORY_MAX = 50;

// id estable = `${camId}_${type}`
const _active   = new Map();    // id -> { firstSeen, lastSeen, acknowledgedAt, ... }
const _history  = [];
const _reported = new Set();    // ids ya reportados al backend (anti-duplicados)
const _eventQueue = [];         // cola de eventos pendientes para flush en batch
let _flushTimer = null;

function queueAlarmEvent(payload) {
  if (_reported.has(payload.id)) return;
  _reported.add(payload.id);
  _eventQueue.push(payload);
  if (_flushTimer) return;
  _flushTimer = setTimeout(flushAlarmEvents, 250);   // debounce 250ms
}

async function flushAlarmEvents() {
  _flushTimer = null;
  const batch = _eventQueue.splice(0, _eventQueue.length);
  for (const payload of batch) {
    try {
      const res = await fetch('/api/alarms/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.warn('alarms event POST:', res.status);
    } catch (e) {
      console.warn('alarms event network:', e.message);
    }
  }
}

let _currentSidebarTab = 'active';
let _currentViewTab    = 'active';

// Thresholds activos (vienen de /api/thresholds o config.alertRanges).
let _thresholds = null;

export function setThresholds(t) { _thresholds = t; }

// Devuelve un snapshot inmutable de las alarmas activas (firstSeen asc).
export function getActiveAlarms() {
  return [..._active.values()].sort((a, b) => a.firstSeen - b.firstSeen);
}

function rangesFor(/* camId */) {
  // Umbral único: todas las cámaras comparten el general.
  return _thresholds?.general ?? null;
}

export function countAlarms(snapshot) {
  let n = 0;
  for (const c of snapshot.chambers) {
    if (!c.enabled) continue;
    if (!c.temp) { n++; continue; }
    const r = rangesFor(c.id);
    if (!r) continue;
    if (c.temp.value > r.temp.max) n++;
    else if (c.temp.value < r.temp.min) n++;
  }
  return n;
}

function detectAlarms(snapshot) {
  const detected = [];
  for (const c of snapshot.chambers) {
    if (!c.enabled) continue;
    if (!c.temp) {
      detected.push({ id: `${c.id}_comm`, camId: c.id, cam: c.label, type: 'Falla de comunicación', sev: 'high' });
      continue;
    }
    const r = rangesFor(c.id);
    if (!r) continue;
    if (c.temp.value > r.temp.max)
      detected.push({ id: `${c.id}_high`, camId: c.id, cam: c.label, type: 'Alta temperatura', sev: 'high', value: c.temp.value });
    else if (c.temp.value < r.temp.min)
      detected.push({ id: `${c.id}_low`, camId: c.id, cam: c.label, type: 'Baja temperatura', sev: 'med', value: c.temp.value });

    if (c.hum) {
      if (c.hum.value > r.hum.max)
        detected.push({ id: `${c.id}_hhigh`, camId: c.id, cam: c.label, type: 'Humedad alta', sev: 'med', value: c.hum.value });
      else if (c.hum.value < r.hum.min)
        detected.push({ id: `${c.id}_hlow`, camId: c.id, cam: c.label, type: 'Humedad baja', sev: 'med', value: c.hum.value });
    }
  }
  return detected;
}

export function updateAlarms(snapshot) {
  const now = Date.now();
  const detected = detectAlarms(snapshot);
  const detectedIds = new Set(detected.map(d => d.id));

  for (const d of detected) {
    const existing = _active.get(d.id);
    if (existing) {
      existing.lastSeen = now;
    } else {
      _active.set(d.id, { ...d, firstSeen: now, lastSeen: now, acknowledgedAt: null });
    }
  }
  for (const [id, alarm] of [..._active.entries()]) {
    if (!detectedIds.has(id)) {
      const resolved = { ...alarm, resolvedAt: now };
      _history.unshift(resolved);
      if (_history.length > HISTORY_MAX) _history.length = HISTORY_MAX;
      _active.delete(id);
      // Reporta al backend (con debounce + dedup por id).
      queueAlarmEvent(resolved);
    }
  }

  // Renderiza el panel sidebar (resumen) y la vista grande (alarmas).
  renderSidebarList();
  renderViewTable();
  const badge = document.getElementById('panel-alarm-count');
  if (badge) badge.textContent = _active.size;
}

export function acknowledgeAlarm(id) {
  const a = _active.get(id);
  if (!a) return;
  a.acknowledgedAt = Date.now();
  renderSidebarList();
  renderViewTable();
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

/* ── Sidebar panel (resumen) ────────────────────────────────────────────── */

function renderSidebarList() {
  const list = document.getElementById('alarm-list');
  if (!list) return;
  if (_currentSidebarTab === 'active') {
    const items = [..._active.values()].sort((a, b) => a.firstSeen - b.firstSeen);
    if (items.length === 0) { list.innerHTML = `<div class="alarm-empty">Sin alarmas activas</div>`; return; }
    const now = Date.now();
    list.innerHTML = `
      <div class="alarm-header"><span>Hora</span><span>Alarma</span><span>Cámara</span><span>Duración</span></div>
      ${items.map(a => `
        <div class="alarm-row sev-${a.sev} ${a.acknowledgedAt ? 'acked' : ''}">
          <span class="alarm-time">${formatTime(a.firstSeen)}</span>
          <span class="alarm-type">${a.type}</span>
          <span class="alarm-cam">${a.cam}</span>
          <span class="alarm-state alarm-duration">${formatDuration(now - a.firstSeen)}</span>
        </div>
      `).join('')}
    `;
  } else {
    if (_history.length === 0) { list.innerHTML = `<div class="alarm-empty">Sin alarmas resueltas</div>`; return; }
    list.innerHTML = `
      <div class="alarm-header"><span>Hora</span><span>Alarma</span><span>Cámara</span><span>Duró</span></div>
      ${_history.map(a => `
        <div class="alarm-row sev-${a.sev} resolved">
          <span class="alarm-time">${formatTime(a.firstSeen)}</span>
          <span class="alarm-type">${a.type}</span>
          <span class="alarm-cam">${a.cam}</span>
          <span class="alarm-state alarm-duration">${formatDuration(a.resolvedAt - a.firstSeen)}</span>
        </div>
      `).join('')}
    `;
  }
}

export function initAlarmTabs() {
  document.querySelectorAll('[data-alarm-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentSidebarTab = btn.dataset.alarmTab;
      document.querySelectorAll('[data-alarm-tab]').forEach(b => b.classList.toggle('active', b === btn));
      renderSidebarList();
    });
  });
  document.querySelectorAll('[data-alarmas-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentViewTab = btn.dataset.alarmasTab;
      document.querySelectorAll('[data-alarmas-tab]').forEach(b => b.classList.toggle('active', b === btn));
      renderViewTable();
    });
  });

  // Event delegation para los botones de "Reconocer" — evita re-attach por
  // cada render de la tabla.
  const tbody = document.querySelector('#alarmas-table tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ack]');
      if (btn) acknowledgeAlarm(btn.dataset.ack);
    });
  }
}

/* ── Vista "Alarmas" grande con andon ───────────────────────────────────── */

function renderViewTable() {
  const table = document.getElementById('alarmas-table');
  if (!table) return;

  const stats = document.getElementById('alarmas-stats');
  if (stats) {
    const acked = [..._active.values()].filter(a => a.acknowledgedAt).length;
    const crit  = [..._active.values()].filter(a => a.sev === 'high').length;
    stats.innerHTML = `
      <div class="alarm-stat ${crit > 0 ? 'crit' : ''}"><div class="alarm-stat-label">Críticas</div><div class="alarm-stat-value">${crit}</div></div>
      <div class="alarm-stat ${_active.size > 0 ? 'warn' : ''}"><div class="alarm-stat-label">Activas</div><div class="alarm-stat-value">${_active.size}</div></div>
      <div class="alarm-stat"><div class="alarm-stat-label">Reconocidas</div><div class="alarm-stat-value">${acked}</div></div>
      <div class="alarm-stat"><div class="alarm-stat-label">Resueltas hoy</div><div class="alarm-stat-value">${_history.length}</div></div>
    `;
  }

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  if (_currentViewTab === 'active') {
    thead.innerHTML = `
      <tr><th>Inicio</th><th>Tipo</th><th>Cámara</th><th>Valor</th><th>Severidad</th><th>Duración</th><th>Estado</th><th>Acción</th></tr>
    `;
    const items = [..._active.values()].sort((a, b) => a.firstSeen - b.firstSeen);
    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="alarmas-empty">Sin alarmas activas en este momento</td></tr>`;
      return;
    }
    const now = Date.now();
    tbody.innerHTML = items.map(a => `
      <tr class="sev-${a.sev} ${a.acknowledgedAt ? 'acknowledged' : ''}">
        <td class="col-time">${formatTime(a.firstSeen)}</td>
        <td class="col-type">${a.type}</td>
        <td>${a.cam}</td>
        <td class="col-time">${a.value != null ? a.value.toFixed(1) : '—'}</td>
        <td>${a.sev === 'high' ? 'CRÍTICA' : 'ATENCIÓN'}</td>
        <td class="col-duration">${formatDuration(now - a.firstSeen)}</td>
        <td>${a.acknowledgedAt ? `<span class="alarm-andon-label">Reconocida ${formatTime(a.acknowledgedAt)}</span>` : 'Sin reconocer'}</td>
        <td>${a.acknowledgedAt ? '—' : `<button class="alarm-andon-btn" data-ack="${a.id}">Reconocer</button>`}</td>
      </tr>
    `).join('');
    // Sin re-attach de listeners: initAlarmTabs() ya hizo event delegation
    // en el tbody.
  } else {
    thead.innerHTML = `
      <tr><th>Inicio</th><th>Resolución</th><th>Tipo</th><th>Cámara</th><th>Severidad</th><th>Duración total</th><th>Reconocida</th></tr>
    `;
    if (_history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="alarmas-empty">Sin histórico todavía</td></tr>`;
      return;
    }
    tbody.innerHTML = _history.map(a => `
      <tr class="sev-${a.sev} resolved">
        <td class="col-time">${formatTime(a.firstSeen)}</td>
        <td class="col-time">${formatTime(a.resolvedAt)}</td>
        <td class="col-type">${a.type}</td>
        <td>${a.cam}</td>
        <td>${a.sev === 'high' ? 'CRÍTICA' : 'ATENCIÓN'}</td>
        <td class="col-duration">${formatDuration(a.resolvedAt - a.firstSeen)}</td>
        <td>${a.acknowledgedAt ? formatTime(a.acknowledgedAt) : '—'}</td>
      </tr>
    `).join('');
  }
}
