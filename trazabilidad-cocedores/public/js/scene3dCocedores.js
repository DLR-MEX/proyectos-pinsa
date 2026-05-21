// Escena Babylon 3D — 11 cocedores cilíndricos horizontales en fila.
// Cada cocedor = cuerpo cilíndrico + 2 tapas (frontal abierta, trasera) +
// patas + manómetro decorativo + luz interior.
// Click selecciona, doble click dispara onOpenDetail.

const COCEDOR_SPACING = 4.4;  // separación entre cocedores en X
const COCEDOR_BODY_R  = 1.4;
const COCEDOR_BODY_H  = 3.2;  // largo del cilindro horizontal
const RIM_R           = 1.5;
const RIM_H           = 0.18;

let engine = null;
let scene  = null;
let camera = null;
let cocedorNodes = [];          // [{ id, root, bodyMat, statusLight, anchor }]
let _onSelect = null;
let _onOpenDetail = null;
let _selectedId = null;
let _labelsRoot = null;
let _hover = null;

const STATE_LABEL = {
  EN_PROCESO:    'EN PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTENIMIENTO',
  DESACTIVADO:   'DESACTIVADO',
};

// Colores por estado — lazy init para no requerir BABYLON al evaluar el módulo.
let _STATE_COLOR = null;
function STATE_COLOR() {
  if (_STATE_COLOR) return _STATE_COLOR;
  _STATE_COLOR = {
    EN_PROCESO:    new BABYLON.Color3(0.95, 0.65, 0.15),
    LISTO:         new BABYLON.Color3(0.00, 0.78, 0.59),
    ESPERA:        new BABYLON.Color3(0.96, 0.65, 0.14),
    MANTENIMIENTO: new BABYLON.Color3(0.55, 0.62, 0.68),
    DESACTIVADO:   new BABYLON.Color3(0.35, 0.42, 0.48),
  };
  return _STATE_COLOR;
}

