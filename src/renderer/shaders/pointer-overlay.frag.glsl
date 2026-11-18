// Screen-paint flow adapted from the blog; see THIRD_PARTY_NOTICES.md.
// Neutral hard-light values preserve the native HTML beneath the liquid.
uniform sampler2D uPaint;
uniform vec2 uTexel;
uniform float uDark;
varying vec2 vUv;

void main() {
  vec4 data = texture2D(uPaint, vUv);
  float weight = (data.z + data.w) * 0.5;
  vec2 vel = (0.5 - data.xy - 0.001) * 2.0 * weight;
  float activity = max(abs(vel.x), abs(vel.y));
  vec2 gradient = vec2(
    texture2D(uPaint, vUv + vec2(uTexel.x, 0.0)).z -
    texture2D(uPaint, vUv - vec2(uTexel.x, 0.0)).z,
    texture2D(uPaint, vUv + vec2(0.0, uTexel.y)).z -
    texture2D(uPaint, vUv - vec2(0.0, uTexel.y)).z
  );
  float rim = clamp(length(gradient) * 3.0, 0.0, 1.0) * smoothstep(0.015, 0.12, weight);
  float ripple = sin((vel.x + vel.y) * 40.0 + weight * 8.0);
  // USB Guard's mint highlight and blue action accent, without rainbow hues.
  vec3 mint = vec3(0.55, 0.84, 0.66);
  vec3 blue = vec3(0.14, 0.35, 0.93);
  vec3 tint = mix(mint, blue, (0.5 + 0.5 * ripple) * 0.65);
  float alpha = clamp(activity * 4.0 + rim * 0.25, 0.0, 0.34);
  if (alpha < 0.001) discard;
  vec3 shade = mix((tint - 1.0) * 0.32, tint * 0.42, uDark);
  // White glints and a darker inner edge make the liquid read as translucent.
  shade += vec3(ripple * rim * 0.12);
  gl_FragColor = vec4(clamp(0.5 + shade, 0.0, 1.0), alpha);
}
