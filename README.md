# Anime Train Eye

**Live:** https://abhi478jeetur-rgb.github.io/anime-train-eye/

An original 14-second vertical (1080×1920, 30 fps) anime shot. A girl sits on a red-lit night train, and a colossal glowing eye opens outside the windows. It is built like an After Effects 2D compositing job (multiplane parallax, puppet-style hair and scarf sway, blinks, satsuei glow, flicker, chromatic aberration, grain, camera shake, impact frames), but it runs as WebGL2 shaders on your own GPU.

- **▶ Start Animation**: plays live with sound. The frame clock comes from `AudioContext.currentTime`, so picture and sound stay in sync.
- **⬇ Render & Download**: renders every frame offline with fixed timing (`t = frame / 30`). It encodes with WebCodecs (`VideoEncoder` H.264 → MP4, or VP9 → WebM if H.264 is not available; `AudioEncoder` AAC or Opus) and muxes in the browser, then gives you a download. If your browser has no WebCodecs, the page records the live playback with `MediaRecorder` instead.

Works best in desktop Chrome or Edge. Safari and Firefox fall back to whatever codecs they support.

## Files
- `index.html`, `app.js`: the page and its bundled runtime. Source is in `src/` (`shaders.ts` holds the scene, bloom and final passes; `timeline.ts` holds the beat sheet; `main.ts` holds the renderer, UI and encoder).
- `assets/`: still layers made with an image model (carriage plate with keyed windows, monster-eye plate, seated character, two close-up faces) and `soundtrack.mp3`.
- `vendor/`: [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) and [webm-muxer](https://github.com/Vanilagy/webm-muxer) by Vanilagy, MIT licence (licences included).

Rebuild: `esbuild src/main.ts --bundle --format=iife --target=es2020 --outfile=app.js`

## Sound credits
The soundtrack is a mix of library sound effects. Nothing in it is synthesized.
| Effect | Source | Licence |
|---|---|---|
| Sci-fi machine deep hum (mixkit-2137) | Mixkit | Mixkit Sound Effects Free License |
| Deep cinematic wind hum (mixkit-1177) | Mixkit | Mixkit Sound Effects Free License |
| Electric buzz glitch (mixkit-2594) ×2 | Mixkit | Mixkit Sound Effects Free License |
| Small electric glitch (mixkit-2595) | Mixkit | Mixkit Sound Effects Free License |
| Deep heartbeat impact (mixkit-498) | Mixkit | Mixkit Sound Effects Free License |
| Bass rumble hum (mixkit-2297) | Mixkit | Mixkit Sound Effects Free License |
| Big cinematic impact (mixkit-788) | Mixkit | Mixkit Sound Effects Free License |
| Cinematic Reverse 11 | VideoEditingSFX free pack | CC0 1.0 |

Mixkit licence: https://mixkit.co/license/#sfxFree. It allows commercial use with no attribution required.

Style reference (studied, not copied): "I Made This 2D Animation in Just 7 Hours | After Effects Speed Project" by @Visarg.
