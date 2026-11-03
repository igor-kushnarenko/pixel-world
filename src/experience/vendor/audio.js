import { rainParams } from './settings.js';
// Процедурный звук: шум дождя (две полосы) + редкие капли и тихий городской гул. Уровни низкие.
export class Ambience {
  constructor() { this.ctx = null; this.vol = 0.4; this.rain = 0; this.sources = []; }
  start() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value=0; const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -12; lim.ratio.value = 8;
    this.master.connect(lim).connect(ctx.destination);
    const noise = (this.noise = this.buf((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }));
    const brown = this.buf((d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    const src = (b) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); this.sources.push(s); return s; };
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 5000;
    this.hi = ctx.createGain(); this.hi.gain.value = 0; src(noise).connect(hp).connect(this.lp).connect(this.hi).connect(this.master);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    this.lo = ctx.createGain(); this.lo.gain.value = 0; src(brown).connect(bp).connect(this.lo).connect(this.master);
    const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 140;
    this.hum = ctx.createGain(); this.hum.gain.value = 0.012; src(brown).connect(hlp).connect(this.hum).connect(this.master);
    // радио-помехи (как в rainroom/campfire)
    this.radioOut = ctx.createGain(); this.radioOut.gain.value = 0; this.radioOut.connect(this.master);
    const st = src(noise); const shp = ctx.createBiquadFilter(); shp.type = 'highpass'; shp.frequency.value = 300;
    this.radioBp = ctx.createBiquadFilter(); this.radioBp.type = 'bandpass'; this.radioBp.frequency.value = 1800; this.radioBp.Q.value = 0.5;
    this.radioHiss = ctx.createGain(); this.radioHiss.gain.value = 0.04; st.connect(shp).connect(this.radioBp).connect(this.radioHiss).connect(this.radioOut);
    this.nextRadioPop = ctx.currentTime;
    this.apply(); this.next = ctx.currentTime; this.timer = setInterval(() => this.schedule(), 100);
  }
  click() { if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025); s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 3, 0.03); }
  buf(fill) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 4, this.ctx.sampleRate); fill(b.getChannelData(0)); return b; }
  set(vol, rain) { if(this.vol === vol && this.rain === rain) return; this.vol = vol; this.rain = rain; this.apply(); }
  async dispose() { clearInterval(this.timer); for(const s of this.sources) { try { s.stop(); } catch {} } this.sources=[]; if(this.ctx && this.ctx.state !== 'closed') await this.ctx.close(); }
  thunder() {
    if(!this.ctx || this.ctx.state!=='running') return;
    const c=this.ctx, t=c.currentTime+0.4, s=c.createBufferSource(); s.buffer=this.noise;
    const low=c.createBiquadFilter(); low.type='lowpass'; low.frequency.value=145;
    const gain=c.createGain(); gain.gain.setValueAtTime(0.0001,t); gain.gain.exponentialRampToValueAtTime(0.19,t+0.18); gain.gain.exponentialRampToValueAtTime(0.0001,t+2.6);
    s.connect(low).connect(gain).connect(this.master); s.start(t,0,2.8);
  }
  apply() {
    if (!this.ctx) return; const t = this.ctx.currentTime, R = rainParams(this.rain);
    this.master.gain.setTargetAtTime(this.vol * 1.2, t, 0.15);
    this.hi.gain.setTargetAtTime(R.soundGain, t, 1); this.lo.gain.setTargetAtTime(R.soundGain * 0.6, t, 1); this.lp.frequency.setTargetAtTime(R.soundCutoff, t, 1);
  }
  setRadio(on, vol = this.radioVol ?? 0.5) { this.radioOn = !!on; this.radioVol = vol; this.applyRadio(); }
  setRadioNoise(x) { if (Math.abs((this.radioNoise ?? 1) - x) < 0.004) return; this.radioNoise = x; this.applyRadio(); }
  applyRadio() { if (!this.ctx) return; this.radioOut.gain.setTargetAtTime(this.radioOn ? 1.2 * (this.radioVol ?? 0.5) * (this.radioNoise ?? 1) : 0, this.ctx.currentTime, this.radioOn ? 0.25 : 0.08); }
  radioSweep(dir = 1) {
    if (!this.ctx || !this.radioOn) return; const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain(); const f0 = 900 + Math.random() * 1500;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(200, f0 * (dir > 0 ? 2.2 : 0.4)), t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02 * (this.radioVol ?? 0.5), t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.radioOut); o.start(t); o.stop(t + 0.6);
  }
  tickRadio(t) {
    if (!this.radioOn) return; const ctx = this.ctx;
    this.radioBp.frequency.setTargetAtTime(1300 + 1100 * Math.sin(t * 0.21) * Math.sin(t * 0.07 + 1), t, 0.6);
    this.radioHiss.gain.setTargetAtTime(0.03 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.33 + Math.sin(t * 0.9))), t, 0.4);
    if (t >= this.nextRadioPop) {
      this.nextRadioPop = t + 0.05 + Math.random() * Math.random() * 1.2;
      const s = ctx.createBufferSource(); s.buffer = this.noise; const g = ctx.createGain(), d = 0.004 + Math.random() * 0.02;
      g.gain.setValueAtTime(0.02 + Math.random() * 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(g).connect(this.radioOut); s.start(t, Math.random() * 3, d + 0.01);
    }
  }
  schedule() {
    const ctx = this.ctx, t = ctx.currentTime; this.tickRadio(t); if (this.rain < 0.02) { this.next = t; return; }
    while (this.next < t + 0.2) {
      const s = ctx.createBufferSource(); s.buffer = this.noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 3000; f.Q.value = 5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.015 + Math.random() * 0.03, this.next); g.gain.exponentialRampToValueAtTime(0.0001, this.next + 0.025);
      s.connect(f).connect(g).connect(this.master); s.start(Math.max(this.next, t), Math.random() * 3, 0.03);
      this.next += -Math.log(1 - Math.random()) * (0.4 - 0.34 * this.rain);
    }
  }
}
