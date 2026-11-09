// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { PLAYER, ROBOTS, W, H, ACTIONS, TYPES, newBattle, cloneBattle, applyAction, isLegal, legalActions, reachable, shotInfo, coverInfo, lineOfSight, visibleCells, isVisibleTo, publicView, alive, byId, refreshSeen } from '../js/rules.js';
import { GENERALS, ROBOT, chooseAction, playBattle, playTurn } from '../js/ai.js';
import { CHALLENGES, setupChallenge, runChallenge, naive, measure } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 200 s'); process.exit(1); }, 200000).unref();
const T0 = performance.now();

// mapa vazio com obstáculos escolhidos
const EMPTY = Array.from({ length: H }, () => '.'.repeat(W));
const mapWith = (marks) => EMPTY.map((row, y) => [...row].map((c, x) => marks[`${x},${y}`] || c).join(''));
const P = (type, x, y) => ({ side: PLAYER, type, x, y }), R = (type, x, y) => ({ side: ROBOTS, type, x, y });

console.log('Grade, movimento e ações');
{
  const st = newBattle({ seed: 1 });
  ok(alive(st, PLAYER).length === 4 && alive(st, ROBOTS).length === 4, '4 soldadinhos contra 4 robôs');
  ok(new Set(st.units.filter(u => u.side === PLAYER).map(u => u.type)).size === 4, 'tipos: fuzileiro, granadeiro, batedor e médico');
  ok(alive(st, PLAYER).every(u => u.ap === ACTIONS), 'cada unidade começa com 2 ações');
  const s = newBattle({ map: mapWith({ '3,5': 'V' }), units: [P('fuzileiro', 3, 7), R('fuzileiro', 3, 1)] });
  const r = reachable(s, byId(s, 0));
  ok(!r.has(5 * W + 3), 'não entra na casa do vaso');
  ok([...r.values()].every(c => c.cost <= TYPES.fuzileiro.move * 2), 'alcance: até o dobro do movimento (correndo)');
  let a = applyAction(s, { type: 'move', id: 0, x: 3, y: 6 });
  ok(byId(a.st, 0).ap === 1 && byId(a.st, 0).y === 6, 'andar perto gasta 1 ação');
  a = applyAction(s, { type: 'move', id: 0, x: 4, y: 3 });
  ok(a.st.side === ROBOTS && byId(a.st, 0).y === 3, 'andar longe (correr) gasta as 2 ações e passa a vez');
  ok(!isLegal(s, { type: 'move', id: 1, x: 3, y: 2 }), 'não mexe em robô na sua vez');
  ok(!isLegal(s, { type: 'grenade', id: 0, x: 3, y: 3 }), 'fuzileiro não tem granada');
  a = applyAction(s, { type: 'hunker', id: 0 });
  ok(a.st.side === ROBOTS && byId(a.st, 0).hunker && byId(a.st, 1).ap === ACTIONS, 'agachar encerra a vez do boneco; acabou todo mundo, vez dos robôs');
}

