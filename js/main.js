// Liga as regras e a IA à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { PLAYER, ROBOTS, W, H, TYPES, OBST, COVER_NAME, newBattle, applyAction, isLegal, legalActions, reachable, moveCost, shotInfo, coverAt, alive, byId, unitAt, visibleCells, isVisibleTo, rng, MAPS, cloneBattle, refreshSeen } from './rules.js';
import { GENERALS, ROBOT, chooseAction, playTurn } from './ai.js';
import { CHALLENGES, setupChallenge, measure, starsFor, goalText, metricName, metricShown, generalOf } from './challenges.js';
import { buildWorld, CELL, TABLE_Y, BOARD, BTN_Z, cellPos, cellAt } from './scene.js';
import { createShell } from './shell.js';
import { setTheme, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(246,242,228,0.97)', edge: '#3a78d8', text: '#22302a', dim: '#6a7a70', btn: '#dfe8d2', btnHover: '#ffd24a',
  btnOn: '#3a78d8', btnOnText: '#ffffff', lock: '#e4e2d8', star: '#e8a82a', labelBg: 'rgba(246,242,228,0.92)',
  title: 'bold 56px sans-serif',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GRAB_DIST = 0.05;
const STAND = { x: BOARD.cx, z: BOARD.cz + 0.75 };

const world = buildWorld();
const { scene } = world;
const shell = createShell({ scene, sfx, save, storeSave, stand: STAND, exposure: 1.0, statusPos: new THREE.Vector3(BOARD.cx + 0.5, TABLE_Y + 0.25, BOARD.cz - 0.4), statusWidth: 0.5, shadows: true, hooks: {} });
const { renderer, camera, panel } = shell;
world.setupEnv(renderer);
renderer.toneMapping = THREE.AgXToneMapping;
shell.statusLabel.mesh.rotation.y = -0.5;
shell.orbit.target.set(BOARD.cx, BOARD.y, BOARD.cz + 0.1);
shell.orbit.dist = 1.05; shell.orbit.pitch = 0.92; shell.orbit.keys = 'wasd';
shell.orbit.minPitch = 0.25; shell.orbit.maxPitch = 1.45; shell.orbit.minDist = 0.35; shell.orbit.maxDist = 2.0;
const menuCam = (t) => ({ pos: new THREE.Vector3(Math.sin(t * 0.15) * 1.5, 1.45, BOARD.cz + Math.cos(t * 0.15) * 1.5), look: new THREE.Vector3(BOARD.cx, BOARD.y, BOARD.cz) });
world.sideLabel.mesh.visible = false;

// ---------- Estado ----------
let app = 'menu', mode = 'match', st = null, ch = null, genIndex = 0;
let phase = 'idle';           // 'intro' | 'player' | 'anim' | 'ai' | 'over'
let time = 0, msg = null, random = rng((Date.now() % 100000) + 1);
let sel = null, aim = null, tool = null, look = false, hoverCell = null, chResult = null, timerAuto = 0;
let held = null;              // VR: { entry, id }
let aiT = 0, aiAvoid = new Set(), aiCount = 0;
const models = new Map(), ghosts = new Map(), extras = [];
const queue = [];             // animações em fila: { dur, start, update(k), end }
let cur = null, curT = 0;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const general = () => (mode === 'match' ? GENERALS[genIndex] : generalOf(CHALLENGES[ch.i]));
const unitName = (u) => (u.side === PLAYER ? TYPES[u.type].name : TYPES[u.type].robot);

// ---------- Bonecos ----------
function clearModels() {
  for (const m of models.values()) scene.remove(m);
  for (const g of ghosts.values()) scene.remove(g);
  for (const e of extras) scene.remove(e);
  models.clear(); ghosts.clear(); extras.length = 0;
}
function buildModels() {
  clearModels();
  world.setMap(st.map);
  for (const u of st.units) {
    const m = u.side === PLAYER ? world.makeSoldier(u.type) : world.makeRobot(u.type);
    cellPos(u.x, u.y, m.position);
    m.rotation.y = u.side === PLAYER ? 0 : Math.PI;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.035; hit.userData = { kind: 'unit', id: u.id }; m.add(hit); m.userData.hit = hit;
    // vida em cima do boneco
    const hp = new Label(0.05, 128, 48); hp.mesh.position.y = 0.1; hp.mesh.renderOrder = 6; m.add(hp.mesh); m.userData.hp = hp;
    scene.add(m); models.set(u.id, m);
  }
  const mm = st.mission;
  if (mm?.kind === 'resgatar') for (const [x, y] of mm.cells) { const r = world.makeRescue(); cellPos(x, y, r.position); r.userData.rescue = true; scene.add(r); extras.push(r); }
  if (mm?.kind === 'sabotar') mm.cells.forEach(([x, y], i) => { const k = world.makeKey(); cellPos(x, y, k.position); k.userData.keyIndex = i; scene.add(k); extras.push(k); });
}
function syncModels(snap = false) {
  if (!st) return;
  const vis = visibleCells(st, PLAYER);
  for (const u of st.units) {
    const m = models.get(u.id);
    if (!m) continue;
    if (snap && !m.userData.moving) { cellPos(u.x, u.y, m.position); }
    if (!u.alive) { if (!m.userData.down) { m.userData.down = true; m.userData.downT = time; } }
    m.userData.body.scale.y = u.hunker && u.alive ? 0.78 : 1;
    m.userData.hp.mesh.visible = u.alive && app === 'play';
    if (u.alive) m.userData.hp.set([{ text: `${'♥'.repeat(u.hp)}${'♡'.repeat(u.maxHp - u.hp)}`, size: 0.75, color: u.side === PLAYER ? '#2a58c8' : '#c8302a' }]);
    if (u.side === ROBOTS) {
      const c = cellAt(m.position);
      const seen = u.alive ? (c ? vis.has(c.y * W + c.x) : false) : m.userData.down && time - m.userData.downT < 1.5;
      m.visible = phase === 'over' ? true : seen;
    }
  }
  // fantasmas: onde você viu cada robô pela última vez
  for (const [id, g] of ghosts) if (!st.seen[PLAYER][id] || models.get(+id)?.visible || !byId(st, +id)?.alive) { scene.remove(g); ghosts.delete(id); }
  for (const [id, s] of Object.entries(st.seen[PLAYER])) {
    const u = byId(st, +id);
    if (!u?.alive || models.get(+id)?.visible) continue;
    let g = ghosts.get(id);
    if (!g) { g = world.makeGhost(); scene.add(g); ghosts.set(id, g); }
    cellPos(s.x, s.y, g.position);
  }
  // névoa: casas que nenhum soldado enxerga
  const fog = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!vis.has(y * W + x)) fog.push([x, y]);
  world.tiles.fog.set(phase === 'over' ? [] : fog);
  const mm = st.mission;
  world.tiles.goal.set(mm && mm.kind === 'segurar' ? mm.cells : []);
  world.tiles.exit.set(mm && (mm.kind === 'atravessar' || (mm.kind === 'resgatar' && mm.carrier != null)) ? mm.exit : []);
  for (const e of extras) {
    if (e.userData.rescue) e.visible = mm.carrier == null && !mm.rescued;
    if (e.userData.keyIndex != null) e.visible = !mm.done.includes(e.userData.keyIndex);
  }
  // quem carrega o Cabo leva ele nas costas
  for (const u of st.units) { const m = models.get(u.id); if (!m) continue; if (u.carrying && mm?.carrier === u.id && !m.userData.pack) { const p = world.makeRescue(); p.scale.setScalar(0.6); p.position.set(0, 0.045, 0.012); m.add(p); m.userData.pack = p; } if (m.userData.pack && (mm?.carrier !== u.id || mm.rescued)) { m.remove(m.userData.pack); m.userData.pack = null; } }
}

