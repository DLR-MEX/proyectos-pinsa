// Escena Babylon 3D — 11 cocedores usando el modelo GLB industrial.
// Cada cocedor = instancia del GLB + PointLight de estado + aro de selección.
// Fallback automático a geometría procedural si el GLB no carga.

const COCEDOR_SPACING = 5.5;
const COCEDOR_BODY_R  = 1.4;
const COCEDOR_BODY_H  = 3.2;

let engine = null;
let scene  = null;
let camera = null;
let cocedorNodes = [];
let _onSelect = null;
let _onOpenDetail = null;
let _selectedId = null;
let _labelsRoot = null;

// GLB state
let _glbContainer = null;
let _glbReady     = false;
let _glbScaleX    = 1;
let _glbScaleY    = 1;
let _glbScaleZ    = 1;
let _glbYOffset   = 0;
let _pendingSnapshot = null;

const GLB_PATH = '/images/';
const GLB_FILE = 'Meshy_AI_Horizontal_process_ve_0521162050_generate.glb';

const STATE_LABEL = {
  EN_PROCESO:    'EN PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTENIMIENTO',
  DESACTIVADO:   'DESACTIVADO',
};

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
  _onSelect = onSelect;
  _onOpenDetail = onOpenDetail;
  _labelsRoot = labelsRoot;

  engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
  scene  = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.78, 0.80, 0.83, 1);
  scene.ambientColor = new BABYLON.Color3(0.30, 0.32, 0.35);

  const totalW = (ids.length - 1) * COCEDOR_SPACING;
  const center = new BABYLON.Vector3(totalW / 2, 0, 0);

  camera = new BABYLON.ArcRotateCamera('cam', -Math.PI * 0.42, Math.PI * 0.36, totalW * 0.45, center, scene);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 15;
  camera.lowerRadiusLimit = totalW * 0.35;
  camera.upperRadiusLimit = totalW * 1.0;
  camera.lowerBetaLimit = Math.PI * 0.12;
  camera.upperBetaLimit = Math.PI * 0.48;
  camera.panningSensibility = 0;
  camera.minZ = 0.1;

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.2), scene);
  hemi.intensity = 0.45;
  hemi.diffuse  = new BABYLON.Color3(0.80, 0.82, 0.85);
  hemi.groundColor = new BABYLON.Color3(0.25, 0.27, 0.30);

  const key = new BABYLON.DirectionalLight('key', new BABYLON.Vector3(-0.4, -0.9, 0.5), scene);
  key.intensity = 0.55;
  key.diffuse = new BABYLON.Color3(0.85, 0.85, 0.88);
  key.position = new BABYLON.Vector3(totalW / 2, 14, -10);

  const fill = new BABYLON.PointLight('fill', new BABYLON.Vector3(totalW / 2, 4, 6), scene);
  fill.intensity = 0.15;
  fill.diffuse = new BABYLON.Color3(0.70, 0.72, 0.75);

  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: totalW + 8, height: 8 }, scene);
  ground.position = new BABYLON.Vector3(totalW / 2, -COCEDOR_BODY_R - 0.95, 0);
  const groundMat = new BABYLON.StandardMaterial('gmat', scene);
  groundMat.diffuseColor  = new BABYLON.Color3(0.32, 0.34, 0.37);
  groundMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  groundMat.alpha = 1.0;
  ground.material = groundMat;
  ground.receiveShadows = true;

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

  engine.runRenderLoop(() => {
    scene.render();
    if (_glbReady && cocedorNodes.length > 0) updateLabels();
  });

  const resize = () => engine.resize();
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => engine.resize()).observe(canvas.parentElement);
  }
  requestAnimationFrame(() => engine.resize());
  setTimeout(() => engine.resize(), 100);

  _loadGLBAndBuild(ids);

  return { scene, engine };
}

