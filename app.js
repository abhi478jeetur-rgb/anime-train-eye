(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/shaders.ts
  var VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;
  var COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 hash2(vec2 p){ return vec2(hash(p),hash(p+17.13)); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5;} return s; }
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
`;
  var FS_SCENE = COMMON + `
uniform sampler2D tCar,tEye,tChar,tCalm,tShock;
uniform vec2 res;
uniform float time, shot, camS, light, eyeOpen, eyeGlow, dilate, swirl, blink, face, faceS, embers, carGlow;
uniform vec2 focus, shake;

const vec2 SC = vec2(540.0,960.0);
const vec4 CAR = vec4(0.0,-7.5,1080.0,1935.0);      // carriage plate rect (base px)
const vec2 WINC = vec2(521.0,829.0);                 // big window centre
const vec4 EYE = vec4(21.0,329.0,1000.0,1000.0);     // eye plate rect (centred on window)
const vec4 CHR = vec4(267.0,592.0,546.0,1050.0);     // seated character rect

vec2 toBase(vec2 p, float d){ return focus + (p - SC - shake*d)/(1.0+(camS-1.0)*d); }
vec2 rectUV(vec2 b, vec4 r){ return (b-r.xy)/r.zw; }
bool inside(vec2 uv){ return uv.x>=0.0&&uv.y>=0.0&&uv.x<=1.0&&uv.y<=1.0; }
vec4 tex(sampler2D t, vec2 uv, float lod){ return textureLod(t, vec2(uv.x,uv.y), lod); }

// colossal eye: pupil dilation (radial remap), swirl, lids, emissive pulse
vec3 eyeCol(vec2 uv, float lod){
  vec2 c = uv-0.5; float r=length(c); float a=atan(c.y,c.x);
  float R=0.20;
  float sw = swirl*pow(max(0.0,1.0-r/(R*1.8)),2.0);
  a += sw*sin(time*1.3)*0.6 + sw*0.8;
  float rr=r;
  if(r<R){ rr = R*pow(r/R, dilate); }
  vec2 cc = vec2(cos(a),sin(a))*rr;
  // slow heat-haze wobble of the flesh
  cc += 0.006*vec2(fbm(cc*9.0+time*0.6)-0.5, fbm(cc*9.0-time*0.5+3.0)-0.5);
  vec3 col = textureLod(tEye, cc+0.5, lod).rgb;
  // flowing fire in veins
  float n = fbm(cc*7.0 + vec2(0.0,-time*0.8));
  float hot = smoothstep(0.45,0.9,lum(col));
  col *= 1.0 + eyeGlow*(0.3*sin(time*4.0+n*8.0)*hot + 0.35*hot);
  // eyelids: almond aperture
  float ax = clamp(c.x/0.40,-1.0,1.0);
  float h = eyeOpen*0.24*(1.0-ax*ax);
  float inA = smoothstep(h+0.012, h-0.004, abs(c.y));
  vec3 lid = textureLod(tEye, vec2(uv.x, 0.5+ (uv.y-0.5)*0.35 + 0.33*sign(c.y)), lod+1.0).rgb*0.28;
  lid *= 0.8+0.4*fbm(uv*14.0+time*0.2);
  float slit = (1.0-step(0.6,eyeOpen))*exp(-abs(c.y)/0.006)*(1.0-ax*ax)*eyeGlow*smoothstep(0.0,0.01,eyeOpen);
  vec3 outc = mix(lid, col*(0.7+0.3*eyeGlow), inA);
  outc += vec3(1.0,0.55,0.2)*slit*1.5;
  // lid rim line
  outc *= 1.0-0.6*smoothstep(0.014,0.0,abs(abs(c.y)-h))*step(0.02,eyeOpen);
  return outc;
}

vec4 charSample(vec2 uv, sampler2D t){ return inside(uv)? textureLod(t,uv,0.0) : vec4(0.0); }

vec3 blinkLid(vec3 col, vec2 uv, vec2 ec, vec2 er, float b, vec3 skin){
  if(b<=0.01) return col;
  vec2 d=(uv-ec)/er;
  float m = pow(d.x/1.18,2.0)+pow(d.y/1.45,2.0);
  if(m>1.2) return col;
  float inEl = smoothstep(1.0,0.82,m);
  float lidY = -1.45 + 2.6*b + 0.45*(1.0-d.x*d.x)*b*0.5;
  float cover = smoothstep(lidY+0.08, lidY-0.08, d.y)*inEl;
  cover *= 1.0 - step(0.6,m)*smoothstep(0.26,0.16,lum(col)); // keep hair strands crossing the rim
  vec3 lidc = skin*mix(0.97,0.82,smoothstep(lidY-0.9,lidY,d.y));
  col = mix(col, lidc, cover);
  float line = smoothstep(0.24,0.06,abs(d.y-lidY))*smoothstep(1.15,0.75,abs(d.x))*smoothstep(0.35,0.6,b);
  return mix(col, vec3(0.08,0.06,0.1), line);
}