// ---------- Partidas e missões ----------
function newMatch(i) {
  mode = 'match';
  genIndex = clamp(i, 0, GENERALS.length - 1);
  const maps = Object.keys(MAPS);
  st = newBattle({ map: maps[Math.floor(random() * maps.length)], seed: Math.floor(random() * 1e9), limit: 20 });
  ch = null;
  startPlay();
  msg = { text: `Contra ${general().name}. Elimine os 4 robôs. Você começa.`, t: 4 };
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  ch = { i: clamp(i, 0, CHALLENGES.length - 1) };
  st = setupChallenge(CHALLENGES[ch.i]);
  chResult = null;
  startPlay();
  if (skipIntro || dev.autoplay) { shell.hidePanel(); beginPlayer(); } else { phase = 'intro'; showScreen('chIntro'); }
}
function startPlay() {
  app = 'play'; shell.hidePanel();
  queue.length = 0; cur = null; held = null; sel = null; aim = null; tool = null; look = false; msg = null;
  buildModels();
  phase = 'player';
  syncModels(true);
  shell.orbit.menu = null; shell.orbit.snap = true;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
  beginPlayer();
}
let rigPlaced = false;
function beginPlayer() {
  phase = 'player';
  aiCount = 0;
  if (!sel || !byId(st, sel)?.alive || byId(st, sel).ap <= 0) sel = nextReady(null);
  refreshTiles();
  updateHint();
}
function nextReady(after) {
  const us = alive(st, PLAYER).filter(u => u.ap > 0);
  if (!us.length) return null;
  const i = us.findIndex(u => u.id === after);
  return us[(i + 1) % us.length].id;
}

// executa uma ação (sua ou do robô) e anima o que aconteceu
function act(a) {
  if (!st || !isLegal(st, a)) return false;
  const before = st;
  const r = applyAction(st, a);
  st = r.st;
  if (a.type !== 'endTurn' && byId(st, a.id)?.side === PLAYER) { aim = null; tool = null; }
  phase = 'anim';
  animateEvents(before, r.events);
  enqueue({ dur: 0.05, end: () => afterAction() });
  refreshTiles();
  return true;
}
function afterAction() {
  syncModels(true);
  if (st.over) { endBattle(); return; }
  if (st.side === ROBOTS) { phase = 'ai'; aiT = 0; return; }
  if (phase !== 'player') {
    const fresh = st.turn !== lastTurnShown;
    beginPlayer();
    if (fresh) { lastTurnShown = st.turn; sfx.horn(); msg = { text: `Turno ${st.turn}${mode === 'challenge' ? ` de ${CHALLENGES[ch.i].limit}` : ''}: sua vez.`, t: 2.5 }; }
  }
  if (sel && byId(st, sel)?.ap <= 0) sel = nextReady(sel);
  refreshTiles();
}
let lastTurnShown = 1;

function aiStep() {
  if (st.side !== ROBOTS || st.over) return;
  if (aiCount++ === 0) { sfx.robotTurn(); msg = { text: `Vez dos robôs de ${general().name}...`, t: 2 }; aiAvoid = new Set(); }
  let a = chooseAction(st, ROBOTS, general(), aiAvoid);
  if (a.type === 'move' && !isLegal(st, a)) { aiAvoid.add(a.y * W + a.x); aiT = 0.6; return; }
  if (!isLegal(st, a) || aiCount > 40) a = { type: 'endTurn' };
  act(a);
  if (st.side === PLAYER) aiCount = 0;
}

