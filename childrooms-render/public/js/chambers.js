// Status panels C1-C4 debajo del canvas 3D — muestran el estado de compresor
// y evaporador por cámara con SVG animado (mismo estilo que el panel "Estado
// de equipos principales"). El SVG se inserta una sola vez al montar; el
// toggle ON/OFF se hace vía classList.toggle('eq-off') para no reiniciar las
// animaciones CSS al cambiar de estado.

import { svgCompresor, svgEvaporador } from './equipos.js';

const statusEls = {};   // camId -> panel element
const lastState = {};   // camId -> { compresor, evaporador }

export function initStatusPanels(config) {
  const row = document.getElementById('chamber-status-row');
  if (!row) return;
  row.innerHTML = '';

  for (const cam of config.chambers) {
    if (!cam.enabled) continue;
    const panel = buildStatusPanel(cam);
    statusEls[cam.id] = panel;
    lastState[cam.id] = { compresor: undefined, evaporador: undefined };
    row.appendChild(panel);

    // SVG inicial montado una sola vez (en estado ON; el primer snapshot lo
    // ajustará vía toggle de clase si toca apagar).
    panel.querySelector('[data-eq-icon="compresor"]').innerHTML  = svgCompresor(true);
    panel.querySelector('[data-eq-icon="evaporador"]').innerHTML = svgEvaporador(true);
  }
}

function buildStatusPanel(cam) {
  const el = document.createElement('div');
  el.className = 'status-panel is-clickable';
  el.dataset.camId = cam.id;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `Abrir detalle de ${cam.label}`);
  const shortId = cam.id.replace('cam', 'C');
  el.innerHTML = `
    <div class="status-panel-header">
      <span>${shortId}</span>
      <span class="status-panel-sp">SP ${cam.setpoint}°C</span>
    </div>
    <div class="status-equipos">
      <div class="status-eq" data-eq-block="compresor">
        <div class="status-eq-icon" data-eq-icon="compresor"></div>
        <div class="status-eq-label">Compresor</div>
        <div class="status-eq-state on" data-eq-state>ON</div>
      </div>
      <div class="status-eq" data-eq-block="evaporador">
        <div class="status-eq-icon" data-eq-icon="evaporador"></div>
        <div class="status-eq-label">Evaporador</div>
        <div class="status-eq-state on" data-eq-state>ON</div>
      </div>
    </div>
  `;
  return el;
}

export function updateStatusPanels(snapshot) {
  for (const cam of snapshot.chambers) {
    const panel = statusEls[cam.id];
    if (!panel) continue;

    const prev = lastState[cam.id] ?? {};
    const compOn = !!cam.equipos?.compresor;
    const evapOn = !!cam.equipos?.evaporador;

    if (prev.compresor !== compOn) {
      paintEqBlock(panel.querySelector('[data-eq-block="compresor"]'), compOn);
      prev.compresor = compOn;
    }
    if (prev.evaporador !== evapOn) {
      paintEqBlock(panel.querySelector('[data-eq-block="evaporador"]'), evapOn);
      prev.evaporador = evapOn;
    }
    lastState[cam.id] = prev;
  }
}

// Toggle de estado sin re-inyectar el SVG: solo agrega/quita la clase eq-off
// al svg interno (CSS define el grayscale y detiene las animaciones).
function paintEqBlock(block, on) {
  if (!block) return;
  const svg = block.querySelector('.eq-svg');
  if (svg) svg.classList.toggle('eq-off', !on);
  const stateEl = block.querySelector('[data-eq-state]');
  if (stateEl) {
    stateEl.textContent = on ? 'ON' : 'OFF';
    stateEl.classList.toggle('on',  on);
    stateEl.classList.toggle('off', !on);
  }
  block.classList.toggle('is-on',  on);
  block.classList.toggle('is-off', !on);
}
