// Cenário do Batalhão de Brinquedo: quintal de verdade num dia de sol (gramado, cerca, árvores, a
// parede da casa) e, numa mesa de jardim, o quintal em miniatura com a grade: grama, vasos, regador,
// tijolos, mangueira e pedras. Soldadinhos de plástico azul contra robôs de corda de lata.
import * as THREE from '../vendor/three/three.module.js';
import { caixaArredondada, sombraContato, halo, ceuGradiente, ambienteDoCeu, solPrincipal, luzCeuChao, neblina } from './visual3d.js';
import { madeira, tijolo } from './materiais3d.js';
import { W, H, OBST } from './rules.js';
import { Label } from './ui.js';

export const CELL = 0.075;
export const TABLE_Y = 0.78;
export const BOARD = { cx: 0, cz: -0.52, y: TABLE_Y + 0.035 };
export const cellPos = (x, y, out = new THREE.Vector3()) => out.set(BOARD.cx + (x - (W - 1) / 2) * CELL, BOARD.y, BOARD.cz + (y - (H - 1) / 2) * CELL);
export function cellAt(p) {
  const x = Math.round((p.x - BOARD.cx) / CELL + (W - 1) / 2), y = Math.round((p.z - BOARD.cz) / CELL + (H - 1) / 2);
  return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
}
export const BTN_Z = BOARD.cz + (H / 2) * CELL + 0.1;   // botões na beirada perto de você

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep = null) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; }
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function grassCanvas(base, seed, n = 2600, size = 256) {
  const c = canvas(size, size), g = c.getContext('2d'), r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++) { const l = 30 + r() * 25, h = 85 + r() * 25; g.fillStyle = `hsla(${h},45%,${l}%,0.55)`; g.fillRect(r() * size, r() * size, 1.5, 3 + r() * 4); }
  return c;
}
const PLAYER_COL = 0x3a78d8, ROBOT_COL = 0xc8463a;