console.log('Linha de visão, cobertura, flanco e chance');
{
  const map = mapWith({ '5,4': 'T', '2,5': 'h', '8,5': 'V' });
  const st = newBattle({ map, units: [P('fuzileiro', 5, 7), R('fuzileiro', 5, 1), R('batedor', 2, 4), R('batedor', 8, 4)] });
  ok(!lineOfSight(st, 5, 7, 5, 1), 'muro de tijolos tapa a visão');
  ok(lineOfSight(st, 2, 7, 2, 3), 'tijolo baixo (meia cobertura) não tapa a visão');
  ok(!isVisibleTo(st, PLAYER, byId(st, 1)), 'robô atrás do muro fica escondido (névoa)');
  // meia cobertura: robô em (2,4) com tijolo em (2,5), atirando de baixo
  const half = shotInfo(st, byId(st, 0), byId(st, 2), { from: { x: 2, y: 8 } });
  ok(half.ok && half.cover === 1 && !half.flanked, `meia cobertura de frente (${half.chance}%)`);
  const side = shotInfo(st, byId(st, 0), byId(st, 2), { from: { x: 0, y: 4 } });
  ok(side.ok && side.flanked && side.cover === 0 && side.dmg === TYPES.fuzileiro.dmg + 1, `de lado: flanco anula a cobertura e dá +1 de dano (${side.chance}%)`);
  ok(side.chance > half.chance, 'flanco acerta mais que de frente para a cobertura');
  const full = shotInfo(st, byId(st, 0), byId(st, 3), { from: { x: 8, y: 7 } });
  ok(full.ok && full.cover === 2 && full.chance < half.chance, `cobertura inteira (vaso) tira mais (${full.chance}%)`);
  const near = shotInfo(st, byId(st, 0), byId(st, 2), { from: { x: 2, y: 6 } }), far = shotInfo(st, byId(st, 0), byId(st, 2), { from: { x: 2, y: 9 } });
  ok(far.chance < near.chance, `mais longe, menos chance (${near.chance}% x ${far.chance}%)`);
  const hk = cloneBattle(st); byId(hk, 2).hunker = true;
  ok(shotInfo(hk, byId(hk, 0), byId(hk, 2), { from: { x: 2, y: 8 } }).chance < half.chance, 'agachado fica mais difícil de acertar');
  // tiro de verdade: dano quando acerta
  let s = newBattle({ map: mapWith({}), units: [P('fuzileiro', 5, 6), R('fuzileiro', 5, 4)], seed: 3 });
  let hits = 0, shots = 0;
  for (let k = 0; k < 40; k++) { const t = cloneBattle(s); t.seed = 100 + k; const r = applyAction(t, { type: 'shoot', id: 0, target: 1 }); shots++; if (r.events.some(e => e.type === 'shot' && e.hit)) { hits++; ok(byId(r.st, 1).hp === TYPES.fuzileiro.hp - TYPES.fuzileiro.dmg - 1 || byId(r.st, 1).hp === TYPES.fuzileiro.hp - TYPES.fuzileiro.dmg, 'acerto tira o dano da arma'); } }
  const ch = shotInfo(s, byId(s, 0), byId(s, 1)).chance;
  ok(Math.abs(hits / shots * 100 - ch) < 25, `acertos batem com a chance mostrada (${hits}/${shots} com ${ch}%)`);
  // granada: 3x3, sem cobertura
  s = newBattle({ map: mapWith({ '5,3': 'h' }), units: [P('granadeiro', 5, 7), R('fuzileiro', 5, 4), R('batedor', 6, 4), R('medico', 9, 4)] });
  const g = applyAction(s, { type: 'grenade', id: 0, x: 5, y: 4 });
  ok(byId(g.st, 1).hp === TYPES.fuzileiro.hp - 2 && byId(g.st, 2).hp === TYPES.batedor.hp - 2 && byId(g.st, 3).hp === TYPES.medico.hp && byId(g.st, 0).grenades === 1, 'granada pega a área 3x3 e gasta uma');
  // médico cura vizinho
  s = newBattle({ map: mapWith({}), units: [P('medico', 5, 7), P('fuzileiro', 6, 7), R('fuzileiro', 0, 0)] });
  byId(s, 1).hp = 2;
  const h = applyAction(s, { type: 'heal', id: 0, target: 1 });
  ok(byId(h.st, 1).hp === 4 && byId(h.st, 0).heals === 1, 'médico cura 2 no vizinho');
  // vigiar: atira em quem passa na frente
  s = newBattle({ map: mapWith({}), units: [P('fuzileiro', 2, 9), R('fuzileiro', 9, 3)], seed: 9 });
  s = applyAction(s, { type: 'overwatch', id: 0 }).st;
  ok(s.side === ROBOTS && byId(s, 0).overwatch, 'vigiar: fica de olho e passa a vez');
  const mv = applyAction(s, { type: 'move', id: 1, x: 5, y: 5 });
  ok(mv.events.some(e => e.type === 'reaction') && !byId(mv.st, 0).overwatch, 'robô andando na vista leva tiro de vigia (uma vez só)');
}

