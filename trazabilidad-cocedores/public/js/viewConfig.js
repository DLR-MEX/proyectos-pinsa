// Vista "Configuración": lista de recetas por talla (read-only en MVP).

import { $, el, clear } from './dom.js';

let _config = null;

export async function loadConfig() {
  try {
    const r = await fetch('/api/config');
    _config = await r.json();
  } catch { _config = null; }
  renderConfig();
}

export function renderConfig() {
  const root = $('#config-body');
  clear(root);
  if (!_config) { root.append(el('div', { class: 'empty' }, 'Cargando configuración…')); return; }

  // Recetas
  const recetasPanel = el('div', { class: 'panel' });
  recetasPanel.innerHTML = `
    <div class="panel-header"><h3 class="panel-title">Recetas por talla</h3></div>
    <div style="overflow:auto">
      <table class="table">
        <thead>
          <tr>
            <th>Talla</th><th>Setpoint °C</th><th>Duración min</th>
            <th>Tol. temp ±</th><th>Tol. tiempo ±</th><th>Destino</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(_config.recetas).map(([talla, r]) => `
            <tr>
              <td class="col-mono">${talla}</td>
              <td><input class="input" type="number" value="${r.setpoint}" disabled style="width:80px"></td>
              <td><input class="input" type="number" value="${r.durMin}"   disabled style="width:80px"></td>
              <td><input class="input" type="number" value="${r.tolTemp}"  disabled style="width:60px"></td>
              <td><input class="input" type="number" value="${r.tolTiempo}" disabled style="width:60px"></td>
              <td>${r.destino}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.append(recetasPanel);

  // Operarios
  const opsPanel = el('div', { class: 'panel' });
  opsPanel.innerHTML = `
    <div class="panel-header"><h3 class="panel-title">Operarios registrados</h3></div>
    <div style="overflow:auto">
      <table class="table">
        <thead><tr><th>ID</th><th>Nombre</th><th>Turno</th></tr></thead>
        <tbody>
          ${_config.operarios.map(o => `
            <tr>
              <td class="col-mono">${o.id}</td>
              <td>${o.nombre}</td>
              <td class="col-dim">${o.turno}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  root.append(opsPanel);

  // Información del sistema
  const sysPanel = el('div', { class: 'panel' });
  sysPanel.innerHTML = `
    <div class="panel-header"><h3 class="panel-title">Sistema</h3></div>
    <dl class="detalle-dl-mini">
      <div><dt>Planta</dt><dd>${_config.plant.label}</dd></div>
      <div><dt>Cocedores configurados</dt><dd>${_config.cocedores.length}</dd></div>
      <div><dt>Capacidad por cocedor</dt><dd>${_config.cocedores[0]?.capacidad ?? '--'} carritos</dd></div>
      <div><dt>Tallas</dt><dd>${_config.tallas.join(', ')}</dd></div>
      <div><dt>Subtallas</dt><dd>${_config.subtallas.join(', ')}</dd></div>
      <div><dt>Build</dt><dd>${_config.build}</dd></div>
    </dl>
  `;
  root.append(sysPanel);
}