// ─── Carga asíncrona del GLB y construcción de los 11 nodos ──────────────────
async function _loadGLBAndBuild(ids) {
  try {
    _glbContainer = await BABYLON.SceneLoader.LoadAssetContainerAsync(
      GLB_PATH, GLB_FILE, scene
    );

    // Medir dimensiones del modelo con una instancia temporal
    const probe = _glbContainer.instantiateModelsToScene(n => `__probe_${n}`, false);
    const probeRoot = probe.rootNodes[0];
    probeRoot.computeWorldMatrix(true);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const m of probeRoot.getChildMeshes(false)) {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo();
      const bi = m.getBoundingInfo();
      if (!bi) continue;
      const mn = bi.boundingBox.minimumWorld;
      const mx = bi.boundingBox.maximumWorld;
      minX = Math.min(minX, mn.x); maxX = Math.max(maxX, mx.x);
      minY = Math.min(minY, mn.y); maxY = Math.max(maxY, mx.y);
      minZ = Math.min(minZ, mn.z); maxZ = Math.max(maxZ, mx.z);
    }
    probeRoot.dispose(false, true);

    // Si no se obtuvieron bounds válidos, usar valores por defecto
    if (!isFinite(minX)) { minX = -1; maxX = 1; minY = -1; maxY = 1; minZ = -1; maxZ = 1; }

    const sX = maxX - minX, sY = maxY - minY, sZ = maxZ - minZ;
    // Orientar el eje largo del GLB (sZ) a lo largo de world-X (spacing direction)
    // vía rotation.y=π/2. Escala no-uniforme para proporciones correctas.
    const isXLongest = sX >= sY && sX >= sZ;
    const isZLongest = !isXLongest && (sZ >= sY);
    if (isXLongest) {
      // Eje largo del modelo ya va por world X (verificado empíricamente)
      _glbScaleX  = (COCEDOR_SPACING * 0.82) / (sX || 1);   // worldX (largo)
      _glbScaleY  = (COCEDOR_BODY_R * 2.2)   / (sY || 1);   // worldY (diámetro)
      _glbScaleZ  = (COCEDOR_BODY_R * 2.2)   / (sZ || 1);   // worldZ (profundidad)
    } else if (isZLongest) {
      _glbScaleZ  = (COCEDOR_SPACING * 0.82) / (sZ || 1);
      _glbScaleY  = (COCEDOR_BODY_R * 2.2)   / (sY || 1);
      _glbScaleX  = (COCEDOR_BODY_R * 2.2)   / (sX || 1);
    } else {
      // Y más largo (fallback uniforme)
      const longest = Math.max(sX, sY, sZ) || 1;
      _glbScaleX = _glbScaleY = _glbScaleZ = (COCEDOR_SPACING * 0.82) / longest;
    }
    _glbYOffset = -(minY + sY / 2) * _glbScaleY;

    console.log('[scene3d] GLB cargado OK — bounds:', { sX: sX.toFixed(3), sY: sY.toFixed(3), sZ: sZ.toFixed(3) }, 'scales:', { x: _glbScaleX.toFixed(2), y: _glbScaleY.toFixed(2), z: _glbScaleZ.toFixed(2) });
  } catch (e) {
    console.warn('[scene3d] GLB no disponible, usando fallback procedural:', e.message);
    _glbContainer = null;
  }

  cocedorNodes = ids.map((id, i) => {
    const x = i * COCEDOR_SPACING;
    if (_glbContainer) {
      try { return _buildCocedorGLB(id, x); }
      catch (e) { console.warn('[scene3d] GLB build failed para', id, ':', e.message); }
    }
    return _buildCocedorProcedural(id, x);
  });

  _glbReady = true;

  if (_pendingSnapshot) {
    const snap = _pendingSnapshot;
    _pendingSnapshot = null;
    updateCocedoresScene(snap);
  }
  selectId(_selectedId ?? cocedorNodes[0]?.id);
}