console.log('Névoa de guerra');
{
  const map = mapWith({ '3,4': 'T', '4,4': 'T', '5,4': 'T', '6,4': 'T', '7,4': 'T', '8,4': 'T', '2,4': 'V', '9,4': 'V' });
  const st = newBattle({ map, units: [P('fuzileiro', 5, 8), R('fuzileiro', 5, 1), R('batedor', 9, 8)] });
  const vis = visibleCells(st, PLAYER);
  ok(!vis.has(1 * W + 5) && vis.has(7 * W + 5), 'atrás do muro é névoa, na frente é visível');
  const view = publicView(st, PLAYER);
  ok(!view.units.some(u => u.id === 1) && view.units.some(u => u.id === 2), 'visão pública: só os inimigos à vista');
  // a IA não espia: mover robôs escondidos (do ponto de vista dela, seus soldados escondidos) não muda a decisão
  let same = true, tests = 0;
  for (let g = 0; g < 12; g++) for (const prof of GENERALS) {
    const base = newBattle({ seed: 50 + g });
    base.side = ROBOTS; for (const u of alive(base, ROBOTS)) u.ap = 2; for (const u of alive(base, PLAYER)) u.ap = 0;
    refreshSeen(base);
    const hidden = alive(base, PLAYER).filter(u => !isVisibleTo(base, ROBOTS, u) && !base.seen[ROBOTS][u.id]);
    if (!hidden.length) continue;
    const other = cloneBattle(base);
    for (const u of hidden) { const v = byId(other, u.id); v.x = (v.x + 6) % W; v.y = H - 1; v.hp = 1; }
    other.seed = 999;
    if (alive(other, PLAYER).some(u => !isVisibleTo(other, ROBOTS, u) === false && hidden.some(h => h.id === u.id))) continue;
    tests++;
    if (JSON.stringify(chooseAction(base, ROBOTS, prof)) !== JSON.stringify(chooseAction(other, ROBOTS, prof))) same = false;
  }
  ok(tests > 0 && same, `a IA não espia: soldados escondidos em outro lugar, mesma decisão (${tests} casos)`);
  // a memória (fantasma) é de onde ela viu, não de onde está
  const s2 = newBattle({ map: mapWith({}), units: [P('batedor', 5, 5), R('fuzileiro', 5, 2)] });
  ok(s2.seen[ROBOTS][0] && s2.seen[ROBOTS][0].x === 5, 'o robô lembra onde viu o batedor');
}

console.log('IA');
{
  for (const o of [...GENERALS, ROBOT]) {
    let worst = 0, legal = true;
    for (let g = 0; g < 6; g++) {
      const st = newBattle({ seed: 200 + g, map: g % 2 ? 'canteiro' : 'quintal' });
      const side = o === ROBOT ? PLAYER : ROBOTS;
      if (side === ROBOTS) { st.side = ROBOTS; for (const u of alive(st, ROBOTS)) u.ap = 2; }
      const t0 = performance.now();
      const a = chooseAction(st, side, o);
      worst = Math.max(worst, performance.now() - t0);
      if (!isLegal(st, a)) legal = false;
    }
    ok(legal, `${o.name}: ação válida`);
    ok(worst < 100, `${o.name}: decide em menos de 100 ms (pior ${worst.toFixed(1)} ms)`);
  }
  // estilos: o Engrenagem avança mais, a Mira vigia mais, o Manivela flanqueia mais
  const stats = (o) => { let adv = 0, ow = 0, acts = 0, fl = 0, shots = 0;
    for (let g = 0; g < 30; g++) { let s = newBattle({ seed: 400 + g, map: g % 2 ? 'canteiro' : 'quintal' }), guard = 0;
      while (!s.over && guard++ < 40) { if (s.side === PLAYER) { s = playTurn(s, PLAYER, GENERALS[1]); continue; }
        s = playTurn(s, ROBOTS, o, (a, r) => { acts++; if (a.type === 'overwatch') ow++; if (a.type === 'move') adv += a.y - r.events.find(e => e.type === 'move').path[0][1]; if (a.type === 'shoot') { shots++; if (r.events.find(e => e.type === 'shot')?.flanked) fl++; } }); } }
    return { adv: adv / acts, ow: ow / acts, fl: fl / 30 }; };
  const [sE, sM, sN] = GENERALS.map(stats);
  console.log(`  avanço por ação: ${sE.adv.toFixed(2)} / ${sM.adv.toFixed(2)} / ${sN.adv.toFixed(2)}  ·  vigiar: ${(sE.ow * 100).toFixed(0)}% / ${(sM.ow * 100).toFixed(0)}% / ${(sN.ow * 100).toFixed(0)}%  ·  tiros de flanco por batalha: ${sE.fl.toFixed(1)} / ${sM.fl.toFixed(1)} / ${sN.fl.toFixed(1)}  (Engrenagem / Mira / Manivela)`);
  ok(sE.adv > sM.adv, 'General Engrenagem avança mais que a Capitã Mira');
  ok(sM.ow > sE.ow, 'Capitã Mira vigia mais que o Engrenagem');
  ok(sN.fl > sM.fl, 'Major Manivela pega mais de flanco que a Capitã Mira');
}