vec3 grade(vec3 c, float glowRim){ // red emergency light on neutral-lit cel art
  vec3 t = c*vec3(1.05,0.36,0.30)*1.25;
  return mix(t, c, 0.10)*light;
}

void main(){
  vec2 p = vec2(vUv.x*res.x, (1.0-vUv.y)*res.y);   // screen px, y down
  vec3 col = vec3(0.0);
  float tt=time;
  if(shot<0.5 || shot>1.5){
    // ---- multiplane: eye plate (far), carriage (mid), character (near)
    float dEye = shot<0.5 ? 0.4 : 0.85;
    vec2 be = toBase(p, dEye);
    vec3 ec = eyeCol(rectUV(be,EYE), 0.0);
    vec2 bc = toBase(p, 1.0);
    vec2 cu = rectUV(bc,CAR);
    vec4 car = tex(tCar, cu, 0.0);
    float dw = length((bc-WINC)/vec2(1.0,1.15));
    float spill = exp(-dw/520.0);
    vec3 carc = car.rgb*(light*0.85 + carGlow*spill*1.1) + vec3(0.25,0.05,0.02)*carGlow*spill*car.rgb*2.0;
    col = mix(ec, carc, car.a);
    if(shot<0.5){
      vec2 bh = toBase(p, 1.2);
      // contact shadows
      float sh = exp(-pow(length((bh-vec2(540.0,1268.0))/vec2(250.0,34.0)),2.0))*0.55
               + exp(-pow(length((bh-vec2(540.0,1640.0))/vec2(230.0,28.0)),2.0))*0.6;
      col *= 1.0-sh;
      vec2 uv = rectUV(bh,CHR);
      // puppet-style sine warp: hair, scarf, breathing
      float faceM = smoothstep(0.11,0.07,abs(uv.x-0.59))*smoothstep(0.28,0.24,uv.y)*smoothstep(0.08,0.12,uv.y);
      float hairW = smoothstep(0.26,0.02,uv.y)*(1.0-faceM);
      vec2 wuv = uv;
      wuv.x += hairW*0.0065*sin(tt*2.4+uv.y*26.0) + hairW*0.003*sin(tt*5.1+uv.x*14.0);
      float scarf = smoothstep(0.50,0.54,uv.x)*smoothstep(0.68,0.64,uv.x)*smoothstep(0.30,0.50,uv.y)*smoothstep(0.53,0.50,uv.y);
      wuv.x += scarf*0.009*sin(tt*1.9+uv.y*14.0);
      wuv.y -= 0.0035*sin(tt*1.7)*smoothstep(0.62,0.15,uv.y);
      vec4 ch = charSample(wuv, tChar);
      if(ch.a>0.002){
        vec3 skin = textureLod(tChar, vec2(0.592,0.213),0.0).rgb;
        vec3 cc = ch.rgb;
        cc = blinkLid(cc, wuv, vec2(0.531,0.200), vec2(0.036,0.0133), blink, skin);
        cc = blinkLid(cc, wuv, vec2(0.651,0.200), vec2(0.034,0.0133), blink, skin);
        // gradient lighting: darker toward the floor
        cc *= mix(1.05,0.62,smoothstep(0.35,1.0,uv.y));
        cc = grade(cc, eyeGlow);
        // rim light from the window behind (upward edge)
        float aUp = charSample(wuv+vec2(0.0,-7.0/1050.0), tChar).a;
        float aL = charSample(wuv+vec2(-6.0/546.0,-3.0/1050.0), tChar).a;
        float aR = charSample(wuv+vec2(6.0/546.0,-3.0/1050.0), tChar).a;
        float rim = ch.a*clamp((1.0-aUp)+0.6*(1.0-aL)+0.6*(1.0-aR),0.0,1.0);
        float hi = smoothstep(0.75,0.15,uv.y);
        cc += vec3(1.0,0.42,0.18)*rim*(0.45+0.6*eyeGlow)*hi;
        // light wrap: background bleeds over the silhouette edge
        float ab=0.0;
        for(int i=0;i<8;i++){ float an=6.2831*float(i)/8.0; ab+=charSample(wuv+vec2(cos(an)/546.0,sin(an)/1050.0)*14.0, tChar).a; }
        ab/=8.0;
        float wrap = ch.a*(1.0-ab)*1.6;
        cc += col*wrap*0.9;
        col = mix(col, cc, ch.a);
      }
    }
  } else {
    // ---- close-up: defocused background (mip blur) + face plate in screen space
    vec2 be = toBase(p, 0.7);
    vec3 ec = eyeCol(rectUV(be,EYE), 3.0);
    vec2 bc = toBase(p, 1.0);
    vec4 car = tex(tCar, rectUV(bc,CAR), 3.5);
    float spill = exp(-length(bc-WINC)/500.0);
    vec3 carc = car.rgb*(light*0.8 + carGlow*spill*1.2);
    col = mix(ec*0.9, carc, smoothstep(0.2,0.9,car.a));
    // face plate: height fills lower ~70% of frame
    float H = 1290.0*faceS;
    float W = face<0.5 ? H*675.0/768.0 : H*716.0/768.0;
    vec2 fo = vec2(540.0 - W*0.5, 1920.0 + 30.0*faceS - H) + shake*1.15;
    vec2 uv = (p - fo)/vec2(W,H);
    float faceM = smoothstep(0.16,0.10,abs(uv.x-0.5))*smoothstep(0.75,0.68,uv.y)*smoothstep(0.30,0.38,uv.y);
    float hairW = smoothstep(0.55,0.05,uv.y)*(1.0-faceM);
    vec2 wuv = uv;
    wuv.x += hairW*(0.004*sin(tt*2.2+uv.y*18.0) + 0.002*sin(tt*4.7+uv.x*11.0));
    wuv.y -= 0.003*sin(tt*1.6);
    vec4 ch = face<0.5 ? charSample(wuv,tCalm) : charSample(wuv,tShock);
    if(ch.a>0.002){
      vec3 cc = ch.rgb;
      if(face<0.5){
        vec3 skin = textureLod(tCalm, vec2(0.444,0.573),0.0).rgb;
        cc = blinkLid(cc, wuv, vec2(0.387,0.483), vec2(0.059,0.035), blink, skin);
        cc = blinkLid(cc, wuv, vec2(0.603,0.482), vec2(0.059,0.036), blink, skin);
      }
      cc *= mix(1.08,0.55,smoothstep(0.45,1.0,uv.y));
      cc = grade(cc, eyeGlow);
      float aUp = (face<0.5?charSample(wuv+vec2(0.0,-8.0/H),tCalm):charSample(wuv+vec2(0.0,-8.0/H),tShock)).a;
      float aS = (face<0.5?charSample(wuv+vec2(-8.0/W,-2.0/H),tCalm):charSample(wuv+vec2(-8.0/W,-2.0/H),tShock)).a;
      float aS2 = (face<0.5?charSample(wuv+vec2(8.0/W,-2.0/H),tCalm):charSample(wuv+vec2(8.0/W,-2.0/H),tShock)).a;
      float rim = ch.a*clamp((1.0-aUp)+0.7*(1.0-aS)+0.7*(1.0-aS2),0.0,1.0);
      cc += vec3(1.0,0.45,0.2)*rim*(0.5+0.7*eyeGlow);
      // eye-glow key light flickering on the face (gradient from top)
      cc += vec3(0.35,0.06,0.02)*eyeGlow*smoothstep(0.7,0.0,uv.y)*(0.6+0.4*sin(tt*7.0));
      float ab=0.0;
      for(int i=0;i<8;i++){ float an=6.2831*float(i)/8.0; ab+=(face<0.5?charSample(wuv+vec2(cos(an)/W,sin(an)/H)*18.0,tCalm):charSample(wuv+vec2(cos(an)/W,sin(an)/H)*18.0,tShock)).a; }
      ab/=8.0;
      cc += col*ch.a*(1.0-ab)*1.4;
      col = mix(col, cc, ch.a);
    }
  }
  // embers (cell particles drifting up)
  if(embers>0.0){
    for(int L=0;L<2;L++){
      float sz = L==0?70.0:38.0;
      vec2 g = p/sz + vec2(sin(p.y*0.004+tt)*0.3, tt*(L==0?2.2:3.4));
      vec2 id=floor(g), f=fract(g);
      vec2 pos = 0.2+0.6*hash2(id);
      float on = step(0.78,hash(id+3.1));
      float d = length(f-pos);
      float tw = 0.6+0.4*sin(tt*9.0+hash(id)*20.0);
      col += vec3(1.0,0.5,0.15)*on*tw*embers*(smoothstep(0.09,0.0,d)*1.2+smoothstep(0.3,0.0,d)*0.15);
    }
  }
  o = vec4(col,1.0);
}`;
  var FS_BRIGHT = COMMON + `