// ---------- Animação dos eventos ----------
function enqueue(step) { queue.push(step); }
function unitWorld(id, out = new THREE.Vector3()) { const m = models.get(id); return m ? m.getWorldPosition(out).add(_v2.set(0, 0.045, 0)) : out; }
function animateEvents(before, events) {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'move') {
      const m = models.get(e.id), u = byId(st, e.id);
      // até onde anda antes de cada tiro de vigia
      const stops = [];
      for (let j = i + 1; j < events.length && events[j].type !== 'move'; j++) if (events[j].type === 'triggered' && events[j].id === e.id) stops.push(j);
      let k = 0;
      const walkTo = (endIdx) => {
        const seg = e.path.slice(k, endIdx + 1);
        k = endIdx;
        if (seg.length < 2) return;
        enqueue({ dur: (seg.length - 1) * 0.12, start: () => { m.userData.moving = true; }, update: (t) => {
          const f = t * (seg.length - 1), a = Math.min(seg.length - 2, Math.floor(f)), r = f - a;
          const pa = cellPos(seg[a][0], seg[a][1], new THREE.Vector3()), pb = cellPos(seg[a + 1][0], seg[a + 1][1], new THREE.Vector3());
          m.position.lerpVectors(pa, pb, r); m.position.y += Math.abs(Math.sin(r * Math.PI)) * 0.012;
          m.rotation.y = Math.atan2(-(pb.x - pa.x), -(pb.z - pa.z));
          if (u.side === ROBOTS) { const vis = visibleNow(); m.visible = vis.has(seg[r < 0.5 ? a : a + 1][1] * W + seg[r < 0.5 ? a : a + 1][0]); }
          const step = Math.floor(f * 2);
          if (step !== m.userData.lastStep) { m.userData.lastStep = step; if (u.side === PLAYER) sfx.step(); else if (m.visible) sfx.windup(); }
        }, end: () => { m.userData.moving = false; } });
      };
      for (const j of stops) { const tr = events[j]; const idx = e.path.findIndex(([x, y]) => x === tr.x && y === tr.y); if (idx > k) walkTo(idx); }
      const stop = events.slice(i + 1).find(x => x.type === 'stopped' && x.id === e.id);
      walkTo(stop ? e.path.findIndex(([x, y]) => x === stop.x && y === stop.y) : e.path.length - 1);
    } else if (e.type === 'shot' || e.type === 'reaction') {
      const ev = e;
      enqueue({ dur: 0.55, start: () => {
        const sm = models.get(ev.id), tm = models.get(ev.target);
        if (sm && tm) {
          const tp = tm.getWorldPosition(new THREE.Vector3()); const sp = sm.getWorldPosition(new THREE.Vector3());
          sm.rotation.y = Math.atan2(-(tp.x - sp.x), -(tp.z - sp.z));
          if (byId(st, ev.id).side === ROBOTS) sm.visible = true;
        }
        const a = unitWorld(ev.id), b = unitWorld(ev.target);
        world.tracer(a, b, ev.hit, byId(st, ev.id).side === PLAYER ? 0x9ad0ff : 0xffa07a);
        if (byId(st, ev.id).side === PLAYER) sfx.shot(); else sfx.zap();
        const tag = ev.type === 'reaction' ? 'Vigia! ' : '';
        setTimeout0(() => { if (ev.hit) { sfx.hit(); shell.pulseAll(byId(st, ev.target).side === PLAYER ? 0.5 : 0.2, 40); } else { sfx.miss(); world.floatText(`${tag}Errou (${ev.chance}%)`, b.clone().add(_v.set(0, 0.04, 0)), '#ffffff'); } }, 0.15);
      } });
    } else if (e.type === 'damage') {
      const ev = e;
      enqueue({ dur: 0.25, start: () => world.floatText(`-${ev.n}`, unitWorld(ev.id).add(_v.set(0, 0.05, 0)), byId(st, ev.id).side === PLAYER ? '#ff5a4a' : '#ffd24a') });
    } else if (e.type === 'down') {
      const ev = e;
      enqueue({ dur: 0.5, start: () => { sfx.down(); const m = models.get(ev.id); if (m) { m.userData.down = true; m.userData.downT = time; m.visible = true; } msg = { text: `${unitName(byId(st, ev.id))} caiu!`, t: 2.5 }; } });
    } else if (e.type === 'grenade') {
      const ev = e;
      enqueue({ dur: 0.75, start: () => {
        sfx.pick();
        const a = unitWorld(ev.id), b = cellPos(ev.x, ev.y, new THREE.Vector3());
        world.lob(a, b, 0.6, () => { world.explosion(b); sfx.boom(); shell.pulseAll(0.6, 80); });
        world.tiles.blast.set([[-1, 0], [0, 0], [1, 0]].flatMap(([dx]) => [-1, 0, 1].map(dy => [ev.x + dx, ev.y + dy])).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H));
      }, end: () => world.tiles.blast.set([]) });
    } else if (e.type === 'heal') {
      const ev = e;
      enqueue({ dur: 0.5, start: () => { sfx.heal(); const p = unitWorld(ev.target); world.puff(p, 0x6aff8a, 14, 0.08); world.floatText(`+${ev.n}`, p.add(_v.set(0, 0.05, 0)), '#3ac85a'); } });
    } else if (e.type === 'overwatch' || e.type === 'hunker') {
      const ev = e;
      enqueue({ dur: 0.35, start: () => { if (ev.type === 'overwatch') sfx.overwatch(); else sfx.hunker(); const u = byId(st, ev.id); if (u.side === PLAYER || models.get(ev.id)?.visible) world.floatText(ev.type === 'overwatch' ? 'Vigiando' : 'Agachado', unitWorld(ev.id).add(_v.set(0, 0.05, 0)), '#ffffff'); syncModels(); } });
    } else if (['pickup', 'rescued', 'sabotage', 'hold'].includes(e.type)) {
      const ev = e;
      const text = { pickup: 'Pegou o Cabo Tampinha!', rescued: 'Cabo Tampinha resgatado!', sabotage: 'Chave de corda sabotada!', hold: `Faixa segura: ${ev.n} de ${st.mission?.need}` }[e.type];
      enqueue({ dur: 0.4, start: () => { sfx.objective(); msg = { text, t: 3 }; syncModels(); } });
    } else if (e.type === 'turn') {
      enqueue({ dur: 0.1, start: () => syncModels(true) });
    }
  }
}
const deferred = [];
function setTimeout0(fn, sec) { deferred.push({ at: time + sec, fn }); }
let visCache = null, visKey = '';
function visibleNow() { const k = JSON.stringify(alive(st, PLAYER).map(u => [u.x, u.y])); if (k !== visKey) { visKey = k; visCache = visibleCells(st, PLAYER); } return visCache; }
function updateQueue(dt) {
  if (!cur && queue.length) { cur = queue.shift(); curT = 0; cur.start?.(); }
  if (!cur) return;
  curT += dt;
  const k = cur.dur > 0 ? Math.min(1, curT / cur.dur) : 1;
  cur.update?.(k);
  if (k >= 1) { const c = cur; cur = null; c.end?.(); }
}

