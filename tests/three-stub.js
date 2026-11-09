// Three.js de verdade, com um WebGLRenderer de mentira (para o teste de fumaça rodar no Node).
// ImageData não existe no Node: as texturas geradas em código (materiais3d.js) usam.
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
import * as THREE from '../vendor/three/three.module.js';
export * from '../vendor/three/three.module.js';

class FakeXR extends THREE.EventDispatcher {
  constructor() { super(); this.enabled = false; this.isPresenting = false; this._c = []; this._g = []; this._h = []; }
  setReferenceSpaceType() {}
  setFoveation() {}
  getController(i) { return (this._c[i] ||= new THREE.Group()); }
  getControllerGrip(i) { return (this._g[i] ||= new THREE.Group()); }
  getHand(i) { return (this._h[i] ||= Object.assign(new THREE.Group(), { joints: {} })); }
  getSession() { return null; }
}

export class WebGLRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.xr = new FakeXR();
    this.toneMapping = 0;
    this.shadowMap = { enabled: false, type: 0 };
    this.capabilities = { getMaxAnisotropy: () => 1 };
    this.outputColorSpace = 'srgb';
    this.toneMappingExposure = 1;
    this.renders = 0;
    this._loop = null;
  }
  setPixelRatio() {}
  setSize() {}
  setAnimationLoop(f) { this._loop = f; }
  // como o de verdade, calcula a esfera de cada geometria (pega posição com NaN, que o WebGL acusa no console)
  render(scene, camera) { scene.updateMatrixWorld(); camera.updateMatrixWorld(); scene.traverse(o => { if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); }); this.renders++; }
  setRenderTarget() {}
  getRenderTarget() { return null; }
  dispose() {}
}
