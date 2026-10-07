'use strict';
// ============================================================================
// js/core/models.js — carregamento de modelos 3D (.glb/.gltf) da pasta assets/models/, com cache
// Fluxo do jogo: main.js chama Models.preload(MODEL_DEFS) antes de criar o Game;
//                depois, Models.get('hammer') devolve uma cópia pronta (ou null se não carregou).
// Uso avulso:    Models.load('items/martelo.glb').then(gltf=>{ scene.add(gltf.scene); });
//                gltf.animations traz as animações (tocar com new THREE.AnimationMixer(gltf.scene)).
// Precisa do jogo rodando por servidor ("npm run dev"): aberto com duplo clique (file://) o navegador bloqueia.
// ============================================================================
const Models={
  BASE:'assets/models/',
  cache:new Map(),     // arquivo → Promise<gltf>
  ready:new Map(),     // id do catálogo → { scene, def }
  loader:null,
  load(file){
    if(!this.cache.has(file)){
      this.loader=this.loader||new THREE.GLTFLoader();
      const p=new Promise((resolve,reject)=>this.loader.load(this.BASE+file,resolve,undefined,
        err=>{ this.cache.delete(file); reject(err); }));
      this.cache.set(file,p);
    }
    return this.cache.get(file);
  },
  // carrega todo o catálogo; nunca rejeita — o que falhar fica de fora e o jogo usa o modelo feito por código
  preload(defs){
    if(location.protocol==='file:'){
      console.warn('Models: jogo aberto por duplo clique; modelos 3D desativados. Rode "npm run dev" para usá-los.');
      return Promise.resolve();
    }
    return Promise.all(Object.entries(defs).map(([id,def])=>this.load(def.file)
      .then(gltf=>{ this.ready.set(id,{scene:gltf.scene,def}); })
      .catch(err=>console.warn(`Models: falha ao carregar "${def.file}" (${id}); usando o modelo padrão.`,err))));
  },
  // cópia independente do modelo, já com escala/rotação/deslocamento do catálogo; null se não carregou
  get(id){
    const r=this.ready.get(id); if(!r) return null;
    const d=r.def, m=r.scene.clone(true), g=new THREE.Group();
    m.scale.setScalar(d.scale||1);
    if(d.rotation) m.rotation.set(...d.rotation);
    if(d.offset) m.position.set(...d.offset);
    g.add(m); return g;
  }
};