console.log('IA contra IA');
{
  const duel = (i, j, games) => {
    let wa = 0, wb = 0, dr = 0; const lines = [];
    for (let g = 0; g < games; g++) {
      const sw = g % 2 === 1;
      const st = newBattle({ seed: 900 + g, map: g % 4 < 2 ? 'quintal' : 'canteiro' });
      const f = playBattle(st, sw ? [GENERALS[j], GENERALS[i]] : [GENERALS[i], GENERALS[j]]);
      ok(f.over, 'batalha IA x IA até o fim');
      const aSide = sw ? 1 : 0;
      if (f.winner == null) dr++; else if (f.winner === aSide) wa++; else wb++;
      if (g < 6) lines.push(`${alive(f, aSide).length}x${alive(f, 1 - aSide).length}`);
    }
    console.log(`  ${GENERALS[i].name} ${wa} x ${wb} ${GENERALS[j].name}${dr ? ` (${dr} empates)` : ''}  (de pé no fim: ${lines.join(' ')} ...)`);
    return [wa, wb];
  };
  const [a, b] = duel(2, 0, 160), [c, d] = duel(2, 1, 160), [e, f] = duel(0, 1, 160);
  ok(a > b && c > d, 'Major Manivela (o mais forte) ganha mais do que perde dos outros dois');
  ok(e > f, 'General Engrenagem ganha mais do que perde da Capitã Mira');
}

console.log('Missões');
{
  for (const [i, c] of CHALLENGES.entries()) {
    ok(c.desc && c.stars.length === 3 && c.stars[0] < c.stars[1] && c.stars[1] < c.stars[2] && c.limit >= 2, `missão ${i + 1}: texto e metas crescentes`);
    const st = setupChallenge(c);
    ok(st.units.every(u => st.map[u.y][u.x] === '.') && new Set(st.units.map(u => `${u.x},${u.y}`)).size === st.units.length, `missão ${i + 1}: tropas em casas livres`);
    const t0 = performance.now();
    const r = runChallenge(c);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}  ${r.value}  (turno ${r.st.turn}, ${alive(r.st, PLAYER).length} de pé, ${(performance.now() - t0).toFixed(0)} ms)`);
    ok(r.stars === 3, `robô tira 3 estrelas na missão ${i + 1}`);
    ok(naive(c) < c.stars[2], `missão ${i + 1}: só agachar e esperar não dá 3 estrelas`);
  }
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try {
    const out = await smoke();
    for (const [cond, msg] of out) ok(cond, msg);
    console.log(`  ${out.filter(o => o[0]).length} de ${out.length} conferências do jogo carregado`);
  } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
