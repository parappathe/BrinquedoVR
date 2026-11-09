// Regras do Batalhão de Brinquedo: grade do quintal, unidades, ações, linha de visão, cobertura,
// flanco, chance de acerto, vigiar, névoa de guerra e missões. Sem navegador.
//
// Grade de W x H casas; y = 0 é o fundo (lado dos robôs), y = H-1 é o lado do jogador.
// Cada unidade tem 2 ações por turno. Andar gasta 1. Atirar, granada, curar, vigiar e agachar
// encerram a vez daquele boneco.

export const PLAYER = 0, ROBOTS = 1;
export const W = 12, H = 10, ACTIONS = 2;

// Obstáculos: meia cobertura (h tijolo baixo, m mangueira, p pedra) e cobertura inteira, que também
// tapa a visão (V vaso, R regador, T muro de tijolos). Ninguém fica em cima de obstáculo.
export const OBST = {
  h: { name: 'tijolos', cover: 1 }, m: { name: 'mangueira', cover: 1 }, p: { name: 'pedra', cover: 1 },
  V: { name: 'vaso', cover: 2 }, R: { name: 'regador', cover: 2 }, T: { name: 'muro de tijolos', cover: 2 },
};
export const COVER_NAME = ['sem cobertura', 'meia cobertura', 'cobertura inteira'];

export const TYPES = {
  fuzileiro: { name: 'Fuzileiro', robot: 'Robô Fuzil', hp: 5, move: 4, aim: 72, range: 9, dmg: 2, sight: 9 },
  granadeiro: { name: 'Granadeiro', robot: 'Robô Morteiro', hp: 5, move: 4, aim: 62, range: 7, dmg: 2, sight: 9, grenades: 2 },
  batedor: { name: 'Batedor', robot: 'Robô Corredor', hp: 4, move: 5, aim: 66, range: 6, dmg: 2, sight: 11 },
  medico: { name: 'Médico', robot: 'Robô Reparo', hp: 4, move: 4, aim: 58, range: 7, dmg: 1, sight: 9, heals: 2 },
};
export const GRENADE = { range: 5, dmg: 2 };
export const HEAL = 2;
const OW_PENALTY = 15;

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// número de 0 a 99 a partir do estado (o estado continua puro: só o contador muda)
function roll(st) {
  let t = (st.seed + Math.imul(++st.rolls, 0x9E3779B1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B); t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35); t ^= t >>> 16;
  return (t >>> 0) % 100;
}

export const MAPS = {
  quintal: [
    '....h..h....',
    '.V........R.',
    '....mm......',
    '..h.....T...',
    '..h..V..T.p.',
    '.p.T..V..h..',
    '...T.....h..',
    '......mm....',
    '.R........V.',
    '....h..h....',
  ],
  canteiro: [
    '...p....p...',
    '.h...VV...h.',
    '.h........h.',
    '....T..T....',
    '.m..T..T..m.',
    '.m..T..T..m.',
    '....T..T....',
    '.h........h.',
    '.h...RR...h.',
    '...p....p...',
  ],
};
const SQUAD = ['fuzileiro', 'granadeiro', 'batedor', 'medico'];

