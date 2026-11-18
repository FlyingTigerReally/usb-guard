
uniform float uTime,uPixel,uPulse,uAlpha;uniform vec2 uPointer;varying float vLight,vAlpha;
#include <guard_noise>
void main(){vec3 p=position;float valley=pow(abs(p.x)*.28,1.65);
float wave=sin(p.z*.75+uTime*.3)*.35+noise3(vec3(p.x*.4,p.z*.3,uTime*.12))*1.6;
p.y+=valley+wave;float d=length(p.xz-uPointer*6.);p.y+=exp(-d*d*.12)*uPulse;
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
gl_PointSize=clamp(uPixel*(18.+8.*noise3(p))/(-mv.z),1.,4.);
vLight=clamp(wave*.5+valley*.1,.1,1.);vAlpha=uAlpha*clamp(1.-abs(p.z)*.018,.1,1.);}
