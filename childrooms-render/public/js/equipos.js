// Equipos principales — iconos SVG animados (compresor=pistón, condensador=
// ventilador) que se pausan cuando OFF. Sin barra de carga; solo estado + tiempo.

// Estado por equipo: ts del último cambio de estado.
const _state = {};

function ensureState(id, on) {
  if (!_state[id])        _state[id] = { on, since: Date.now() };
  if (_state[id].on !== on) _state[id] = { on, since: Date.now() };
  return _state[id];
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// SVG compresor: pistón vertical en cilindro con bielas. Animación arriba/abajo.
export function svgCompresor(on) {
  const cls = on ? '' : ' eq-off';
  return `
    <svg class="eq-svg eq-compresor${cls}" viewBox="0 0 32 32" aria-hidden="true">
      <!-- base -->
      <rect x="3"  y="22" width="26" height="6" rx="1.5" fill="#1F3D5E" stroke="#2E80D8" stroke-width="0.6"/>
      <!-- cilindros -->
      <rect class="eq-cyl" x="7"  y="6"  width="6" height="16" rx="1" fill="#142B43" stroke="#2E80D8" stroke-width="0.6"/>
      <rect class="eq-cyl" x="19" y="6"  width="6" height="16" rx="1" fill="#142B43" stroke="#2E80D8" stroke-width="0.6"/>
      <!-- pistones (animados) -->
      <rect class="eq-piston eq-piston-a" x="8"  y="10" width="4" height="6" fill="#5BB8F5"/>
      <rect class="eq-piston eq-piston-b" x="20" y="14" width="4" height="6" fill="#5BB8F5"/>
      <!-- tubería superior -->
      <rect x="8" y="3" width="16" height="3" rx="1" fill="#0E2034" stroke="#2E80D8" stroke-width="0.6"/>
      <!-- piloto ON -->
      <circle cx="16" cy="25" r="1.3" class="eq-pilot"/>
    </svg>
  `;
}

// SVG condensador: ventilador con 4 aspas rotando dentro de marco rectangular.
function svgCondensador(on) {
  const cls = on ? '' : ' eq-off';
  return `
    <svg class="eq-svg eq-condensador${cls}" viewBox="0 0 32 32" aria-hidden="true">
      <!-- carcasa -->
      <rect x="2" y="4" width="28" height="24" rx="2" fill="#142B43" stroke="#2E80D8" stroke-width="0.6"/>
      <!-- rejilla -->
      <line x1="5" y1="8"  x2="27" y2="8"  stroke="#1F3D5E" stroke-width="0.4"/>
      <line x1="5" y1="11" x2="27" y2="11" stroke="#1F3D5E" stroke-width="0.4"/>
      <line x1="5" y1="22" x2="27" y2="22" stroke="#1F3D5E" stroke-width="0.4"/>
      <line x1="5" y1="25" x2="27" y2="25" stroke="#1F3D5E" stroke-width="0.4"/>
      <!-- ventilador -->
      <circle cx="16" cy="16" r="6" fill="#0E2034" stroke="#2E80D8" stroke-width="0.6"/>
      <g class="eq-fan">
        <ellipse cx="16" cy="10.5" rx="1.4" ry="4" fill="#5BB8F5"/>
        <ellipse cx="21.5" cy="16" rx="4" ry="1.4" fill="#5BB8F5"/>
        <ellipse cx="16" cy="21.5" rx="1.4" ry="4" fill="#5BB8F5"/>
        <ellipse cx="10.5" cy="16" rx="4" ry="1.4" fill="#5BB8F5"/>
        <circle cx="16" cy="16" r="1.4" fill="#0B1825" stroke="#2E80D8" stroke-width="0.5"/>
      </g>
    </svg>
  `;
}

// SVG bomba de líquido: hélice helicoidal animada.
function svgBomba(on) {
  const cls = on ? '' : ' eq-off';
  return `
    <svg class="eq-svg eq-bomba${cls}" viewBox="0 0 32 32" aria-hidden="true">
      <!-- carcasa redonda -->
      <circle cx="16" cy="16" r="11" fill="#142B43" stroke="#2E80D8" stroke-width="0.6"/>
      <!-- tubería entrada -->
      <rect x="0" y="14" width="6" height="4" fill="#0E2034" stroke="#2E80D8" stroke-width="0.4"/>
      <!-- tubería salida superior -->
      <rect x="14" y="0" width="4" height="6" fill="#0E2034" stroke="#2E80D8" stroke-width="0.4"/>
      <!-- impulsor giratorio -->
      <g class="eq-impeller">
        <path d="M16 8 Q 22 14 16 16 Q 10 18 16 24 Q 10 18 16 16 Q 22 14 16 8" fill="none" stroke="#5BB8F5" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="16" cy="16" r="1.2" fill="#0B1825" stroke="#2E80D8" stroke-width="0.4"/>
      </g>
    </svg>
  `;
}

// SVG evaporador: carcasa con aletas verticales (serpentín) + ventilador
// axial integrado a la derecha. El ventilador rota cuando ON gracias a la
// clase eq-fan-right (transform-origin: 25px 16px desde el view-box).
export function svgEvaporador(on) {
  const cls = on ? '' : ' eq-off';
  return `
    <svg class="eq-svg eq-evaporador${cls}" viewBox="0 0 32 32" aria-hidden="true">
      <!-- carcasa -->
      <rect x="2" y="6" width="28" height="20" rx="2" fill="#142B43" stroke="#2E80D8" stroke-width="0.6"/>
      <!-- aletas verticales (serpentín) -->
      <g stroke="#5BB8F5" stroke-width="0.7" opacity="0.85">
        <line x1="5"  y1="8.5" x2="5"  y2="23.5"/>
        <line x1="8"  y1="8.5" x2="8"  y2="23.5"/>
        <line x1="11" y1="8.5" x2="11" y2="23.5"/>
        <line x1="14" y1="8.5" x2="14" y2="23.5"/>
        <line x1="17" y1="8.5" x2="17" y2="23.5"/>
        <line x1="20" y1="8.5" x2="20" y2="23.5"/>
      </g>
      <!-- ventilador axial a la derecha -->
      <circle cx="25" cy="16" r="3.6" fill="#0E2034" stroke="#2E80D8" stroke-width="0.5"/>
      <g class="eq-fan-right">
        <ellipse cx="25" cy="13" rx="0.8" ry="2.4" fill="#5BB8F5"/>
        <ellipse cx="28" cy="16" rx="2.4" ry="0.8" fill="#5BB8F5"/>
        <ellipse cx="25" cy="19" rx="0.8" ry="2.4" fill="#5BB8F5"/>
        <ellipse cx="22" cy="16" rx="2.4" ry="0.8" fill="#5BB8F5"/>
        <circle cx="25" cy="16" r="0.9" fill="#0B1825" stroke="#2E80D8" stroke-width="0.3"/>
      </g>
      <!-- bandeja de drenaje -->
      <rect x="3" y="25" width="26" height="2" rx="0.5" fill="#1F3D5E" stroke="#2E80D8" stroke-width="0.4"/>
    </svg>
  `;
}

function svgFor(id, on) {
  if (id.startsWith('comp')) return svgCompresor(on);
  if (id.startsWith('cond')) return svgCondensador(on);
  return svgBomba(on);
}

export function updateEquipos(snapshot) {
  const list = document.getElementById('equipos-list');
  if (!list) return;

  const equipos = snapshot.equipos ?? [];

  list.innerHTML = equipos.map(eq => {
    const st   = ensureState(eq.id, eq.on);
    const time = formatDuration(Date.now() - st.since);
    return `
      <li class="equipo-row ${eq.on ? 'is-on' : 'is-off'}" title="${eq.on ? 'ON' : 'OFF'} desde hace ${time}">
        <span class="equipo-icon-wrap">${svgFor(eq.id, eq.on)}</span>
        <div class="equipo-body">
          <div class="equipo-line">
            <span class="equipo-label">${eq.label}</span>
            <span class="equipo-status ${eq.on ? 'on' : 'off'}">${eq.on ? 'ON' : 'OFF'}</span>
          </div>
          <div class="equipo-time">${eq.on ? 'En marcha' : 'Detenido'} · ${time}</div>
        </div>
      </li>
    `;
  }).join('');
}