export function initCocedoresScene({ canvas, labelsRoot, ids, onSelect, onOpenDetail }) {
  console.log('[scene3d] init start, canvas size=', canvas.clientWidth, 'x', canvas.clientHeight,
              ' ids=', ids.length);
  _onSelect = onSelect;
  _onOpenDetail = onOpenDetail;
  _labelsRoot = labelsRoot;

  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
  console.log('[scene3d] engine created, render width=', engine.getRenderWidth(), 'height=', engine.getRenderHeight());
  scene  = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.024, 0.055, 0.094, 1);
  scene.ambientColor = new BABYLON.Color3(0.18, 0.22, 0.30);

  // Cámara: vista 3/4 desde el frente (donde están las aperturas, lado -Z del
  // cilindro acostado en X). alpha ~ -π/2 + π/5 = -0.94 → cámara delante y
  // ligeramente a la derecha, beta 0.36π → un poco arriba.
  const totalW = (ids.length - 1) * COCEDOR_SPACING;
  const center = new BABYLON.Vector3(totalW / 2, 0, 0);
  camera = new BABYLON.ArcRotateCamera(
    'cam',
    -Math.PI * 0.42,   // frente con ligero sesgo
    Math.PI * 0.36,    // 3/4 desde arriba
    totalW * 0.95,
    center,
    scene,
  );
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 15;
  camera.lowerRadiusLimit = totalW * 0.55;
  camera.upperRadiusLimit = totalW * 1.8;
  camera.lowerBetaLimit = Math.PI * 0.12;
  camera.upperBetaLimit = Math.PI * 0.48;
  camera.panningSensibility = 0;
  camera.minZ = 0.1;

  // Luces — intensidades altas para garantizar visibilidad
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.2), scene);
  hemi.intensity = 0.85;
  hemi.diffuse  = new BABYLON.Color3(0.92, 0.96, 1.0);
  hemi.groundColor = new BABYLON.Color3(0.10, 0.14, 0.22);

  const key = new BABYLON.DirectionalLight('key', new BABYLON.Vector3(-0.4, -0.9, 0.5), scene);
  key.intensity = 0.95;
  key.diffuse = new BABYLON.Color3(0.95, 0.97, 1.0);
  key.position = new BABYLON.Vector3(totalW / 2, 12, -8);

  const fill = new BABYLON.PointLight('fill', new BABYLON.Vector3(totalW / 2, 4, 6), scene);
  fill.intensity = 0.35;
  fill.diffuse = new BABYLON.Color3(0.36, 0.55, 0.95);

  // Piso reflectivo sutil
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: totalW + 6, height: 6, subdivisions: 1 }, scene);
  ground.position = new BABYLON.Vector3(totalW / 2, -COCEDOR_BODY_R - 0.95, 0);
  const groundMat = new BABYLON.StandardMaterial('gmat', scene);
  groundMat.diffuseColor  = new BABYLON.Color3(0.03, 0.06, 0.10);
  groundMat.specularColor = new BABYLON.Color3(0.05, 0.08, 0.12);
  groundMat.alpha = 0.85;
  ground.material = groundMat;
  ground.receiveShadows = true;

  // Sombras desde la luz key — opcionales (algunos drivers WebGL fallan).
  let shadowGen = null;
  try {
    shadowGen = new BABYLON.ShadowGenerator(1024, key);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurScale = 2;
    shadowGen.usePoissonSampling = true;
  } catch (e) {
    console.warn('[scene3d] sombras deshabilitadas:', e.message);
    shadowGen = null;
  }

  // Construir 11 cocedores
  cocedorNodes = [];
  ids.forEach((id, i) => {
    const x = i * COCEDOR_SPACING;
    const node = buildCocedor(scene, id, x);
    // ShadowGenerator espera Mesh (no TransformNode). Hay que añadir los hijos.
    if (shadowGen) {
      try {
        const meshes = node.root.getChildMeshes(false);
        for (const m of meshes) {
          if (m && typeof m.getBoundingInfo === 'function') {
            shadowGen.addShadowCaster(m);
          }
        }
      } catch (e) {
        console.warn('[scene3d] shadow add failed for', id, ':', e.message);
      }
    }
    cocedorNodes.push(node);
  });
  console.log('[scene3d] built', cocedorNodes.length, 'cocedores; total meshes=', scene.meshes.length);

  // Picking → seleccionar + abrir detalle (click simple)
  scene.onPointerObservable.add((info) => {
    if (info.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
    const pick = info.pickInfo;
    if (!pick?.hit) return;
    const cocedorId = pick.pickedMesh?.metadata?.cocedorId;
    if (!cocedorId) return;
    selectId(cocedorId);
    _onSelect?.(cocedorId);
    _onOpenDetail?.(cocedorId);
  });

  // Loop + observer para posicionar labels
  let _firstRender = true;
  engine.runRenderLoop(() => {
    scene.render();
    updateLabels();
    if (_firstRender) {
      _firstRender = false;
      console.log('[scene3d] primer frame renderizado, dims=', engine.getRenderWidth(), 'x', engine.getRenderHeight());
    }
  });

  // Resize
  const resize = () => engine.resize();
  window.addEventListener('resize', resize);
  // ResizeObserver para cuando el panel cambia de tamaño
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas.parentElement);
  }
  // Forzar primer resize en el siguiente frame, ya con layout estable
  requestAnimationFrame(() => engine.resize());
  setTimeout(() => engine.resize(), 100);

  return { scene, engine };
}

