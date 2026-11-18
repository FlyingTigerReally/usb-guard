
uniform sampler2D uTexture;uniform vec2 uStep;varying vec2 vUv;
void main(){gl_FragColor=texture2D(uTexture,vUv)*.227027;
gl_FragColor+=(texture2D(uTexture,vUv+uStep*1.384615)+texture2D(uTexture,vUv-uStep*1.384615))*.316216;
gl_FragColor+=(texture2D(uTexture,vUv+uStep*3.230769)+texture2D(uTexture,vUv-uStep*3.230769))*.070270;}
