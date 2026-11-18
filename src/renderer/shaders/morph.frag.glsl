
uniform vec3 uColor;varying float vLight,vAlpha,vShade;
void main(){float d=length(gl_PointCoord-.5);if(d>.48)discard;vec3 color=mix(uColor,vec3(.85,1.,.8),vLight*.5)*vShade;
gl_FragColor=vec4(color,smoothstep(.5,.15,d)*vAlpha);}