uniform sampler2D tSrc; uniform vec2 texel; uniform float thr;
void main(){
  vec3 c = vec3(0.0);
  c += texture(tSrc, vUv+texel*vec2(-1,-1)).rgb; c += texture(tSrc, vUv+texel*vec2(1,-1)).rgb;
  c += texture(tSrc, vUv+texel*vec2(-1,1)).rgb;  c += texture(tSrc, vUv+texel*vec2(1,1)).rgb;
  c*=0.25;
  float l = lum(c);
  o = vec4(c*smoothstep(thr, thr+0.3, l),1.0);
}`;
  var FS_BLUR = COMMON + `
uniform sampler2D tSrc; uniform vec2 dir;
void main(){
  float w[5] = float[](0.227,0.1945,0.1216,0.054,0.0162);
  vec3 c = texture(tSrc,vUv).rgb*w[0];
  for(int i=1;i<5;i++){ c += texture(tSrc,vUv+dir*float(i)).rgb*w[i]; c += texture(tSrc,vUv-dir*float(i)).rgb*w[i]; }
  o = vec4(c,1.0);
}`;
  var FS_FINAL = COMMON + `
uniform sampler2D tScene, tB1, tB2; uniform vec2 res;
uniform float time, frame, ca, bloomK, flash, impact, speed, gloom, fade;
uniform vec3 flashCol;
void main(){
  vec2 uv=vUv; vec2 d=uv-0.5;
  vec3 col;
  col.r = texture(tScene, uv - d*ca).r;
  col.g = texture(tScene, uv).g;
  col.b = texture(tScene, uv + d*ca).b;
  vec3 bl = texture(tB1,uv).rgb*0.9 + texture(tB2,uv).rgb*1.3;
  col += bl*bloomK*vec3(1.0,0.75,0.6);
  // vignette
  float v = length(d*vec2(1.0,0.75))*1.45;
  col *= 1.0-0.55*pow(clamp(v,0.0,1.2),2.4);
  // anime 'tate-sen' gloom lines from the top
  if(gloom>0.0){
    float x = floor(uv.x*120.0);
    float on = step(0.55,hash(vec2(x,3.0)));
    float len = 0.25+0.35*hash(vec2(x,7.0));
    float ln = on*smoothstep(1.0-len,1.0,uv.y);
    col = mix(col, col*0.25, ln*gloom*0.75);
  }
  // radial speed lines
  if(speed>0.0){
    float an = atan(d.y,d.x);
    float k = floor(an*110.0 + floor(frame*0.5)*3.7);
    float on = step(0.82,hash(vec2(k,1.0)));
    float r = length(d*vec2(1.0,1.6));
    col = mix(col, vec3(1.0), on*smoothstep(0.25,0.75,r)*speed);
  }
  // impact frames: two-tone inverted / white-hot
  if(impact>0.5){
    float l = lum(col);
    if(impact<1.5) col = l>0.32 ? vec3(0.02,0.0,0.0) : vec3(1.0,0.12,0.08);
    else col = l>0.25 ? vec3(1.0,0.97,0.9) : vec3(0.05,0.0,0.0);
  }
  col = mix(col, flashCol, flash);
  // film grain
  float g = hash(uv*res + vec2(frame*13.17, frame*7.31)) - 0.5;
  col += g*0.07;
  col *= 1.0-fade;
  o = vec4(clamp(col,0.0,1.0),1.0);
}`;

  // src/timeline.ts
  var FPS = 30;
  var DURATION = 420;
  var clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  var lerp = (a, b, t) => a + (b - a) * t;
  var ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  var easeOut = (t) => 1 - Math.pow(1 - t, 3);
  var seg = (f, a, b) => clamp((f - a) / (b - a));
  var h = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  var wig = (t, freq, seed) => {
    const x = t * freq;
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return lerp(h(i + seed * 101) * 2 - 1, h(i + 1 + seed * 101) * 2 - 1, s);
  };
  var blinkCurve = (f, start) => {
    const k = f - start;
    return [0, 0.55, 1, 1, 0.5, 0][k] ?? 0;
  };
  function uniformsAt(f) {
    const t = f / FPS;
    const u = {
      shot: 0,
      camS: 1,
      focus: [540, 960],
      shake: [0, 0],
      light: 1,
      eyeOpen: 0,
      eyeGlow: 0.3,
      dilate: 1,
      swirl: 0,
      blink: 0,
      face: 0,
      faceS: 1,
      embers: 0,
      carGlow: 0.15,
      ca: 15e-4,
      bloomK: 0.9,
      flash: 0,
      flashCol: [1, 1, 1],
      impact: 0,
      speed: 0,
      gloom: 0,
      fade: 0
    };
    let shakeAmp = 0;
    if (f < 180) {
      u.shot = 0;
      u.camS = lerp(1, 1.14, ease(seg(f, 0, 180)));
      u.focus = [540, lerp(960, 900, ease(seg(f, 0, 180)))];
      u.blink = Math.max(blinkCurve(f, 30), blinkCurve(f, 162));
      const flickFrames = [58, 59, 63, 67, 68, 69, 76, 82, 83, 91];
      u.light = f >= 56 && f < 96 ? flickFrames.includes(f) ? 0.22 : 0.8 + 0.2 * h(f) : f >= 96 ? 0.82 : 1;
      u.eyeOpen = f < 72 ? 0 : f < 100 ? 0.03 * (0.5 + 0.5 * h(f)) : (() => {
        const k = seg(f, 100, 150);
        return easeOut(k) * (1 + 0.08 * Math.sin(k * Math.PI));
      })();
      u.eyeGlow = lerp(0.35, 1.05, seg(f, 72, 160));
      u.carGlow = lerp(0.15, 0.9, seg(f, 100, 165));
      shakeAmp = f > 100 ? lerp(1.5, 5, seg(f, 100, 180)) : 0.8;
      u.ca = lerp(15e-4, 3e-3, seg(f, 100, 180));
    } else if (f < 270) {
      u.shot = 1;
      u.camS = 1.7;
      u.focus = [521 + 10 * Math.sin(t * 0.7), 760];
      u.eyeOpen = 1;
      u.eyeGlow = 1 + 0.15 * Math.sin(t * 5);
      u.carGlow = 0.9;
      u.light = 0.8;
      if (f < 210) {
        u.face = 0;
        u.faceS = lerp(1, 1.03, seg(f, 180, 210));
        u.blink = blinkCurve(f, 193);
        shakeAmp = 2.5;
      } else {
        u.face = 1;
        u.faceS = f < 216 ? lerp(1.13, 1.08, easeOut(seg(f, 210, 216))) : lerp(1.08, 1.12, seg(f, 216, 270));
        u.flash = f === 210 ? 0.75 : f === 211 ? 0.35 : 0;
        u.ca = f < 215 ? 8e-3 : 3e-3;
        shakeAmp = f < 216 ? 9 : 4.5;
        u.gloom = clamp(seg(f, 214, 232));
      }
    } else if (f < 345) {
      u.shot = 2;
      u.camS = lerp(1.9, 2.35, ease(seg(f, 270, 345)));
      u.focus = [521, 829];
      u.eyeOpen = 1;
      u.dilate = lerp(1, 1.9, easeOut(seg(f, 284, 326)));
      u.swirl = lerp(0, 1.2, seg(f, 280, 345));
      u.eyeGlow = lerp(1, 1.8, seg(f, 280, 340)) * (0.92 + 0.08 * Math.sin(t * 9));
      u.carGlow = 1.2;
      u.light = 0.7 + 0.1 * Math.sin(t * 6);
      u.embers = seg(f, 285, 320);
      shakeAmp = lerp(3, 10, seg(f, 270, 345));
      u.ca = lerp(3e-3, 8e-3, seg(f, 270, 345));
      u.bloomK = 1.1;
    } else if (f < 366) {
      u.shot = 0;
      u.camS = 1.08;
      u.focus = [540, 930];
      u.eyeOpen = 1;
      u.dilate = 1.9;
      u.swirl = 1.2;
      u.eyeGlow = 1.8 + 0.3 * Math.sin(t * 22);
      u.carGlow = 1.3;
      u.embers = 1;
      u.light = h(Math.floor(f / 2) + 9) > 0.5 ? 0.85 : 0.2;
      shakeAmp = 14;
      u.ca = 9e-3;
      u.bloomK = 1.15;
    } else if (f < 372) {
      u.shot = 2;
      u.camS = 2.7;
      u.focus = [521, 829];
      u.eyeOpen = 1;
      u.dilate = 2.1;
      u.swirl = 1.4;
      u.eyeGlow = 2.2;
      u.carGlow = 1.4;
      u.embers = 1;
      shakeAmp = 18;
      u.ca = 0.012;
      const k = f - 366;
      u.impact = k <= 1 ? 1 : k === 2 ? 2 : 0;
      u.speed = k <= 3 ? 1 : 0.5;
      u.flash = k === 3 ? 0.75 : k === 4 ? 0.4 : k === 5 ? 0.15 : 0;
      u.flashCol = [1, 0.15, 0.08];
    } else {
      u.shot = 1;
      u.camS = 1.7;
      u.focus = [521, 760];
      u.face = 1;
      u.eyeOpen = 1;
      u.dilate = 2;
      u.swirl = 1.2;
      u.faceS = lerp(1.15, 1.26, ease(seg(f, 372, 420)));
      u.eyeGlow = 1.5 + 0.35 * Math.sin(t * 6);
      u.carGlow = 1.2;
      u.light = 0.75;
      u.embers = 0.6;
      shakeAmp = lerp(7, 1.5, seg(f, 372, 405));
      u.ca = lerp(6e-3, 3e-3, seg(f, 372, 395));
      u.gloom = 0.7;
      u.speed = f < 378 ? lerp(0.6, 0, seg(f, 372, 378)) : 0;
      u.fade = ease(seg(f, 402, 420));
    }
    u.shake = [
      shakeAmp * (0.7 * wig(t, 9, 1) + 0.3 * wig(t, 23, 2)),
      shakeAmp * (0.7 * wig(t, 8, 3) + 0.3 * wig(t, 21, 4)) + (shakeAmp > 0 ? 1.2 * Math.sin(t * 40) : 0)
    ];
    return u;
  }

  // src/main.ts
  var W = 1080;
  var H = 1920;
  function compile(gl, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
  function fbo(gl, w, h2) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h: h2 };
  }
  function imgTex(gl, img, wrap) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  var loadImg = (src) => new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("load " + src));
    i.src = src;
  });
  var Renderer = class {
    constructor(cv, imgs) {
      __publicField(this, "gl");
      __publicField(this, "scene");
      __publicField(this, "bright");
      __publicField(this, "blur");
      __publicField(this, "fin");
      __publicField(this, "fScene");
      __publicField(this, "a1");
      __publicField(this, "b1");
      __publicField(this, "a2");
      __publicField(this, "b2");
      __publicField(this, "tex");
      const gl = cv.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false, alpha: false });
      if (!gl) throw new Error("WebGL2 not available in this browser");
      this.gl = gl;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.scene = compile(gl, FS_SCENE);
      this.bright = compile(gl, FS_BRIGHT);
      this.blur = compile(gl, FS_BLUR);
      this.fin = compile(gl, FS_FINAL);
      this.fScene = fbo(gl, W, H);
      this.a1 = fbo(gl, W / 4, H / 4);
      this.b1 = fbo(gl, W / 4, H / 4);
      this.a2 = fbo(gl, W / 8, H / 8);
      this.b2 = fbo(gl, W / 8, H / 8);
      this.tex = {
        tCar: imgTex(gl, imgs.car, gl.CLAMP_TO_EDGE),
        tEye: imgTex(gl, imgs.eye, gl.MIRRORED_REPEAT),
        tChar: imgTex(gl, imgs.char, gl.CLAMP_TO_EDGE),
        tCalm: imgTex(gl, imgs.calm, gl.CLAMP_TO_EDGE),
        tShock: imgTex(gl, imgs.shock, gl.CLAMP_TO_EDGE)
      };
    }
    pass(prog, target, texs, set) {
      const gl = this.gl;
      gl.useProgram(prog.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
      texs.forEach(([name, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(prog.u[name], i);
      });
      set(prog);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    draw(frame) {
      const gl = this.gl;
      const U = uniformsAt(frame);
      const time = frame / FPS;
      const f1 = (p, n, v) => p.u[n] && gl.uniform1f(p.u[n], v);
      this.pass(this.scene, this.fScene, Object.entries(this.tex), (p) => {
        gl.uniform2f(p.u.res, W, H);
        f1(p, "time", time);
        ["shot", "camS", "light", "eyeOpen", "eyeGlow", "dilate", "swirl", "blink", "face", "faceS", "embers", "carGlow"].forEach((k) => f1(p, k, U[k]));
        gl.uniform2f(p.u.focus, U.focus[0], U.focus[1]);
        gl.uniform2f(p.u.shake, U.shake[0], U.shake[1]);
      });
      this.pass(this.bright, this.a1, [["tSrc", this.fScene.tex]], (p) => {
        gl.uniform2f(p.u.texel, 1 / W, 1 / H);
        f1(p, "thr", 0.6);
      });
      this.pass(this.blur, this.b1, [["tSrc", this.a1.tex]], (p) => gl.uniform2f(p.u.dir, 1.5 / this.a1.w, 0));
      this.pass(this.blur, this.a1, [["tSrc", this.b1.tex]], (p) => gl.uniform2f(p.u.dir, 0, 1.5 / this.a1.h));
      this.pass(this.blur, this.b2, [["tSrc", this.a1.tex]], (p) => gl.uniform2f(p.u.dir, 2 / this.b2.w, 0));
      this.pass(this.blur, this.a2, [["tSrc", this.b2.tex]], (p) => gl.uniform2f(p.u.dir, 0, 2 / this.b2.h));
      this.pass(this.fin, null, [["tScene", this.fScene.tex], ["tB1", this.a1.tex], ["tB2", this.a2.tex]], (p) => {
        gl.uniform2f(p.u.res, W, H);
        f1(p, "time", time);
        f1(p, "frame", frame);
        ["ca", "bloomK", "flash", "impact", "speed", "gloom", "fade"].forEach((k) => f1(p, k, U[k]));
        gl.uniform3f(p.u.flashCol, ...U.flashCol);
      });
    }
  };
  var $ = (id) => document.getElementById(id);
  var canvas = $("stage");
  var status = (s) => {
    $("status").textContent = s;
  };
  var renderer;
  var audioBytes;
  var liveCtx = null;
  var liveSrc = null;
  var liveBuf = null;
  var raf = 0;
  var busy = false;
  async function init() {
    const [car, eye, char, calm, shock] = await Promise.all(
      ["assets/carriage.webp", "assets/eye.jpg", "assets/char.webp", "assets/close_calm.webp", "assets/close_shock.webp"].map(loadImg)
    );
    renderer = new Renderer(canvas, { car, eye, char, calm, shock });
    audioBytes = await (await fetch("assets/soundtrack.mp3")).arrayBuffer();
    renderer.draw(0);
    window.__ready = true;
    status("Ready. 14 s \xB7 1080\xD71920 \xB7 30 fps");
    $("start").disabled = false;
    $("render").disabled = false;
  }
  async function startLive(onFrame) {
    stopLive();
    liveCtx = liveCtx || new AudioContext();
    await liveCtx.resume();
    if (!liveBuf) liveBuf = await liveCtx.decodeAudioData(audioBytes.slice(0));
    const dest = startLive.extraDest;
    liveSrc = liveCtx.createBufferSource();
    liveSrc.buffer = liveBuf;
    liveSrc.connect(liveCtx.destination);
    if (dest) liveSrc.connect(dest);
    const t0 = liveCtx.currentTime + 0.05;
    liveSrc.start(t0);
    return new Promise((resolve) => {
      const tick = () => {
        const f = Math.floor((liveCtx.currentTime - t0) * FPS);
        if (f >= DURATION) {
          renderer.draw(DURATION - 1);
          status("Finished \u2014 press Start to replay");
          resolve();
          return;
        }
        const ff = Math.max(0, f);
        renderer.draw(ff);
        onFrame?.(ff);
        $("bar").style.width = (100 * ff / DURATION).toFixed(1) + "%";
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }
  function stopLive() {
    cancelAnimationFrame(raf);
    try {
      liveSrc?.stop();
    } catch {
    }
    liveSrc = null;
  }
  async function pickVideo() {
    if (typeof window.VideoEncoder === "undefined") return null;
    const base = { width: W, height: H, bitrate: 14e6, framerate: FPS };
    const cands = [
      ["avc1.640034", "mp4", "avc"],
      ["avc1.4d0034", "mp4", "avc"],
      ["avc1.42003e", "mp4", "avc"],
      ["vp09.00.40.08", "webm", "V_VP9"],
      ["vp8", "webm", "V_VP8"]
    ];
    for (const [codec, container, muxCodec] of cands) {
      const cfg = { ...base, codec };
      if (container === "mp4") cfg.avc = { format: "avc" };
      try {
        const s = await VideoEncoder.isConfigSupported(cfg);
        if (s.supported) return { cfg, container, muxCodec };
      } catch {
      }
    }
    return null;
  }
  async function pickAudio(container) {
    if (typeof window.AudioEncoder === "undefined") return null;
    const cands = container === "mp4" ? [["mp4a.40.2", "aac"], ["opus", "opus"]] : [["opus", "A_OPUS"]];
    for (const [codec, muxCodec] of cands) {
      const cfg = { codec, sampleRate: 48e3, numberOfChannels: 2, bitrate: 192e3 };
      try {
        const s = await AudioEncoder.isConfigSupported(cfg);
        if (s.supported) return { cfg, muxCodec };
      } catch {
      }
    }
    return null;
  }
  async function renderOffline(maxFrames = DURATION) {
    const v = await pickVideo();
    if (!v) throw new Error("NO_WEBCODECS");
    const a = await pickAudio(v.container);
    const nFrames = Math.min(DURATION, maxFrames);
    const M = v.container === "mp4" ? Mp4Muxer : WebMMuxer;
    const muxOpts = { target: new M.ArrayBufferTarget(), video: { codec: v.muxCodec, width: W, height: H, frameRate: FPS } };
    if (a) muxOpts.audio = { codec: a.muxCodec, numberOfChannels: 2, sampleRate: 48e3 };
    if (v.container === "mp4") muxOpts.fastStart = "in-memory";
    else muxOpts.firstTimestampBehavior = "offset";
    const muxer = new M.Muxer(muxOpts);
    let err = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => {
      err = e;
    } });
    venc.configure(v.cfg);
    if (a) {
      const off = new OfflineAudioContext(2, Math.ceil(48e3 * DURATION / FPS), 48e3);
      const buf = await off.decodeAudioData(audioBytes.slice(0));
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => {
        err = e;
      } });
      aenc.configure(a.cfg);
      const total = Math.min(buf.length, Math.floor(48e3 * nFrames / FPS));
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      const CH = 4800;
      for (let s = 0; s < total; s += CH) {
        const n = Math.min(CH, total - s);
        const data = new Float32Array(n * 2);
        data.set(L.subarray(s, s + n), 0);
        data.set(R.subarray(s, s + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: 48e3, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / 48e3), data });
        aenc.encode(ad);
        ad.close();
      }
      await aenc.flush();
      aenc.close();
    }
    const t0 = performance.now();
    for (let f = 0; f < nFrames; f++) {
      if (err) throw err;
      renderer.draw(f);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: f % 60 === 0 });
      vf.close();
      while (venc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
      if (f % 3 === 0) {
        $("bar").style.width = (100 * (f + 1) / nFrames).toFixed(1) + "%";
        status(`Rendering frame ${f + 1}/${nFrames} (${v.cfg.codec}${a ? " + " + a.cfg.codec : ""})`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await venc.flush();
    venc.close();
    if (err) throw err;
    muxer.finalize();
    const blob = new Blob([muxOpts.target.buffer], { type: v.container === "mp4" ? "video/mp4" : "video/webm" });
    const info = `${v.cfg.codec}${a ? " + " + a.cfg.codec : " (no audio encoder)"} \xB7 ${nFrames} frames \xB7 ${((performance.now() - t0) / 1e3).toFixed(1)} s`;
    return { blob, name: `anime_train_eye.${v.container}`, info };
  }
  async function recordLive() {
    liveCtx = liveCtx || new AudioContext();
    const dest = liveCtx.createMediaStreamDestination();
    startLive.extraDest = dest;
    const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : void 0);
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const done = new Promise((r) => rec.onstop = () => r());
    rec.start(500);
    await startLive();
    rec.stop();
    await done;
    startLive.extraDest = void 0;
    const type = rec.mimeType || "video/webm";
    return { blob: new Blob(parts, { type }), name: "anime_train_eye." + (type.includes("mp4") ? "mp4" : "webm"), info: "MediaRecorder fallback (real-time)" };
  }
  function offerDownload(r) {
    const url = URL.createObjectURL(r.blob);
    const a = $("dl");
    a.href = url;
    a.download = r.name;
    a.style.display = "inline-block";
    a.textContent = `Download ${r.name} (${(r.blob.size / 1e6).toFixed(1)} MB)`;
    status("Done: " + r.info);
  }
  $("start").onclick = async () => {
    if (busy) return;
    status("Playing\u2026");
    await startLive();
  };
  $("render").onclick = async () => {
    if (busy) return;
    busy = true;
    stopLive();
    $("start").disabled = true;
    $("render").disabled = true;
    $("dl").style.display = "none";
    try {
      let r;
      try {
        r = await renderOffline();
      } catch (e) {
        if (e?.message !== "NO_WEBCODECS") console.warn("WebCodecs render failed, falling back", e);
        status("WebCodecs unavailable \u2014 recording live playback instead (14 s)\u2026");
        r = await recordLive();
      }
      offerDownload(r);
    } catch (e) {
      status("Render failed: " + (e?.message || e));
    }
    busy = false;
    $("start").disabled = false;
    $("render").disabled = false;
  };
  window.__renderTest = async (n) => {
    stopLive();
    const r = await renderOffline(n);
    const b = new Uint8Array(await r.blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768));
    return { name: r.name, info: r.info, size: b.length, b64: btoa(s) };
  };
  window.__startLive = () => {
    startLive();
    return true;
  };
  init().catch((e) => {
    status("Failed to load: " + e.message);
    console.error(e);
  });
})();
