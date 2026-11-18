
attribute vec3 aFace1,aFace2;attribute float aSeed,aShade;uniform float uTime,uTeam,uPixel,uAlpha,uPulse;uniform vec2 uPointer;varying float vLight,vAlpha,vShade;
#include <guard_noise>
void main(){vec3 p=mix(position,aFace1,clamp(uTeam,0.,1.));p=mix(p,aFace2,clamp(uTeam-1.,0.,1.));
float n=noise3(p*2.+uTime*.2);p+=normalize(p+.001)*sin(aSeed*60.+uTime)*.015;
float d=length(p.xy-uPointer*3.);p.z+=exp(-d*d*1.5)*(.16+uPulse*.3);
vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(uPixel*(11.+aSeed*6.)/-mv.z,1.,4.);
vShade=aShade;vLight=.25+n*.5+max(0.,p.z)*.18;vAlpha=uAlpha*(.45+aSeed*.55);}
