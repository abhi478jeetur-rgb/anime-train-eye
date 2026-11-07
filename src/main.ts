// Anime Train Eye — browser runtime. Same shaders/timeline as the Remotion build,
// driven by AudioContext time (live) or f/30 (offline WebCodecs render).
import { VS, FS_SCENE, FS_BRIGHT, FS_BLUR, FS_FINAL } from "./shaders";
import { uniformsAt, FPS, DURATION } from "./timeline";

declare const Mp4Muxer: any;
declare const WebMMuxer: any;

const W = 1080, H = 1920;
type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type FBO = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

function compile(gl: WebGL2RenderingContext, fs: string): Prog {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  const u: Prog["u"] = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i)!.name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function fbo(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fb, tex, w, h };
}
function imgTex(gl: WebGL2RenderingContext, img: HTMLImageElement, wrap: number): WebGLTexture {
  const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("load " + src)); i.src = src; });

class Renderer {
  gl: WebGL2RenderingContext; scene: Prog; bright: Prog; blur: Prog; fin: Prog;
  fScene: FBO; a1: FBO; b1: FBO; a2: FBO; b2: FBO; tex: Record<string, WebGLTexture>;
  constructor(cv: HTMLCanvasElement, imgs: Record<string, HTMLImageElement>) {
    const gl = cv.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false, alpha: false })!;
    if (!gl) throw new Error("WebGL2 not available in this browser");
    this.gl = gl;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.scene = compile(gl, FS_SCENE); this.bright = compile(gl, FS_BRIGHT); this.blur = compile(gl, FS_BLUR); this.fin = compile(gl, FS_FINAL);
    this.fScene = fbo(gl, W, H); this.a1 = fbo(gl, W / 4, H / 4); this.b1 = fbo(gl, W / 4, H / 4); this.a2 = fbo(gl, W / 8, H / 8); this.b2 = fbo(gl, W / 8, H / 8);
    this.tex = {
      tCar: imgTex(gl, imgs.car, gl.CLAMP_TO_EDGE), tEye: imgTex(gl, imgs.eye, gl.MIRRORED_REPEAT),
      tChar: imgTex(gl, imgs.char, gl.CLAMP_TO_EDGE), tCalm: imgTex(gl, imgs.calm, gl.CLAMP_TO_EDGE), tShock: imgTex(gl, imgs.shock, gl.CLAMP_TO_EDGE),
    };
  }
  pass(prog: Prog, target: FBO | null, texs: [string, WebGLTexture][], set: (p: Prog) => void) {
    const gl = this.gl; gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
    texs.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[name], i); });
    set(prog); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  draw(frame: number) {
    const gl = this.gl; const U = uniformsAt(frame); const time = frame / FPS;
    const f1 = (p: Prog, n: string, v: number) => p.u[n] && gl.uniform1f(p.u[n], v);
    this.pass(this.scene, this.fScene, Object.entries(this.tex), (p) => {
      gl.uniform2f(p.u.res, W, H); f1(p, "time", time);
      (["shot", "camS", "light", "eyeOpen", "eyeGlow", "dilate", "swirl", "blink", "face", "faceS", "embers", "carGlow"] as const).forEach((k) => f1(p, k, U[k] as number));
      gl.uniform2f(p.u.focus, U.focus[0], U.focus[1]); gl.uniform2f(p.u.shake, U.shake[0], U.shake[1]);
    });
    this.pass(this.bright, this.a1, [["tSrc", this.fScene.tex]], (p) => { gl.uniform2f(p.u.texel, 1 / W, 1 / H); f1(p, "thr", 0.6); });
    this.pass(this.blur, this.b1, [["tSrc", this.a1.tex]], (p) => gl.uniform2f(p.u.dir, 1.5 / this.a1.w, 0));
    this.pass(this.blur, this.a1, [["tSrc", this.b1.tex]], (p) => gl.uniform2f(p.u.dir, 0, 1.5 / this.a1.h));
    this.pass(this.blur, this.b2, [["tSrc", this.a1.tex]], (p) => gl.uniform2f(p.u.dir, 2.0 / this.b2.w, 0));
    this.pass(this.blur, this.a2, [["tSrc", this.b2.tex]], (p) => gl.uniform2f(p.u.dir, 0, 2.0 / this.b2.h));
    this.pass(this.fin, null, [["tScene", this.fScene.tex], ["tB1", this.a1.tex], ["tB2", this.a2.tex]], (p) => {
      gl.uniform2f(p.u.res, W, H); f1(p, "time", time); f1(p, "frame", frame);
      (["ca", "bloomK", "flash", "impact", "speed", "gloom", "fade"] as const).forEach((k) => f1(p, k, U[k] as number));
      gl.uniform3f(p.u.flashCol, ...U.flashCol);
    });
  }
}