function endBattle() {
  phase = 'over';
  held = null; look = false; sel = null; aim = null; tool = null;
  refreshTiles(); syncModels(true);
  if (mode === 'challenge') { finishChallenge(); return; }
  save.games[genIndex]++;
  if (st.winner === PLAYER) { save.wins[genIndex]++; sfx.fanfare(); } else sfx.bad();
  storeSave(save);
  timerAuto = 2.5;
  showScreen('over');
}
function finishChallenge() {
  const c = CHALLENGES[ch.i];
  const value = measure(c, st), stars = starsFor(c, value);
  chResult = { stars, value };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) setTimeout0(() => sfx.star(k), 0.25 * k);
  if (stars === 3) setTimeout0(() => sfx.fanfare(), 0.8);
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  queue.length = 0; cur = null; held = null; look = false; sel = null; aim = null; tool = null;
  st = newBattle({ map: 'quintal', seed: 3 });
  buildModels(); syncModels(true);
  for (const m of models.values()) m.visible = true;
  world.tiles.fog.set([]);
  st = null; ch = null;
  refreshTiles();
  if (shell.vr) shell.recenter();
  showScreen('main');
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Batalhão de Brinquedo', 70);
      p.text('Tática por turnos: soldadinhos de plástico contra robôs de corda', 512, 128, { size: 26, color: '#6a7a70' });
      p.button('Batalha contra um general', () => showScreen('opponents'), 212, 168, 600, 88, { size: 36 });
      p.button('Missões', () => showScreen('challenges'), 212, 270, 600, 76);
      p.button('Como jogar', () => showScreen('help'), 212, 360, 600, 76);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 456, 190, 66, { size: 26 });
      p.button(`Dicas: ${save.hints ? 'sim' : 'não'}`, () => { save.hints = !save.hints; storeSave(save); showScreen('main'); }, 417, 456, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 456, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nas missões: ${stars} de ${CHALLENGES.length * 3}`, 512, 580, { size: 26, color: '#3a78d8' });
      p.text(vr ? 'Aponte com o controle (ou a mão) e aperte o gatilho (ou faça a pinça)' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 650, { size: 21, color: '#6a7a70' });
    } else if (name === 'opponents') {
      p.title('Escolha o general', 62);
      GENERALS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 72, 116 + i * 156, 880, 136, { size: 34, sub: o.desc }));
      p.text(`4 contra 4, até 20 turnos. Vitórias: ${save.wins.join(' / ')}`, 512, 600, { size: 24, color: '#6a7a70' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Missões', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Cumpra uma missão (1 estrela) para liberar a próxima.', 512, 540, { size: 24, color: '#6a7a70' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Cada boneco tem 2 ações: andar gasta 1. Atirar, granada, curar,',
        'vigiar e agachar encerram a vez dele. Andar longe (amarelo) gasta as 2.',
        'Chance de acerto: cai com a distância e com a cobertura do alvo',
        '(meia -20, inteira -40). Pegar de lado (flanco) anula a cobertura: +10 e +1 de dano.',
        'Vaso, regador e muro tapam a visão. Você só vê o que seus soldados enxergam.',
        vr ? 'VR: pegue o boneco e solte na casa. Raio + gatilho escolhe e atira.' : 'PC: clique no soldado, na casa e no robô (duas vezes atira). 1 a 4 escolhem.',
        vr ? 'Botões na beirada da mesa. "Olhar": retrato do que o boneco vê.' : 'G granada · C curar · V vigiar · B agachar · Q olhar · Espaço: fim do turno.',
        vr ? 'B ou Y: pausa.' : 'Botão direito: câmera. Esc: desfaz / pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 120 + i * 54, { size: 23, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${general().name}` : `Missão ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#6a7a70' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a batalha' : 'Recomeçar a missão', () => (mode === 'match' ? newMatch(genIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'over') {
      const w = st.winner;
      p.title(w === PLAYER ? 'Vitória!' : w === ROBOTS ? `${general().name} venceu` : 'Empate!', 72);
      p.text(`Soldados de pé: ${alive(st, PLAYER).length} de 4 · robôs de pé: ${alive(st, ROBOTS).length} de 4`, 512, 150, { size: 32, bold: true });
      p.text(`${st.turn} turno(s)`, 512, 206, { size: 26, color: '#6a7a70' });
      p.text(`Contra ${general().name}: ${save.wins[genIndex]} vitória(s) em ${save.games[genIndex]} batalha(s)`, 512, 252, { size: 24, color: '#6a7a70' });
      p.button('Jogar de novo', () => newMatch(genIndex), 262, 300, 500, 92, { size: 36 });
      p.button('Outro general', () => showScreen('opponents'), 262, 410, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 510, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Missão ${ch.i + 1}: ${c.name}`, 66);
      p.text(c.desc, 512, 150, { size: 25 });
      p.text(`Contra ${generalOf(c).name} (${generalOf(c).title}).`, 512, 200, { size: 24, color: '#6a7a70' });
      p.text(goalText(c), 512, 250, { size: 22, color: '#3a78d8' });
      p.button('Começar', () => { shell.hidePanel(); beginPlayer(); }, 262, 310, 500, 94, { size: 38 });
      p.button('Missões', () => showScreen('challenges'), 262, 430, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(chResult.stars ? 'Missão cumprida!' : 'Missão fracassada', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(`${metricName(c)}: ${metricShown(c, chResult.value)}`, 512, 232, { size: 30, bold: true });
      p.text(goalText(c), 512, 276, { size: 21, color: '#6a7a70' });
      p.text(`Melhor: ${save.ch[ch.i] || 0} estrela(s)`, 512, 314, { size: 24 });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 350, 245, 84, { size: 30 });
      p.button('Próxima', () => newChallenge(ch.i + 1), 517, 350, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Missões', () => showScreen('challenges'), 262, 454, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 554, 500, 80);
    }
  });
  updateHint();
}

