export const vertex = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const common = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform sampler2D uWindow;
uniform float uClip;
uniform float uSteps;
uniform float uFlash;
uniform float uSeed;
float windowAt(vec2 uv) { vec4 m = texture2D(uWindow, uv); return mix(1.0, m.r * m.a, uClip); }
float quant(float x, float levels) { return floor(x * levels + 0.0001) / levels; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + uSeed * 0.713) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p) {
  float n=0.0, a=0.54;
  for(int i=0;i<4;i++){ n+=a*noise(p); p=p*2.03+vec2(13.1,7.7); a*=0.47; }
  return n;
}
`;
export const skyFragment = common + /* glsl */`
uniform vec3 uTop, uBottom;
uniform float uGlow, uStars, uNight, uDither;
void main() {
  vec2 p=floor(vUv*uResolution);
  float d = (mod(p.x,2.0)*2.0+mod(p.y,2.0)-1.5)/4.0;
  float h=quant(pow(1.0-vUv.y,0.8)+d*uDither/uSteps,uSteps);
  vec3 c=mix(uTop,uBottom,h);
  float glow=quant(pow(1.0-vUv.y,3.0),8.0)*uGlow;
  c+=glow*vec3(0.21,0.14,0.29);
  float stars=step(0.9985,hash(p))*step(0.35,vUv.y)*uStars*uNight;
  c+=stars*vec3(0.38,0.43,0.55);
  c+=uFlash*vec3(0.32,0.38,0.48);
  gl_FragColor=vec4(c,windowAt(vUv));
}
`;
const stableNoise = /* glsl */`
// Integer lattice hash avoids sin()/large-float rounding at threshold edges.
// Keep this independent of the star/rain hashes and of animation time.
float cloudHash(ivec2 p) {
  uint h=uint(p.x)*1597334677u ^ uint(p.y)*3812015801u ^ uint(uSeed)*2798796415u;
  h=(h^(h>>16u))*2246822519u;
  h=(h^(h>>13u))*3266489917u;
  h=h^(h>>16u);
  return float(h>>8u)*(1.0/16777216.0);
}
float cloudNoise(vec2 p) {
  ivec2 i=ivec2(floor(p));
  vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(cloudHash(i),cloudHash(i+ivec2(1,0)),f.x),
    mix(cloudHash(i+ivec2(0,1)),cloudHash(i+ivec2(1,1)),f.x),f.y);
}
float cloudField(vec2 p) {
  float n=0.0, a=0.54;
  for(int i=0;i<4;i++){ n+=a*cloudNoise(p); p=p*2.03+vec2(13.1,7.7); a*=0.47; }
  return n;
}
`;
export const cloudFragment = common + stableNoise + /* glsl */`
uniform vec2 uOffset;
uniform float uCoverage, uDensity, uScale, uHeight, uThickness, uCloudSteps, uStorm;
uniform vec3 uCloudColor;
void main() {
  vec2 pixel=floor(gl_FragCoord.xy);
  // Only integer translations reach the noise. No subpixel interpolation in time.
  vec2 p=(pixel+floor(uOffset+0.5))*vec2(0.018,0.038)*uScale;
  float n=cloudField(p);
  float screenY=1.0-(pixel.y+0.5)/uResolution.y;
  float band=1.0-smoothstep(uThickness*0.25,max(0.001,uThickness),abs(screenY-uHeight));
  float shape=n*band;
  float threshold=mix(1.0,0.18,uCoverage);
  float inside=step(threshold,shape);
  float tone=quant(clamp((shape-threshold)*3.5,0.0,1.0),uCloudSteps);
  vec3 c=uCloudColor*(0.6+tone*0.65)*(1.0-uStorm*0.22)+uFlash*vec3(0.38,0.42,0.52);
  float alpha=inside*quant(uDensity,uCloudSteps);
  gl_FragColor=vec4(c,alpha*windowAt(vUv));
}
`;
export const imageFragment = common + /* glsl */`
uniform sampler2D uImage;
uniform vec2 uOrigin, uSize;
uniform float uOpacity, uReceivesFlash;
uniform sampler2D uCityMask;
uniform float uHasCityMask, uCityLights, uTime, uBeacons;
uniform vec3 uTint;
void main() {
  vec2 pos=vec2(vUv.x,1.0-vUv.y)*uResolution-uOrigin;
  if(pos.x<0.0||pos.y<0.0||pos.x>=uSize.x||pos.y>=uSize.y) discard;
  vec2 texUV=vec2(pos.x/uSize.x,1.0-pos.y/uSize.y);
  vec4 c=texture2D(uImage,texUV);
  vec3 col=c.rgb*uTint;
  if(uHasCityMask>0.5){
    vec3 m=texture2D(uCityMask,texUV).rgb;
    // Reuse only prepared masks. Whole windows share the mask's cluster ID.
    float phase=floor(m.g*255.0+0.5);
    if(m.r>0.5){
      float pulse=0.985+0.015*sin(uTime*0.14+phase);
      col=mix(col*0.3,c.rgb*1.28,uCityLights)*pulse+vec3(0.045,0.028,0.0)*uCityLights;
    }
    if(m.b>0.5) col=mix(col*0.4,c.rgb*1.25,uCityLights)*(0.97+0.03*sin(uTime*0.7+phase));
  }
  if(uBeacons>0.5 && c.r>0.55 && c.r>c.g*2.5 && c.r>c.b*2.5){
    float cluster=hash(floor(pos/16.0));
    float phase=fract(uTime/(2.0+cluster*3.0)+cluster);
    float pulse=smoothstep(0.0,0.08,phase)*(1.0-smoothstep(0.16,0.3,phase));
    col=mix(c.rgb*0.14,c.rgb*1.3,pulse);
  }
  c.rgb=col;
  c.rgb+=c.rgb*uFlash*uReceivesFlash*1.7;
  gl_FragColor=vec4(c.rgb,c.a*uOpacity*windowAt(vUv));
}
`;
export const roomFragment = common + /* glsl */`
uniform sampler2D uImage, uLeftLight, uRightLight, uEmitters;
uniform vec2 uOrigin, uSize, uRadioLed;
uniform vec4 uRadioDial;
uniform vec3 uTint, uRoomControls;
uniform float uOpacity, uReceivesFlash;
void main(){
  vec2 p=vec2(vUv.x,1.0-vUv.y)*uResolution-uOrigin;
  if(p.x<0.0||p.y<0.0||p.x>=uSize.x||p.y>=uSize.y) discard;
  vec2 uv=vec2(p.x/uSize.x,1.0-p.y/uSize.y);
  vec4 c=texture2D(uImage,uv); if(c.a<0.01) discard;
  vec3 controls=floor(uRoomControls*24.0+0.5)/24.0;
  vec3 em=texture2D(uEmitters,uv).rgb;
  vec3 col=c.rgb*uTint;
  col+=texture2D(uLeftLight,uv).rgb*controls.x+texture2D(uRightLight,uv).rgb*controls.y;
  col+=vec3(1.0,0.72,0.42)*em.r*controls.x*0.35+vec3(1.0,0.62,0.28)*em.g*controls.y*0.3;
  vec2 pixel=floor(p)+0.5;
  float dial=step(uRadioDial.x,pixel.x)*step(pixel.x,uRadioDial.z)*step(uRadioDial.y,pixel.y)*step(pixel.y,uRadioDial.w);
  float lum=dot(c.rgb,vec3(0.3,0.59,0.11));
  col+=dial*vec3(1.0,0.62,0.25)*(0.1+lum*1.6)*controls.z;
  float led=1.0-step(2.1,length(pixel-uRadioLed));
  col+=vec3(0.25,1.0,0.35)*led*controls.z*0.8;
  col+=c.rgb*uFlash*uReceivesFlash*0.6;
  gl_FragColor=vec4(col,c.a*uOpacity);
}
`;
export const lightFragment = common + /* glsl */`
uniform sampler2D uImage;
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  vec4 mask=texture2D(uImage,vUv);
  float a=mask.r*mask.a*quant(uIntensity,16.0)*windowAt(vUv);
  gl_FragColor=vec4(uColor,a);
}
`;
export const fogFragment = common + /* glsl */`
uniform float uFog;
uniform vec3 uFogColor;
void main() {
  float a=quant(pow(1.0-vUv.y,2.0)*uFog,12.0);
  gl_FragColor=vec4(uFogColor+uFlash*0.3,a*windowAt(vUv));
}
`;
export const layerAtmosphereFragment = common + stableNoise + /* glsl */`
uniform vec4 uAtmosphere;
uniform vec3 uAtmosphereColor;
uniform vec2 uDrift;
void main() {
  vec2 pixel=floor(gl_FragCoord.xy);
  float bottom=1.0-(pixel.y+0.5)/uResolution.y;
  float amount=uAtmosphere.z;
  float rise=smoothstep(1.0-amount,1.0,bottom);
  vec2 p=(pixel+floor(uDrift))*vec2(0.012,0.025);
  float rolls=0.5+0.5*cloudNoise(p);
  float fog=uAtmosphere.y*rise*mix(1.0,rolls,uAtmosphere.w);
  float alpha=quant(1.0-(1.0-uAtmosphere.x)*(1.0-fog),32.0);
  gl_FragColor=vec4(uAtmosphereColor+uFlash*0.3,alpha*windowAt(vUv));
}
`;
export const rainFragment = common + /* glsl */`
uniform float uRain, uTime;
void main() {
  vec2 p=floor(vUv*uResolution);
  float alpha=0.0;
  // Three native-pixel column fields, adapted from nightcity's rain model.
  // No smooth subpixel edges: each streak occupies whole logical pixels.
  for(int i=0;i<3;i++){
    float layer=float(i), cellWidth=4.0+layer*2.0;
    float x=floor(p.x+p.y*(0.09+layer*0.025));
    float column=floor(x/cellWidth), within=mod(x,cellWidth);
    float seed=hash(vec2(column,layer*17.0));
    float speed=(340.0+layer*180.0)*(0.8+seed*0.4);
    float period=250.0+seed*230.0;
    float fall=p.y+floor(uTime*speed)+floor(seed*period*3.0);
    float cycle=floor(fall/period), phase=mod(fall,period);
    float allowed=step(1.0-uRain*(0.7-layer*0.12),hash(vec2(column+layer*97.0,cycle)));
    float len=(7.0+layer*6.0)*(0.6+uRain);
    float position=floor(hash(vec2(column,cycle+layer+2.0))*cellWidth);
    float streak=(1.0-step(0.5,abs(within-position)))*(1.0-step(len,phase));
    alpha+=allowed*streak*(0.12+layer*0.07);
  }
  gl_FragColor=vec4(vec3(0.5,0.61,0.74)+uFlash*0.3,min(0.5,alpha)*windowAt(vUv));
}
`;
export const trafficFragment = common + /* glsl */`
uniform float uVehicleCount,uTrafficRank,uDetailedTraffic;
uniform vec4 uVehicles[60],uVehicleStyles[60];
uniform vec2 uOrigin,uSize,uNative;
void main(){
  vec2 p=floor(gl_FragCoord.xy); p.y=uResolution.y-p.y;
  vec2 local=(p-uOrigin)*uNative/uSize;
  vec3 color=vec3(0.0); float alpha=0.0;
  for(int i=0;i<60;i++){
    if(float(i)>=uVehicleCount) break;
    vec4 v=uVehicles[i],style=uVehicleStyles[i];
    vec2 delta=local-floor(v.xy);
    if(abs(delta.x)>16.0+uDetailedTraffic*24.0 || abs(delta.y)>16.0+uDetailedTraffic*24.0) continue;
    vec2 q=floor(vec2(dot(delta,v.zw),dot(delta,vec2(-v.w,v.z)))/(1.0+uDetailedTraffic*1.5)+0.5);
    vec3 lamp=v.z>0.0?vec3(0.5,0.85,1.0):vec3(1.0,0.36,0.18);
    if(uTrafficRank<1.5){
      float dotPixel=1.0-step(0.75,length(delta));
      color+=lamp*dotPixel*0.8;alpha=max(alpha,dotPixel);continue;
    }
    float kind=style.x,variant=style.y;
    float halfLength=kind<0.5?3.0+variant:kind<1.5?6.0+variant:8.0+variant;
    float body=step(abs(q.x),halfLength)*step(abs(q.y),kind<0.5?1.0:2.0);
    // Three car roofs, three cargo boxes and three bus lengths.
    float roof=step(abs(q.x+(kind<1.5?1.0:0.0)),kind<0.5?1.0+variant:halfLength-2.0)*step(abs(q.y+2.0),0.0);
    if(kind>0.5 && kind<1.5) roof*=1.0-step(halfLength-2.0,q.x);
    float shape=max(body,roof);
    float enginePod=uDetailedTraffic*step(abs(q.y-3.0),0.0)*step(abs(q.x),halfLength-1.0);
    shape=max(shape,enginePod);
    vec3 paint=mix(vec3(0.15,0.31,0.42),vec3(0.45,0.25,0.16),style.z);
    if(kind>1.5) paint=mix(vec3(0.2,0.34,0.4),vec3(0.5,0.38,0.16),style.z);
    float windows=step(1.0,mod(q.x+halfLength,3.0))*step(abs(q.y+1.0),0.0);
    if(kind>1.5) paint=mix(paint,vec3(0.55,0.72,0.68),windows*0.7);
    else if(q.x>halfLength-2.0 && q.y<0.0) paint=vec3(0.32,0.65,0.78);
    if(q.x>halfLength-1.0) paint=lamp;
    if(q.x<-halfLength+1.0) paint=vec3(0.8,0.12,0.07);
    if(enginePod>0.5) paint=mix(vec3(0.08,0.15,0.2),vec3(0.28,0.65,0.9),step(halfLength-3.0,abs(q.x)));
    if(uDetailedTraffic>0.5 && kind>0.5 && kind<1.5 && q.x<halfLength-2.0 && q.y>=0.0) paint*=mix(0.65,1.0,step(0.5,mod(q.x+halfLength,3.0)));
    color+=paint*shape;alpha=max(alpha,shape);
  }
  gl_FragColor=vec4(color,alpha*windowAt(vUv));
}
`;
export const outputFragment = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrame,uGlassMask;
uniform vec2 uGlassResolution;
uniform vec4 uDrops[32];
uniform float uDropCount;
void main(){
  vec4 base=texture2D(uFrame,vUv);
  if(texture2D(uGlassMask,vUv).r<0.5){gl_FragColor=base;return;}
  vec2 pixel=floor(vUv*uGlassResolution)+0.5;
  vec2 shift=vec2(0.0);float rim=0.0;
  for(int i=0;i<32;i++){
    if(float(i)>=uDropCount) break;
    vec4 drop=uDrops[i];
    vec2 delta=pixel-drop.xy;
    vec2 size=vec2(drop.z,drop.z*(1.2+drop.w*0.015));
    vec2 q=delta/size;float dist=dot(q,q);
    if(dist<1.0){ shift=q*drop.z*0.65;rim=(step(0.65,dist)*0.1+step(0.88,dist)*0.06)*step(0.0,q.y);break; }
    // A thin wet wake above each moving droplet.
    if(abs(delta.x)<0.65 && delta.y>0.0 && delta.y<drop.w*0.25) shift=vec2(1.0,0.0);
  }
  vec2 uv=(floor(pixel+shift)+0.5)/uGlassResolution;
  if(texture2D(uGlassMask,uv).r>0.5) base=texture2D(uFrame,uv);
  gl_FragColor=vec4(base.rgb+rim,1.0);
}
`;
