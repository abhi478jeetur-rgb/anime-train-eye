// Beat sheet -> per-frame uniforms. 30 fps, 420 frames (14 s).
export const FPS = 30;
export const DURATION = 420;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const seg = (f: number, a: number, b: number) => clamp((f - a) / (b - a));
const h = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// AE-style wiggle(freq, amp): smooth value noise
const wig = (t: number, freq: number, seed: number) => {
  const x = t * freq; const i = Math.floor(x); const f = x - i; const s = f * f * (3 - 2 * f);
  return lerp(h(i + seed * 101) * 2 - 1, h(i + 1 + seed * 101) * 2 - 1, s);
};
const blinkCurve = (f: number, start: number) => { const k = f - start; return [0, 0.55, 1, 1, 0.5, 0][k] ?? 0; };

export type U = {
  shot: number; camS: number; focus: [number, number]; shake: [number, number];
  light: number; eyeOpen: number; eyeGlow: number; dilate: number; swirl: number; blink: number;
  face: number; faceS: number; embers: number; carGlow: number;
  ca: number; bloomK: number; flash: number; flashCol: [number, number, number]; impact: number;
  speed: number; gloom: number; fade: number;
};

export function uniformsAt(f: number): U {
  const t = f / FPS;
  const u: U = {
    shot: 0, camS: 1, focus: [540, 960], shake: [0, 0], light: 1, eyeOpen: 0, eyeGlow: 0.3, dilate: 1, swirl: 0,
    blink: 0, face: 0, faceS: 1, embers: 0, carGlow: 0.15, ca: 0.0015, bloomK: 0.9, flash: 0, flashCol: [1, 1, 1],
    impact: 0, speed: 0, gloom: 0, fade: 0,
  };
  let shakeAmp = 0;
  if (f < 180) {
    // A: calm establishing push-in -> flicker -> the eye opens outside
    u.shot = 0;
    u.camS = lerp(1.0, 1.14, ease(seg(f, 0, 180)));
    u.focus = [540, lerp(960, 900, ease(seg(f, 0, 180)))];
    u.blink = Math.max(blinkCurve(f, 30), blinkCurve(f, 162));
    const flickFrames = [58, 59, 63, 67, 68, 69, 76, 82, 83, 91];
    u.light = f >= 56 && f < 96 ? (flickFrames.includes(f) ? 0.22 : 0.8 + 0.2 * h(f)) : f >= 96 ? 0.82 : 1;
    // slit of light, then the lid opens with a small overshoot
    u.eyeOpen = f < 72 ? 0 : f < 100 ? 0.03 * (0.5 + 0.5 * h(f)) : (() => { const k = seg(f, 100, 150); return easeOut(k) * (1 + 0.08 * Math.sin(k * Math.PI)); })();
    u.eyeGlow = lerp(0.35, 1.05, seg(f, 72, 160));
    u.carGlow = lerp(0.15, 0.9, seg(f, 100, 165));
    shakeAmp = f > 100 ? lerp(1.5, 5, seg(f, 100, 180)) : 0.8;
    u.ca = lerp(0.0015, 0.003, seg(f, 100, 180));
  } else if (f < 270) {
    // B: close-up; calm -> blink -> SHOCK swap with snap-zoom + flash
    u.shot = 1; u.camS = 1.7; u.focus = [521 + 10 * Math.sin(t * 0.7), 760];
    u.eyeOpen = 1; u.eyeGlow = 1.0 + 0.15 * Math.sin(t * 5); u.carGlow = 0.9; u.light = 0.8;
    if (f < 210) { u.face = 0; u.faceS = lerp(1.0, 1.03, seg(f, 180, 210)); u.blink = blinkCurve(f, 193); shakeAmp = 2.5; }
    else {
      u.face = 1;
      u.faceS = f < 216 ? lerp(1.13, 1.08, easeOut(seg(f, 210, 216))) : lerp(1.08, 1.12, seg(f, 216, 270));
      u.flash = f === 210 ? 0.75 : f === 211 ? 0.35 : 0;
      u.ca = f < 215 ? 0.008 : 0.003;
      shakeAmp = f < 216 ? 9 : 4.5;
      u.gloom = clamp(seg(f, 214, 232));
    }
  } else if (f < 345) {
    // C: extreme close on the eye: dilation, swirl, glow, embers, rising shake
    u.shot = 2; u.camS = lerp(1.9, 2.35, ease(seg(f, 270, 345))); u.focus = [521, 829];
    u.eyeOpen = 1; u.dilate = lerp(1.0, 1.9, easeOut(seg(f, 284, 326)));
    u.swirl = lerp(0, 1.2, seg(f, 280, 345)); u.eyeGlow = lerp(1.0, 1.8, seg(f, 280, 340)) * (0.92 + 0.08 * Math.sin(t * 9));
    u.carGlow = 1.2; u.light = 0.7 + 0.1 * Math.sin(t * 6); u.embers = seg(f, 285, 320);
    shakeAmp = lerp(3, 10, seg(f, 270, 345)); u.ca = lerp(0.003, 0.008, seg(f, 270, 345)); u.bloomK = 1.1;
  } else if (f < 366) {
    // D: wide again, carriage shaking hard, lights stuttering
    u.shot = 0; u.camS = 1.08; u.focus = [540, 930]; u.eyeOpen = 1; u.dilate = 1.9; u.swirl = 1.2;
    u.eyeGlow = 1.8 + 0.3 * Math.sin(t * 22); u.carGlow = 1.3; u.embers = 1;
    u.light = h(Math.floor(f / 2) + 9) > 0.5 ? 0.85 : 0.2;
    shakeAmp = 14; u.ca = 0.009; u.bloomK = 1.15;
  } else if (f < 372) {
    // IMPACT frames on the eye
    u.shot = 2; u.camS = 2.7; u.focus = [521, 829]; u.eyeOpen = 1; u.dilate = 2.1; u.swirl = 1.4; u.eyeGlow = 2.2; u.carGlow = 1.4;
    u.embers = 1; shakeAmp = 18; u.ca = 0.012;
    const k = f - 366;
    u.impact = k <= 1 ? 1 : k === 2 ? 2 : 0;
    u.speed = k <= 3 ? 1 : 0.5;
    u.flash = k === 3 ? 0.75 : k === 4 ? 0.4 : k === 5 ? 0.15 : 0; u.flashCol = [1, 0.15, 0.08];
  } else {
    // E: final close-up, shaken, lit by the pulsing eye; fade out
    u.shot = 1; u.camS = 1.7; u.focus = [521, 760]; u.face = 1; u.eyeOpen = 1; u.dilate = 2; u.swirl = 1.2;
    u.faceS = lerp(1.15, 1.26, ease(seg(f, 372, 420)));
    u.eyeGlow = 1.5 + 0.35 * Math.sin(t * 6); u.carGlow = 1.2; u.light = 0.75; u.embers = 0.6;
    shakeAmp = lerp(7, 1.5, seg(f, 372, 405)); u.ca = lerp(0.006, 0.003, seg(f, 372, 395));
    u.gloom = 0.7; u.speed = f < 378 ? lerp(0.6, 0, seg(f, 372, 378)) : 0;
    u.fade = ease(seg(f, 402, 420));
  }
  // camera shake: two wiggles (low + high freq) + vertical rail rumble
  u.shake = [
    shakeAmp * (0.7 * wig(t, 9, 1) + 0.3 * wig(t, 23, 2)),
    shakeAmp * (0.7 * wig(t, 8, 3) + 0.3 * wig(t, 21, 4)) + (shakeAmp > 0 ? 1.2 * Math.sin(t * 40) : 0),
  ];
  return u;
}