// ---------- Entrada ----------
const canAct = () => app === 'play' && phase === 'player' && !panel.visible && !dev.autoplay && st && st.side === PLAYER && !st.over;
const selUnit = () => (sel != null ? byId(st, sel) : null);
function selectUnit(id) {
  const u = byId(st, id);
  if (!u || !u.alive || u.side !== PLAYER) return;
  if (u.ap <= 0) { msg = { text: `${unitName(u)} já agiu neste turno.`, t: 2 }; sfx.deny(); return; }
  sel = id; aim = null; tool = null;
  sfx.pick();
  refreshTiles();
}
function legal(a) { return st && isLegal(st, a); }
function clickUnit(id) {
  if (!canAct()) return;
  const u = byId(st, id), s = selUnit();
  if (!u || !u.alive) return;
  if (u.side === PLAYER) {
    if (tool === 'heal' && s && legal({ type: 'heal', id: s.id, target: id })) { act({ type: 'heal', id: s.id, target: id }); return; }
    selectUnit(id); return;
  }
  if (!isVisibleTo(st, PLAYER, u)) return;
  if (!s) { msg = { text: 'Escolha um soldado primeiro.', t: 2 }; return; }
  if (tool === 'grenade') { grenadeAt(u.x, u.y); return; }
  if (aim === id) { shoot(); return; }
  const info = shotInfo(st, s, u);
  if (!info.ok) { msg = { text: info.los ? `Longe demais para o ${TYPES[s.type].name.toLowerCase()} (alcance ${TYPES[s.type].range}).` : 'Sem linha de visão: tem obstáculo no caminho.', t: 2.5 }; sfx.deny(); return; }
  aim = id; sfx.pick();
  msg = { text: `${info.chance}% de acerto${info.flanked ? ' · FLANCO!' : ` · ${COVER_NAME[info.cover]}`} · ${info.dmg} de dano. Clique de novo para atirar.`, t: 4 };
}
function shoot() {
  const s = selUnit();
  if (!canAct() || !s || aim == null) return;
  if (!act({ type: 'shoot', id: s.id, target: aim })) { sfx.deny(); }
}
function grenadeAt(x, y) {
  const s = selUnit();
  if (!s) return;
  if (!act({ type: 'grenade', id: s.id, x, y })) { msg = { text: 'Granada: até 5 casas, numa casa que ele enxerga.', t: 2.5 }; sfx.deny(); }
}
function clickCell(x, y) {
  if (!canAct()) return;
  const u = unitAt(st, x, y);
  if (tool === 'grenade') { grenadeAt(x, y); return; }
  if (u && (u.side === PLAYER || isVisibleTo(st, PLAYER, u))) { clickUnit(u.id); return; }
  const s = selUnit();
  if (!s) return;
  if (!act({ type: 'move', id: s.id, x, y })) { msg = { text: 'Não dá para chegar nessa casa.', t: 1.5 }; sfx.deny(); }
}
function button(action) {
  if (action === 'look') { toggleLook(); return; }
  if (!canAct()) return;
  const s = selUnit();
  if (action === 'end') { act({ type: 'endTurn' }); return; }
  if (!s) { msg = { text: 'Escolha um soldado primeiro.', t: 2 }; sfx.deny(); return; }
  if (action === 'shoot') {
    if (aim == null) { const t = bestTarget(s); if (t) { clickUnit(t); } else { msg = { text: 'Nenhum robô à vista e ao alcance.', t: 2 }; sfx.deny(); } return; }
    shoot();
  } else if (action === 'grenade') {
    if (s.grenades <= 0) { msg = { text: 'Só o granadeiro tem granada (2 por batalha).', t: 2.5 }; sfx.deny(); return; }
    tool = tool === 'grenade' ? null : 'grenade'; aim = null; msg = tool ? { text: 'Escolha a casa da granada (explode 3x3).', t: 3 } : null; refreshTiles();
  } else if (action === 'heal') {
    if (s.heals <= 0) { msg = { text: 'Só o médico cura (2 vezes por batalha).', t: 2.5 }; sfx.deny(); return; }
    const targets = legalActions(st, s.id).filter(a => a.type === 'heal');
    if (targets.length === 1) act(targets[0]);
    else if (!targets.length) { msg = { text: 'Ninguém machucado do lado do médico.', t: 2.5 }; sfx.deny(); }
    else { tool = 'heal'; msg = { text: 'Escolha quem curar (vizinho do médico).', t: 3 }; }
  } else if (action === 'overwatch' || action === 'hunker') act({ type: action, id: s.id });
}
function bestTarget(s) {
  let best = null, bc = -1;
  for (const e of alive(st, ROBOTS)) { if (!isVisibleTo(st, PLAYER, e)) continue; const i = shotInfo(st, s, e); if (i.ok && i.chance > bc) { bc = i.chance; best = e.id; } }
  return best;
}
function toggleLook() {
  if (app !== 'play' || !st) return;
  if (!look && !selUnit()) { const u = alive(st, PLAYER)[0]; if (u) sel = u.id; }
  look = !look && !!selUnit();
  sfx.click();
  if (!shell.vr) { shell.orbit.menu = look ? povPose : null; shell.orbit.snap = true; }
  updateHint();
}
function povEye(u, out = new THREE.Vector3()) { const m = models.get(u.id); (m ? m.getWorldPosition(out) : cellPos(u.x, u.y, out)); out.y += 0.064; return out; }
function povTarget(u) {
  const t = aim != null ? byId(st, aim) : null;
  if (t) return unitWorld(t.id, new THREE.Vector3());
  let best = null, bd = 99;
  for (const e of alive(st, ROBOTS)) if (isVisibleTo(st, PLAYER, e)) { const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; } }
  if (best) return unitWorld(best.id, new THREE.Vector3());
  return povEye(u).add(new THREE.Vector3(0, -0.01, -0.3));
}
function povPose() {
  const u = selUnit();
  if (!u) return { pos: camera.position.clone(), look: shell.orbit.target.clone() };
  const eye = povEye(u), tgt = povTarget(u);
  const back = eye.clone().sub(tgt).setY(0).normalize().multiplyScalar(0.012);
  return { pos: eye.add(back), look: tgt };
}

