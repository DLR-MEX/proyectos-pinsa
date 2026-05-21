// Header user dropdown — switch entre 3 usuarios + persistencia localStorage

let _currentUser = 'LUIS R.';

export function getUsuarioActual() {
  return _currentUser;
}

export function setUsuarioActual(nombre) {
  _currentUser = nombre;

  const nameEl = document.getElementById('header-user-name');
  if (nameEl) nameEl.textContent = nombre + ' ▾';

  const menuName = document.getElementById('user-menu-name');
  if (menuName) menuName.textContent = nombre;

  localStorage.setItem('pinsa_usuario', nombre);

  window.dispatchEvent(new CustomEvent('usuario-cambiado', { detail: { usuario: nombre } }));
}

export function initHeaderUser() {
  const userBtn = document.getElementById('header-user');
  const userMenu = document.getElementById('user-menu');

  if (!userBtn || !userMenu) {
    console.warn('[headerUser] elementos no encontrados en el DOM');
    return;
  }

  // Cargar usuario guardado o default
  const savedUser = localStorage.getItem('pinsa_usuario') || 'LUIS R.';
  setUsuarioActual(savedUser);

  // Toggle menu on click
  userBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!userBtn.contains(e.target)) {
      userMenu.classList.remove('open');
    }
  });

  // Switch user on button click
  userMenu.querySelectorAll('[data-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      setUsuarioActual(btn.dataset.user);
      userMenu.classList.remove('open');
    });
  });

  // Logout
  const logoutBtn = document.getElementById('user-menu-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      userMenu.classList.remove('open');
      console.log('[headerUser] logout — sesión cerrada');
    });
  }

  console.log('[headerUser] initialized, current user:', _currentUser);
}