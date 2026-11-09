// Os generais robôs (e o robô que joga por você nos testes). Cada um decide uma ação por vez, olhando
// só o que o lado dele enxerga (publicView: inimigos à vista + fantasmas de onde viu por último).
// Sem navegador.
import { PLAYER, ROBOTS, W, H, TYPES, GRENADE, publicView, reachable, moveCost, shotInfo, coverInfo, lineOfSight, alive, byId, blocked, unitAt, legalActions, isLegal, applyAction, missionDone } from './rules.js';

export const GENERALS = [
  {
    id: 'engrenagem', name: 'General Engrenagem', title: 'avança em massa', desc: 'Todos para a frente ao mesmo tempo. Atira em qualquer coisa.',
    think: 0.5, color: 0xd84a3a, w: { danger: 0.1, cover: 0, advance: 0.9, flank: 0, offense: 1, overwatch: 0.2, minShot: 25 },
  },
  {
    id: 'mira', name: 'Capitã Mira', title: 'atiradora', desc: 'Fica atrás da cobertura, vigia e só atira com boa chance.',
    think: 0.6, color: 0x3a8ad8, w: { danger: 0.8, cover: 1.0, advance: 0.25, flank: 0.3, offense: 1.1, overwatch: 1.0, minShot: 45 },
  },
  {
    id: 'manivela', name: 'Major Manivela', title: 'flanqueador', desc: 'Dá a volta pelos lados e pega você sem cobertura. Usa granada.',
    think: 0.6, color: 0xe8b82a, w: { danger: 0.3, cover: 0.4, advance: 0.7, flank: 1.6, offense: 1.5, overwatch: 0.5, minShot: 20, grenade: 1 },
  },
];
// o robô que joga pelo seu lado (dev.autoplay e testes): o flanqueador, mais atento ao objetivo
export const ROBOT = { id: 'robo', name: 'Robô', think: 0.3, w: { danger: 0.3, cover: 0.4, advance: 0.7, flank: 1.6, offense: 1.5, overwatch: 0.5, minShot: 20, grenade: 1, objective: 1.4 } };

// distância andando (BFS) de cada casa até um conjunto de casas
function distMap(view, targets) {
  const d = new Array(W * H).fill(Infinity), q = [];
  for (const [x, y] of targets) { if (x < 0 || y < 0 || x >= W || y >= H) continue; d[y * W + x] = 0; q.push([x, y]); }
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(view, nx, ny)) continue;
      const k = ny * W + nx;
      if (d[k] > d[y * W + x] + 1) { d[k] = d[y * W + x] + 1; q.push([nx, ny]); }
    }
  }
  return d;
}

// inimigos conhecidos: os que enxerga (peso 1) e os fantasmas (peso menor)
function knownEnemies(view, side) {
  const out = view.units.filter(u => u.side !== side && u.alive).map(u => ({ u, w: 1, seen: true }));
  for (const g of view.ghosts || []) out.push({ u: { ...g, side: 1 - side, alive: true, hunker: false, overwatch: false }, w: 0.55, seen: false });
  return out;
}

// para onde puxar cada unidade (objetivo da missão ou os inimigos)
function goalCells(view, side, u, enemies) {
  const m = view.mission;
  if (side === PLAYER && m) {
    if (m.kind === 'resgatar') {
      if (m.carrier === u.id) return m.exit;
      if (m.carrier == null && !m.rescued) return m.cells;
    }
    if (m.kind === 'segurar') return m.cells;
    if (m.kind === 'atravessar') return m.exit;
    if (m.kind === 'sabotar') { const left = m.cells.filter((_, i) => !m.done.includes(i)); if (left.length) return left; }
  }
  if (enemies.length) return enemies.map(e => [e.u.x, e.u.y]);
  // ninguém à vista: vai para o lado de onde o inimigo começou
  const y = side === ROBOTS ? H - 1 : 0;
  return Array.from({ length: W }, (_, x) => [x, y]);
}

function shotValue(view, shooter, target, from, w) {
  const info = shotInfo(view, shooter, target, { from });
  if (!info.ok) return 0;
  let v = info.chance / 100 * info.dmg;
  if (info.dmg >= target.hp) v += info.chance / 100 * 2.5;
  if (info.flanked) v += (w.flank || 0) * 0.6;
  if (info.chance < (w.minShot || 0)) v *= 0.4;
  return v * (w.offense || 1);
}
// perigo numa casa: chance de cada inimigo conhecido acertar quem estiver ali
function dangerAt(view, u, x, y, enemies) {
  let d = 0, minCover = 2, seenBy = 0;
  const me = { ...u, x, y };
  for (const e of enemies) {
    const info = shotInfo(view, e.u, me, { from: { x: e.u.x, y: e.u.y } });
    if (!info.ok) { if (lineOfSight(view, e.u.x, e.u.y, x, y)) seenBy += 0.3 * e.w; continue; }
    seenBy += e.w;
    d += info.chance / 100 * info.dmg * e.w * (e.u.overwatch ? 1.3 : 1);
    minCover = Math.min(minCover, info.cover);
  }
  return { d, cover: seenBy ? minCover : 2, seenBy };
}