// ─── Cocedor basado en el modelo GLB ─────────────────────────────────────────
function _buildCocedorGLB(id, x) {
  const result = _glbContainer.instantiateModelsToScene(
    n => `coc_${id}_${n}`, false, { doNotInstantiate: false }
  );

  const glbRoot = result.rootNodes[0];
  // rotation.y=π/2: eje largo del modelo (Z) → world X (dirección del espaciado)
  glbRoot.rotation.y = Math.PI / 2;
  glbRoot.scaling = new BABYLON.Vector3(_glbScaleX, _glbScaleY, _glbScaleZ);
  glbRoot.position = new BABYLON.Vector3(x, _glbYOffset, 0);

  // Convertir materiales GLB a escala de grises neutros (tema claro PINSA)
  for (const m of glbRoot.getChildMeshes(false)) {
    if (m.material) {
      const mat = m.material.clone(`${m.material.name}_gray_${id}`);
      if (mat.albedoColor) {
        // PBR (GLB default) — mismo tono gris industrial que el render detalle
        mat.albedoColor = new BABYLON.Color3(0.28, 0.30, 0.33);
        mat.metallic = 0.10;
        mat.roughness = 0.90;
      } else if (mat.diffuseColor) {
        // StandardMaterial fallback
        mat.diffuseColor = new BABYLON.Color3(0.28, 0.30, 0.33);
        mat.specularColor = new BABYLON.Color3(0.15, 0.16, 0.18);
        mat.specularPower = 20;
      }
      m.material = mat;
    }
    m.metadata = { cocedorId: id };
  }

  // PointLight de estado en el centro del cocedor
  const statusLight = new BABYLON.PointLight(`sl_${id}`,
    new BABYLON.Vector3(x, 0, 0), scene
  );
  statusLight.intensity = 1.2;
  statusLight.range = 6;
  statusLight.diffuse = new BABYLON.Color3(0.96, 0.65, 0.14);

  // Disco emisivo pequeño — indicador de estado, visible desde la cámara (-Z)
  const glowDisc = BABYLON.MeshBuilder.CreateDisc(`gd_${id}`,
    { radius: COCEDOR_BODY_R * 0.25, tessellation: 24 }, scene
  );
  glowDisc.rotation.y = Math.PI;
  glowDisc.position.set(x, 0, -(COCEDOR_BODY_R * 1.1 + 0.04));
  const glowMat = new BABYLON.StandardMaterial(`gmat_${id}`, scene);
  glowMat.diffuseColor  = new BABYLON.Color3(0.15, 0.17, 0.20);
  glowMat.emissiveColor = new BABYLON.Color3(0.12, 0.08, 0.02);
  glowMat.specularColor = new BABYLON.Color3(0, 0, 0);
  glowDisc.material = glowMat;
  glowDisc.metadata = { cocedorId: id };

  // Aro de selección centrado, orientado hacia la cámara
  const selectionGlow = BABYLON.MeshBuilder.CreateTorus(`selglow_${id}`,
    { diameter: COCEDOR_BODY_R * 2.4, thickness: 0.05, tessellation: 32 }, scene
  );
  selectionGlow.rotation.x = Math.PI / 2;
  selectionGlow.position.set(x, 0, 0);
  const selMat = new BABYLON.StandardMaterial(`sel_${id}`, scene);
  selMat.emissiveColor = new BABYLON.Color3(0.18, 0.50, 0.85);
  selMat.diffuseColor  = new BABYLON.Color3(0, 0, 0);
  selectionGlow.material = selMat;
  selectionGlow.isVisible = false;

  // Anclas para labels HTML overlay
  const anchorTop = new BABYLON.TransformNode(`anchorTop_${id}`, scene);
  anchorTop.position.set(x, COCEDOR_BODY_R + 1.8, 0);

  const anchor = new BABYLON.TransformNode(`anchor_${id}`, scene);
  anchor.position.set(x, -COCEDOR_BODY_R - 0.8, 0);

  return { id, glbRoot, statusLight, glowMat, anchor, anchorTop, selectionGlow };
}

