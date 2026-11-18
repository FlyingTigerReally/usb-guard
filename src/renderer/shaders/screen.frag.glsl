
// Screen-paint refraction/chromatic shift adapted from the blog reference.
// See THIRD_PARTY_NOTICES.md. Native HTML uses the separate transparent overlay.
uniform sampler2D uScene,uPaint;uniform vec2 uPaintTexel;uniform vec4 uPaintRect;uniform float uTime,uStrength;varying vec2 vUv;
void main(){
 vec2 paintUv=uPaintRect.xy+vUv*uPaintRect.zw;
 vec4 data=texture2D(uPaint,paintUv);
 float weight=(data.z+data.w)*.5;
 vec2 vel=(.5-data.xy-.001)*2.*weight*uStrength;
 vec2 direction=vel*3.75*uPaintTexel/max(uPaintRect.zw,vec2(.001));
 vec2 uv=vUv;vec3 c=vec3(0.);
 for(int i=0;i<9;i++){c+=texture2D(uScene,uv).rgb;uv+=direction;}
 c/=9.;
 float ripple=sin((vel.x+vel.y)*40.);
 vec3 tint=mix(vec3(.55,.84,.66),vec3(.14,.35,.93),(.5+.5*ripple)*.65);
 c+=(tint-.35)*ripple*(1.-smoothstep(-.9,.4,weight))*max(abs(vel.x),abs(vel.y))*4.;
 float vignette=1.-dot(vUv-.5,vUv-.5)*.42;
 gl_FragColor=vec4(max(c*vignette,0.),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
