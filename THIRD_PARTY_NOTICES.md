# Pointer screen-paint effect

The pointer flow simulation and signed chromatic-shift equations are adapted from the user-provided reference project at `C:/Users/Administrator/Desktop/blog`:

- `src/three/lusion/effects/screen-paint.js`
- `src/three/lusion/effects/paint-distortion.js`
- `src/three/lusion/shaders/screen-paint-frag-n.frag.glsl`
- `src/three/lusion/shaders/screen-paint-distortion-frag-1.frag.glsl`

That project's `NOTICE.md` attributes the original visual code and GLSL to Lusion (https://lusion.co/), obtained from public scripts on 2026-11-16. Those rights remain with their respective owners; this project does not relicense the adapted portions under its MIT license.

The Electron lifecycle, shared shader loading, transparent DOM overlay, input handling, quality controls and render-target ownership are integrated for USB Guard. No reference models, image textures, fonts or audio are required by the pointer effect.
