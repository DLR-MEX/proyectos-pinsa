// Panel "Información del sistema" — variables sys_* con severity dot basado en
// rangos operativos típicos de refrigeración industrial.

const RANGES = {
  sys_temp_ext:   { ok: [22, 33], warn: [33, 40] },
  sys_hum_ext:    { ok: [30, 75], warn: [75, 90] },
  sys_setpoint:   { ok: [-25, 20] },
  sys_p_succion:  { ok: [1.5, 2.5], warn: [2.5, 3.0] },
  sys_p_descarga: { ok: [13, 18],   warn: [18, 20] },
  sys_eficiencia: { ok: [70, 100],  warn: [60, 70] },
};

function severityFor(key, value) {
  const r = RANGES[key];
  if (!r || value == null) return 'unknown';
  if (value >= r.ok[0] && value <= r.ok[1]) return 'ok';
  if (r.warn && value >= r.warn[0] && value <= r.warn[1]) return 'warn';
  return 'err';
}

export function updateSysInfo(snapshot) {
  const sys = snapshot.system ?? {};
  paint('setpoint',   sys.sys_setpoint,   1, ' °C');
  paint('temp_ext',   sys.sys_temp_ext,   1, ' °C');
  paint('hum_ext',    sys.sys_hum_ext,    1, ' %');
  paint('p_succion',  sys.sys_p_succion,  1, ' bar');
  paint('p_descarga', sys.sys_p_descarga, 1, ' bar');
  paint('eficiencia', sys.sys_eficiencia, 1, ' %');
}

function paint(key, entry, digits, suffix) {
  const el = document.querySelector(`[data-sys="${key}"]`);
  if (!el) return;
  if (entry == null || entry.value == null) {
    el.innerHTML = `<span class="sys-dot unknown"></span>--${suffix}`;
    return;
  }
  const sev = severityFor(`sys_${key}`, entry.value);
  el.innerHTML = `<span class="sys-dot ${sev}"></span>${entry.value.toFixed(digits)}${suffix}`;
  el.classList.toggle('sev-warn', sev === 'warn');
  el.classList.toggle('sev-err',  sev === 'err');
}
