
uniform sampler2D uPrevious;uniform vec2 uPointer,uVelocity;uniform float uDecay,uAspect;varying vec2 vUv;
void main(){vec2 old=texture2D(uPrevious,vUv).rg;vec2 p=vUv-uPointer;p.x*=uAspect;float stamp=exp(-dot(p,p)*220.);vec2 flow=(old-.5)*uDecay+uVelocity*stamp*.16;gl_FragColor=vec4(clamp(flow+vec2(.5),0.,1.),0.,1.);}
