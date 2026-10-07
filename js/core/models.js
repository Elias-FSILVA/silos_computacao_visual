'use strict';
// ============================================================================
// js/core/models.js — carregamento de modelos 3D (.glb/.gltf) da pasta assets/models/, com cache
// Uso:   Models.load('mao.glb').then(gltf=>{ scene.add(gltf.scene); });
//        gltf.animations traz as animações (tocar com new THREE.AnimationMixer(gltf.scene)).
// Cada arquivo é baixado uma vez só; para várias cópias de um modelo sem esqueleto, use gltf.scene.clone().
// Precisa do jogo rodando por servidor ("npm run dev"): aberto com duplo clique (file://) o navegador bloqueia.
// ============================================================================
const Models={
  BASE:'assets/models/',
  cache:new Map(),
  loader:null,
  load(file){
    if(!this.cache.has(file)){
      if(location.protocol==='file:') console.warn(`Models: "${file}" não carrega com o jogo aberto por duplo clique. Rode "npm run dev".`);
      this.loader=this.loader||new THREE.GLTFLoader();
      const p=new Promise((resolve,reject)=>this.loader.load(this.BASE+file,resolve,undefined,
        err=>{ this.cache.delete(file); reject(err); }));
      this.cache.set(file,p);
    }
    return this.cache.get(file);
  }
};
