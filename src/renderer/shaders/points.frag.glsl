
uniform vec3 uColor;varying float vLight,vAlpha;
void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.1,d)*vAlpha;gl_FragColor=vec4(mix(uColor,vec3(.94,1.,.82),vLight*.7),a);}
