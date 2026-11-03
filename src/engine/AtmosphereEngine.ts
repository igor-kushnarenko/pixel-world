import {
  AdditiveBlending, ClampToEdgeWrapping, Color, DataTexture, LinearSRGBColorSpace,
  Mesh, NearestFilter, NoColorSpace, NormalBlending, OrthographicCamera,
  PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Texture, TextureLoader,
  UnsignedByteType, Vector2, WebGLRenderer, WebGLRenderTarget, CanvasTexture
} from 'three';
import type { IUniform } from 'three';
import type { AtmosphereParameters, CloudPlane, EngineDiagnostics, EngineOptions, LightMask, ParameterPatch, TextureSource } from './types';
import { getPreset, paletteAt, parsePreset, resolveParameters, rgb } from './parameters';
import { vertex, skyFragment, cloudFragment, imageFragment, lightFragment, fogFragment, rainFragment, outputFragment } from './shaders';

interface Pass { id: string; mesh: Mesh<PlaneGeometry, ShaderMaterial>; uniforms: Record<string, IUniform>; userVisible: boolean }
interface CloudPass extends Pass { name: 'far' | 'low'; offset: Vector2 }
interface LightPass extends Pass { config: LightMask }

/** Owns its renderer and GPU resources. Does not modify source files or caller textures. */
export class AtmosphereEngine {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  private readonly options: EngineOptions;
  private readonly renderer: WebGLRenderer;
  private readonly target: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly output = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly textures: Texture[] = [];
  private readonly passes: Pass[] = [];
  private readonly clouds: CloudPass[] = [];
  private readonly lights: LightPass[] = [];
  private readonly observer: ResizeObserver;
  private parameters: AtmosphereParameters;
  private windowTexture: Texture;
  private outputMaterial: ShaderMaterial;
  private frameId = 0;
  private previousTime = 0;
  private time = 0;
  private flashAge = Infinity;
  private nextFlash = 14;
  private running = false;
  private disposed = false;
  private contextLost = false;
  private resumeAfterRestore = false;
  private scale = 1;
  private calls = 0;

