
varying vec3 vNormal,vWorld;varying vec4 vClip;
void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*normal);vClip=projectionMatrix*viewMatrix*world;gl_Position=vClip;}