export function buildWorld() {
  const scene = new THREE.Scene();
  const ceu = { zenite: '#4a86d0', horizonte: '#cfe4f2', chao: '#6a8a4a', dirSol: new THREE.Vector3(-0.55, 0.62, 0.45) };
  scene.add(ceuGradiente(ceu));
  neblina(scene, '#cfe4f2', 14, 60);
  scene.background = new THREE.Color('#cfe4f2');
  const sun = solPrincipal(scene, { dir: ceu.dirSol, cor: '#ffe2b4', intensidade: 3.3, raioArea: 1.0, alvo: new THREE.Vector3(BOARD.cx, BOARD.y, BOARD.cz), mapa: 2048 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.004; sun.shadow.camera.far = 8;
  luzCeuChao(scene, { ceu: '#94b8ff', chao: '#8a7a4a', intensidade: 0.5 });

  // ---------- Quintal de verdade ----------
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(grassCanvas('#5f8f3c', 3), [40, 40]), roughness: 0.95 }));
  lawn.receiveShadow = true; scene.add(lawn);
  // cerca de madeira em volta
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.8 });
  const picket = caixaArredondada(0.1, 1.0, 0.03, 0.01, 2).translate(0, 0.5, 0);
  const pickets = new THREE.InstancedMesh(picket, fenceMat, 260);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let k = 0; k < 260; k++) { const a = k / 260 * Math.PI * 2, R = 7; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); m4.compose(p3.set(Math.cos(a) * R, 0, Math.sin(a) * R - 1), q, s3.set(1, 0.9 + (k % 3) * 0.05, 1)); pickets.setMatrixAt(n++, m4); }
  pickets.castShadow = true; scene.add(pickets);
  for (const y of [0.3, 0.75]) { const rail = new THREE.Mesh(new THREE.TorusGeometry(6.98, 0.025, 4, 120).rotateX(Math.PI / 2), fenceMat); rail.position.set(0, y, -1); scene.add(rail); }
  // árvores
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9 });
  const leafMats = [0x4a8a3a, 0x5a9a3a, 0x3a7a3a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
  const tr = rand(7);
  for (const [x, z, s] of [[-4.5, -4.5, 1.2], [4.8, -3.8, 1.0], [-5.6, 1.5, 0.9], [3.2, -5.8, 1.3], [5.8, 1.8, 0.8]]) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 10), trunkMat); t.position.y = 0.8; t.castShadow = true; g.add(t);
    for (let k = 0; k < 4; k++) { const geo = new THREE.IcosahedronGeometry(0.7 + tr() * 0.3, 1); const b = new THREE.Mesh(geo, leafMats[k % 3]); b.position.set((tr() - 0.5) * 0.8, 1.9 + tr() * 0.6, (tr() - 0.5) * 0.8); b.castShadow = true; g.add(b); }
    g.scale.setScalar(s); g.position.set(x, 0, z); scene.add(g);
  }
  // parede da casa ao fundo, com janela e floreira
  const house = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0d8b0, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 0.2), wallMat); wall.position.y = 1.6; house.add(wall);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 1.2), new THREE.MeshStandardMaterial({ color: 0xb8543a, roughness: 0.7 })); roof.position.set(0, 3.25, 0.4); roof.rotation.x = 0.25; house.add(roof);
  for (const x of [-2, 1.6]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshStandardMaterial({ color: 0x8ab8d8, roughness: 0.1, metalness: 0 })); win.position.set(x, 1.8, 0.11); house.add(win);
    const fr = new THREE.Mesh(caixaArredondada(1.25, 1.05, 0.06, 0.02, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })); fr.position.set(x, 1.8, 0.09); house.add(fr);
    const box = new THREE.Mesh(caixaArredondada(1.2, 0.18, 0.22, 0.02, 2), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 })); box.position.set(x, 1.25, 0.2); house.add(box);
    for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: [0xff6a8a, 0xffd24a, 0xffffff][k % 3], roughness: 0.6 })); f.position.set(x - 0.45 + k * 0.18, 1.4, 0.22); house.add(f); }
  }
  const door = new THREE.Mesh(caixaArredondada(0.9, 2.0, 0.08, 0.02, 2), new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.6 })); door.position.set(-0.2, 1.0, 0.12); house.add(door);
  house.position.set(0, 0, -5.4); scene.add(house);
  house.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // brinquedos largados no gramado (escala real: bola, balde)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff5a3a, roughness: 0.45 })); ball.position.set(1.4, 0.11, 0.6); ball.castShadow = true; scene.add(ball);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.5, side: THREE.DoubleSide })); bucket.position.set(-1.3, 0.1, 0.4); bucket.castShadow = true; scene.add(bucket);
  // tufos de grama no chão
  const tuftGeo = new THREE.ConeGeometry(0.025, 0.07, 4);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: 0x7aa84a, roughness: 0.9 }), 400);
  const rr = rand(31);
  for (let k = 0; k < 400; k++) { const a = rr() * Math.PI * 2, r = 0.9 + rr() * 5.5; q.setFromEuler(new THREE.Euler((rr() - 0.5) * 0.4, rr() * 6, (rr() - 0.5) * 0.4)); m4.compose(p3.set(Math.cos(a) * r, 0.05, Math.sin(a) * r - 0.6), q, s3.setScalar(0.6 + rr() * 0.8)); tufts.setMatrixAt(k, m4); }
  scene.add(tufts);

  // ---------- Mesa de jardim ----------
  const woodMat = madeira({ clara: '#c89a6a', escura: '#8a5a3a', tabuas: 5, leve: true, repete: [1, 1] });
  const tableTop = new THREE.Mesh(caixaArredondada(1.24, 0.04, 1.04, 0.012, 2), woodMat);
  tableTop.position.set(BOARD.cx, TABLE_Y - 0.02, BOARD.cz); tableTop.castShadow = tableTop.receiveShadow = true; scene.add(tableTop);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = new THREE.Mesh(caixaArredondada(0.06, TABLE_Y - 0.04, 0.06, 0.01, 2), woodMat); leg.position.set(BOARD.cx + sx * 0.54, (TABLE_Y - 0.04) / 2, BOARD.cz + sz * 0.44); leg.castShadow = true; scene.add(leg); }
  const ts = sombraContato(1.5, 1.3, 0.45); ts.position.set(BOARD.cx, 0.004, BOARD.cz); scene.add(ts);

  // ---------- Tabuleiro (grama em miniatura) ----------
  const bw = W * CELL, bh = H * CELL;
  const bc = canvas(W * 48, H * 48), bg = bc.getContext('2d');
  bg.drawImage(grassCanvas('#78a84c', 9, 5000, Math.max(W, H) * 48), 0, 0);
  bg.strokeStyle = 'rgba(255,255,255,0.18)'; bg.lineWidth = 2;
  for (let x = 0; x <= W; x++) { bg.beginPath(); bg.moveTo(x * 48, 0); bg.lineTo(x * 48, H * 48); bg.stroke(); }
  for (let y = 0; y <= H; y++) { bg.beginPath(); bg.moveTo(0, y * 48); bg.lineTo(W * 48, y * 48); bg.stroke(); }
  const boardSide = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
  const board = new THREE.Mesh(caixaArredondada(bw + 0.02, 0.035, bh + 0.02, 0.006, 2), [boardSide, boardSide, new THREE.MeshStandardMaterial({ map: tex(bc), roughness: 0.95 }), boardSide, boardSide, boardSide]);
  // caixaArredondada não tem grupos de material: usa um plano de grama por cima
  board.material = boardSide;
  board.position.set(BOARD.cx, BOARD.y - 0.0175, BOARD.cz); board.castShadow = board.receiveShadow = true; scene.add(board);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(bc), roughness: 0.95 }));
  grass.position.set(BOARD.cx, BOARD.y + 0.0005, BOARD.cz); grass.receiveShadow = true; grass.userData = { kind: 'board' }; scene.add(grass);
  // fileiras de partida (faixa de terra nos dois lados)
  const dirt = new THREE.MeshStandardMaterial({ color: 0xa88a5a, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false });
  for (const y of [0, H - 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(bw, CELL).rotateX(-Math.PI / 2), dirt); cellPos(0, y, d.position); d.position.x = BOARD.cx; d.position.y += 0.001; scene.add(d); }

  // ---------- Obstáculos ----------
  const obstGroup = new THREE.Group(); scene.add(obstGroup);
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xc8643a, roughness: 0.75 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 });
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.8, flatShading: true });
  const canMat = new THREE.MeshStandardMaterial({ color: 0x2a9a7a, roughness: 0.35, metalness: 0 });
  const brickMat = tijolo({ cor: '#b45a3a', variacao: '#8a3a28', fileiras: 4, leve: true });
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0x3aa83a, roughness: 0.4 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9, flatShading: true });
  const potGeo = new THREE.LatheGeometry([[0, 0], [0.022, 0], [0.03, 0.045], [0.034, 0.05], [0.034, 0.056], [0.03, 0.056], [0, 0.054]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  function makeObstacle(ch, x, y, seed) {
    const g = new THREE.Group();
    const r = rand(seed * 7 + 3);
    if (ch === 'V') {
      g.add(new THREE.Mesh(potGeo, terracotta));
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16).rotateX(-Math.PI / 2), soil); s.position.y = 0.053; g.add(s);
      for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 4), plantMat); l.position.set((r() - 0.5) * 0.03, 0.085, (r() - 0.5) * 0.03); l.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8); g.add(l); }
    } else if (ch === 'R') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.06, 18), canMat); body.position.y = 0.03; g.add(body);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.06, 8), canMat); spout.position.set(0.035, 0.05, 0); spout.rotation.z = -0.9; g.add(spout);
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.004, 0.008, 10), canMat); rose.position.set(0.058, 0.068, 0); rose.rotation.z = -0.9; g.add(rose);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 16, Math.PI), canMat); handle.position.set(-0.005, 0.06, 0); g.add(handle);
      g.rotation.y = r() * 6;
    } else if (ch === 'T') {
      const wall = new THREE.Mesh(caixaArredondada(CELL * 0.96, 0.075, CELL * 0.55, 0.004, 2), brickMat); wall.position.y = 0.0375; g.add(wall);
    } else if (ch === 'h') {
      for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(caixaArredondada(0.05, 0.016, 0.024, 0.003, 2), brickMat); b.position.set(0, 0.008 + k * 0.016, (k - 0.5) * 0.004); b.rotation.y = (r() - 0.5) * 0.3 + (k ? 0.1 : 0); g.add(b); }
      g.rotation.y = r() < 0.5 ? 0 : Math.PI / 2;
    } else if (ch === 'm') {
      for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.026 - k * 0.002, 0.0045, 6, 22).rotateX(Math.PI / 2), hoseMat); t.position.y = 0.005 + k * 0.009; g.add(t); }
    } else if (ch === 'p') {
      const geo = new THREE.IcosahedronGeometry(0.025, 1);
      const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) { const k = 0.8 + ((Math.sin(i * 12.9898 + seed) * 43758.5) % 1 + 1) % 1 * 0.35; pos.setXYZ(i, pos.getX(i) * k * 1.2, pos.getY(i) * k * 0.7, pos.getZ(i) * k); }
      geo.computeVertexNormals();
      const st = new THREE.Mesh(geo, stoneMat); st.position.y = 0.014; g.add(st);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    cellPos(x, y, g.position);
    obstGroup.add(g);
  }
  function setMap(rows) {
    while (obstGroup.children.length) obstGroup.remove(obstGroup.children[0]);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (OBST[ch]) makeObstacle(ch, x, y, x * 31 + y * 7); }));
  }

  // ---------- Marcadores das casas ----------
  const tileGeo = new THREE.PlaneGeometry(CELL * 0.9, CELL * 0.9).rotateX(-Math.PI / 2);
  function tileLayer(color, opacity, y = 0.002) {
    const m = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), W * H);
    m.count = 0; m.position.y = y; m.renderOrder = 2; m.frustumCulled = false; scene.add(m);
    return {
      m, set(cells) { m.count = 0; for (const [x, y2] of cells) { cellPos(x, y2, p3); p3.y = 0; m4.makeTranslation(p3.x, BOARD.y + 0.0012, p3.z); m.setMatrixAt(m.count++, m4); } m.instanceMatrix.needsUpdate = true; },
    };
  }
  const tiles = {
    move: tileLayer(0x4ab0ff, 0.42), dash: tileLayer(0xffc83a, 0.38), fog: tileLayer(0x1a2a3a, 0.42, 0.003),
    goal: tileLayer(0x6aff6a, 0.38), exit: tileLayer(0xffffff, 0.28), blast: tileLayer(0xff5a2a, 0.45), path: tileLayer(0xffffff, 0.5),
  };
  // névoa: vira "nuvem" mais alta para esconder
  tiles.fog.m.material.color.set(0x24384a);
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.032, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe25a, transparent: true, depthWrite: false })); selRing.renderOrder = 3; selRing.visible = false; scene.add(selRing);
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.034, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, depthWrite: false })); aimRing.renderOrder = 3; aimRing.visible = false; scene.add(aimRing);
  const hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.035, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })); hoverRing.renderOrder = 3; hoverRing.visible = false; scene.add(hoverRing);
  // escudinhos de cobertura em volta da casa apontada
  const shieldGeo = new THREE.PlaneGeometry(0.022, 0.026);
  const shieldMats = [null, new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ color: 0x3a8aff, transparent: true, opacity: 0.95, side: THREE.DoubleSide })];
  const shields = [0, 1, 2, 3].map(() => { const s = new THREE.Mesh(shieldGeo, shieldMats[1]); s.visible = false; s.renderOrder = 4; scene.add(s); return s; });
  function showCover(x, y, covers) {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], i) => {
      const s = shields[i], c = covers?.[i] || 0;
      s.visible = c > 0 && x != null;
      if (!s.visible) return;
      s.material = shieldMats[c];
      cellPos(x, y, s.position); s.position.x += dx * CELL * 0.42; s.position.z += dy * CELL * 0.42; s.position.y += c === 2 ? 0.03 : 0.018;
      s.scale.y = c === 2 ? 1.3 : 0.8;
      s.rotation.y = dx ? Math.PI / 2 : 0;
    });
  }

  // ---------- Bonecos ----------
  const plasticBlue = new THREE.MeshStandardMaterial({ color: PLAYER_COL, roughness: 0.38 });
  const plasticDark = new THREE.MeshStandardMaterial({ color: 0x2a58a8, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4 });
  const redCross = new THREE.MeshStandardMaterial({ color: 0xe83a3a, roughness: 0.4 });
  const tin = new THREE.MeshStandardMaterial({ color: ROBOT_COL, roughness: 0.3, metalness: 1 });
  const tinSilver = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.25, metalness: 1 });
  const tinGold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.3, metalness: 1 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe86a, toneMapped: false });
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff8a7a, transparent: true, opacity: 0.35, depthWrite: false });
  function makeSoldier(type) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.005, 20), plasticDark); base.position.y = 0.0025; body.add(base);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.022, 3, 8), plasticBlue); leg.position.set(s * 0.007, 0.018, s * 0.003); leg.rotation.x = s * 0.15; body.add(leg); }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.016, 4, 10), plasticBlue); torso.position.y = 0.043; torso.scale.set(1.15, 1, 0.8); body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 10), plasticBlue); head.position.y = 0.064; body.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), plasticDark); helmet.position.y = 0.065; body.add(helmet);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.0015, 16), plasticDark); brim.position.y = 0.065; body.add(brim);
    // braços segurando a arma para a frente (-z do boneco = para onde olha)
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.016, 3, 6), plasticBlue); arm.position.set(s * 0.011, 0.046, -0.006); arm.rotation.x = 1.1; body.add(arm); }
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.005, 0.032), plasticDark); gun.position.set(0.004, 0.047, -0.018); body.add(gun);
    if (type === 'granadeiro') { const bag = new THREE.Mesh(caixaArredondada(0.016, 0.014, 0.008, 0.002, 1), plasticDark); bag.position.set(0, 0.044, 0.01); body.add(bag); for (const s of [-1, 1]) { const gr = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), plasticDark); gr.position.set(s * 0.008, 0.034, -0.008); body.add(gr); } }
    if (type === 'batedor') { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.03, 4), plasticDark); ant.position.set(-0.008, 0.07, 0.008); body.add(ant); const bin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.005), plasticDark); bin.position.set(0, 0.057, -0.009); body.add(bin); }
    if (type === 'medico') { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.004, 14), white); band.position.y = 0.068; body.add(band); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.0012), redCross); c1.position.set(0, 0.068, -0.0108); body.add(c1); const c2 = c1.clone(); c2.rotation.z = Math.PI / 2; body.add(c2); const kit = new THREE.Mesh(caixaArredondada(0.012, 0.01, 0.007, 0.0015, 1), white); kit.position.set(0, 0.042, 0.011); body.add(kit); }
    body.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { body, kind: 'unit' };
    return g;
  }
  function makeRobot(type) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const accent = type === 'granadeiro' ? tinGold : type === 'medico' ? tinSilver : tin;
    for (const s of [-1, 1]) { const foot = new THREE.Mesh(caixaArredondada(0.011, 0.007, 0.018, 0.002, 1), tinSilver); foot.position.set(s * 0.008, 0.0035, -0.002); body.add(foot); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 8), tinSilver); leg.position.set(s * 0.008, 0.014, 0); body.add(leg); }
    const torso = new THREE.Mesh(caixaArredondada(0.03, 0.028, 0.022, 0.004, 2), tin); torso.position.y = 0.036; body.add(torso);
    const plate = new THREE.Mesh(caixaArredondada(0.018, 0.012, 0.002, 0.001, 1), accent); plate.position.set(0, 0.038, -0.0115); body.add(plate);
    const head = new THREE.Mesh(caixaArredondada(0.022, 0.016, 0.018, 0.004, 2), tinSilver); head.position.y = 0.059; body.add(head);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 6), eyeMat); e.position.set(s * 0.005, 0.06, -0.009); body.add(e); }
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.012, 4), tinSilver); ant.position.y = 0.073; body.add(ant);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), accent); ball.position.y = 0.08; body.add(ball);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 6), tinSilver); arm.position.set(s * 0.018, 0.038, -0.006); arm.rotation.x = 1.2; body.add(arm); }
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 8).rotateX(Math.PI / 2), accent); gun.position.set(0.018, 0.034, -0.018); body.add(gun);
    // chave de corda nas costas (gira)
    const key = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.01, 6).rotateX(Math.PI / 2), tinGold); shaft.position.z = 0.005; key.add(shaft);
    for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.TorusGeometry(0.0045, 0.0013, 5, 12), tinGold); wing.position.set(s * 0.005, 0, 0.01); key.add(wing); }
    key.position.set(0, 0.038, 0.011); body.add(key);
    body.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData = { body, key, kind: 'unit' };
    return g;
  }
  function makeGhost() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(caixaArredondada(0.03, 0.06, 0.022, 0.005, 1), ghostMat); m.position.y = 0.03; g.add(m);
    const qm = new Label(0.035, 64, 64); qm.set([{ text: '?', size: 0.8, color: '#ffffff' }]); qm.mesh.position.y = 0.085; g.add(qm.mesh); g.userData.q = qm.mesh;
    return g;
  }
  // Cabo Tampinha (resgate) e chaves de corda (sabotagem)
  function makeRescue() { const g = makeSoldier('fuzileiro'); g.userData.body.rotation.z = Math.PI / 2; g.userData.body.position.y = 0.012; g.traverse(o => { if (o.isMesh && o.material === plasticBlue) o.material = new THREE.MeshStandardMaterial({ color: 0x3ac8a8, roughness: 0.4 }); }); return g; }
  function makeKey() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, 8), tinGold); shaft.position.y = 0.02; g.add(shaft);
    for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 6, 16), tinGold); wing.position.set(s * 0.011, 0.045, 0); g.add(wing); }
    const h = halo('#ffd24a', 0.06, 0.8); h.position.y = 0.04; g.add(h);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ---------- Efeitos ----------
  const fx = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true });
  function tracer(a, b, hit, color = 0xffe08a) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(geo, tracerMat.clone()); l.material.color.set(color); scene.add(l);
    const flash = halo('#ffd27a', 0.05, 1.5); flash.position.copy(a); scene.add(flash);
    fx.push({ o: l, t: 0, life: 0.35, fade: true }, { o: flash, t: 0, life: 0.15, fade: true });
    if (hit) puff(b, 0xff8a3a, 8); else puff(b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.04)), 0xd8d0c0, 6);
  }
  const puffGeo = new THREE.SphereGeometry(0.004, 6, 4);
  function puff(p, color, n = 10, speed = 0.12) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, depthWrite: false });
    for (let k = 0; k < n; k++) { const m = new THREE.Mesh(puffGeo, mat); m.position.copy(p); scene.add(m); fx.push({ o: m, t: 0, life: 0.6, v: new THREE.Vector3((Math.random() - 0.5), Math.random() * 1.2, (Math.random() - 0.5)).multiplyScalar(speed), grow: true }); }
  }
  function explosion(p) {
    const h = halo('#ff8a3a', 0.25, 2.2); h.position.copy(p).add(new THREE.Vector3(0, 0.03, 0)); scene.add(h);
    fx.push({ o: h, t: 0, life: 0.5, fade: true, scaleTo: 0.4 });
    puff(p, 0xffb84a, 24, 0.25); puff(p, 0x6a5a4a, 14, 0.12);
  }
  function lob(a, b, dur, onEnd) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), plasticDark); scene.add(m);
    fx.push({ o: m, t: 0, life: dur, path: [a.clone(), b.clone()], onEnd });
  }
  const floaters = [];
  function floatText(text, pos, color = '#ff5a4a') {
    const l = new Label(0.12, 256, 96); l.set([{ text, size: 0.75, color }]);
    l.mesh.position.copy(pos); scene.add(l.mesh); floaters.push({ l, t: 0 });
  }
  function updateFx(dt, camPos) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt; const k = f.t / f.life;
      if (f.v) { f.o.position.addScaledVector(f.v, dt); f.v.y -= dt * 0.4; }
      if (f.grow) f.o.scale.setScalar(1 + k * 2);
      if (f.fade && f.o.material) f.o.material.opacity = Math.max(0, 1 - k);
      if (f.scaleTo) f.o.scale.setScalar(0.25 + k * f.scaleTo);
      if (f.path) { f.o.position.lerpVectors(f.path[0], f.path[1], Math.min(1, k)); f.o.position.y += Math.sin(Math.PI * Math.min(1, k)) * 0.12; }
      if (f.v && f.o.material) f.o.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { scene.remove(f.o); fx.splice(i, 1); f.onEnd?.(); }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.t += dt;
      f.l.mesh.position.y += dt * 0.05; f.l.mesh.lookAt(camPos);
      f.l.mesh.material.opacity = Math.max(0, 1 - Math.max(0, f.t - 0.9) / 0.5);
      if (f.t > 1.4) { scene.remove(f.l.mesh); floaters.splice(i, 1); }
    }
  }

  // ---------- Botões na beirada da mesa ----------
  const BTNS = [['shoot', 'Atirar'], ['grenade', 'Granada'], ['heal', 'Curar'], ['overwatch', 'Vigiar'], ['hunker', 'Agachar'], ['look', 'Olhar'], ['end', 'Fim do turno']];
  const buttons = {};
  const btnW = 0.13;
  BTNS.forEach(([kind, text], i) => {
    const c = canvas(256, 96), g = c.getContext('2d');
    const draw = (on, active) => {
      g.clearRect(0, 0, 256, 96);
      g.fillStyle = !on ? '#8a8a84' : active ? '#ffd24a' : kind === 'end' ? '#c8463a' : '#3a78d8';
      g.beginPath(); g.roundRect ? g.roundRect(4, 4, 248, 88, 22) : g.rect(4, 4, 248, 88); g.fill();
      g.fillStyle = on && active ? '#2a2010' : '#ffffff'; g.font = `bold ${text.length > 8 ? 34 : 42}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 128, 50);
      t.needsUpdate = true;
    };
    const t = tex(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(btnW, btnW * 96 / 256), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    m.rotation.x = -1.0;
    m.position.set(BOARD.cx + (i - (BTNS.length - 1) / 2) * (btnW + 0.012), TABLE_Y + 0.02, BTN_Z);
    m.userData = { kind: 'button', action: kind };
    const base = new THREE.Mesh(caixaArredondada(btnW + 0.01, btnW * 96 / 256 + 0.01, 0.008, 0.003, 1), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.7 }));
    base.position.copy(m.position).add(new THREE.Vector3(0, -0.0045, -0.0025)); base.rotation.x = -1.0; scene.add(base);
    scene.add(m);
    let last = '';
    buttons[kind] = { m, set(on, active = false) { const k = `${on}${active}`; if (k !== last) { last = k; draw(on, active); } } };
    buttons[kind].set(false);
  });
  // retrato "olhar do soldado" (VR: na mão esquerda ou em cima dos botões)
  const povRT = new THREE.WebGLRenderTarget(320, 240);
  const portrait = new THREE.Group();
  const frame = new THREE.Mesh(caixaArredondada(0.17, 0.13, 0.01, 0.006, 2), new THREE.MeshStandardMaterial({ color: 0x3a78d8, roughness: 0.4 })); portrait.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({ map: povRT.texture, toneMapped: false })); screen.position.z = 0.0055; portrait.add(screen);
  portrait.visible = false; scene.add(portrait);
  const povCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.005, 30);

  // placa de chance de acerto
  const chanceLabel = new Label(0.16, 512, 160);
  chanceLabel.mesh.visible = false; scene.add(chanceLabel.mesh);
  // placa de status na mesa (VR)
  const sideLabel = new Label(0.36, 640, 220);
  sideLabel.mesh.position.set(BOARD.cx - 0.5, TABLE_Y + 0.22, BOARD.cz - 0.42); sideLabel.mesh.rotation.y = 0.5; scene.add(sideLabel.mesh);

  function animate(dt, t, camPos) { updateFx(dt, camPos); hoverRing.rotation.y += dt; aimRing.material.opacity = 0.6 + Math.sin(t * 8) * 0.35; selRing.scale.setScalar(1 + Math.sin(t * 5) * 0.06); }

  return {
    scene, sun, setMap, makeSoldier, makeRobot, makeGhost, makeRescue, makeKey, tiles, selRing, aimRing, hoverRing, showCover, grass,
    tracer, puff, explosion, lob, floatText, buttons, portrait, povRT, povCam, chanceLabel, sideLabel, animate,
    setupEnv(renderer) { if (renderer?.isWebGLRenderer) ambienteDoCeu(renderer, scene, ceu, 0.6); },
  };
}
