/** Independent exterior sound bus. Radio and room switches never pass through it. */
export class CitySound {
  private filter:BiquadFilterNode; private gain:GainNode;
  private sources=new Set<AudioScheduledSourceNode>();private nodes:AudioNode[]=[];
  private timer:number;private enabled=false;private volume=0;private nextCar=0;private nextPolice=0;private disposed=false;
  private noise:AudioBuffer;
  constructor(private ctx:AudioContext, destination:AudioNode){
    this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=10000;
    this.gain=ctx.createGain();this.gain.gain.value=0;this.filter.connect(this.gain).connect(destination);
    this.noise=ctx.createBuffer(1,ctx.sampleRate*6,ctx.sampleRate);const data=this.noise.getChannelData(0);let last=0;
    for(let i=0;i<data.length;i++){last=(last+0.025*(Math.random()*2-1))/1.025;data[i]=last*4;}
    const bed=ctx.createBufferSource();bed.buffer=this.noise;bed.loop=true;
    const band=ctx.createBiquadFilter();band.type='bandpass';band.frequency.value=230;band.Q.value=0.4;
    const pulse=ctx.createGain();pulse.gain.value=0.11;
    const lfo=ctx.createOscillator();lfo.frequency.value=0.035;const depth=ctx.createGain();depth.gain.value=0.025;
    lfo.connect(depth).connect(pulse.gain);bed.connect(band).connect(pulse).connect(this.filter);
    this.nodes.push(band,pulse,depth);this.sources.add(bed);this.sources.add(lfo);bed.start();lfo.start();
    this.nextCar=ctx.currentTime+2;this.nextPolice=ctx.currentTime+55+Math.random()*70;
    this.timer=window.setInterval(()=>this.schedule(),1000);
  }
  set(enabled:boolean,volume:number,closed:number){
    this.enabled=enabled;this.volume=volume;const t=this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(enabled?volume*(1-closed*0.85):0,t,0.2);
    this.filter.frequency.setTargetAtTime(450+Math.pow(1-closed,2)*9550,t,0.2);
  }
  private schedule(){
    if(this.disposed||this.ctx.state!=='running'||!this.enabled||this.volume===0)return;
    const t=this.ctx.currentTime;
    if(t>=this.nextCar){this.flyby();this.nextCar=t+3+Math.random()*7;}
    if(t>=this.nextPolice){this.police();this.nextPolice=t+65+Math.random()*100;}
  }
  private event(duration:number){
    const t=this.ctx.currentTime, envelope=this.ctx.createGain(), pan=this.ctx.createStereoPanner();
    const direction=Math.random()<0.5?1:-1;
    pan.pan.setValueAtTime(-0.85*direction,t);pan.pan.linearRampToValueAtTime(0.85*direction,t+duration);
    envelope.gain.setValueAtTime(0,t);envelope.gain.linearRampToValueAtTime(1,t+duration*0.35);envelope.gain.linearRampToValueAtTime(0,t+duration);
    envelope.connect(pan).connect(this.filter);
    return {t,envelope,nodes:[envelope,pan] as AudioNode[]};
  }
  private track(source:AudioScheduledSourceNode,nodes:AudioNode[],end:number){
    this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();for(const n of nodes)n.disconnect();};source.start();source.stop(end);
  }
  flyby(){
    const duration=3+Math.random()*3,e=this.event(duration);
    const motor=this.ctx.createOscillator();motor.type='triangle';motor.frequency.setValueAtTime(240+Math.random()*160,e.t);motor.frequency.exponentialRampToValueAtTime(95,e.t+duration);
    const motorGain=this.ctx.createGain();motorGain.gain.value=0.016;motor.connect(motorGain).connect(e.envelope);
    const air=this.ctx.createBufferSource();air.buffer=this.noise;const airFilter=this.ctx.createBiquadFilter();airFilter.type='bandpass';airFilter.frequency.value=1100;const airGain=this.ctx.createGain();airGain.gain.value=0.07;
    air.connect(airFilter).connect(airGain).connect(e.envelope);
    this.track(air,[airFilter,airGain],e.t+duration);this.track(motor,[motorGain,...e.nodes],e.t+duration+0.01);
  }
  police(){
    const duration=7,e=this.event(duration),o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='sine';g.gain.value=0.012;
    for(let i=0;i<15;i++)o.frequency.linearRampToValueAtTime(i%2?780:510,e.t+i*0.46);
    o.connect(g).connect(e.envelope);this.track(o,[g,...e.nodes],e.t+duration);
  }
  dispose(){this.disposed=true;clearInterval(this.timer);for(const s of this.sources){try{s.stop();}catch{}s.disconnect();}this.sources.clear();for(const n of this.nodes)n.disconnect();this.filter.disconnect();this.gain.disconnect();}
}
