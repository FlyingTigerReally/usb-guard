
varying vec2 vUv;varying float vDepth;uniform float uTime,uScroll;void main(){vUv=uv;vec3 p=position;p.xy*=1.+sin(p.z*.15+uTime*.15)*.08;vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}