export function cell(st, x, y) { return x < 0 || y < 0 || x >= W || y >= H ? '#' : st.map[y][x]; }
export const coverAt = (st, x, y) => OBST[cell(st, x, y)]?.cover || 0;
export const blocked = (st, x, y) => cell(st, x, y) !== '.';
export const unitAt = (st, x, y) => st.units.find(u => u.alive && u.x === x && u.y === y);
export const alive = (st, side) => st.units.filter(u => u.alive && u.side === side);
export const byId = (st, id) => st.units.find(u => u.id === id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeUnit(id, side, type, x, y) {
  const t = TYPES[type];
  return { id, side, type, x, y, hp: t.hp, maxHp: t.hp, ap: 0, overwatch: false, hunker: false, grenades: t.grenades || 0, heals: t.heals || 0, alive: true, carrying: false };
}

// config: { map, seed, units: [{ side, type, x, y }], starter, mission }
export function newBattle({ map = 'quintal', seed = 1, units = null, mission = null, limit = 20 } = {}) {
  const rows = typeof map === 'string' ? MAPS[map] : map;
  const st = { map: rows.slice(), seed: seed >>> 0, rolls: 0, units: [], side: PLAYER, turn: 1, limit, over: false, winner: null, mission: mission ? { ...mission, done: [], holds: 0, carrier: null } : null, seen: [{}, {}], log: [] };
  const list = units || [
    ...SQUAD.map((t, i) => ({ side: PLAYER, type: t, x: [2, 5, 6, 9][i], y: H - 1 })),
    ...SQUAD.map((t, i) => ({ side: ROBOTS, type: t, x: [9, 6, 5, 2][i], y: 0 })),
  ];
  list.forEach((u, i) => st.units.push(makeUnit(i, u.side, u.type, u.x, u.y)));
  for (const u of alive(st, PLAYER)) u.ap = ACTIONS;
  updateSeen(st);
  return st;
}
export function cloneBattle(st) {
  return { ...st, units: st.units.map(u => ({ ...u })), seen: st.seen.map(s => ({ ...s })), log: st.log.slice(), mission: st.mission ? { ...st.mission, done: st.mission.done.slice() } : null };
}

// ---------- Linha de visão ----------
// Do centro de uma casa ao centro da outra; muro, vaso e regador (cobertura inteira) no caminho tapam,
// menos o que está encostado em uma das pontas (a cobertura do alvo protege, mas não esconde).
export function lineOfSight(st, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, n = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
  for (let i = 1; i < n; i++) {
    const fx = ax + dx * i / n + 0.5, fy = ay + dy * i / n + 0.5;
    const cx = Math.floor(fx), cy = Math.floor(fy);
    // a casa encostada (de lado) em quem atira ou em quem leva o tiro não tapa: o boneco espia pela beirada
    if (Math.abs(cx - ax) + Math.abs(cy - ay) <= 1 || Math.abs(cx - bx) + Math.abs(cy - by) <= 1) continue;
    if (coverAt(st, cx, cy) === 2) return false;
  }
  return true;
}
export function canSee(st, viewer, x, y) {
  const r = TYPES[viewer.type].sight;
  if (Math.hypot(viewer.x - x, viewer.y - y) > r) return false;
  return lineOfSight(st, viewer.x, viewer.y, x, y);
}
export function visibleCells(st, side) {
  const out = new Set();
  const us = alive(st, side);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (us.some(u => canSee(st, u, x, y))) out.add(y * W + x);
  return out;
}
export const isVisibleTo = (st, side, unit) => alive(st, side).some(u => canSee(st, u, unit.x, unit.y));
// memória: onde cada lado viu cada inimigo pela última vez
export function refreshSeen(st) { updateSeen(st); }
function updateSeen(st) {
  for (const side of [PLAYER, ROBOTS]) for (const e of st.units) {
    if (e.side === side) continue;
    if (!e.alive) { if (st.seen[side][e.id] && isVisibleTo(st, side, e)) delete st.seen[side][e.id]; continue; }
    if (isVisibleTo(st, side, e)) st.seen[side][e.id] = { x: e.x, y: e.y, turn: st.turn, type: e.type, hp: e.hp };
  }
}

// ---------- Cobertura, flanco e chance ----------
// A cobertura de quem está em T contra quem atira de S: obstáculo encostado em T (nos 4 lados) que fica
// do lado de S. Nenhum assim = flanqueado.
export function coverInfo(st, sx, sy, tx, ty) {
  let best = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = coverAt(st, tx + dx, ty + dy);
    if (!c) continue;
    if ((sx - tx) * dx + (sy - ty) * dy > 0.5) best = Math.max(best, c);
  }
  const anyCover = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => coverAt(st, tx + dx, ty + dy) > 0);
  return { cover: best, flanked: anyCover && best === 0 };
}
export function shotInfo(st, shooter, target, { from = null, reaction = false } = {}) {
  const s = from || shooter, t = TYPES[shooter.type];
  const d = dist(s, target);
  const los = lineOfSight(st, s.x, s.y, target.x, target.y);
  if (!los || d > t.range) return { ok: false, los, inRange: d <= t.range, chance: 0, dist: d };
  const ci = coverInfo(st, s.x, s.y, target.x, target.y);
  let chance = t.aim - Math.max(0, Math.round(d - 4)) * 3 - ci.cover * 20;
  if (target.hunker) chance -= ci.cover ? 20 : 15;
  if (ci.flanked) chance += 10;
  if (reaction) chance -= OW_PENALTY;
  chance = Math.max(5, Math.min(95, chance));
  return { ok: true, los, inRange: true, chance, cover: ci.cover, flanked: ci.flanked, dist: d, dmg: t.dmg + (ci.flanked ? 1 : 0) };
}

