// Hidratación centralizada de los gráficos del Resumen desde el histórico
// persistido del backend. Hace UN solo fetch a /api/history.csv con todas las
// variables relevantes, reconstruye snapshots por timestamp (propagando el
// último valor conocido de cada variable) y los reparte a los módulos que
// mantienen buffers en memoria.

import { hydrateTrendsFromSnapshots } from './trends.js';
import { hydrateKpisFromSnapshots }   from './kpi.js';
import { hydratePowerFromSnapshots }  from './eventos.js';

const CAM_IDS = ['cam1', 'cam2', 'cam3', 'cam4', 'cam5', 'cam6'];

export async function hydrateResumenFromHistory(enabledMap) {
  let snapshots;
  try {
    snapshots = await fetchSnapshots();
  } catch (e) {
    console.warn('hydrateResumenFromHistory:', e.message);
    return;
  }
  if (!snapshots.length) return;

  hydrateTrendsFromSnapshots(snapshots);
  hydrateKpisFromSnapshots(snapshots, enabledMap);
  hydratePowerFromSnapshots(snapshots, enabledMap);
}

async function fetchSnapshots() {
  const vars = [];
  for (const id of CAM_IDS) {
    vars.push(`${id}_temperature`, `${id}_humidity`, `${id}_power_kw`);
  }
  const res = await fetch(`/api/history.csv?vars=${vars.join(',')}`);
  if (!res.ok) return [];
  const csv = await res.text();
  const lines = csv.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const colIdx = vars.map(v => header.indexOf(v));

  // Propagamos último valor conocido por variable: el CSV trae las columnas
  // vacías cuando esa variable no se actualizó en ese ts, así que necesitamos
  // forward-fill para tener un snapshot completo por fila.
  const last = {};
  const snapshots = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const ts = Number(cols[0]);
    if (!Number.isFinite(ts)) continue;

    for (let j = 0; j < vars.length; j++) {
      const idx = colIdx[j];
      if (idx < 0) continue;
      const raw = cols[idx];
      if (raw === '' || raw == null) continue;
      const x = Number(raw);
      if (Number.isFinite(x)) last[vars[j]] = x;
    }

    const cams = {};
    for (const id of CAM_IDS) {
      cams[id] = {
        temp:  last[`${id}_temperature`] ?? null,
        hum:   last[`${id}_humidity`]    ?? null,
        power: last[`${id}_power_kw`]    ?? null,
      };
    }
    snapshots.push({ ts, cams });
  }
  return snapshots;
}