// raio: bonecos, botões e o tabuleiro
function pickables() {
  const out = [world.grass];
  for (const b of Object.values(world.buttons)) out.push(b.m);
  for (const [id, m] of models) { const u = byId(st, id); if (u?.alive && m.visible) out.push(m.userData.hit); }
  return out;
}
function rayPick(rc) {
  if (!st) return null;
  const h = rc.intersectObjects(pickables(), false)[0];
  if (!h) return null;
  const ud = h.object.userData;
  if (ud.kind === 'board') { const c = cellAt(h.point); return c ? { kind: 'cell', ...c, dist: h.distance, point: h.point } : null; }
  return { ...ud, dist: h.distance };
}
function activate(t) {
  if (!t) return;
  if (t.kind === 'unit') clickUnit(t.id);
  else if (t.kind === 'cell') clickCell(t.x, t.y);
  else if (t.kind === 'button') button(t.action);
}
function touchAt(p) {
  let best = null, bd = GRAB_DIST;
  for (const b of Object.values(world.buttons)) { b.m.getWorldPosition(_v); const d = _v.distanceTo(p); if (d < bd) { bd = d; best = { kind: 'button', action: b.m.userData.action }; } }
  for (const [id, m] of models) { const u = byId(st, id); if (!u?.alive || !m.visible) continue; m.userData.hit.getWorldPosition(_v); const d = _v.distanceTo(p); if (d < bd) { bd = d; best = { kind: 'unit', id }; } }
  if (!best && Math.abs(p.y - BOARD.y) < 0.03) { const c = cellAt(p); if (c) best = { kind: 'cell', ...c }; }
  return best;
}
function tryGrab(e) {
  if (!st) return false;
  const p = shell.grabPoint(e);
  const t = touchAt(p);
  if (!t) return false;
  if (t.kind === 'unit') {
    const u = byId(st, t.id);
    if (u.side === PLAYER && canAct() && u.ap > 0) { selectUnit(u.id); held = { entry: e, id: u.id }; shell.pulse(e, 0.3, 20); return true; }
  }
  activate(t); shell.pulse(e, 0.3, 20);
  return true;
}
function releaseHeld() {
  if (!held) return;
  const h = held; held = null;
  const m = models.get(h.id), u = byId(st, h.id);
  const c = cellAt(shell.grabPoint(h.entry));
  if (c && (c.x !== u.x || c.y !== u.y) && act({ type: 'move', id: u.id, x: c.x, y: c.y })) return;
  cellPos(u.x, u.y, m.position);
}
function dropHeld() { if (held) { const u = byId(st, held.id); cellPos(u.x, u.y, models.get(held.id).position); held = null; } }
function updateHeld() {
  if (!held) return;
  const m = models.get(held.id);
  const p = shell.grabPoint(held.entry);
  m.position.copy(p).add(_v.set(0, -0.04, 0));
  const c = cellAt(p);
  hoverCell = c;
}
const hooks = {
  tick,
  pause: () => togglePause(),
  squeezeStart: (e) => { if (!e.isHand) tryGrab(e); },
  squeezeEnd: (e) => { if (held?.entry === e) releaseHeld(); },
  selectStart: (e) => {
    if (e.isHand && tryGrab(e)) return;
    activate(rayPick(shell.entryRay(e)));
  },
  selectEnd: (e) => { if (e.isHand && held?.entry === e) releaseHeld(); },
  disconnected: (e) => { if (held?.entry === e) dropHeld(); },
  sessionStart: () => { rigPlaced = false; look = false; shell.orbit.menu = app === 'menu' ? menuCam : null; updateHint(); },
  sessionEnd: () => { dropHeld(); updateHint(); },
  pointerDown: () => activate(rayPick(shell.mouseRay())),
  key: (k) => {
    if (app !== 'play') return false;
    if (k >= '1' && k <= '4') { const u = st.units.filter(x => x.side === PLAYER)[+k - 1]; if (u && canAct()) selectUnit(u.id); return true; }
    if (k === 'tab') { if (canAct()) { const n = nextReady(sel); if (n != null) selectUnit(n); } return true; }
    if (k === 'enter') { button('shoot'); return true; }
    if (k === 'g') { button('grenade'); return true; }
    if (k === 'c') { button('heal'); return true; }
    if (k === 'v') { button('overwatch'); return true; }
    if (k === 'b') { button('hunker'); return true; }
    if (k === 'q') { button('look'); return true; }
    if (k === ' ') { button('end'); return true; }
    if (k === 'escape' && !panel.visible && (look || tool || aim != null)) { if (look) toggleLook(); tool = null; aim = null; refreshTiles(); return true; }
    return false;
  },
};
Object.assign(shell.hooks, hooks);