// ---------- Movimento ----------
// Casas alcançáveis: 4 direções, sem atravessar obstáculo nem boneco. Devolve Map(chave -> { x, y, cost, path }).
export function reachable(st, unit, maxCost = null) {
  const lim = maxCost ?? TYPES[unit.type].move * Math.min(unit.ap, 2);
  const out = new Map();
  const start = { x: unit.x, y: unit.y, cost: 0, path: [] };
  out.set(unit.y * W + unit.x, start);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    if (c.cost >= lim) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, y = c.y + dy, k = y * W + x;
      if (blocked(st, x, y) || out.has(k) || unitAt(st, x, y)) continue;
      const n = { x, y, cost: c.cost + 1, path: [...c.path, [x, y]] };
      out.set(k, n); q.push(n);
    }
  }
  out.delete(unit.y * W + unit.x);
  return out;
}
// quantas ações custa andar até a casa (1 = até o alcance; 2 = corrida, até o dobro)
export const moveCost = (unit, steps) => (steps <= TYPES[unit.type].move ? 1 : 2);

// ---------- Ações ----------
export function legalActions(st, id) {
  const u = byId(st, id);
  if (st.over || !u || !u.alive || u.side !== st.side || u.ap <= 0) return [];
  const out = [];
  for (const c of reachable(st, u).values()) if (moveCost(u, c.cost) <= u.ap) out.push({ type: 'move', id, x: c.x, y: c.y });
  for (const e of alive(st, 1 - u.side)) if (isVisibleTo(st, u.side, e) && shotInfo(st, u, e).ok) out.push({ type: 'shoot', id, target: e.id });
  if (u.grenades > 0) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - u.x, y - u.y) <= GRENADE.range && !blocked(st, x, y) && canSee(st, u, x, y)) out.push({ type: 'grenade', id, x, y });
  if (u.heals > 0) for (const a of alive(st, u.side)) if (a.hp < a.maxHp && Math.max(Math.abs(a.x - u.x), Math.abs(a.y - u.y)) <= 1) out.push({ type: 'heal', id, target: a.id });
  out.push({ type: 'overwatch', id }, { type: 'hunker', id });
  return out;
}
export function isLegal(st, a) {
  if (!a) return false;
  if (a.type === 'endTurn') return !st.over;
  return legalActions(st, a.id).some(b => b.type === a.type && b.x === a.x && b.y === a.y && b.target === a.target);
}

function damage(st, target, n, events, by) {
  target.hp = Math.max(0, target.hp - n);
  events.push({ type: 'damage', id: target.id, n, by });
  if (target.hp <= 0) {
    target.alive = false; target.overwatch = false;
    events.push({ type: 'down', id: target.id });
    if (st.mission?.carrier === target.id) { st.mission.carrier = null; events.push({ type: 'dropped', id: target.id }); }
  }
}
function fire(st, shooter, target, events, reaction = false) {
  const info = shotInfo(st, shooter, target, { reaction });
  if (!info.ok) return false;
  const r = roll(st);
  const hit = r < info.chance;
  events.push({ type: reaction ? 'reaction' : 'shot', id: shooter.id, target: target.id, chance: info.chance, roll: r, hit, cover: info.cover, flanked: info.flanked });
  if (hit) damage(st, target, info.dmg, events, shooter.id);
  return hit;
}

export function applyAction(st0, a) {
  if (!isLegal(st0, a)) throw new Error(`ação inválida: ${JSON.stringify(a)}`);
  const st = cloneBattle(st0);
  const events = [];
  if (a.type === 'endTurn') { endTurn(st, events); return { st, events }; }
  const u = byId(st, a.id);
  if (a.type === 'move') {
    const c = reachable(st, u).get(a.y * W + a.x);
    u.ap -= moveCost(u, c.cost);
    u.hunker = false;
    events.push({ type: 'move', id: u.id, path: [[u.x, u.y], ...c.path] });
    for (const [x, y] of c.path) {
      u.x = x; u.y = y;
      updateSeen(st);
      // vigilância do outro lado: atira no primeiro passo que enxerga
      for (const w of alive(st, 1 - u.side)) {
        if (!w.overwatch || !u.alive) continue;
        if (canSee(st, w, x, y) && shotInfo(st, w, u, { reaction: true }).ok) { w.overwatch = false; events.push({ type: 'triggered', id: u.id, by: w.id, x, y }); fire(st, w, u, events, true); }
      }
      if (!u.alive) { events.push({ type: 'stopped', id: u.id, x, y }); break; }
    }
    if (u.alive) missionStep(st, u, events);
  } else if (a.type === 'shoot') {
    fire(st, u, byId(st, a.target), events);
    u.ap = 0;
  } else if (a.type === 'grenade') {
    u.grenades--; u.ap = 0;
    events.push({ type: 'grenade', id: u.id, x: a.x, y: a.y });
    for (const t of st.units) if (t.alive && Math.max(Math.abs(t.x - a.x), Math.abs(t.y - a.y)) <= 1) damage(st, t, GRENADE.dmg, events, u.id);
  } else if (a.type === 'heal') {
    const t = byId(st, a.target);
    u.heals--; u.ap = 0;
    const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + HEAL);
    events.push({ type: 'heal', id: u.id, target: t.id, n: t.hp - before });
  } else if (a.type === 'overwatch') { u.overwatch = true; u.ap = 0; events.push({ type: 'overwatch', id: u.id }); }
  else if (a.type === 'hunker') { u.hunker = true; u.ap = 0; events.push({ type: 'hunker', id: u.id }); }
  updateSeen(st);
  st.log.push({ ...a, turn: st.turn, side: st.side });
  checkEnd(st, events);
  if (!st.over && alive(st, st.side).every(x => x.ap <= 0)) endTurn(st, events);
  return { st, events };
}

