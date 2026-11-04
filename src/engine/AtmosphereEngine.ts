import {
  AdditiveBlending, ClampToEdgeWrapping, Color, DataTexture, LinearSRGBColorSpace,
  Mesh, NearestFilter, NoColorSpace, NormalBlending, OrthographicCamera,
  PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, Texture, TextureLoader,
  UnsignedByteType, Vector2, Vector3, Vector4, WebGLRenderer, WebGLRenderTarget, CanvasTexture
} from 'three';
import type { IUniform } from 'three';
import type { AtmosphereParameters, CloudPlane, EngineDiagnostics, EngineOptions, LightMask, LayerPlacement, ParameterPatch, TextureSource } from './types';
import { getPreset, paletteAt, parsePreset, resolveParameters, rgb } from './parameters';
import { frameDeltaSeconds } from './clock';
import { WindowDrops } from './WindowDrops';
import { sampleTraffic, sampleCloseTraffic } from './traffic';
import { vertex, skyFragment, cloudFragment, imageFragment, roomFragment, lightFragment, fogFragment, layerAtmosphereFragment, rainFragment, trafficFragment, outputFragment } from './shaders';

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
  private readonly atmosphereLayers = new Map<string, Pass>();
  private readonly trafficLayers = new Map<string, Pass>();
  private readonly drops: WindowDrops;
  private readonly imageLayers = new Map<string, { pass: Pass; native: Vector2 }>();
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
    ids.push(...layers.filter(l => l.scope === 'world').map(l => `atmosphere-${l.id}`));
    ids.push(...layers.filter(l => l.scope === 'world').map(l => `traffic-${l.id}`));
    ids.push(...layers.filter(l => l.scope === 'world' && l.closeTraffic).map(l => `traffic-close-${l.id}`));
    if (new Set(ids).size !== ids.length) throw new Error('Layer IDs must be unique, including reserved atmosphere IDs');
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
    this.drops = new WindowDrops(this.width, this.height, this.parameters.seed);
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
    this.outputMaterial = new ShaderMaterial({ vertexShader: vertex, fragmentShader: outputFragment, uniforms: { uFrame: { value: this.target.texture }, uGlassMask: { value: this.windowTexture }, uGlassResolution: { value: new Vector2(this.width,this.height) }, uDrops: { value: Array.from({length:32},()=>new Vector4()) }, uDropCount: { value: 0 } }, depthTest: false, depthWrite: false });
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
    this.outputMaterial.uniforms.uGlassMask.value = this.windowTexture;
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
      if (!layer.placement && (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + width > this.width || y + height > this.height)) throw new Error(`${layer.id}: native-size art must fit scene at integer coordinates`);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error(`${layer.id}: opacity must be 0…1`);
      const extra: Record<string, IUniform> = {
        uImage: { value: texture }, uOrigin: { value: new Vector2(x, y) }, uSize: { value: new Vector2(width, height) },
        uOpacity: { value: opacity }, uReceivesFlash: { value: layer.receivesLightning ? 1 : 0 },
        uTint: { value: new Vector3(...(layer.tint ?? [1, 1, 1])) },
        uTime: { value: 0 }, uHasCityMask: { value: layer.cityLightMask ? 1 : 0 },
        uCityMask: { value: layer.cityLightMask ? await this.texture(layer.cityLightMask) : this.windowTexture },
        uCityLights: { value: this.parameters.lighting.cityLightsIntensity }, uBeacons: { value: 0 }
      };
      const checkSameSize = (t: Texture) => {
        const image = t.image as { width: number; height: number };
        if (image.width !== width || image.height !== height) throw new Error(`${layer.id}: light map must match its source image`);
      };
      if (layer.cityLightMask) checkSameSize(extra.uCityMask.value);
      if (layer.roomLights) {
        const [left, right, emitters] = await Promise.all([this.texture(layer.roomLights.left), this.texture(layer.roomLights.right), this.texture(layer.roomLights.emitters)]);
        [left, right, emitters].forEach(checkSameSize);
        Object.assign(extra, {
          uLeftLight: { value: left }, uRightLight: { value: right }, uEmitters: { value: emitters },
          uRoomControls: { value: new Vector3() },
          uRadioDial: { value: new Vector4(...layer.roomLights.radioDial) }, uRadioLed: { value: new Vector2(...layer.roomLights.radioLed) },
          uComputerScreen:{value:layer.roomLights.computerScreen ? await this.texture(layer.roomLights.computerScreen):this.windowTexture},
          uComputerRect:{value:new Vector4(...(layer.roomLights.computerRect??[0,0,0,0]))},
          uComputerCorners:{value:new Vector4(...(layer.roomLights.computerCorners??[layer.roomLights.computerRect?.[0]??0,layer.roomLights.computerRect?.[2]??0,layer.roomLights.computerRect?.[0]??0,layer.roomLights.computerRect?.[2]??0]))},uComputerOn:{value:0}
        });
      }
      const pass = this.pass(layer.id, layer.roomLights ? roomFragment : imageFragment, layer.depth, layer.scope === 'world', extra);
      this.imageLayers.set(layer.id, { pass, native: new Vector2(width, height) });
      if (layer.placement) this.placeLayer(layer.id, layer.placement);
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
    const depths = this.passes.map(p => p.mesh.renderOrder);
    for (const layer of scene.layers ?? []) {
      if (layer.scope !== 'world') continue;
      const next = Math.min(1000, ...depths.filter(d => d > layer.depth));
      const pass = this.pass(`atmosphere-${layer.id}`, layerAtmosphereFragment, (layer.depth + next) / 2, true, {
        uAtmosphere: { value: new Vector4() }, uAtmosphereColor: { value: [0, 0, 0] }, uDrift: { value: new Vector2() }
      });
      this.atmosphereLayers.set(layer.id, pass);
      const image = this.imageLayers.get(layer.id)!;
      const traffic = this.pass(`traffic-${layer.id}`, trafficFragment, layer.depth+(next-layer.depth)*0.25, true, {
        uVehicleCount: { value:0 }, uTrafficRank: { value:(scene.layers ?? []).filter(l=>l.scope==='world' && l.depth<layer.depth).length },
        uDetailedTraffic: { value:0 },
        uVehicles: { value:Array.from({length:60},()=>new Vector4()) }, uVehicleStyles: { value:Array.from({length:60},()=>new Vector4()) },
        uOrigin: image.pass.uniforms.uOrigin, uSize: image.pass.uniforms.uSize, uNative: { value:image.native }
      });
      this.trafficLayers.set(layer.id,traffic);
      if(layer.closeTraffic){
        const close=this.pass(`traffic-close-${layer.id}`,trafficFragment,layer.depth+(next-layer.depth)*0.75,true,{
          ...traffic.uniforms,uDetailedTraffic:{value:1},uTrafficRank:{value:2},uVehicleCount:{value:0},
          uVehicles:{value:Array.from({length:60},()=>new Vector4())},uVehicleStyles:{value:Array.from({length:60},()=>new Vector4())}
        });
        this.trafficLayers.set(`close-${layer.id}`,close);
      }
    }
    this.prepareAtmosphere(this.parameters);
  }

  private prepareAtmosphere(p: AtmosphereParameters) {
    for (const id of Object.keys(p.weather.layers)) if (!this.atmosphereLayers.has(id)) throw new Error(`Unknown world atmosphere layer: ${id}`);
    for (const id of this.atmosphereLayers.keys()) {
      if (!Object.hasOwn(p.weather.layers, id)) p.weather.layers[id] = { hazeDensity: 0, fogDensity: 0, fogAmount: 0.5, billowing: 0 };
    }
  }

  getParameters(): AtmosphereParameters { return structuredClone(this.parameters); }
  setParameters(patch: ParameterPatch): void {
    this.assertAlive();
    const next = resolveParameters(patch, this.parameters);
    this.prepareAtmosphere(next);
    if (next.seed !== this.parameters.seed) this.drops.reset(next.seed);
    if (!next.weather.stormEnabled) this.flashAge = Infinity;
    if (next.weather.stormEnabled && !this.parameters.weather.stormEnabled) this.nextFlash = this.time + 14;
    this.parameters = next;
    this.renderAfterEdit();
  }
  applyPreset(name: string): void { this.replaceParameters(getPreset(name)); }
  importPreset(json: string): void { this.replaceParameters(parsePreset(json)); }
  exportPreset(): string { return JSON.stringify(this.parameters, null, 2); }
  private replaceParameters(parameters: AtmosphereParameters) {
    this.prepareAtmosphere(parameters);
    this.assertAlive(); this.parameters = parameters; this.seek(0);
  }
  /** Absolute deterministic state for screenshots, replays and preset comparisons. */
  seek(seconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Time must be finite and non-negative');
    this.time = seconds; this.flashAge = Infinity; this.nextFlash = seconds + 14;
    this.drops.reset(this.parameters.seed);
    for (const cloud of this.clouds) { cloud.offset.set(0, 0); this.moveCloud(cloud, this.parameters.clouds.layers[cloud.name], seconds); }
    this.render();
  }
  setLayerVisible(id: string, visible: boolean): void {
    this.assertAlive(); const pass = this.passes.find(p => p.id === id);
    if (!pass) throw new Error(`Unknown layer: ${id}`);
    pass.userVisible = visible; this.renderAfterEdit();
  }
  private renderAfterEdit() { if (!this.running && this.options.autoRender !== false) this.render(); }
  private placeLayer(id: string, placement: LayerPlacement) {
    const image = this.imageLayers.get(id);
    if (!image) throw new Error(`Unknown image layer: ${id}`);
    const { x, y, scale } = placement;
    if (![x, y, scale].every(Number.isFinite) || scale < 0.1 || scale > 4 || Math.abs(x) > this.width * 4 || Math.abs(y) > this.height * 4) throw new Error(`Invalid placement: ${id}`);
    const size = image.native.clone().multiplyScalar(scale);
    image.pass.uniforms.uSize.value.copy(size);
    image.pass.uniforms.uOrigin.value.set(Math.round((this.width - size.x) / 2 + x), Math.round((this.height - size.y) / 2 + y));
  }
  /** Applies only explicit scene-authored transforms. Image data stays untouched. */
  setLayerPlacement(id: string, placement: LayerPlacement): void { this.assertAlive(); this.placeLayer(id, placement); this.renderAfterEdit(); }
  setLayerTint(id: string, tint: [number, number, number]): void {
    this.assertAlive(); const image = this.imageLayers.get(id);
    if (!image || !tint.every(n => Number.isFinite(n) && n >= 0 && n <= 2)) throw new Error(`Invalid tint/layer: ${id}`);
    image.pass.uniforms.uTint.value.set(...tint); this.renderAfterEdit();
  }
  setRoomLightLevels(id: string, left: number, right: number, radio: number): void {
    this.assertAlive(); const pass = this.imageLayers.get(id)?.pass;
    if (!pass?.uniforms.uRoomControls || ![left, right, radio].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error(`Invalid room light controls: ${id}`);
    pass.uniforms.uRoomControls.value.set(left, right, radio); this.renderAfterEdit();
  }
  setComputerLevel(id:string,level:number,refresh=false):void{
    this.assertAlive();const pass=this.imageLayers.get(id)?.pass;
    if(!pass?.uniforms.uComputerOn||!Number.isFinite(level)||level<0||level>1)throw new Error('Invalid computer control');
    pass.uniforms.uComputerOn.value=level;
    if(refresh)pass.uniforms.uComputerScreen.value.needsUpdate=true;
    this.renderAfterEdit();
  }
  /** For an editor panorama view. Location art and masks themselves stay untouched. */
  setWindowMaskEnabled(enabled: boolean): void {
    this.assertAlive();
    for (const pass of this.passes) {
      const isWorld = !this.options.scene.layers?.some(l => l.id === pass.id && l.scope === 'room')
        && !this.options.scene.lights?.some(l => l.id === pass.id && l.scope === 'room');
      if (isWorld) pass.uniforms.uClip.value = enabled ? 1 : 0;
    }
    this.renderAfterEdit();
  }
  triggerLightning(): boolean {
    this.assertAlive();
    if (!this.parameters.weather.stormEnabled || this.flashAge < 1) return false;
    this.flashAge = 0; this.options.onLightning?.(); this.renderAfterEdit(); return true;
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
    if (this.parameters.life.windowDrops && this.options.scene.windowMask) this.drops.update(deltaSeconds,this.parameters.weather.rain);
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
      if (pass.uniforms.uTime) pass.uniforms.uTime.value = this.time;
      if (pass.uniforms.uCityLights) pass.uniforms.uCityLights.value = p.lighting.cityLightsIntensity;
      if (pass.uniforms.uBeacons) pass.uniforms.uBeacons.value = p.life.beacons ? 1 : 0;
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
    for(const pass of this.trafficLayers.values()) {
      pass.mesh.visible=pass.userVisible && p.life.traffic>0;
      if(pass.mesh.visible){
        const native=pass.uniforms.uNative.value;
        const vehicles=pass.uniforms.uDetailedTraffic.value>0
          ? sampleCloseTraffic(native.x,native.y,this.time,p.life.traffic,p.seed)
          : sampleTraffic(native.x,native.y,pass.uniforms.uTrafficRank.value,this.time,p.life.traffic,p.seed);
        pass.uniforms.uVehicleCount.value=vehicles.length;
        vehicles.forEach((v,i)=>{
          pass.uniforms.uVehicles.value[i].set(v.x,v.y,v.dx,v.dy);
          pass.uniforms.uVehicleStyles.value[i].set(v.kind,v.variant,v.tint,0);
        });
      }
    }
    const drops=p.life.windowDrops && this.options.scene.windowMask ? this.drops.drops : [];
    this.outputMaterial.uniforms.uDropCount.value=drops.length;
    drops.forEach((d,i)=>this.outputMaterial.uniforms.uDrops.value[i].set(d.x,this.height-d.y,Math.sqrt(d.mass),d.speed));
    for (const [id, pass] of this.atmosphereLayers) {
      const layer = p.weather.layers[id];
      pass.mesh.visible = pass.userVisible && (layer.hazeDensity > 0 || (layer.fogDensity > 0 && layer.fogAmount > 0));
      pass.uniforms.uAtmosphere.value.set(layer.hazeDensity, layer.fogDensity, Math.max(0.0001, layer.fogAmount), layer.billowing);
      pass.uniforms.uAtmosphereColor.value = colors.bottom.map((c, i) => c * 0.4 + colors.cloud[i] * 0.6);
      pass.uniforms.uDrift.value.set(this.time * 2, 0);
    }
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
      const dt = frameDeltaSeconds(now, this.previousTime); this.previousTime = now;
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
