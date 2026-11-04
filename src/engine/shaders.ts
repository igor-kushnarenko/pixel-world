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
export const cloudFragment = common + /* glsl */`
uniform vec2 uOffset;
uniform float uCoverage, uDensity, uScale, uHeight, uThickness, uCloudSteps, uStorm;
uniform vec3 uCloudColor;
void main() {
  vec2 pixel=floor(vUv*uResolution);
  // Only integer translations reach the noise. No subpixel interpolation in time.
  vec2 p=(pixel+floor(uOffset+0.5))*vec2(0.018,0.038)*uScale;
  float n=fbm(p);
  float screenY=1.0-vUv.y;
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
uniform float uHasCityMask, uCityLights, uTime;
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
export const outputFragment = /* glsl */`
varying vec2 vUv;
uniform sampler2D uFrame;
void main(){ gl_FragColor=texture2D(uFrame,vUv); }
`;