// ─── Fallback procedural (idéntico al original) ───────────────────────────────
function _buildCocedorProcedural(id, x) {
  const root = new BABYLON.TransformNode(`coc_${id}`, scene);
  root.position.x = x;

  const steel = new BABYLON.StandardMaterial(`mat_steel_${id}`, scene);
  steel.diffuseColor  = new BABYLON.Color3(0.28, 0.30, 0.33);
  steel.specularColor = new BABYLON.Color3(0.15, 0.16, 0.18);
  steel.specularPower = 20;

  const steelDark = new BABYLON.StandardMaterial(`mat_steelDark_${id}`, scene);
  steelDark.diffuseColor = new BABYLON.Color3(0.18, 0.20, 0.23);

  const rim = new BABYLON.StandardMaterial(`mat_rim_${id}`, scene);
  rim.diffuseColor  = new BABYLON.Color3(0.35, 0.37, 0.40);
  rim.specularColor = new BABYLON.Color3(0.25, 0.27, 0.30);
  rim.specularPower = 30;

  const cavityMat = new BABYLON.StandardMaterial(`mat_cav_${id}`, scene);
  cavityMat.diffuseColor  = new BABYLON.Color3(0.12, 0.14, 0.17);
  cavityMat.emissiveColor = new BABYLON.Color3(0.02, 0.03, 0.04);
  cavityMat.specularColor = new BABYLON.Color3(0, 0, 0);

  const body = BABYLON.MeshBuilder.CreateCylinder(`body_${id}`,
    { diameter: COCEDOR_BODY_R * 2, height: COCEDOR_BODY_H, tessellation: 32 }, scene);
  body.rotation.x = Math.PI / 2;
  body.material = steel;
  body.parent = root;
  body.metadata = { cocedorId: id };

  const back = BABYLON.MeshBuilder.CreateDisc(`back_${id}`,
    { radius: COCEDOR_BODY_R * 0.99, tessellation: 32 }, scene);
  back.position.z = COCEDOR_BODY_H / 2 + 0.01;
  back.material = steelDark;
  back.parent = root;
  back.metadata = { cocedorId: id };

  const cav = BABYLON.MeshBuilder.CreateDisc(`cav_${id}`,
    { radius: COCEDOR_BODY_R * 0.92, tessellation: 32 }, scene);
  cav.rotation.y = Math.PI;
  cav.position.z = COCEDOR_BODY_H / 2 - 0.06;
  cav.material = cavityMat;
  cav.parent = root;
  cav.metadata = { cocedorId: id };

  const ring = BABYLON.MeshBuilder.CreateTorus(`ring_${id}`,
    { diameter: COCEDOR_BODY_R * 2.0, thickness: 0.10, tessellation: 32 }, scene);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -COCEDOR_BODY_H / 2;
  ring.material = rim;
  ring.parent = root;
  ring.metadata = { cocedorId: id };

  for (let bk = 0; bk < 2; bk++) {
    const band = BABYLON.MeshBuilder.CreateTorus(`band_${id}_${bk}`,
      { diameter: COCEDOR_BODY_R * 2.04, thickness: 0.06, tessellation: 24 }, scene);
    band.rotation.x = Math.PI / 2;
    band.position.z = (bk === 0 ? -1 : 1) * (COCEDOR_BODY_H * 0.28);
    band.material = rim;
    band.parent = root;
    band.metadata = { cocedorId: id };
  }

  for (const pz of [-COCEDOR_BODY_H * 0.32, COCEDOR_BODY_H * 0.32]) {
    const leg = BABYLON.MeshBuilder.CreateBox(`leg_${id}_${pz}`,
      { width: 0.50, height: 0.95, depth: 0.18 }, scene);
    leg.position.set(0, -COCEDOR_BODY_R - 0.45, pz);
    leg.material = steelDark;
    leg.parent = root;
    leg.metadata = { cocedorId: id };
  }

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

  const anchor = new BABYLON.TransformNode(`anchor_${id}`, scene);
  anchor.position.set(0, -COCEDOR_BODY_R - 0.95, 0);
  anchor.parent = root;

  const anchorTop = new BABYLON.TransformNode(`anchorTop_${id}`, scene);
  anchorTop.position.set(0, COCEDOR_BODY_R + 1.3, 0);
  anchorTop.parent = root;

  return { id, root, cavityMat, anchor, anchorTop, selectionGlow };
}

