
uniform sampler2D uBackdrop;uniform float uTime,uAlpha;varying vec3 vNormal,vWorld;varying vec4 vClip;
void main(){vec3 n=normalize(vNormal);vec3 eye=normalize(cameraPosition-vWorld);float fres=pow(1.-abs(dot(n,eye)),2.2);vec2 uv=vClip.xy/vClip.w*.5+.5;vec2 offset=n.xy*.065;
vec3 refr=vec3(texture2D(uBackdrop,uv+offset*1.05).r,texture2D(uBackdrop,uv+offset).g,texture2D(uBackdrop,uv+offset*.94).b);
vec3 env=mix(vec3(.1,.32,.36),vec3(.75,.94,.85),n.y*.5+.5);
float spec=pow(max(0.,dot(reflect(-eye,n),normalize(vec3(-1.,2.,3.)))),40.);
gl_FragColor=vec4(mix(refr,env,.34)+fres*.55+spec*.8,uAlpha*(.55+fres*.4));}