function planFor(view, side, u, prof, enemies, avoid) {
  const w = prof.w;
  const plans = [];
  const visibleEnemies = enemies.filter(e => e.seen);
  const goals = goalCells(view, side, u, enemies);
  const dm = distMap(view, goals);
  const objW = side === PLAYER && view.mission && view.mission.kind !== 'eliminar' ? (w.objective || 1) : 0;
  const posValue = (x, y) => {
    const dg = dangerAt(view, u, x, y, enemies);
    const dd = dm[y * W + x];
    let v = -dg.d * w.danger + (dg.seenBy ? dg.cover * 0.4 * w.cover : 0.3 * w.cover);
    v -= (Number.isFinite(dd) ? dd : 30) * (0.12 * w.advance + 0.35 * objW);
    if (Number.isFinite(dd) && dd === 0 && objW) v += 3 * objW;
    // não amontoar (granada)
    for (const a of alive(view, side)) if (a.id !== u.id && Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) <= 1) v -= 0.25;
    if (u.hp <= 2) v -= dg.d * 0.8;
    return v;
  };
  const here = posValue(u.x, u.y);
  // atirar daqui
  for (const e of visibleEnemies) { const v = shotValue(view, u, e.u, u, w); if (v > 0) plans.push({ v: v + here, acts: [{ type: 'shoot', id: u.id, target: e.u.id }] }); }
  // granada
  if (u.grenades > 0 && w.grenade) {
    for (const e of visibleEnemies) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = e.u.x + dx, y = e.u.y + dy;
      if (Math.hypot(x - u.x, y - u.y) > GRENADE.range || blocked(view, x, y) || !lineOfSight(view, u.x, u.y, x, y)) continue;
      let v = 0;
      for (const t of visibleEnemies) if (Math.max(Math.abs(t.u.x - x), Math.abs(t.u.y - y)) <= 1) v += GRENADE.dmg * (GRENADE.dmg >= t.u.hp ? 1.6 : 0.8);
      for (const t of alive(view, side)) if (Math.max(Math.abs(t.x - x), Math.abs(t.y - y)) <= 1) v -= 3;
      if (v >= 2.4) plans.push({ v: v * w.grenade + here, acts: [{ type: 'grenade', id: u.id, x, y }] });
    }
  }
  // curar
  if (u.heals > 0) for (const a of alive(view, side)) if (a.maxHp - a.hp >= 2 && Math.max(Math.abs(a.x - u.x), Math.abs(a.y - u.y)) <= 1) plans.push({ v: 1.6 + (a.hp <= 2 ? 1.5 : 0) + here, acts: [{ type: 'heal', id: u.id, target: a.id }] });
  // vigiar / agachar aqui
  plans.push({ v: here + (enemies.length ? 0.35 + 0.5 * w.overwatch : 0.05), acts: [{ type: 'overwatch', id: u.id }] });
  plans.push({ v: here + dangerAt(view, u, u.x, u.y, enemies).d * 0.35 - 0.1, acts: [{ type: 'hunker', id: u.id }] });
  // andar e depois atirar (ou vigiar), ou correr
  for (const c of reachable(view, u).values()) {
    if (avoid?.has(c.y * W + c.x)) continue;
    const cost = moveCost(u, c.cost);
    if (cost > u.ap) continue;
    const pv = posValue(c.x, c.y);
    const mv = { type: 'move', id: u.id, x: c.x, y: c.y };
    if (u.ap - cost >= 1) {
      let best = enemies.length ? 0.35 + 0.5 * w.overwatch : 0.05;
      for (const e of visibleEnemies) best = Math.max(best, shotValue(view, u, e.u, c, w));
      // de lá pode passar a enxergar um fantasma
      for (const e of enemies) if (!e.seen) best = Math.max(best, shotValue(view, u, e.u, c, w) * 0.5);
      plans.push({ v: pv + best, acts: [mv] });
    } else plans.push({ v: pv - 0.2, acts: [mv] });
  }
  plans.sort((a, b) => b.v - a.v);
  return plans[0];
}

// Próxima ação do lado `side`. avoid: casas que já se descobriu que estão ocupadas.
export function chooseAction(st, side, prof, avoid = null) {
  const view = publicView(st, side);
  const enemies = knownEnemies(view, side);
  let best = null;
  const units = alive(view, side).filter(u => u.ap > 0);
  if (!units.length) return { type: 'endTurn' };
  for (const u of units) {
    const p = planFor(view, side, u, prof, enemies, avoid);
    if (!p) continue;
    // quem tem tiro bom age antes (o tiro pode mudar o plano dos outros)
    const bonus = p.acts[0].type === 'shoot' || p.acts[0].type === 'grenade' ? 0.5 : 0;
    if (!best || p.v + bonus > best.v) best = { v: p.v + bonus, act: p.acts[0] };
  }
  return best ? best.act : { type: 'endTurn' };
}

// Joga a vez inteira do lado (devolve a lista de ações e o estado). Se a casa escolhida estiver
// ocupada por alguém escondido, a unidade "esbarra" e escolhe outra.
export function playTurn(st, side, prof, onAction = null) {
  let s = st, guard = 0;
  const avoid = new Set();
  while (!s.over && s.side === side && guard++ < 40) {
    let a = chooseAction(s, side, prof, avoid);
    if (a.type === 'move' && !isLegal(s, a)) { avoid.add(a.y * W + a.x); continue; }
    if (!isLegal(s, a)) a = { type: 'endTurn' };
    const r = applyAction(s, a);
    onAction?.(a, r);
    s = r.st;
  }
  if (!s.over && s.side === side) s = applyAction(s, { type: 'endTurn' }).st;
  return s;
}
export function playBattle(st, profiles, maxTurns = 60) {
  let s = st, guard = 0;
  while (!s.over && guard++ < maxTurns * 2) s = playTurn(s, s.side, profiles[s.side]);
  return s;
}
export { missionDone, legalActions, byId, unitAt, coverInfo, TYPES };
