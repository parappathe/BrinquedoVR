// As 10 missões (desafios de 3 estrelas). Cada uma tem mapa, tropas, objetivo, limite de turnos e o
// general robô que comanda o outro lado. Medidas: turnos de sobra, soldados de pé ou vida somada.
// Sem navegador.
import { PLAYER, ROBOTS, W, H, newBattle, alive, applyAction } from './rules.js';
import { GENERALS, ROBOT, playTurn } from './ai.js';

const SQUAD = (y = H - 1) => [['fuzileiro', 2], ['granadeiro', 5], ['batedor', 6], ['medico', 9]].map(([type, x]) => ({ side: PLAYER, type, x, y }));
const R = (type, x, y) => ({ side: ROBOTS, type, x, y });
const ROW = (y, skip = []) => Array.from({ length: W }, (_, x) => [x, y]).filter(([x]) => !skip.includes(x));
const DEFAULT_ROBOTS = [R('fuzileiro', 9, 0), R('granadeiro', 6, 0), R('batedor', 5, 0), R('medico', 2, 0)];

export const CHALLENGES = [
  {
    name: 'Primeira Patrulha', map: 'quintal', general: 0, limit: 4, metric: 'turnos',
    desc: 'Dois robôs de corda entraram no quintal. Elimine os dois.',
    mission: { kind: 'eliminar' }, units: [...SQUAD(), R('fuzileiro', 5, 1), R('batedor', 8, 2)], stars: [1, 2, 3],
  },
  {
    name: 'Resgate do Cabo', map: 'quintal', general: 1, limit: 4, metric: 'turnos',
    desc: 'O Cabo Tampinha caiu atrás do muro (casa marcada). Busque e traga até a sua beirada.',
    mission: { kind: 'resgatar', cells: [[6, 3]], exit: ROW(H - 1, [4, 7]) },
    units: [...SQUAD(), R('fuzileiro', 3, 1), R('medico', 9, 2), R('batedor', 8, 0)], stars: [1, 2, 3],
  },
  {
    name: 'Segurar a Mangueira', map: 'quintal', general: 0, limit: 8, metric: 'vivos',
    desc: 'Fique na faixa marcada sem nenhum robô nela no fim de 3 rodadas.',
    mission: { kind: 'segurar', cells: [[5, 6], [6, 6], [7, 6], [8, 6]], need: 3 }, units: [...SQUAD(), ...DEFAULT_ROBOTS.slice(0, 3)], stars: [1, 2, 3],
  },
  {
    name: 'Atravessar o Canteiro', map: 'canteiro', general: 1, limit: 10, metric: 'vivos',
    desc: 'Leve todo mundo que estiver de pé até a beirada do fundo.',
    mission: { kind: 'atravessar', exit: ROW(0, [3, 8]), need: 1 }, units: [...SQUAD(), R('fuzileiro', 5, 4), R('medico', 6, 5)], stars: [2, 3, 4],
  },
  {
    name: 'Sabotagem', map: 'quintal', general: 2, limit: 5, metric: 'turnos',
    desc: 'Pise nas duas chaves de corda reservas dos robôs (casas marcadas).',
    mission: { kind: 'sabotar', cells: [[2, 1], [9, 0]] }, units: [...SQUAD(), R('fuzileiro', 5, 0), R('granadeiro', 6, 1), R('batedor', 3, 2)], stars: [1, 2, 3],
  },
  {
    name: 'Sem Baixas', map: 'canteiro', general: 1, limit: 12, metric: 'vida',
    desc: 'Elimine os três robôs perdendo o mínimo de vida.',
    mission: { kind: 'eliminar' }, units: [...SQUAD(), R('fuzileiro', 4, 1), R('granadeiro', 7, 1), R('batedor', 8, 2)], stars: [5, 9, 12],
  },
  {
    name: 'Emboscada', map: 'quintal', general: 0, limit: 7, metric: 'turnos',
    desc: 'Os robôs começam vigiando. Cuidado onde pisa e elimine todos.',
    mission: { kind: 'eliminar' }, units: [...SQUAD(), R('fuzileiro', 9, 1), R('fuzileiro', 2, 1), R('batedor', 6, 0)], overwatch: true, stars: [1, 2, 3],
  },
  {
    name: 'Só o Batedor', map: 'canteiro', general: 1, limit: 4, metric: 'turnos',
    desc: 'Só o batedor. Atravesse até a beirada do fundo sem ser pego.',
    mission: { kind: 'atravessar', exit: ROW(0, [3, 8]), need: 1 },
    units: [{ side: PLAYER, type: 'batedor', x: 6, y: H - 1 }, R('fuzileiro', 2, 4), R('medico', 9, 2)], stars: [1, 2, 3],
  },
  {
    name: 'Relâmpago', map: 'quintal', general: 0, limit: 5, metric: 'turnos',
    desc: 'Elimine os quatro robôs bem rápido.',
    mission: { kind: 'eliminar' }, units: [...SQUAD(), ...DEFAULT_ROBOTS], stars: [1, 2, 3],
  },
  {
    name: 'O General', map: 'canteiro', general: 2, limit: 12, metric: 'vida',
    desc: 'O Major Manivela em pessoa, com o batalhão inteiro. Vença com o máximo de vida.',
    mission: { kind: 'eliminar' }, units: [...SQUAD(), ...DEFAULT_ROBOTS], stars: [1, 3, 5],
  },
];

