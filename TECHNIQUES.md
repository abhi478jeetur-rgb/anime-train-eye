# After-Effects-style 2D anime shots — technique guide (AE → code)

Reference studied: YouTube Short "I Made This 2D Animation in Just 7 Hours | After Effects Speed Project" (@Visarg, https://www.youtube.com/shorts/eEyDQmCftqg). Browser check (2026-11-07): the 13 s Short is a screen-recording of the AE workspace (comp view + two 3D camera viewports + timeline), so it shows the *setup* (layered 3D comp, camera keys) rather than a clean finished shot. Useful takeaways: character design (brown spiky hair, green jacket, yellow tee, jeans), colour story (red-lit carriage vs. glowing monster eye), beat structure (calm → eye reveal → red climax).

## 1. How AE creators do it

| Step | AE method | Notes / source |
|---|---|---|
| Layer separation | Cut the illustration into BG / mid / character / FX layers in Photoshop; fill holes behind cut-outs so camera moves don't reveal gaps. | Adobe "Animate a picture" (parallax) https://helpx.adobe.com/after-effects/how-to/animate-picture.html ; Motion Array https://motionarray.com/learn/after-effects/animate-flat-2d-images-after-effects/ |
| 2.5D parallax / multiplane | Make layers 3D, spread them in Z, add a 28 mm camera and key a slow push or pan; far layers move/scale less. Digital version of Disney's multiplane camera. | Adobe link above; Wikipedia "Multiplane camera" https://en.wikipedia.org/wiki/Multiplane_camera ; Toon Boom multiplane https://docs.toonboom.com/help/harmony-22/advanced/staging/about-multiplane.html |
| Hair / cloth sway | Puppet Pin (pins at roots fixed, tips animated); scripts like AutoSway add sine sway to pins. Puppet Starch keeps faces rigid. | Dark Skies puppet guide https://darkskiesfilm.com/how-to-do-puppet-animation-in-after-effects/ ; AutoSway https://aescripts.com/autosway/ ; JP walkthrough https://note.com/tomoex/n/na30abdecf726 |
| Blinks / expressions | Swap eye / mouth drawings (open, half, closed) on hold frames; or a replacement face layer for big expression changes. | Cunliffe AE anime character rig (puppet pin, animating eyes) https://www.classcentral.com/course/youtube-anime-character-design-and-animation-a-stable-diffusion-photoshop-and-after-effects-tutorial-pt2-150793 |
| Camera shake | `wiggle(freq, amp)` on the camera / null position; stack a low-freq and a high-freq wiggle; ramp amplitude with the beat. | (standard AE expression) |
| Satsuei (anime photography/compositing) | Character lighting with gradient masks ("para"), shadow tint, rim light, light wrap so the BG bleeds onto the character's edge, glow built from several blurred copies added with Screen/Add (narrow+strong core, wide+soft halo), subtle chromatic aberration for special shots, grain, vignette, flicker. | Rayjii "Anime Compositing – Simple Beginners" https://www.youtube.com/watch?v=YqhZ3aqY560 ; Dong Chang "Anime Compositing in AE" (OLM / F's plugins) https://www.youtube.com/watch?v=MN518F3vOvE ; 3DCineTV anime look (gradients, CA in special cases) https://3dcinetv.com/how-to-create-the-classic-anime-style-look ; layered-glow method (blur radius doubling per layer, Add/Screen) http://compojigoku.blog.fc2.com/blog-entry-3.html ; T-光 / effects lighting (WEBアニメスタイル) https://animestyle.jp/2016/03/07/9837/ ; light backdrop for shock scenes https://www.youtube.com/watch?v=b34PMFg6A9Q |
| Impact frames | 1–3 frames that break the look: inverted / two-tone, posterised, speed lines, then a flash. | 327 Robots "Impact frames" https://327robots.wordpress.com/2020/10/03/impact-frames |
| Speed lines, embers | Radial line overlay; CC Particle World / Particular for sparks rising. | — |

## 2. The same thing in code

| AE idea | Code equivalent used here |
|---|---|
| 3D layers + camera | One "camera" (scale + focus point + shake) and a depth factor per layer: `base = focus + (screen - centre - shake*d) / (1 + (camScale-1)*d)`. d=0.4 for the far eye plate, 1.0 for the carriage, 1.2 for the character. |
| Puppet pin sway | Backward-mapped UV displacement in the fragment shader: `uv.x += mask * A * sin(t*ω + uv.y*k)`, with masks for hair (top of head, face excluded = "starch") and scarf ends, plus a breathing lift. A PixiJS `MeshPlane` / three.js `PlaneGeometry` vertex warp is the mesh alternative (https://pixijs.download/release/docs/scene.MeshPlane.html ; https://tympanus.net/codrops/2020/03/17/create-a-wave-motion-effect-on-an-image-with-three-js/). |
| Blink swaps | Procedural lid: inside an eye ellipse, fill above a descending lid line with sampled skin colour + a dark lash line; keep dark hair pixels on the ellipse rim. |
| Expression swap | Cut to a second face plate (calm → shocked) hidden under a 2-frame flash + snap zoom. |
| Glowing monster eye | Fragment shader on the eye plate: radial remap `r' = R*(r/R)^k` (k>1 dilates the pupil), swirl angle offset near the iris, fbm heat-haze UV wobble, emissive boost on hot pixels, animated almond eyelid mask for the "opening". |
| Glow / bloom | Bright pass (luma threshold) → 1/4-res separable Gaussian → 1/8-res Gaussian; add both (narrow + wide), tinted warm. |
| Rim light / light wrap | Rim = alpha minus alpha sampled a few px toward the light; light wrap = (1 − blurred alpha) × background colour added inside the edge. |
| Gradient lighting | Multiply the character by a vertical ramp (darker toward the floor) and tint with the red key light. |
| Flicker | Per-frame light level from a hashed frame list (deterministic). |
| CA, grain, vignette | Final pass: R/B sampled at ±radial offset, hashed grain per frame, radial vignette. |
| Impact frames / speed lines / gloom lines | Final pass modes: luma threshold → two-tone red/black, then white; radial hashed lines; vertical "tate-sen" shock lines from the top. |
| Determinism | Remotion: every value derived from `useCurrentFrame()`; WebGL2 drawn synchronously in `useLayoutEffect` with `delayRender/continueRender`, `preserveDrawingBuffer: true`; render with `gl: "swangle"` on a headless box. Remotion docs: https://www.remotion.dev/docs/webgl , https://www.remotion.dev/docs/three-canvas |

## 3. Files of this build
- Art layers: /workspace/work/ae2d/ae2d_*.png (generated), keyed layers in /workspace/work/ae2d/layers/, copied to /workspace/work/samjho/remotion/public/ae2d/
- Code: /workspace/work/samjho/remotion/src/ae2d/{shaders.ts,timeline.ts,AnimeTrain.tsx,index.tsx}; render scripts /workspace/work/samjho/remotion/ae2d_stills.mjs, ae2d_render.mjs
- Output: /workspace/work/ae2d/anime_train_eye.mp4, /workspace/work/ae2d/out_sheet.jpg