// ---------- Casas, botões, HUD ----------
let reachCache = null;
function refreshTiles() {
  const s = st && phase === 'player' ? selUnit() : null;
  reachCache = null;
  if (!s || s.ap <= 0 || tool === 'grenade') { world.tiles.move.set([]); world.tiles.dash.set([]); return; }
  const move = [], dash = [];
  reachCache = reachable(st, s);
  for (const c of reachCache.values()) (moveCost(s, c.cost) === 1 ? move : dash).push([c.x, c.y]);
  world.tiles.move.set(move); world.tiles.dash.set(s.ap >= 2 ? dash : []);
}
function updateMarkers() {
  const s = st && app === 'play' ? selUnit() : null;
  if (s && s.alive && models.get(s.id)) { models.get(s.id).getWorldPosition(world.selRing.position); world.selRing.position.y = BOARD.y + 0.003; world.selRing.visible = phase !== 'over'; }
  else world.selRing.visible = false;
  const t = aim != null ? byId(st, aim) : null;
  if (t && t.alive && s) {
    models.get(t.id).getWorldPosition(world.aimRing.position); world.aimRing.position.y = BOARD.y + 0.003; world.aimRing.visible = true;
    const info = shotInfo(st, s, t);
    world.chanceLabel.mesh.visible = save.hints || true;
    world.chanceLabel.set([{ text: `${info.chance}%`, size: 0.5, color: info.chance >= 65 ? '#2a8a3a' : info.chance >= 40 ? '#b8862a' : '#c83a2a' }, { text: info.flanked ? 'FLANCO! +1 dano' : COVER_NAME[info.cover], size: 0.3, bold: false }]);
    world.chanceLabel.mesh.position.copy(world.aimRing.position).add(_v.set(0, 0.13, 0));
    world.chanceLabel.mesh.lookAt(camera.getWorldPosition(_v2));
  } else { world.aimRing.visible = false; world.chanceLabel.mesh.visible = false; }
  // casa apontada: escudinhos de cobertura
  if (hoverCell && save.hints && app === 'play' && phase === 'player') {
    world.hoverRing.visible = true; cellPos(hoverCell.x, hoverCell.y, world.hoverRing.position); world.hoverRing.position.y = BOARD.y + 0.004;
    world.showCover(hoverCell.x, hoverCell.y, [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => coverAt(st, hoverCell.x + dx, hoverCell.y + dy)));
  } else { world.hoverRing.visible = false; world.showCover(null); }
  // botões
  const ok = canAct(), sOk = ok && s && s.ap > 0;
  const B = world.buttons;
  B.shoot.set(sOk && legalActions(st, s.id).some(a => a.type === 'shoot'), aim != null);
  B.grenade.set(sOk && s.grenades > 0, tool === 'grenade');
  B.heal.set(sOk && legalActions(st, s.id).some(a => a.type === 'heal'), tool === 'heal');
  B.overwatch.set(!!sOk); B.hunker.set(!!sOk);
  B.look.set(app === 'play' && !!st, look);
  B.end.set(ok);
}
function updateHover() {
  if (held || !st || app !== 'play') return;
  let h = null;
  if (shell.vr) { for (const e of shell.ctrls) { if (!e.source) continue; const r = rayPick(shell.entryRay(e)); if (r) { e.laserLen = r.dist; if (r.kind === 'cell') h = r; else if (r.kind === 'unit') { const u = byId(st, r.id); h = { x: u.x, y: u.y }; } } } }
  else { const r = rayPick(shell.mouseRay()); if (r?.kind === 'cell') h = r; else if (r?.kind === 'unit') { const u = byId(st, r.id); h = { x: u.x, y: u.y }; } }
  hoverCell = h ? { x: h.x, y: h.y } : null;
}
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (look) t = 'Olhando do soldado · Q ou Esc volta';
  else if (phase === 'player') t = 'Clique no soldado (1 a 4), na casa azul ou amarela e no robô (2 cliques atira) · G granada · C curar · V vigiar · B agachar · Q olhar · Espaço: fim do turno · Esc: pausa';
  else t = 'Vez dos robôs... · botão direito ou A/D/W/S: câmera · Esc: pausa';
  shell.setHint(t);
}
function missionLine() {
  const m = st.mission;
  if (!m) return `Elimine os robôs · turno ${st.turn} de ${st.limit}`;
  const c = CHALLENGES[ch.i];
  const obj = { eliminar: () => `elimine os robôs (${alive(st, ROBOTS).length} de pé)`, resgatar: () => (m.carrier != null ? 'leve o Cabo até a sua beirada' : 'busque o Cabo Tampinha'), segurar: () => `segure a faixa (${m.holds} de ${m.need})`, atravessar: () => 'chegue na beirada do fundo', sabotar: () => `pise nas chaves (${m.done.length} de ${m.cells.length})` }[m.kind]();
  return `Missão ${ch.i + 1}: ${c.name} · ${obj} · turno ${st.turn} de ${c.limit}`;
}
function updateHud() {
  if (app === 'menu' || !st) { shell.setStatus(null); world.sideLabel.mesh.visible = false; return; }
  const s = selUnit();
  const b = phase === 'player' ? (s ? `${unitName(s)} · vida ${s.hp} de ${s.maxHp} · ${s.ap} ação(ões)${s.grenades ? ` · ${s.grenades} granada(s)` : ''}${s.heals ? ` · ${s.heals} cura(s)` : ''}` : 'Escolha um soldado') : phase === 'ai' || phase === 'anim' ? (st.side === ROBOTS ? `Vez de ${general().name}` : '') : '';
  shell.setStatus({ a: missionLine(), b, msg: msg?.text });
  world.sideLabel.mesh.visible = false;
}