export function setupChallenge(c) {
  const st = newBattle({ map: c.map, seed: 7000 + CHALLENGES.indexOf(c) * 13, units: c.units, mission: c.mission, limit: c.limit });
  if (c.overwatch) for (const u of alive(st, ROBOTS)) u.overwatch = true;
  return st;
}
export function measure(c, st) {
  if (!st.over || st.winner !== PLAYER) return 0;
  if (c.metric === 'turnos') return c.limit - st.turn + 1;
  if (c.metric === 'vivos') return alive(st, PLAYER).length;
  return alive(st, PLAYER).reduce((a, u) => a + u.hp, 0);
}
export const starsFor = (c, v) => c.stars.filter(t => v >= t).length;
export function metricName(c) { return { turnos: 'Turnos de sobra', vivos: 'Soldados de pé', vida: 'Vida somada' }[c.metric]; }
export function metricShown(c, v) { return c.metric === 'turnos' ? Math.max(0, v - 1) : v; }
export function goalText(c) {
  const [a, b, d] = c.stars;
  if (c.metric === 'turnos') return `Até ${c.limit} turnos. Estrelas: cumprir com ${a - 1}, ${b - 1} e ${d - 1} turno(s) de sobra.`;
  if (c.metric === 'vivos') return `Até ${c.limit} turnos. Estrelas com ${a}, ${b} e ${d} soldado(s) de pé.`;
  return `Até ${c.limit} turnos. Estrelas com ${a}, ${b} e ${d} de vida somada nos soldados.`;
}
export const generalOf = (c) => GENERALS[c.general];

// Joga a missão inteira com um perfil do seu lado (o robô) contra o general dela.
export function runChallenge(c, prof = ROBOT) {
  let st = setupChallenge(c), guard = 0;
  while (!st.over && guard++ < 200) st = playTurn(st, st.side, st.side === PLAYER ? prof : generalOf(c));
  return { st, value: measure(c, st), stars: starsFor(c, measure(c, st)) };
}
// Jogada "ingênua": todo mundo agacha e espera. Não pode dar 3 estrelas.
export function naive(c) {
  let st = setupChallenge(c), guard = 0;
  while (!st.over && guard++ < 200) {
    if (st.side === PLAYER) { for (const u of alive(st, PLAYER)) if (!st.over && st.side === PLAYER && u.ap > 0) st = applyAction(st, { type: 'hunker', id: u.id }).st; }
    else st = playTurn(st, ROBOTS, generalOf(c));
  }
  return measure(c, st);
}
