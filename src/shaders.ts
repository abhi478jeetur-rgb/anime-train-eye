// AE-style 2D anime compositing shaders (WebGL2).
export const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 hash2(vec2 p){ return vec2(hash(p),hash(p+17.13)); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5;} return s; }
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
`;

// ---------------- SCENE PASS: multiplane layers, warp, blink, eye shader, rim + light wrap
export const FS_SCENE = COMMON + `
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

// ---------------- BLOOM: bright pass + separable blur
export const FS_BRIGHT = COMMON + `
uniform sampler2D tSrc; uniform vec2 texel; uniform float thr;
void main(){
  vec3 c = vec3(0.0);
  c += texture(tSrc, vUv+texel*vec2(-1,-1)).rgb; c += texture(tSrc, vUv+texel*vec2(1,-1)).rgb;
  c += texture(tSrc, vUv+texel*vec2(-1,1)).rgb;  c += texture(tSrc, vUv+texel*vec2(1,1)).rgb;
  c*=0.25;
  float l = lum(c);
  o = vec4(c*smoothstep(thr, thr+0.3, l),1.0);
}`;
export const FS_BLUR = COMMON + `
uniform sampler2D tSrc; uniform vec2 dir;
void main(){
  float w[5] = float[](0.227,0.1945,0.1216,0.054,0.0162);
  vec3 c = texture(tSrc,vUv).rgb*w[0];
  for(int i=1;i<5;i++){ c += texture(tSrc,vUv+dir*float(i)).rgb*w[i]; c += texture(tSrc,vUv-dir*float(i)).rgb*w[i]; }
  o = vec4(c,1.0);
}`;

// ---------------- FINAL: satsuei finish (bloom add, chromatic aberration, vignette, grain, flash, impact frames, speed / gloom lines)
export const FS_FINAL = COMMON + `
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
