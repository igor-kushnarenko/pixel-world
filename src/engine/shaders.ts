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
void main() {
  vec2 pos=vec2(vUv.x,1.0-vUv.y)*uResolution-uOrigin;
  if(pos.x<0.0||pos.y<0.0||pos.x>=uSize.x||pos.y>=uSize.y) discard;
  vec2 texUV=vec2(pos.x/uSize.x,1.0-pos.y/uSize.y);
  vec4 c=texture2D(uImage,texUV);
  c.rgb+=c.rgb*uFlash*uReceivesFlash*1.7;
  gl_FragColor=vec4(c.rgb,c.a*uOpacity*windowAt(vUv));
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
  float speed=floor(uTime*85.0);
  vec2 cell=vec2(floor((p.x+floor(p.y*0.2))/7.0),floor((p.y+speed)/17.0));
  float drop=step(1.0-uRain*0.35,hash(cell))*step(mod(p.y+speed,17.0),3.0)*step(mod(p.x+floor(p.y*0.2),7.0),0.0);
  gl_FragColor=vec4(vec3(0.36,0.47,0.61)+uFlash*0.3,drop*0.5*windowAt(vUv));
}
`;
export const outputFragment = /* glsl */`
varying vec2 vUv;
uniform sampler2D uFrame;
void main(){ gl_FragColor=texture2D(uFrame,vUv); }
`;
