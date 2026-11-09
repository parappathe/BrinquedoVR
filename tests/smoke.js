// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, batalha (com o robô), clique do PC, controle e mãos do VR e missões funcionam.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.brinquedo;
  const THREE = await import('../vendor/three/three.module.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(0.5);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
  const canvasEl = G.renderer.domElement;
  const click = (what) => { const p = dev.screenOf(what); canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y }); dev.advance(0.02); canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 }); win.dispatch('pointerup', {}); return dev.advance(0.02); };
  const key = (k) => { win.dispatch('keydown', { key: k }); win.dispatch('keyup', { key: k }); return dev.advance(0.02); };
  const waitFor = (f, max = 200) => { for (let i = 0; i < max && !f(dev.state()); i++) dev.advance(0.25); return dev.advance(0.05); };
  const sold = (st, id) => st.soldados.find(x => x.id === id);

  dev.startMatch(1);
  s = dev.advance(0.5);
  ok(s.tela === 'play' && s.adversario === 'General Engrenagem' && s.soldados.length === 4 && s.fase === 'player', 'batalha contra o General Engrenagem: 4 soldados, sua vez');
  ok(s.robosNaTela.length === s.robosVistos.length, `névoa: só os robôs que seus soldados enxergam aparecem (${s.robosNaTela.length} de 4)`);
  // PC: clicar no soldado, na casa
  const u0 = s.soldados[0];
  s = click({ unit: u0.id });
  ok(s.selecionado === u0.id && s.casasAlcance > 0, `clicar no soldado escolhe e mostra as casas (${s.casasAlcance})`);
  const st0 = G.battle;
  const target = [u0.x, u0.y - 2];
  s = click({ cell: target });
  s = waitFor(x => x.fase === 'player');
  ok(sold(s, u0.id).y === target[1] && sold(s, u0.id).acoes === 1, 'clicar na casa anda (gasta 1 ação)');
  void st0;
  // olhar do soldado
  s = key('q');
  ok(s.olhando, 'Q: olhar do soldado');
  s = dev.advance(0.4);
  const eye = G.models.get(u0.id).getWorldPosition(new THREE.Vector3());
  ok(G.camera.position.distanceTo(eye) < 0.12, `a câmera vai para a altura do boneco (${G.camera.position.distanceTo(eye).toFixed(3)} m)`);
  s = key('q');
  ok(!s.olhando, 'Q de novo volta');
  // tiro: põe um robô à vista e mira (o teleporte é só do teste)
  const rid = G.battle.units.find(u => u.side === 1).id;
  {
    const R0 = await import('../js/rules.js');
    const b = G.battle, me = R0.byId(b, u0.id);
    let spot = null;
    for (let d = 3; d <= 6 && !spot; d++) for (let dx = -2; dx <= 2 && !spot; dx++) { const x = me.x + dx, y = me.y - d; if (x < 0 || y < 0 || x >= R0.W || R0.blocked(b, x, y) || R0.unitAt(b, x, y)) continue; if (R0.shotInfo(b, me, { ...R0.byId(b, rid), x, y }).ok) spot = [x, y]; }
    dev.place(rid, spot[0], spot[1]);
  }
  s = dev.advance(0.1);
  ok(s.robosVistos.includes(rid) && s.robosNaTela.includes(rid), 'robô que entra na vista aparece');
  s = click({ unit: rid });
  ok(s.mira === rid && G.world.chanceLabel.mesh.visible, 'clicar no robô mira e mostra a chance');
  const shots0 = s.tiros;
  s = click({ unit: rid });
  s = waitFor(x => x.fase !== 'anim');
  ok(s.tiros === shots0 + 1, 'clicar de novo atira');
  // o resto: B agacha, Espaço passa a vez; os robôs jogam e volta para você
  s = waitFor(x => x.fase === 'player');
  const busy = s.soldados.find(x => x.vivo && x.acoes > 0);
  if (busy) { key(String(s.soldados.indexOf(busy) + 1)); s = key('b'); s = waitFor(x => x.fase !== 'anim'); ok(sold(s, busy.id).agachado || s.lado === 'robôs', 'B: agachar'); }
  if (dev.state().fase === 'player') key(' ');
  s = waitFor(x => x.fase === 'player' && x.turno === 2);
  ok(s.turno === 2 && s.lado === 'você', 'Espaço passa a vez; os robôs jogam e volta para você no turno 2');

  // VR com controle de mentira: aperto pega o boneco, solta na casa
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const setGrab = (p) => { entry.grip.position.copy(p.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv)); entry.ctrl.position.copy(entry.grip.position); G.shell.rig.updateMatrixWorld(true); };
  const S = await import('../js/scene.js');
  s = dev.state();
  const v = s.soldados.find(x => x.vivo && x.acoes === 2);
  if (v && s.fase === 'player') {
    const R = await import('../js/rules.js');
    const dest = [...R.reachable(G.battle, R.byId(G.battle, v.id)).values()].find(c => c.cost === 1);
    setGrab(G.models.get(v.id).userData.hit.getWorldPosition(new THREE.Vector3()));
    G.shell.hooks.squeezeStart(entry);
    s = dev.advance(0.05);
    ok(s.segurando === v.id, 'VR: aperto pega o soldadinho');
    setGrab(S.cellPos(dest.x, dest.y, new THREE.Vector3()).add(new THREE.Vector3(0, 0.05, 0)));
    s = dev.advance(0.05);
    G.shell.hooks.squeezeEnd(entry);
    s = waitFor(x => x.fase !== 'anim');
    ok(sold(s, v.id).x === dest.x && sold(s, v.id).y === dest.y, 'VR: soltar na casa move o boneco');
  } else ok(false, 'sem soldado com 2 ações para o teste do controle');
  entry.source = null; entry.side = null;

  // Só com as mãos: pinça perto do botão Vigiar; pinça apontando de longe anda
  s = waitFor(x => x.fase === 'player');
  const hand = G.shell.ctrls[0];
  hand.source = { handedness: 'left', hand: {} };
  hand.side = 'left';
  const setHand = (p) => { hand.grip.position.copy(p.clone().applyMatrix4(rigInv)); hand.ctrl.position.copy(hand.grip.position); G.shell.rig.updateMatrixWorld(true); };
  const R2 = await import('../js/rules.js');
  const w2 = s.soldados.find(x => x.vivo && x.acoes === 2);
  if (w2) {
    key(String(s.soldados.indexOf(w2) + 1));
    const dest = [...R2.reachable(G.battle, R2.byId(G.battle, w2.id)).values()].find(c => c.cost === 2);
    const from = new THREE.Vector3(0, 1.35, 0.25);
    setHand(from);
    const to = S.cellPos(dest.x, dest.y, new THREE.Vector3());
    hand.ctrl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), to.clone().sub(from).normalize());
    G.shell.rig.updateMatrixWorld(true);
    G.shell.hooks.selectStart(hand); G.shell.hooks.selectEnd(hand);
    s = waitFor(x => x.fase !== 'anim');
    ok(sold(s, w2.id).x === dest.x && sold(s, w2.id).y === dest.y, 'mãos: pinça apontando de longe escolhe a casa e anda');
    if (dev.state().fase === 'player' && sold(dev.state(), w2.id).acoes > 0) {
      setHand(G.world.buttons.overwatch.m.getWorldPosition(new THREE.Vector3()));
      G.shell.hooks.selectStart(hand); G.shell.hooks.selectEnd(hand);
      s = waitFor(x => x.fase !== 'anim');
      ok(sold(s, w2.id).vigiando || s.lado === 'robôs' || s.turno > 2, 'mãos: pinça no botão Vigiar põe o soldado vigiando');
    }
  } else ok(false, 'sem soldado com 2 ações para o teste das mãos');
  hand.source = null; hand.side = null;

  // o resto da batalha o robô joga
  dev.autoplay = true;
  let guard = 0;
  while (!dev.state().vencedor && guard++ < 4000) s = dev.advance(0.25);
  s = dev.state();
  ok(s.vencedor, `batalha terminou sozinha (vencedor: ${s.vencedor}, turno ${s.turno})`);
  const saved = () => JSON.parse(store.get('brinquedovr.v1') || '{}');
  ok(saved().games?.[0] === 1, 'resultado salvo no localStorage');

  const C = await import('../js/challenges.js');
  const stars = [];
  for (let n = 1; n <= C.CHALLENGES.length; n++) {
    dev.loadLevel(n);
    let g = 0;
    while (dev.state().estrelas == null && g++ < 2000) dev.advance(0.25);
    stars.push(dev.state().estrelas);
  }
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nas ${C.CHALLENGES.length} missões dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(saved().ch || {}).length === C.CHALLENGES.length, 'estrelas das missões salvas');

  dev.autoplay = false;
  dev.loadLevel(10);
  s = dev.win();
  ok(s.estrelas === 3, 'dev.win() cumpre a missão');
  dev.startMatch(3);
  s = dev.win();
  ok(s.vencedor === 'você', 'dev.win() ganha a batalha');
  ok(dev.cheat() && Array.isArray(dev.cheat()), 'dev.cheat() mostra onde estão os robôs');

  dev.startMatch(2);
  dev.advance(0.2);
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'paused', 'Esc pausa');
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'play', 'Esc de novo continua');
  // olhar no VR: retrato renderizado na mão
  G.renderer.xr.isPresenting = true;
  key('q'); dev.advance(0.1);
  ok(G.world.portrait.visible, 'VR: "Olhar" mostra o retrato do que o boneco vê');
  key('q');
  G.renderer.xr.isPresenting = false;
  dev.resetSave();
  ok(saved().wins.join() === '0,0,0', 'dev.resetSave() apaga o progresso');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
