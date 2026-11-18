
varying vec2 vUv;varying float vDepth;uniform float uTime,uScroll,uAlpha;
void main(){float z=vUv.y*32.-uTime*.35-uScroll*6.;float ring=pow(.5+.5*cos(z*6.283),35.);float rail=pow(.5+.5*cos(vUv.x*6.283*12.),90.);float flow=pow(.5+.5*sin(z*2.+vUv.x*70.),14.);
vec3 c=vec3(.025,.1,.13)+ring*vec3(.32,.52,.39)+rail*vec3(.1,.23,.27)+flow*.045;
float fog=exp(-vDepth*.025);gl_FragColor=vec4(c*fog,uAlpha);}