function endTurn(st, events) {
  const was = st.side;
  if (was === ROBOTS) missionEndRound(st, events);
  if (st.over) return;
  st.side = 1 - was;
  if (st.side === PLAYER) st.turn++;
  for (const u of alive(st, st.side)) { u.ap = ACTIONS; u.overwatch = false; u.hunker = false; }
  events.push({ type: 'turn', side: st.side, turn: st.turn });
  checkEnd(st, events);
}

// ---------- Missões ----------
// mission: { kind: 'eliminar' | 'resgatar' | 'segurar' | 'atravessar' | 'sabotar', cells: [[x,y]...],
//            exit: [[x,y]...], need, limit }
const inCells = (cells, u) => cells?.some(([x, y]) => x === u.x && y === u.y);
function missionStep(st, u, events) {
  const m = st.mission;
  if (!m || u.side !== PLAYER) return;
  if (m.kind === 'resgatar' && m.carrier == null && !m.rescued && inCells(m.cells, u)) { m.carrier = u.id; u.carrying = true; events.push({ type: 'pickup', id: u.id }); }
  if (m.kind === 'resgatar' && m.carrier === u.id && inCells(m.exit, u)) { m.rescued = true; events.push({ type: 'rescued', id: u.id }); }
  if (m.kind === 'sabotar') m.cells.forEach(([x, y], i) => { if (!m.done.includes(i) && u.x === x && u.y === y) { m.done.push(i); events.push({ type: 'sabotage', id: u.id, i }); } });
}
function missionEndRound(st, events) {
  const m = st.mission;
  if (!m || m.kind !== 'segurar') return;
  const mine = alive(st, PLAYER).some(u => inCells(m.cells, u)), theirs = alive(st, ROBOTS).some(u => inCells(m.cells, u));
  if (mine && !theirs) { m.holds++; events.push({ type: 'hold', n: m.holds }); }
}
export function missionDone(st) {
  const m = st.mission;
  if (!m) return alive(st, ROBOTS).length === 0;
  if (m.kind === 'eliminar') return alive(st, ROBOTS).length === 0;
  if (m.kind === 'resgatar') return !!m.rescued;
  if (m.kind === 'segurar') return m.holds >= m.need;
  if (m.kind === 'atravessar') { const a = alive(st, PLAYER); return a.length >= (m.need || 1) && a.every(u => inCells(m.exit, u)); }
  if (m.kind === 'sabotar') return m.done.length >= m.cells.length;
  return false;
}
function checkEnd(st, events) {
  if (st.over) return;
  const p = alive(st, PLAYER).length, r = alive(st, ROBOTS).length;
  if (missionDone(st)) { st.over = true; st.winner = PLAYER; }
  else if (p === 0) { st.over = true; st.winner = ROBOTS; }
  else if (!st.mission && r === 0) { st.over = true; st.winner = PLAYER; }
  else if (st.turn > st.limit) {
    st.over = true;
    if (st.mission) st.winner = ROBOTS;
    else { const hp = (s) => alive(st, s).reduce((a, u) => a + u.hp, 0); st.winner = hp(PLAYER) === hp(ROBOTS) ? null : hp(PLAYER) > hp(ROBOTS) ? PLAYER : ROBOTS; }
  }
  if (st.over) events.push({ type: 'over', winner: st.winner });
}

// O que um lado pode saber: as próprias unidades, os inimigos que enxerga agora e a última posição
// em que viu os outros (fantasmas). Nada da posição atual de quem está escondido.
export function publicView(st, side) {
  const v = cloneBattle(st);
  v.units = v.units.filter(u => u.side === side || (u.alive && isVisibleTo(st, side, u)));
  // fantasmas: onde viu cada inimigo pela última vez (quem caiu sai, porque cair só acontece à vista)
  v.ghosts = Object.entries(st.seen[side]).filter(([id]) => !v.units.some(u => u.id === +id) && byId(st, +id)?.alive)
    .map(([id, g]) => ({ id: +id, ...g }));
  v.seen = [{}, {}]; v.seen[side] = { ...st.seen[side] };
  v.seed = 0; v.rolls = 0;
  return v;
}