function buildCocedor(scene, id, x) {
  // Cocedor con eje longitudinal en Z (perpendicular al pasillo).
  // Apertura en -Z (mirando hacia el frente, hacia la cámara).
  // Profundidad del cilindro: hacia +Z.
  const root = new BABYLON.TransformNode(`coc_${id}`, scene);
  root.position.x = x;

  // Materiales
  const steel = new BABYLON.StandardMaterial(`mat_steel_${id}`, scene);
  steel.diffuseColor  = new BABYLON.Color3(0.40, 0.50, 0.62);
  steel.specularColor = new BABYLON.Color3(0.55, 0.62, 0.72);
  steel.specularPower = 64;

  const steelDark = new BABYLON.StandardMaterial(`mat_steelDark_${id}`, scene);
  steelDark.diffuseColor = new BABYLON.Color3(0.16, 0.22, 0.30);

  const rim = new BABYLON.StandardMaterial(`mat_rim_${id}`, scene);
  rim.diffuseColor  = new BABYLON.Color3(0.62, 0.74, 0.88);
  rim.specularColor = new BABYLON.Color3(0.8, 0.85, 0.95);
  rim.specularPower = 100;

  const cavityMat = new BABYLON.StandardMaterial(`mat_cav_${id}`, scene);
  cavityMat.diffuseColor  = new BABYLON.Color3(0.04, 0.06, 0.10);
  cavityMat.emissiveColor = new BABYLON.Color3(0.05, 0.07, 0.10);
  cavityMat.specularColor = new BABYLON.Color3(0, 0, 0);

  // Cuerpo cilíndrico — eje en Z (CreateCylinder por defecto en Y; rotamos
  // sobre X 90° para que quede acostado a lo largo de Z).
  const body = BABYLON.MeshBuilder.CreateCylinder(`body_${id}`,
    { diameter: COCEDOR_BODY_R * 2, height: COCEDOR_BODY_H, tessellation: 32 }, scene);
  body.rotation.x = Math.PI / 2;     // acuesta sobre Z
  body.material = steel;
  body.parent = root;
  body.metadata = { cocedorId: id };

  // Tapa trasera (disco en +Z)
  const back = BABYLON.MeshBuilder.CreateDisc(`back_${id}`,
    { radius: COCEDOR_BODY_R * 0.99, tessellation: 32 }, scene);
  back.position.z = COCEDOR_BODY_H / 2 + 0.01;
  back.material = steelDark;
  back.parent = root;
  back.metadata = { cocedorId: id };

  // Cara frontal — la cavidad iluminada (disco al fondo, visible por apertura)
  const cav = BABYLON.MeshBuilder.CreateDisc(`cav_${id}`,
    { radius: COCEDOR_BODY_R * 0.92, tessellation: 32 }, scene);
  cav.rotation.y = Math.PI;          // cara mirando hacia -Z (al frente)
  cav.position.z = COCEDOR_BODY_H / 2 - 0.06;
  cav.material = cavityMat;
  cav.parent = root;
  cav.metadata = { cocedorId: id };

  // Aro frontal — reborde brillante que enmarca la apertura
  const ring = BABYLON.MeshBuilder.CreateTorus(`ring_${id}`,
    { diameter: COCEDOR_BODY_R * 2.0, thickness: 0.10, tessellation: 32 }, scene);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -COCEDOR_BODY_H / 2;
  ring.material = rim;
  ring.parent = root;
  ring.metadata = { cocedorId: id };

  // Bandas decorativas alrededor del cilindro
  for (let bk = 0; bk < 2; bk++) {
    const band = BABYLON.MeshBuilder.CreateTorus(`band_${id}_${bk}`,
      { diameter: COCEDOR_BODY_R * 2.04, thickness: 0.06, tessellation: 24 }, scene);
    band.rotation.x = Math.PI / 2;
    band.position.z = (bk === 0 ? -1 : 1) * (COCEDOR_BODY_H * 0.28);
    band.material = rim;
    band.parent = root;
    band.metadata = { cocedorId: id };
  }

  // Patas
  for (const pz of [-COCEDOR_BODY_H * 0.32, COCEDOR_BODY_H * 0.32]) {
    const leg = BABYLON.MeshBuilder.CreateBox(`leg_${id}_${pz}`,
      { width: 0.50, height: 0.95, depth: 0.18 }, scene);
    leg.position.set(0, -COCEDOR_BODY_R - 0.45, pz);
    leg.material = steelDark;
    leg.parent = root;
    leg.metadata = { cocedorId: id };
  }

  // Manómetro decorativo arriba al frente
  const gauge = BABYLON.MeshBuilder.CreateDisc(`gauge_${id}`,
    { radius: 0.18, tessellation: 16 }, scene);
  gauge.rotation.y = Math.PI;
  gauge.position.set(0, COCEDOR_BODY_R * 0.55, -COCEDOR_BODY_R * 0.4);
  gauge.material = rim;
  gauge.parent = root;
  gauge.metadata = { cocedorId: id };

  // Anchor para label inferior (badge)
  const anchor = new BABYLON.TransformNode(`anchor_${id}`, scene);
  anchor.position.set(0, -COCEDOR_BODY_R - 0.95, 0);
  anchor.parent = root;

  // Anchor para nombre superior
  const anchorTop = new BABYLON.TransformNode(`anchorTop_${id}`, scene);
  anchorTop.position.set(0, COCEDOR_BODY_R + 1.3, 0);
  anchorTop.parent = root;

  // Resaltado selección (aro grande alrededor de la apertura)
  const selectionGlow = BABYLON.MeshBuilder.CreateTorus(`selglow_${id}`,
    { diameter: COCEDOR_BODY_R * 2.4, thickness: 0.05, tessellation: 32 }, scene);
  selectionGlow.rotation.x = Math.PI / 2;
  selectionGlow.position.z = -COCEDOR_BODY_H / 2 - 0.06;
  const selMat = new BABYLON.StandardMaterial(`sel_${id}`, scene);
  selMat.emissiveColor = new BABYLON.Color3(0.18, 0.50, 0.85);
  selMat.diffuseColor  = new BABYLON.Color3(0, 0, 0);
  selectionGlow.material = selMat;
  selectionGlow.parent = root;
  selectionGlow.isVisible = false;

  return { id, root, cavityMat, anchor, anchorTop, selectionGlow };
}

