// Sidebar: badge alarmas + estado del sistema + logout + dropdown user.
// La navegación entre vistas la gestiona router.js para evitar duplicar
// listeners (el sidebar es el activador visual, el router cambia la vista).

export function initSidebar() {
  // Logout con confirmación. En MVP: redirige al inicio.
  const logout = document.getElementById('sidebar-logout');
  if (logout) {
    logout.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('¿Cerrar sesión del operador?')) {
        // Punto de extensión: aquí iría limpiar token / redirect.
        location.reload();
      }
    });
  }

  // Dropdown del usuario en header — abre con click y con Enter/Space.
  const userBtn = document.getElementById('header-user');
  const userMenu = document.getElementById('user-menu');
  if (userBtn && userMenu) {
    const toggleMenu = (e) => {
      e.stopPropagation();
      const open = userMenu.classList.toggle('open');
      userBtn.setAttribute('aria-expanded', String(open));
    };
    userBtn.addEventListener('click', toggleMenu);
    userBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(e); }
    });
    document.addEventListener('click', () => {
      userMenu.classList.remove('open');
      userBtn.setAttribute('aria-expanded', 'false');
    });
    userMenu.addEventListener('click', e => e.stopPropagation());
    const userLogout = document.getElementById('user-menu-logout');
    if (userLogout) {
      userLogout.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('¿Cerrar sesión del operador?')) location.reload();
      });
    }
  }
}

export function setAlarmCount(n) {
  const b = document.getElementById('alarm-badge');
  if (!b) return;
  b.textContent = n;
  b.classList.toggle('has-alarms', n > 0);
}

// Salud del sistema (NORMAL / ATENCIÓN / CRÍTICO). Independiente del SSE.
export function setSystemStatus(state) {
  const t = document.getElementById('sys-status-text');
  const d = document.getElementById('sys-status-dot');
  const v = document.getElementById('sys-status-value');
  if (t) t.textContent = state;

  if (d) {
    d.classList.toggle('ok',   state === 'NORMAL');
    d.classList.toggle('warn', state === 'ATENCIÓN');
    d.classList.toggle('err',  state === 'CRÍTICO');
  }
  if (v) {
    v.classList.toggle('warn', state === 'ATENCIÓN');
    v.classList.toggle('err',  state === 'CRÍTICO');
  }
}

// Conexión SSE: indicador independiente en el header.
export function setConnectionStatus(connected) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  if (dot) {
    dot.classList.toggle('ok',  connected);
    dot.classList.toggle('err', !connected);
  }
  if (label) label.textContent = connected ? 'EN LÍNEA' : 'OFFLINE';
}
