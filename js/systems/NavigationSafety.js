'use strict';
// Consultas somente leitura. Um destino de inspeção jamais movimenta mecanismos para caber o corpo.
// O que há em cada lugar do goto list (curto, só o que se vê ali; nada sobre o que vem depois)
const PLACE_NOTES=Object.freeze({
  cp1:'primeiro descanso',atalho:'viga suspensa, sem chão (bônus)',cp2:'anel de grade em volta do poço',
  cp3:'caixa: 3 pregos · bilhete das três frentes',cp4:'estação E1 · terminal · caixa: pílula e pregos',
  bombas:'entrada da ala (energia e bombas)',cp_duto1:'porta de saída da Casa das Bombas',
  cp6:'caixa: pregos e 1ª picareta',cp7:'entrada da galeria do exaustor',cp_exa:'topo da escada de serviço',
  cp8:'estação E2 · caixa: pílula e pregos',cp_patio:'Casa de Força e Estufa',cp_duto2:'chegada do elevador de carga',
  cp10:'grade sobre o insuflador',cp_ins:'deck onde o insuflador deixa',cp11:'caixa: pílula, pregos e 2ª picareta',
  cp12:'caixa: 3 pregos · bilhete do rádio',arquivo:'antes do mural e do labirinto',cp13:'saída do Arquivo pelo duto',
  cp14:'estação E3 · caixa: 3 pregos',cp15:'ponte sobre o poço · caixa: pílula e pregos',cp16:'último descanso · caixa: 3 pregos'
});
class NavigationSafety{
  constructor(game){this.game=game;}
  static clonePose(p){return {position:p.position.clone(),yaw:p.yaw,pitch:p.pitch};}
  // goto list: uma linha por lugar, com o que há ali (caixa, estação, ala). Aliases da spec continuam aceitos pelo goto,
  // mas não são listados (levam ao mesmo ponto de um checkpoint); o atalho é suspenso e o goto o recusa.
  catalog(){
    const w=this.game.world,byCheckpoint=(id)=>()=>this._checkpoint(id);
    const entries=w.checkpoints.map(c=>({id:c.id,name:c.label||c.id,height:c.position.y,note:PLACE_NOTES[c.id]||'',
      listed:c.id!=='atalho',resolve:byCheckpoint(c.id)}));
    for(const [id,ref] of [['subida1','cp2'],['subida2','cp_duto1'],['subida2b','cp_exa'],['subida3a','cp_duto2'],['subida3b','cp_ins'],['subida4','cp13'],['mezanino','cp8']]){
      const c=w.checkpoints.find(c=>c.id===ref);
      entries.push({id,name:c?(c.label||ref):ref,height:c?c.position.y:null,note:'mesmo ponto de '+ref,listed:false,resolve:byCheckpoint(ref)});
    }
    entries.push({id:'bombas',name:'Casa das Bombas',height:100,note:PLACE_NOTES.bombas,listed:true,resolve:()=>{
      const g=w.halls.find(h=>h.cfg&&h.cfg.id==='h1');return g?this._near(g.fr.p(g.uN+1.2,g.H,g.vin),null):null;
    }},{id:'arquivo',name:'Arquivo',height:300,note:PLACE_NOTES.arquivo,listed:true,resolve:()=>{
      const r=w.puzzleRooms.mz300;return r&&r.info?this._near(new V3(0,r.baseY,r.info.zA-.8),null):null;
    }});
    return entries.sort((a,b)=>(a.height??Infinity)-(b.height??Infinity)||a.id.localeCompare(b.id));
  }
  _checkpoint(id){const c=this.game.world.checkpoints.find(c=>c.id===id);return c?this._near(c.position,c.bounds||null):null;}
  _pose(p){return {position:p.clone(),yaw:Math.atan2(p.x,p.z),pitch:0};}
  _near(p,bounds){
    const w=this.game.world,candidates=[];
    const add=(x,z,b)=>{const q=solidClampIn(b,x,z,RAD+.015);candidates.push(new V3(q.x,b.top,q.z));};
    const supports=bounds&&w.platforms.includes(bounds)?[bounds]:w.platforms.filter(b=>Math.abs(b.top-p.y)<.04&&solidDistXZ(b,p.x,p.z)<2.5);
    for(const b of supports){
      add(p.x,p.z,b);add((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2,b);
      for(let x=b.minX;x<=b.maxX+.001;x+=.4)for(let z=b.minZ;z<=b.maxZ+.001;z+=.4){if(Math.hypot(x-p.x,z-p.z)<4)add(x,z,b);}
    }
    candidates.sort((a,b)=>a.distanceToSquared(p)-b.distanceToSquared(p));
    // diagnóstico: guarda o motivo do candidato mais próximo (só texto, nenhum estado do jogo)
    let why=candidates.length?null:'Sem apoio estável para o corpo inteiro';
    for(const q of candidates){const pose=this._pose(q),c=this.check(pose);if(c.ok)return pose;why=why||c.reason;}
    this._why=why;return null;
  }
  check(pose){
    const w=this.game.world,p=pose&&pose.position;
    if(!p||![p.x,p.y,p.z,pose.yaw,pose.pitch].every(Number.isFinite))return {ok:false,reason:'Pose inválida'};
    const clear=bodyClearAt(w,p);if(!clear.ok)return clear;
    const region=w.bodyRegionAt(p);if(!region.ok)return region;
    const support=w.platforms.find(b=>Math.abs(b.top-p.y)<=1e-3&&solidSupportsCircle(b,p.x,p.z)&&!this._unstable(b));
    if(!support)return {ok:false,reason:'Sem apoio estável para o corpo inteiro'};
    const m=this.game.mass;if(m&&m.active&&m.reaches({position:p}))return {ok:false,reason:'Massa alcança este apoio'};
    // wind() só cria cache no fan. Proxies locais mantêm a consulta realmente não mutante.
    if(w.wind){const proxy=Object.create(w);proxy.fans=(w.fans||[]).map(f=>Object.create(f));const air=proxy.wind(p);if(air&&air.kill)return {ok:false,reason:'Pás letais'};}
    else for(const f of w.fans||[]){const s=f.sample(p.x,p.y+1,p.z);if(s&&f.mode==='pull'&&s.d<f.kill&&s.rho<f.radius)return {ok:false,reason:'Pás letais'};}
    return {ok:true,reason:'',support};
  }
  _unstable(b){return (this.game.world.crumbling||[]).some(m=>{const u=m.userData;return (u.plat===b||u.solid===b)&&(u.alive===false||u.crumbleT!=null);});}
  resolve(id){
    const d=this.catalog().find(d=>d.id===id);if(!d)return {ok:false,message:'Destino inexistente: '+id};
    this._why=null;const pose=d.resolve();if(!pose)return {ok:false,message:'Sem apoio seguro atual para '+id+(this._why?': '+this._why:'')};
    const c=this.check(pose);if(!c.ok)return {ok:false,message:'Sem apoio seguro atual para '+id+': '+c.reason};
    return {ok:true,pose,destinationId:id,message:`${d.name} (${id}), ${(Math.round(pose.position.y*10)/10).toLocaleString('pt-BR')} m${d.listed!==false&&d.note?' · '+d.note:''}.`};
  }
  _connected(from,to){
    const w=this.game.world,delta=from.distanceTo(to);
    // Uma correção é local e apoiada: não é um segundo teleporte disfarçado.
    if(delta>4||Math.abs(from.y-to.y)>.04)return false;
    const original=new Set(bodyObstaclesAt(w,from));
    const depth=(b,p)=>{const q={x:p.x,y:p.y,z:p.z},v={x:0,z:0};solidPush(b,q,v,RAD);return Math.hypot(q.x-p.x,q.z-p.z);};
    const previous=new Map([...original].map(b=>[b,depth(b,from)]));
    const steps=Math.max(1,Math.ceil(delta/.02));
    for(let i=0;i<=steps;i++){
      const p=new V3().lerpVectors(from,to,i/steps);
      if(!w.bodyRegionAt(p).ok)return false;
      if(!w.platforms.some(b=>Math.abs(b.top-p.y)<=.04&&solidSupportsCircle(b,p.x,p.z)&&!this._unstable(b)))return false;
      const overlaps=new Set(bodyObstaclesAt(w,p));
      for(const b of overlaps){if(!original.has(b))return false;const d=depth(b,p);if(d>(previous.get(b)||0)+1e-5)return false;previous.set(b,d);}
      for(const b of original)if(!overlaps.has(b))original.delete(b);
    }
    return true;
  }
  recover(desired,lastSafe){
    if(!desired||!desired.position)return {ok:false,message:'Posição de retorno ausente'};
    const exact=this.check(desired);if(exact.ok)return {ok:true,pose:NavigationSafety.clonePose(desired),message:'Posição segura',fallback:false};
    // Passo 1 (posição atual): até ~4 cm é tolerância de contato/precisão, só na vertical e no mesmo XZ.
    // Não é busca de piso: acima disso segue o P2 (lastSafe/apoio local no mesmo nível) ou recusa.
    const at=desired.position,contact=this.game.world.platforms.filter(b=>Math.abs(b.top-at.y)<=.04&&solidSupportsCircle(b,at.x,at.z)).sort((a,b)=>Math.abs(a.top-at.y)-Math.abs(b.top-at.y));
    for(const b of contact){const q={position:new V3(at.x,b.top,at.z),yaw:desired.yaw,pitch:desired.pitch};if(this.check(q).ok)return {ok:true,pose:q,message:'Posição segura (contato ajustado '+(Math.abs(b.top-at.y)*100).toFixed(1)+' cm)',fallback:false};}
    const candidates=[];
    if(lastSafe)candidates.push({pose:NavigationSafety.clonePose(lastSafe),id:'último apoio seguro',priority:0});
    const w=this.game.world,p=desired.position;
    w.platforms.forEach((b,i)=>{
      if(Math.abs(b.top-p.y)>.04||solidDistXZ(b,p.x,p.z)>4)return;
      const add=(x,z)=>{const q=solidClampIn(b,x,z,RAD+.015);candidates.push({pose:this._pose(new V3(q.x,b.top,q.z)),id:'apoio '+i,priority:1});};
      add(p.x,p.z);for(let dx=-1;dx<=1.001;dx+=.1)for(let dz=-1;dz<=1.001;dz+=.1)add(p.x+dx,p.z+dz);
    });
    candidates.sort((a,b)=>a.priority-b.priority||a.pose.position.distanceToSquared(p)-b.pose.position.distanceToSquared(p)||a.id.localeCompare(b.id));
    for(const c of candidates)if(this.check(c.pose).ok&&this._connected(p,c.pose.position))return {ok:true,pose:c.pose,destinationId:c.id,fallback:true,message:`Fallback: ${exact.reason}; ${c.id} em (${c.pose.position.x.toFixed(2)}, ${c.pose.position.y.toFixed(2)}, ${c.pose.position.z.toFixed(2)})`};
    return {ok:false,message:'Sem retorno seguro e alcançável: '+exact.reason};
  }
}