// ---------- Laço ----------
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < deferred.length; i++) if (deferred[i].at <= time) { const d = deferred.splice(i, 1)[0]; i--; d.fn(); }
    updateQueue(dt);
  }
  if (app === 'play' && st && !paused) {
    if (phase === 'anim' && !cur && !queue.length) afterAction();
    if (phase === 'ai' && !cur && !queue.length) { aiT += dt; if (aiT >= general().think * (dev.autoplay ? 0.3 : 1)) { aiT = 0; aiStep(); } }
    else if (phase === 'player' && dev.autoplay) robotTurn(dt);
    else if (phase === 'over' && dev.autoplay && mode === 'match') { timerAuto -= dt; if (timerAuto <= 0) newMatch(genIndex); }
  }
  // robôs: chave de corda gira; caídos tombam
  for (const [id, m] of models) {
    const u = st ? byId(st, id) : null;
    if (m.userData.key && (!u || u.alive)) m.userData.key.rotation.z += dt * 3;
    if (m.userData.down) { const k = Math.min(1, (time - m.userData.downT) / 0.4); m.userData.body.rotation.z = k * Math.PI / 2; m.userData.body.position.y = k * 0.01; }
    else if (!m.userData.moving && u?.alive) m.userData.body.position.y = u.side === ROBOTS ? Math.abs(Math.sin(time * 6 + id)) * 0.002 : 0;
  }
  updateHeld();
  updateHover();
  if (st && app !== 'menu' && !cur) syncModels();
  updateMarkers();
  for (const m of models.values()) if (m.userData.hp.mesh.visible) m.userData.hp.mesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion())).premultiply(m.getWorldQuaternion(new THREE.Quaternion()).invert());
  shell.showPinch = app === 'play';
  // olhar do soldado: no VR, retrato na mão esquerda
  world.portrait.visible = look && shell.vr && app === 'play';
  if (world.portrait.visible) {
    const left = shell.entryFor('left') || shell.ctrls.find(e => e.source);
    if (left) { left.grip.getWorldPosition(world.portrait.position); left.grip.getWorldQuaternion(world.portrait.quaternion); world.portrait.position.add(_v.set(0, 0.09, 0).applyQuaternion(world.portrait.quaternion)); }
    else { world.portrait.position.set(BOARD.cx - 0.45, TABLE_Y + 0.25, BTN_Z - 0.05); world.portrait.rotation.set(-0.3, 0.4, 0); }
    const pose = povPose();
    world.povCam.position.copy(pose.pos); world.povCam.lookAt(pose.look);
    const xrOn = renderer.xr.enabled; renderer.xr.enabled = false;
    const prev = renderer.getRenderTarget();
    world.portrait.visible = false;
    renderer.setRenderTarget(world.povRT); renderer.render(scene, world.povCam); renderer.setRenderTarget(prev);
    world.portrait.visible = true;
    renderer.xr.enabled = xrOn;
  }
  world.animate(dt, time, camera.getWorldPosition(_v2));
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  updateHud();
}

let robotT = 0, robotAvoid = new Set(), robotCount = 0, robotTurnNo = -1;
function robotTurn(dt) {
  robotT += dt;
  if (robotT < ROBOT.think) return;
  robotT = 0;
  if (robotTurnNo !== st.turn) { robotTurnNo = st.turn; robotAvoid = new Set(); robotCount = 0; }
  let a = chooseAction(st, PLAYER, ROBOT, robotAvoid);
  if (a.type === 'move' && !isLegal(st, a)) { robotAvoid.add(a.y * W + a.x); return; }
  if (!isLegal(st, a) || ++robotCount > 40) a = { type: 'endTurn' };
  if (a.id != null) sel = a.id;
  act(a);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô joga por você      dev.advance(5)   avança 5 s na hora
// dev.state()           resumo                     dev.cheat()      onde estão os robôs (até os escondidos)
// dev.loadLevel(3)      abre a missão 3 (1 a 10)   dev.startMatch(2) batalha contra o general 2 (1 a 3)
// dev.win()             ganha a batalha/missão     dev.screenOf({ unit: id } | { cell: [x, y] } | { button: 'end' })
// dev.place(id, x, y)   teleporta um boneco (teste) dev.resetSave()  apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; dropHeld(); },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  cheat() { return st ? alive(st, ROBOTS).map(u => ({ id: u.id, tipo: u.type, x: u.x, y: u.y, vida: u.hp })) : null; },
  place(id, x, y) { if (!st || unitAt(st, x, y)) return this.state(); st = cloneBattle(st); const u = byId(st, id); u.x = x; u.y = y; refreshSeen(st); const m = models.get(id); if (m) cellPos(x, y, m.position); syncModels(true); refreshTiles(); return this.state(); },
  win() {
    if (!st) return this.state();
    queue.length = 0; cur = null;
    if (mode === 'challenge') {
      const c = CHALLENGES[ch.i];
      let s = setupChallenge(c), g = 0;
      while (!s.over && g++ < 200) s = playTurn(s, s.side, s.side === PLAYER ? ROBOT : generalOf(c));
      st = s;
    } else { st = { ...st, units: st.units.map(u => (u.side === ROBOTS ? { ...u, alive: false, hp: 0 } : u)), over: true, winner: PLAYER }; }
    endBattle();
    return this.state();
  },
  screenOf(what) {
    let p;
    if (what.unit != null) p = models.get(what.unit).userData.hit.getWorldPosition(new THREE.Vector3());
    else if (what.cell) p = cellPos(what.cell[0], what.cell[1], new THREE.Vector3());
    else p = world.buttons[what.button].m.getWorldPosition(new THREE.Vector3());
    p.project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    if (!st) return base;
    return {
      ...base,
      adversario: general().name,
      missao: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      turno: st.turn, lado: st.side === PLAYER ? 'você' : 'robôs',
      soldados: st.units.filter(u => u.side === PLAYER).map(u => ({ id: u.id, tipo: u.type, x: u.x, y: u.y, vida: u.hp, acoes: u.ap, vivo: u.alive, vigiando: u.overwatch, agachado: u.hunker })),
      robosVistos: alive(st, ROBOTS).filter(u => isVisibleTo(st, PLAYER, u)).map(u => u.id),
      robosNaTela: [...models].filter(([id, m]) => byId(st, id).side === ROBOTS && byId(st, id).alive && m.visible).map(([id]) => id),
      fantasmas: ghosts.size,
      selecionado: sel, mira: aim, ferramenta: tool, olhando: look, segurando: held ? held.id : null,
      casasAlcance: reachCache ? reachCache.size : 0,
      tiros: st.log.filter(l => l.type === 'shoot').length,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && st.over && phase === 'over' ? (st.winner === PLAYER ? 'você' : st.winner === ROBOTS ? general().name : 'empate') : null,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.brinquedo = { dev, get battle() { return st; }, get challenge() { return ch; }, save, camera, scene, renderer, world, shell, models };

goMenu();
shell.start();
