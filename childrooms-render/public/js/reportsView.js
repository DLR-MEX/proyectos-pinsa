// Vista "Reportes" — descarga de CSV. Cada botón arma una URL del backend
// con los vars apropiados y, opcionalmente, un rango from/to en epoch ms.

const TEMP_VARS  = ['cam1_temperature','cam2_temperature','cam3_temperature','cam4_temperature','cam5_temperature','cam6_temperature'];
const HUM_VARS   = ['cam1_humidity','cam2_humidity','cam3_humidity','cam4_humidity','cam5_humidity','cam6_humidity'];
const POWER_VARS = ['cam1_power_kw','cam2_power_kw','cam3_power_kw','cam4_power_kw','cam5_power_kw','cam6_power_kw'];
const SYS_VARS   = ['sys_temp_ext','sys_hum_ext','sys_setpoint','sys_p_succion','sys_p_descarga','sys_eficiencia'];
const ALL_VARS   = [...TEMP_VARS, ...HUM_VARS, ...POWER_VARS, ...SYS_VARS];

function trigger(url, suggestedName) {
  const a = document.createElement('a');
  a.href = url;
  if (suggestedName) a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Construye el sufijo "&from=...&to=..." (en epoch ms) a partir de los inputs
// date. `from` cubre desde 00:00:00 del día y `to` hasta 23:59:59.999.
function rangeParams() {
  const fromEl = document.getElementById('report-from');
  const toEl   = document.getElementById('report-to');
  const parts  = [];
  if (fromEl?.value) {
    const d = new Date(`${fromEl.value}T00:00:00`);
    if (!isNaN(d)) parts.push(`from=${d.getTime()}`);
  }
  if (toEl?.value) {
    const d = new Date(`${toEl.value}T23:59:59.999`);
    if (!isNaN(d)) parts.push(`to=${d.getTime()}`);
  }
  return parts.length ? `&${parts.join('&')}` : '';
}

function rangeStamp() {
  const fromEl = document.getElementById('report-from');
  const toEl   = document.getElementById('report-to');
  if (fromEl?.value && toEl?.value) return `${fromEl.value}_a_${toEl.value}`;
  if (fromEl?.value) return `desde_${fromEl.value}`;
  if (toEl?.value)   return `hasta_${toEl.value}`;
  return new Date().toISOString().slice(0, 10);
}

function buildUrl(vars) {
  return `/api/history.csv?vars=${vars.join(',')}${rangeParams()}`;
}

export function initReportsView() {
  document.querySelectorAll('[data-report]').forEach(btn => {
    btn.addEventListener('click', () => onClick(btn.dataset.report));
  });

  // Default: últimos 7 días, deja al usuario quitar el filtro con "Limpiar".
  const fromEl = document.getElementById('report-from');
  const toEl   = document.getElementById('report-to');
  if (fromEl && toEl) {
    const today = new Date();
    const past  = new Date(today.getTime() - 7 * 24 * 3600 * 1000);
    fromEl.value = past.toISOString().slice(0, 10);
    toEl.value   = today.toISOString().slice(0, 10);
  }

  const resetBtn = document.getElementById('report-range-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (fromEl) fromEl.value = '';
      if (toEl)   toEl.value   = '';
    });
  }
}

function onClick(kind) {
  const stamp = rangeStamp();
  switch (kind) {
    case 'temp':   return trigger(buildUrl(TEMP_VARS),  `temperaturas_${stamp}.csv`);
    case 'hum':    return trigger(buildUrl(HUM_VARS),   `humedad_${stamp}.csv`);
    case 'power':  return trigger(buildUrl(POWER_VARS), `consumo_${stamp}.csv`);
    case 'sys':    return trigger(buildUrl(SYS_VARS),   `sistema_${stamp}.csv`);
    case 'averages': return downloadAveragesCsv(stamp);
    case 'alarms': return trigger(`/api/alarms.csv`,    `alarmas_${stamp}.csv`);
    case 'all':    return trigger(buildUrl(ALL_VARS),   `historico_completo_${stamp}.csv`);
  }
}

// Promedios: calcula en cliente a partir del histórico filtrado por rango.
async function downloadAveragesCsv(stamp) {
  try {
    const csv = await fetch(buildUrl([...TEMP_VARS, ...HUM_VARS])).then(r => r.text());
    const out = buildAveragesCsv(csv);
    const blob = new Blob([out], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `promedios_${stamp}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Error al generar promedios: ' + e.message);
  }
}

function buildAveragesCsv(rawCsv) {
  const lines = rawCsv.split('\n').filter(Boolean);
  if (lines.length < 2) return 'ts_ms,iso,temp_avg_c,hum_avg_pct\n';
  const header = lines[0].split(',');
  const tempIdx = TEMP_VARS.map(v => header.indexOf(v));
  const humIdx  = HUM_VARS.map(v => header.indexOf(v));
  const out = ['ts_ms,iso,temp_avg_c,hum_avg_pct'];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const ts = cols[0];
    const iso = cols[1];
    const tVals = tempIdx.map(j => parseFloat(cols[j])).filter(Number.isFinite);
    const hVals = humIdx.map(j => parseFloat(cols[j])).filter(Number.isFinite);
    const tAvg = tVals.length ? (tVals.reduce((s,x)=>s+x,0) / tVals.length).toFixed(2) : '';
    const hAvg = hVals.length ? (hVals.reduce((s,x)=>s+x,0) / hVals.length).toFixed(2) : '';
    out.push([ts, iso, tAvg, hAvg].join(','));
  }
  return out.join('\n');
}
