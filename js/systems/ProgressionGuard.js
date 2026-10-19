'use strict';
// Filtra apenas observações de posição; não pausa puzzles nem substitui a posição do jogador.
class ProgressionGuard{
  constructor(){this.reset();}
  reset(){this._protected=new Map();}
  static copy(s){return {...s,values:JSON.parse(JSON.stringify(s.values))};}
  discontinue(before,after){
    for(const [id,raw] of after){
      const old=this._protected.get(id),a=old?old.logical:before.get(id);
      if(!a)continue;
      if(old||raw.inside||a.inside!==raw.inside||JSON.stringify(a.values)!==JSON.stringify(raw.values)){
        this._protected.set(id,{logical:ProgressionGuard.copy(a),phase:raw.inside?'need-exit':a.inside?'need-return':'need-entry',releaseOnExit:false,lastPoint:null,witness:false});
      }
    }
  }
  advance(frame,motion={segments:[]}){
    const out=new Map();
    const segments=(motion.segments||[]).filter(s=>s.source==='normal'&&s.from&&s.to&&s.from.distanceToSquared(s.to)>1e-12);
    for(const [id,raw] of frame){
      const p=this._protected.get(id);
      if(!p){out.set(id,ProgressionGuard.copy(raw));continue;}
      if(id==='mass:height'&&segments.length)this._protected.delete(id);
      else if(typeof raw.contains==='function') for(const s of segments){
        if(!p.lastPoint||p.lastPoint.distanceToSquared(s.from)>1e-6)p.witness=false;
        const exiting=p.phase==='need-exit';
        const start=exiting?raw.contains(s.from,-.02):!raw.contains(s.from,.02);
        const end=exiting?!raw.contains(s.to,.02):raw.contains(s.to,-.02);
        p.witness=p.witness||start;p.lastPoint=s.to.clone();
        if(p.witness&&end){
          p.witness=false;
          if(p.phase==='need-return'){p.phase='need-exit';p.releaseOnExit=true;}
          else if(p.phase==='need-exit'&&!p.releaseOnExit)p.phase='need-entry';
          else {this._protected.delete(id);break;}
        }
      }
      out.set(id,ProgressionGuard.copy(this._protected.has(id)?p.logical:raw));
    }
    return out;
  }
  isProtected(id){return this._protected.has(id);}
  protectedTriggers(){
    const actions={'need-exit':'Saia da região com locomoção normal','need-entry':'Reentre na região com locomoção normal','need-return':'Retorne à região normalmente e depois saia'};
    return Array.from(this._protected,([id,p])=>({id,phase:p.phase,instruction:id==='mass:height'?'Mova o corpo normalmente':actions[p.phase]})).sort((a,b)=>a.id.localeCompare(b.id));
  }
}