export function updateCocedoresScene(snapshot) {
  if (!scene) return;
  const byId = new Map(snapshot.cocedores.map(c => [c.id, c]));
  for (const node of cocedorNodes) {
    const c = byId.get(node.id);
    if (!c) continue;
    // Color "luz interior" según estado
    const col = STATE_COLOR()[c.status] ?? STATE_COLOR().DESACTIVADO;
    const hot = c.status === 'EN_PROCESO';
    node.cavityMat.emissiveColor.copyFrom(col).scale(hot ? 0.6 : 0.20, node.cavityMat.emissiveColor);
    // Scale es destructivo; mejor asignar directo
    node.cavityMat.emissiveColor = new BABYLON.Color3(
      col.r * (hot ? 0.55 : 0.18),
      col.g * (hot ? 0.55 : 0.18),
      col.b * (hot ? 0.55 : 0.18),
    );
    if (c.status === 'DESACTIVADO' || c.status === 'MANTENIMIENTO') {
      node.cavityMat.emissiveColor = new BABYLON.Color3(0.02, 0.025, 0.035);
    }
    // Almacena estado para los labels
    node.status = c.status;
    node.label  = c.label;
    node.carritos = c.carritos.length;
  }
  selectId(_selectedId);     // re-pintar glow
}

export function selectId(id) {
  _selectedId = id;
  for (const node of cocedorNodes) {
    if (node.selectionGlow) node.selectionGlow.isVisible = node.id === id;
  }
  updateLabels();
}

function updateLabels() {
  if (!_labelsRoot || !engine || !scene || cocedorNodes.length === 0) return;
  if (_labelsRoot.children.length !== cocedorNodes.length * 2) {
    _labelsRoot.innerHTML = '';
    for (const n of cocedorNodes) {
      const elName = document.createElement('div');
      elName.className = 'coc-label';
      elName.dataset.cocId = n.id;
      elName.dataset.kind = 'name';
      elName.innerHTML = `<span class="lbl-name">${(n.label ?? '').toUpperCase()}</span>`;
      _labelsRoot.append(elName);

      const elBadge = document.createElement('div');
      elBadge.className = 'coc-label';
      elBadge.dataset.cocId = n.id;
      elBadge.dataset.kind = 'badge';
      elBadge.innerHTML = `<span class="lbl-badge" data-state="ESPERA">ESPERA</span>`;
      elBadge.addEventListener('click', () => {
        selectId(n.id);
        _onSelect?.(n.id);
        _onOpenDetail?.(n.id);
      });
      _labelsRoot.append(elBadge);
    }
  }

  const canvas = engine.getRenderingCanvas();
  const w = canvas.clientWidth, h = canvas.clientHeight;

  for (const n of cocedorNodes) {
    if (!n.anchorTop || !n.anchor) continue;
    const topPos   = BABYLON.Vector3.Project(
      n.anchorTop.getAbsolutePosition(),
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      new BABYLON.Viewport(0, 0, w, h),
    );
    const botPos   = BABYLON.Vector3.Project(
      n.anchor.getAbsolutePosition(),
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      new BABYLON.Viewport(0, 0, w, h),
    );
    const nameEl  = _labelsRoot.querySelector(`.coc-label[data-coc-id="${n.id}"][data-kind="name"]`);
    const badgeEl = _labelsRoot.querySelector(`.coc-label[data-coc-id="${n.id}"][data-kind="badge"]`);
    if (nameEl)  { nameEl.style.left  = `${topPos.x}px`; nameEl.style.top  = `${topPos.y}px`;
                   nameEl.classList.toggle('is-selected', n.id === _selectedId); }
    if (badgeEl) {
      badgeEl.style.left = `${botPos.x}px`; badgeEl.style.top = `${botPos.y}px`;
      const b = badgeEl.querySelector('.lbl-badge');
      const state = n.status ?? 'ESPERA';
      b.dataset.state = state;
      b.textContent   = STATE_LABEL[state] ?? state;
    }
  }
}

export function disposeCocedoresScene() {
  engine?.stopRenderLoop();
  scene?.dispose();
  engine?.dispose();
  engine = scene = null;
  cocedorNodes = [];
}