// ---------------- UI wiring
const $ = (id: string) => document.getElementById(id) as any;
const canvas = $("stage") as HTMLCanvasElement;
const status = (s: string) => { $("status").textContent = s; };
let renderer: Renderer;
let audioBytes: ArrayBuffer;
let liveCtx: AudioContext | null = null;
let liveSrc: AudioBufferSourceNode | null = null;
let liveBuf: AudioBuffer | null = null;
let raf = 0;
let busy = false;

async function init() {
  const [car, eye, char, calm, shock] = await Promise.all(
    ["assets/carriage.webp", "assets/eye.jpg", "assets/char.webp", "assets/close_calm.webp", "assets/close_shock.webp"].map(loadImg));
  renderer = new Renderer(canvas, { car, eye, char, calm, shock });
  audioBytes = await (await fetch("assets/soundtrack.mp3")).arrayBuffer();
  renderer.draw(0);
  (window as any).__ready = true;
  status("Ready. 14 s · 1080×1920 · 30 fps");
  $("start").disabled = false; $("render").disabled = false;
}

// ---- live playback, clock = AudioContext.currentTime
async function startLive(onFrame?: (f: number) => void): Promise<void> {
  stopLive();
  liveCtx = liveCtx || new AudioContext();
  await liveCtx.resume();
  if (!liveBuf) liveBuf = await liveCtx.decodeAudioData(audioBytes.slice(0));
  const dest = (startLive as any).extraDest as MediaStreamAudioDestinationNode | undefined;
  liveSrc = liveCtx.createBufferSource(); liveSrc.buffer = liveBuf;
  liveSrc.connect(liveCtx.destination); if (dest) liveSrc.connect(dest);
  const t0 = liveCtx.currentTime + 0.05;
  liveSrc.start(t0);
  return new Promise((resolve) => {
    const tick = () => {
      const f = Math.floor((liveCtx!.currentTime - t0) * FPS);
      if (f >= DURATION) { renderer.draw(DURATION - 1); status("Finished — press Start to replay"); resolve(); return; }
      const ff = Math.max(0, f); renderer.draw(ff); onFrame?.(ff);
      $("bar").style.width = (100 * ff / DURATION).toFixed(1) + "%";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
function stopLive() { cancelAnimationFrame(raf); try { liveSrc?.stop(); } catch { /* */ } liveSrc = null; }

// ---- offline deterministic render with WebCodecs
async function pickVideo(): Promise<{ cfg: VideoEncoderConfig; container: "mp4" | "webm"; muxCodec: string } | null> {
  if (typeof (window as any).VideoEncoder === "undefined") return null;
  const base = { width: W, height: H, bitrate: 14_000_000, framerate: FPS };
  const cands: [string, "mp4" | "webm", string][] = [
    ["avc1.640034", "mp4", "avc"], ["avc1.4d0034", "mp4", "avc"], ["avc1.42003e", "mp4", "avc"],
    ["vp09.00.40.08", "webm", "V_VP9"], ["vp8", "webm", "V_VP8"],
  ];
  for (const [codec, container, muxCodec] of cands) {
    const cfg: any = { ...base, codec };
    if (container === "mp4") cfg.avc = { format: "avc" };
    try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) return { cfg, container, muxCodec }; } catch { /* */ }
  }
  return null;
}
async function pickAudio(container: "mp4" | "webm") {
  if (typeof (window as any).AudioEncoder === "undefined") return null;
  const cands: [string, string][] = container === "mp4" ? [["mp4a.40.2", "aac"], ["opus", "opus"]] : [["opus", "A_OPUS"]];
  for (const [codec, muxCodec] of cands) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
    try { const s = await AudioEncoder.isConfigSupported(cfg); if (s.supported) return { cfg, muxCodec }; } catch { /* */ }
  }
  return null;
}

async function renderOffline(maxFrames = DURATION): Promise<{ blob: Blob; name: string; info: string }> {
  const v = await pickVideo();
  if (!v) throw new Error("NO_WEBCODECS");
  const a = await pickAudio(v.container);
  const nFrames = Math.min(DURATION, maxFrames);
  const M = v.container === "mp4" ? Mp4Muxer : WebMMuxer;
  const muxOpts: any = { target: new M.ArrayBufferTarget(), video: { codec: v.muxCodec, width: W, height: H, frameRate: FPS } };
  if (a) muxOpts.audio = { codec: a.muxCodec, numberOfChannels: 2, sampleRate: 48000 };
  if (v.container === "mp4") muxOpts.fastStart = "in-memory"; else muxOpts.firstTimestampBehavior = "offset";
  const muxer = new M.Muxer(muxOpts);
  let err: any = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { err = e; } });
  venc.configure(v.cfg);
  // audio first (independent of frames)
  if (a) {
    const off = new OfflineAudioContext(2, Math.ceil(48000 * DURATION / FPS), 48000);
    const buf = await off.decodeAudioData(audioBytes.slice(0));
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { err = e; } });
    aenc.configure(a.cfg);
    const total = Math.min(buf.length, Math.floor(48000 * nFrames / FPS));
    const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const CH = 4800;
    for (let s = 0; s < total; s += CH) {
      const n = Math.min(CH, total - s);
      const data = new Float32Array(n * 2); data.set(L.subarray(s, s + n), 0); data.set(R.subarray(s, s + n), n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / 48000), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush(); aenc.close();
  }
  const t0 = performance.now();
  for (let f = 0; f < nFrames; f++) {
    if (err) throw err;
    renderer.draw(f);
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: f % 60 === 0 }); vf.close();
    while (venc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
    if (f % 3 === 0) {
      $("bar").style.width = (100 * (f + 1) / nFrames).toFixed(1) + "%";
      status(`Rendering frame ${f + 1}/${nFrames} (${v.cfg.codec}${a ? " + " + a.cfg.codec : ""})`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await venc.flush(); venc.close();
  if (err) throw err;
  muxer.finalize();
  const blob = new Blob([muxOpts.target.buffer], { type: v.container === "mp4" ? "video/mp4" : "video/webm" });
  const info = `${v.cfg.codec}${a ? " + " + a.cfg.codec : " (no audio encoder)"} · ${nFrames} frames · ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  return { blob, name: `anime_train_eye.${v.container}`, info };
}

// ---- fallback: record the live playback
async function recordLive(): Promise<{ blob: Blob; name: string; info: string }> {
  liveCtx = liveCtx || new AudioContext();
  const dest = liveCtx.createMediaStreamDestination();
  (startLive as any).extraDest = dest;
  const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
  const parts: Blob[] = []; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  await startLive();
  rec.stop(); await done; (startLive as any).extraDest = undefined;
  const type = rec.mimeType || "video/webm";
  return { blob: new Blob(parts, { type }), name: "anime_train_eye." + (type.includes("mp4") ? "mp4" : "webm"), info: "MediaRecorder fallback (real-time)" };
}

function offerDownload(r: { blob: Blob; name: string; info: string }) {
  const url = URL.createObjectURL(r.blob);
  const a = $("dl") as HTMLAnchorElement; a.href = url; a.download = r.name; a.style.display = "inline-block";
  a.textContent = `Download ${r.name} (${(r.blob.size / 1e6).toFixed(1)} MB)`;
  status("Done: " + r.info);
}

$("start").onclick = async () => { if (busy) return; status("Playing…"); await startLive(); };
$("render").onclick = async () => {
  if (busy) return; busy = true; stopLive();
  $("start").disabled = true; $("render").disabled = true; $("dl").style.display = "none";
  try {
    let r;
    try { r = await renderOffline(); }
    catch (e: any) {
      if (e?.message !== "NO_WEBCODECS") console.warn("WebCodecs render failed, falling back", e);
      status("WebCodecs unavailable — recording live playback instead (14 s)…"); r = await recordLive();
    }
    offerDownload(r);
  } catch (e: any) { status("Render failed: " + (e?.message || e)); }
  busy = false; $("start").disabled = false; $("render").disabled = false;
};

// test hooks (headless QA)
(window as any).__renderTest = async (n: number) => {
  stopLive();
  const r = await renderOffline(n);
  const b = new Uint8Array(await r.blob.arrayBuffer());
  let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return { name: r.name, info: r.info, size: b.length, b64: btoa(s) };
};
(window as any).__startLive = () => { startLive(); return true; };

init().catch((e) => { status("Failed to load: " + e.message); console.error(e); });
