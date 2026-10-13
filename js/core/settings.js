'use strict';
// ============================================================================
// js/core/settings.js — configurações persistidas
// ============================================================================
const Settings={
  KEY:'silos.settings.v1',
  defaults:{ master:.8, music:.6, sfx:.8, brightness:1, fov:75, quality:'medium', viewDistance:'normal', sensitivity:1, invertY:false,
    vrTurn:'30', vrVignette:true, devConsoleEnabled:false },   // VR: giro em passos de 30°/45° ou '0' = suave; vinheta de conforto ao andar
  data:null,
  load(){ let d={}; try{ d=JSON.parse((LS&&LS.getItem(this.KEY))||'{}')||{}; }catch(e){ d={}; }
    this.data=Object.assign({},this.defaults);
    for(const k in this.defaults) if(typeof d[k]===typeof this.defaults[k]) this.data[k]=d[k]; },
  set(k,v){ this.data[k]=v; try{ LS&&LS.setItem(this.KEY,JSON.stringify(this.data)); }catch(e){} }
};
Settings.load();