  static async create(options: EngineOptions): Promise<AtmosphereEngine> {
    const { width, height, layers = [], lights = [] } = options.scene;
    if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 4096)) throw new Error('Scene dimensions must be integer logical pixels, 1…4096');
    const ids = ['sky', 'cloud-far', 'cloud-low', 'fog', 'rain', ...layers.map(l => l.id), ...lights.map(l => l.id)];
    if (new Set(ids).size !== ids.length) throw new Error('Layer IDs must be unique, including reserved sky/cloud-far/cloud-low/fog/rain');
    for (const layer of [...layers, ...lights]) {
      if (!Number.isFinite(layer.depth) || layer.depth <= 0 || layer.depth >= 1000) throw new Error(`Invalid depth for ${layer.id}: expected 0 < depth < 1000`);
      if (!['world', 'room'].includes(layer.scope)) throw new Error(`Invalid scope: ${layer.id}`);
    }
    for (const key of ['fogDepth', 'rainDepth'] as const) {
      const depth = options.scene[key];
      if (depth !== undefined && (!Number.isFinite(depth) || depth <= 0 || depth >= 1000)) throw new Error(`Invalid ${key}: expected 0 < depth < 1000`);
    }
    resolveParameters(options.parameters);
    const engine = new AtmosphereEngine(options);
    try { await engine.initialize(); engine.render(); return engine; }
    catch (error) { engine.dispose(); throw error; }
  }

  private constructor(options: EngineOptions) {
    this.options = options;
    this.width = options.scene.width; this.height = options.scene.height;
    this.parameters = resolveParameters(options.parameters);
    this.renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power', premultipliedAlpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(new Color(...rgb(options.scene.background ?? '#060912')), 1);
    this.renderer.info.autoReset = false;
    this.target = new WebGLRenderTarget(this.width, this.height, {
      minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false,
      stencilBuffer: false, type: UnsignedByteType, format: RGBAFormat, generateMipmaps: false
    });
    this.target.texture.colorSpace = NoColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'atmosphere-canvas';
    this.canvas.setAttribute('aria-label', 'Процедурная пиксельная сцена: небо, город и окно');
    this.canvas.setAttribute('role', 'img');
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.display = 'block'; this.canvas.style.flexShrink = '0';
    this.windowTexture = this.whiteTexture();
    this.camera.position.z = 1;
    this.outputMaterial = new ShaderMaterial({ vertexShader: vertex, fragmentShader: outputFragment, uniforms: { uFrame: { value: this.target.texture } }, depthTest: false, depthWrite: false });
    this.output.add(new Mesh(this.geometry, this.outputMaterial));
    options.container.append(this.canvas);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(options.container);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
  }

  private assertAlive() { if (this.disposed) throw new Error('AtmosphereEngine has been disposed'); }
  private whiteTexture() {
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
    texture.needsUpdate = true; this.textures.push(texture); return texture;
  }
  private async texture(source: TextureSource, fullSize = false): Promise<Texture> {
    // Clone caller textures before changing sampling/color metadata.
    const texture = typeof source === 'string' ? await new TextureLoader().loadAsync(source)
      : source instanceof Texture ? source.clone() : new CanvasTexture(source);
    this.textures.push(texture);
    texture.minFilter = NearestFilter; texture.magFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping; texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false; texture.premultiplyAlpha = false;
    // Art is composited in its authored display-space palette, without tone mapping.
    texture.colorSpace = NoColorSpace; texture.needsUpdate = true;
    const size = texture.image as { width?: number; height?: number } | undefined;
    if (!size?.width || !size.height) throw new Error('Texture must have a loaded 2D image');
    if (fullSize && (size.width !== this.width || size.height !== this.height)) throw new Error(`Mask must match scene ${this.width}×${this.height}; got ${size.width}×${size.height}`);
    return texture;
  }

  private pass(id: string, fragment: string, depth: number, clipped: boolean, extra: Record<string, IUniform> = {}, additive = false): Pass {
    const uniforms = {
      uResolution: { value: new Vector2(this.width, this.height) }, uWindow: { value: this.windowTexture },
      uClip: { value: clipped ? 1 : 0 }, uSteps: { value: 12 }, uFlash: { value: 0 }, uSeed: { value: this.parameters.seed }, ...extra
    };
    const material = new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms,
      transparent: true, depthTest: false, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
    const mesh = new Mesh(this.geometry, material); mesh.renderOrder = depth; mesh.frustumCulled = false;
    this.scene.add(mesh);
    const pass = { id, mesh, uniforms, userVisible: true }; this.passes.push(pass); return pass;
  }
  private async initialize() {
    const scene = this.options.scene;
    if (scene.windowMask) this.windowTexture = await this.texture(scene.windowMask, true);
    this.pass('sky', skyFragment, 0, true, {
      uTop: { value: [0, 0, 0] }, uBottom: { value: [0, 0, 0] }, uGlow: { value: 0 },
      uStars: { value: 0 }, uNight: { value: 1 }, uDither: { value: 0 }
    });
    for (const name of ['far', 'low'] as const) {
      const offset = new Vector2();
      const pass = this.pass(`cloud-${name}`, cloudFragment, this.parameters.clouds.layers[name].depth, true, {
        uOffset: { value: offset }, uCoverage: { value: 0 }, uDensity: { value: 0 }, uScale: { value: 1 },
        uHeight: { value: 0.2 }, uThickness: { value: 0.3 }, uCloudSteps: { value: 4 },
        uStorm: { value: 0 }, uCloudColor: { value: [0.2, 0.2, 0.3] }
      });
      this.clouds.push(Object.assign(pass, { name, offset }));
    }
    this.pass('fog', fogFragment, scene.fogDepth ?? 50, true, { uFog: { value: 0 }, uFogColor: { value: [0.2, 0.2, 0.3] } });
    this.pass('rain', rainFragment, scene.rainDepth ?? 80, true, { uRain: { value: 0 }, uTime: { value: 0 } });
    for (const layer of scene.layers ?? []) {
      const texture = await this.texture(layer.source);
      const { width, height } = texture.image as { width: number; height: number };
      const x = layer.x ?? 0, y = layer.y ?? 0, opacity = layer.opacity ?? 1;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + width > this.width || y + height > this.height) throw new Error(`${layer.id}: native-size art must fit scene at integer coordinates`);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error(`${layer.id}: opacity must be 0…1`);
      this.pass(layer.id, imageFragment, layer.depth, layer.scope === 'world', {
        uImage: { value: texture }, uOrigin: { value: new Vector2(x, y) }, uSize: { value: new Vector2(width, height) },
        uOpacity: { value: opacity }, uReceivesFlash: { value: layer.receivesLightning ? 1 : 0 }
      });
    }
    const groups = ['cityWindows', 'neon', 'street', 'reflections', 'exteriorRoom', 'interior', 'radio', 'computer'];
    for (const light of scene.lights ?? []) {
      if (!groups.includes(light.group)) throw new Error(`Unknown light group: ${light.group}`);
      if (light.intensity !== undefined && (!Number.isFinite(light.intensity) || light.intensity < 0 || light.intensity > 1)) throw new Error(`Invalid light intensity: ${light.id}`);
      if (light.pulse && (!Number.isFinite(light.pulse.periodSeconds) || light.pulse.periodSeconds <= 0 || !Number.isFinite(light.pulse.amount) || light.pulse.amount < 0 || light.pulse.amount > 1)) throw new Error(`Invalid pulse: ${light.id}`);
      const texture = await this.texture(light.source, true);
      const pass = this.pass(light.id, lightFragment, light.depth, light.scope === 'world', {
        uImage: { value: texture }, uColor: { value: rgb(light.color) }, uIntensity: { value: light.intensity ?? 1 }
      }, true);
      this.lights.push(Object.assign(pass, { config: { ...light } }));
    }
  }

  getParameters(): AtmosphereParameters { return structuredClone(this.parameters); }
  setParameters(patch: ParameterPatch): void {
    this.assertAlive();
    const next = resolveParameters(patch, this.parameters);
    if (!next.weather.stormEnabled) this.flashAge = Infinity;
    if (next.weather.stormEnabled && !this.parameters.weather.stormEnabled) this.nextFlash = this.time + 14;
    this.parameters = next;
    if (!this.running) this.render();
  }
  applyPreset(name: string): void { this.replaceParameters(getPreset(name)); }
  importPreset(json: string): void { this.replaceParameters(parsePreset(json)); }
  exportPreset(): string { return JSON.stringify(this.parameters, null, 2); }
  private replaceParameters(parameters: AtmosphereParameters) {
    this.assertAlive(); this.parameters = parameters; this.seek(0);
  }
  /** Absolute deterministic state for screenshots, replays and preset comparisons. */
  seek(seconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Time must be finite and non-negative');
    this.time = seconds; this.flashAge = Infinity; this.nextFlash = seconds + 14;
    for (const cloud of this.clouds) { cloud.offset.set(0, 0); this.moveCloud(cloud, this.parameters.clouds.layers[cloud.name], seconds); }
    this.render();
  }
  setLayerVisible(id: string, visible: boolean): void {
    this.assertAlive(); const pass = this.passes.find(p => p.id === id);
    if (!pass) throw new Error(`Unknown layer: ${id}`);
    pass.userVisible = visible; if (!this.running) this.render();
  }
  /** For an editor panorama view. Location art and masks themselves stay untouched. */
  setWindowMaskEnabled(enabled: boolean): void {
    this.assertAlive();
    for (const pass of this.passes) {
      const isWorld = !this.options.scene.layers?.some(l => l.id === pass.id && l.scope === 'room')
        && !this.options.scene.lights?.some(l => l.id === pass.id && l.scope === 'room');
      if (isWorld) pass.uniforms.uClip.value = enabled ? 1 : 0;
    }
    if (!this.running) this.render();
  }
  triggerLightning(): boolean {
    this.assertAlive();
    if (!this.parameters.weather.stormEnabled || this.flashAge < 1) return false;
    this.flashAge = 0; if (!this.running) this.render(); return true;
  }
  private moveCloud(cloud: CloudPass, layer: CloudPlane, dt: number) {
    const angle = this.parameters.clouds.windDirectionDeg * Math.PI / 180;
    const speed = this.parameters.clouds.windSpeed * layer.speed * 12 * dt;
    cloud.offset.x -= Math.cos(angle) * speed; cloud.offset.y += Math.sin(angle) * speed;
  }
  update(deltaSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('deltaSeconds must be finite and non-negative');
    this.time += deltaSeconds; this.flashAge += deltaSeconds;
    for (const cloud of this.clouds) this.moveCloud(cloud, this.parameters.clouds.layers[cloud.name], deltaSeconds);
    if (this.parameters.weather.stormEnabled && this.time >= this.nextFlash) {
      this.triggerLightning();
      this.nextFlash = this.time + 12 + ((this.parameters.seed * 17 + Math.floor(this.time)) % 9);
    }
    this.render();
  }
  private groupIntensity(light: LightMask): number {
    const p = this.parameters;
    let intensity: number;
    switch (light.group) {
      case 'exteriorRoom': intensity = p.lighting.exteriorRoomFill * (1 + paletteAt(p.timeOfDay, p.sky.palette).ambient) + this.flash() * 0.65; break;
      case 'interior': intensity = p.lighting.interiorLightsEnabled ? 1 : 0; break;
      case 'radio': intensity = p.lighting.radioBacklightEnabled ? 1 : 0; break;
      case 'computer': intensity = p.lighting.computerEnabled ? 1 : 0; break;
      default: intensity = p.lighting.cityLightsIntensity;
    }
    const pulse = light.pulse ? 1 - light.pulse.amount * (0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 / light.pulse.periodSeconds)) : 1;
    return Math.min(1, intensity * (light.intensity ?? 1) * pulse);
  }
  private flash() { return this.parameters.weather.stormEnabled ? Math.max(0, 1 - this.flashAge / 0.55) ** 2 : 0; }

  render(): void {
    this.assertAlive(); if (this.contextLost) return;
    const p = this.parameters, colors = paletteAt(p.timeOfDay, p.sky.palette), flash = this.flash();
    for (const pass of this.passes) {
      pass.uniforms.uFlash.value = flash; pass.uniforms.uSteps.value = p.render.colorSteps; pass.uniforms.uSeed.value = p.seed;
      pass.mesh.visible = pass.userVisible;
    }
    const sky = this.passes[0].uniforms;
    sky.uTop.value = colors.top; sky.uBottom.value = colors.bottom; sky.uGlow.value = p.sky.horizonGlow;
    sky.uStars.value = p.sky.starsEnabled ? 1 : 0; sky.uNight.value = 1 - colors.ambient; sky.uDither.value = p.render.dithering ? 1 : 0;
    for (const cloud of this.clouds) {
      const layer = p.clouds.layers[cloud.name], u = cloud.uniforms;
      cloud.mesh.visible = cloud.userVisible && p.clouds.enabled && layer.enabled && layer.thickness > 0 && p.clouds.coverage > 0;
      cloud.mesh.renderOrder = layer.depth;
      u.uCoverage.value = p.clouds.coverage * layer.coverage; u.uDensity.value = p.clouds.density * layer.density;
      u.uScale.value = p.clouds.scale * layer.scale; u.uHeight.value = layer.height; u.uThickness.value = layer.thickness;
      u.uCloudSteps.value = layer.colorSteps; u.uStorm.value = p.weather.stormEnabled ? 1 : 0;
      u.uCloudColor.value = colors.cloud;
    }
    const fog = this.passes.find(pass => pass.id === 'fog')!;
    fog.mesh.visible = fog.userVisible && p.weather.fog > 0; fog.uniforms.uFog.value = p.weather.fog; fog.uniforms.uFogColor.value = colors.bottom;
    const rain = this.passes.find(pass => pass.id === 'rain')!;
    rain.mesh.visible = rain.userVisible && p.weather.rain > 0; rain.uniforms.uRain.value = p.weather.rain; rain.uniforms.uTime.value = this.time;
    for (const light of this.lights) {
      light.uniforms.uIntensity.value = this.groupIntensity(light.config);
      if (light.config.group === 'exteriorRoom') {
        light.uniforms.uColor.value = rgb(light.config.color).map((c, i) => c * 0.8 + colors.bottom[i] * 0.2);
      }
      light.mesh.visible = light.userVisible && light.uniforms.uIntensity.value > 0;
    }
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.target); this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null); this.renderer.render(this.output, this.camera);
    this.calls = this.renderer.info.render.calls;
  }
  start(): void {
    this.assertAlive(); if (this.running || this.contextLost) return;
    this.running = true; this.previousTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      // A hidden tab must not cause a huge weather/time jump on return.
      const dt = Math.min((now - this.previousTime) / 1000, 0.1); this.previousTime = now;
      try { this.update(dt); this.frameId = requestAnimationFrame(tick); }
      catch (error) { this.stop(); this.options.onError?.(error instanceof Error ? error : new Error(String(error))); }
    };
    this.frameId = requestAnimationFrame(tick);
  }
  stop(): void { this.running = false; cancelAnimationFrame(this.frameId); }
  resize(): void {
    if (this.disposed) return;
    const box = this.options.container;
    this.scale = Math.max(1, Math.floor(Math.min(box.clientWidth / this.width, box.clientHeight / this.height)));
    this.canvas.style.width = `${this.width * this.scale}px`; this.canvas.style.height = `${this.height * this.scale}px`;
    // Flex/grid centering can place the entire canvas at a fractional CSS pixel.
    // Snap the display origin as well as the size to preserve exact pixel blocks.
    this.canvas.style.transform = '';
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.style.transform = `translate(${Math.round(rect.left) - rect.left}px, ${Math.round(rect.top) - rect.top}px)`;
  }
  readPixels(): Uint8Array {
    this.assertAlive(); this.render();
    const pixels = new Uint8Array(this.width * this.height * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, this.width, this.height, pixels);
    return pixels; // WebGL bottom-left order, documented.
  }
  getDiagnostics(): EngineDiagnostics {
    return { logicalWidth: this.width, logicalHeight: this.height, integerScale: this.scale, drawCalls: this.calls, running: this.running, time: this.time,
      layers: this.passes.map(p => ({ id: p.id, depth: p.mesh.renderOrder, visible: p.mesh.visible })).sort((a, b) => a.depth - b.depth) };
  }
  private onContextLost = (event: Event) => {
    event.preventDefault(); this.contextLost = true; this.resumeAfterRestore = this.running; this.stop();
    this.options.onError?.(new Error('WebGL context lost. Waiting for the browser to restore it.'));
  };
  private onContextRestored = () => {
    this.contextLost = false; if (this.resumeAfterRestore) this.start(); else this.render();
  };
  dispose(): void {
    if (this.disposed) return;
    this.stop(); this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost); this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    for (const pass of this.passes) pass.mesh.material.dispose();
    this.outputMaterial.dispose(); this.geometry.dispose(); this.target.dispose();
    for (const texture of this.textures) texture.dispose();
    this.renderer.dispose(); this.canvas.remove(); this.disposed = true;
  }
}