// ─── Actualización de estado ──────────────────────────────────────────────────
export function updateCocedoresScene(snapshot) {
  if (!scene) return;
  if (!_glbReady) {
    _pendingSnapshot = snapshot;
    return;
  }

  const byId = new Map(snapshot.cocedores.map(c => [c.id, c]));
  for (const node of cocedorNodes) {
    const c = byId.get(node.id);
    if (!c) continue;
    const col  = STATE_COLOR()[c.status] ?? STATE_COLOR().DESACTIVADO;
    const hot  = c.status === 'EN_PROCESO';
    const dead = c.status === 'DESACTIVADO' || c.status === 'MANTENIMIENTO';

    if (node.statusLight) {
      // GLB path: actualizar PointLight de estado
      node.statusLight.diffuse = col;
      node.statusLight.intensity = dead ? 0.05 : hot ? 1.4 : 0.75;

      // Disco emisivo en la apertura
      if (node.glowMat) {
        node.glowMat.emissiveColor = dead
          ? new BABYLON.Color3(0.01, 0.01, 0.015)
          : new BABYLON.Color3(col.r * (hot ? 0.55 : 0.22), col.g * (hot ? 0.55 : 0.22), col.b * (hot ? 0.55 : 0.22));
      }
    } else if (node.cavityMat) {
      // Fallback procedural
      node.cavityMat.emissiveColor = dead
        ? new BABYLON.Color3(0.02, 0.025, 0.035)
        : new BABYLON.Color3(col.r * (hot ? 0.55 : 0.18), col.g * (hot ? 0.55 : 0.18), col.b * (hot ? 0.55 : 0.18));
    }

    node.status   = c.status;
    node.label    = c.label;
    node.carritos = c.carritos.length;
  }
  selectId(_selectedId);
}

export function selectId(id) {
  _selectedId = id;
  for (const node of cocedorNodes) {
    if (node.selectionGlow) node.selectionGlow.isVisible = node.id === id;
  }
  updateLabels();
}

// ─── Labels HTML overlay ──────────────────────────────────────────────────────
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
    const topPos = BABYLON.Vector3.Project(
      n.anchorTop.getAbsolutePosition(),
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      new BABYLON.Viewport(0, 0, w, h),
    );
    const botPos = BABYLON.Vector3.Project(
      n.anchor.getAbsolutePosition(),
      BABYLON.Matrix.Identity(),
      scene.getTransformMatrix(),
      new BABYLON.Viewport(0, 0, w, h),
    );
    const nameEl  = _labelsRoot.querySelector(`.coc-label[data-coc-id="${n.id}"][data-kind="name"]`);
    const badgeEl = _labelsRoot.querySelector(`.coc-label[data-coc-id="${n.id}"][data-kind="badge"]`);
    if (nameEl) {
      nameEl.style.left = `${topPos.x}px`;
      nameEl.style.top  = `${topPos.y}px`;
      nameEl.classList.toggle('is-selected', n.id === _selectedId);
    }
    if (badgeEl) {
      badgeEl.style.left = `${botPos.x}px`;
      badgeEl.style.top  = `${botPos.y}px`;
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
  _glbContainer = null;
  _glbReady = false;
  _pendingSnapshot = null;
}
