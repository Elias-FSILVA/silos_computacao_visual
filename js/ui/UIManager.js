'use strict';
// ============================================================================
// js/ui/UIManager.js — menu, configurações, HUD, retícula com mãos, ranking, resultado
// Consome apenas: estado simples do gameplay (score, time, timeLeft, currentCheckpoint,
// checkpointJustCollected, finished, result) e o estado público do Player.
// ============================================================================
const HAND_OPEN='<rect x="9" y="21" width="22" height="21" rx="7"/><rect x="9" y="7" width="5" height="18" rx="2.5"/><rect x="15" y="3" width="5" height="21" rx="2.5"/><rect x="21" y="4" width="5" height="20" rx="2.5"/><rect x="27" y="9" width="4.5" height="16" rx="2.25"/><rect x="2" y="24" width="5" height="14" rx="2.5" transform="rotate(-35 4.5 31)"/>';
const HAND_CLOSED='<rect x="8" y="14" width="25" height="27" rx="8"/><rect x="4" y="25" width="15" height="6.5" rx="3.25"/>';
function staminaColor(s){ return s>60?'#c9d2d6':s>35?'#e3b341':s>15?'#e0633a':'#ff2a1a'; }

class UIManager{
  constructor(){
    this.$=id=>document.getElementById(id);
    this.screens=['menu','settings','ranking','quit','pause','result'];
    this.msgT=0; this.toastT=0; this.noteOpen=false;
    this.handEls=[this._buildHand('handL','L',true),this._buildHand('handR','R',false)];
  }
  _buildHand(id,key,mirror){
    const el=this.$(id);
    const tf=mirror?' transform="translate(40 0) scale(-1 1)"':'';
    el.innerHTML=`<svg viewBox="0 0 40 48" aria-hidden="true"><defs><clipPath id="clip${key}"><rect x="0" y="0" width="40" height="48"/></clipPath></defs>`+
      `<g${tf}><g class="open"><g class="ol">${HAND_OPEN}</g><g class="fl" clip-path="url(#clip${key})">${HAND_OPEN}</g></g>`+
      `<g class="closed"><g class="ol">${HAND_CLOSED}</g><g class="fl" clip-path="url(#clip${key})">${HAND_CLOSED}</g></g></g></svg>`;
    return {el,rect:el.querySelector('clipPath rect')};
  }
  show(name){ this.screens.forEach(s=>{ this.$(s).hidden=(s!==name); });
    const sc=name&&this.$(name), first=sc&&(sc.querySelector('input[type=text]')||sc.querySelector('button')); if(first) setTimeout(()=>first.focus({preventScroll:true}),0); }
  hideScreens(){ this.screens.forEach(s=>this.$(s).hidden=true); }
  setHUD(v){ this.$('hud').hidden=!v; }
  msg(text,d=3){ const m=this.$('msg'); m.textContent=text; m.style.opacity=1; this.msgT=d; }
  clearMsg(){ this.msgT=0; this.$('msg').style.opacity=0; this.toastT=0; this.$('toast').style.opacity=0; }
  toast(a,b,d=3){ this.$('toastA').textContent=a; this.$('toastB').textContent=b; this.$('toast').style.opacity=1; this.toastT=d; }
  tick(dt){
    if(this.msgT>0){ this.msgT-=dt; if(this.msgT<=0) this.$('msg').style.opacity=0; }
    if(this.toastT>0){ this.toastT-=dt; if(this.toastT<=0) this.$('toast').style.opacity=0; }
  }
  showNote(text,term){ const n=this.$('note'); n.textContent=text; n.className=term?'term':'';
    const s=document.createElement('small'); s.textContent='F para fechar'; n.appendChild(s); n.hidden=false; this.noteOpen=true; }
  hideNote(){ this.$('note').hidden=true; this.noteOpen=false; }
  // ---------- nome ----------
  validateName(raw){
    const v=String(raw||'').replace(/\s+/g,' ').trim();
    if(!v) return {ok:false,error:'Digite um nome para aparecer no ranking.'};
    if(v.length>16) return {ok:false,error:'Use no máximo 16 caracteres.'};
    if(!/^[\p{L}\p{N} ._-]+$/u.test(v)) return {ok:false,error:'Use letras, números, espaço, ponto, hífen ou sublinhado.'};
    return {ok:true,value:v};
  }
  // ---------- configurações ----------
  bindSettings(settings,onChange){
    this.$('settings').querySelectorAll('[data-key]').forEach(inp=>{
      const k=inp.dataset.key, out=inp.parentElement.querySelector('output');
      const fmt=v=>k==='fov'?`${v}°`:k==='brightness'||k==='sensitivity'?Number(v).toFixed(2):`${Math.round(v*100)}`;
      const sync=()=>{ const v=settings.data[k]; if(inp.type==='checkbox') inp.checked=!!v; else inp.value=v; if(out) out.textContent=fmt(v); };
      sync();
      inp.addEventListener('input',()=>{
        let v; if(inp.type==='checkbox') v=inp.checked; else if(inp.tagName==='SELECT') v=inp.value; else v=parseFloat(inp.value);
        settings.set(k,v); if(out) out.textContent=fmt(v); onChange(k,v);
      });
      inp.addEventListener('change',()=>inp.dispatchEvent(new Event('input')));
    });
  }
  // ---------- ranking ----------
  renderRanking(list,highlight){
    const body=this.$('rankBody'); body.textContent='';
    if(!list.length){ const p=document.createElement('p'); p.className='empty'; p.textContent='Nenhuma subida registrada ainda.'; body.appendChild(p); return; }
    const t=document.createElement('table'), head=t.insertRow();
    [['#','n'],['Jogador',''],['Pontos','n'],['Tempo','n'],['Resultado','']].forEach(([s,c])=>{ const th=document.createElement('th'); th.textContent=s; if(c) th.className=c; head.appendChild(th); });
    list.forEach((e,i)=>{
      const r=t.insertRow(); if(i===highlight) r.className='me';
      [[String(i+1),'n'],[e.name,''],[fmtInt(e.score),'n'],[fmtTime(e.time),'n'],[e.result==='finish'?'Saiu':e.result==='mass'?'Alcançado':'Caiu','']]
        .forEach(([s,c])=>{ const td=r.insertCell(); td.textContent=s; if(c) td.className=c; });
    });
    body.appendChild(t);
  }
  // ---------- resultado ----------
  showResult(r){
    const t=this.$('resT');
    t.textContent=r.result==='finish'?'Subida completa':r.result==='mass'?'A massa te alcançou':'Você caiu';
    t.className=r.result==='finish'?'win':'danger';
    this.$('resName').textContent=r.name; this.$('resTime').textContent=fmtTime(r.time);
    this.$('resH').textContent=`${Math.floor(r.height)} m de ${TOP} m`; this.$('resScore').textContent=fmtInt(r.breakdown.total);
    const br=this.$('resBreak'); br.textContent='';
    [['Altura',r.breakdown.height],['Marcos',r.breakdown.checkpoints],['Contenção',r.breakdown.puzzle||0],['Segredos',r.breakdown.secrets||0],['Velocidade',r.breakdown.speed],['Desempenho',r.breakdown.performance],['Penalidades',-r.breakdown.penalties]]
      .forEach(([k,v])=>{ const dt=document.createElement('dt'); dt.textContent=k; const dd=document.createElement('dd'); dd.textContent=(v<0?'−':'')+fmtInt(Math.abs(v)); br.append(dt,dd); });
    this.$('resSaved').textContent=''; const b=this.$('btnSave'); b.disabled=false; b.textContent='Salvar pontuação';
    this.show('result');
  }
  // ---------- cinematic ----------
  showCine(v){ this.$('cine').hidden=!v; }
  cine(fade,text,op){ this.$('cineFade').style.opacity=fade; const t=this.$('cineText'); if(t.textContent!==text) t.textContent=text; t.style.opacity=op; }
  // ---------- HUD ----------
  // ---------- retícula contextual ----------
  setReticle(mode){
    if(this._ret===mode) return; this._ret=mode;
    const S='var(--sodium)', B='var(--bone)', OK='#9fd6a4', NO='var(--flesh)';
    const svg={
      dot:`<circle cx="12" cy="12" r="2.4" fill="${B}" opacity=".7"/>`,
      grab:`<circle cx="12" cy="12" r="7" fill="none" stroke="${S}" stroke-width="1.6"/>`,
      pickup:`<circle cx="12" cy="12" r="6.5" fill="none" stroke="${B}" stroke-width="1.5"/><circle cx="12" cy="12" r="1.6" fill="${B}"/>`,
      panel:`<path d="M8 6H5v12h3M16 6h3v12h-3" fill="none" stroke="${B}" stroke-width="1.6"/>`,
      'nail-ok':`<path d="M12 4v16M4 12h16" stroke="${OK}" stroke-width="1.7"/><circle cx="12" cy="12" r="2" fill="${OK}"/>`,
      'nail-bad':`<path d="M12 5v14M5 12h14" stroke="${NO}" stroke-width="1.4" opacity=".7"/><path d="M8 8l8 8" stroke="${NO}" stroke-width="1.6"/>`,
      impact:`<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" stroke="${B}" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="${B}"/>`,
      fragile:`<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6.3 6.3l2.4 2.4M17.7 17.7l-2.4-2.4M17.7 6.3l-2.4 2.4M6.3 17.7l2.4-2.4" stroke="${B}" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="${B}"/>`,
      'hammer-nail':`<circle cx="12" cy="12" r="7" fill="none" stroke="${S}" stroke-width="1.6"/><path d="M12 8.5v7M8.5 12h7" stroke="${S}" stroke-width="1.6"/>`
    }[mode]||'';
    this.$('ring').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${svg}</svg>`;
  }
  // ---------- inventário ----------
  renderInventory(items){
    const inv=items.inv, key=inv.version+'|'+items.sel+'|'+inv.slots.map(s=>s?s.id+s.count:'-').join(',');
    if(this._invKey===key) return; this._invKey=key;
    const bar=this.$('slots'); bar.textContent='';
    inv.slots.forEach((s,i)=>{
      const d=document.createElement('div'); d.className='slot'+(s?'':' empty')+(items.sel===i?' sel':''); d.dataset.i=i;
      const k=document.createElement('span'); k.className='k'; k.textContent=String(i+1); d.appendChild(k);
      if(s){
        d.insertAdjacentHTML('beforeend',`<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor">${ICONS[s.id]}</g></svg>`);
        if(ITEM_DEFS[s.id].stack){ const c=document.createElement('span'); c.className='c'+(s.count===0?' zero':''); c.textContent='×'+s.count; d.appendChild(c); }
        d.title=ITEM_DEFS[s.id].name;
      }
      bar.appendChild(d);
    });
    const sel=items.sel>=0&&inv.slots[items.sel];
    this.$('slotName').textContent=sel?(ITEM_DEFS[sel.id].stack?`${ITEM_DEFS[sel.id].name} restantes: ${sel.count}`:ITEM_DEFS[sel.id].name):'';
  }
  slotPulse(i){ setTimeout(()=>{ const el=this.$('slots').querySelector(`[data-i="${i}"]`); if(el){ el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } },30); }
  // ---------- HUD ----------
  updateHUD(gs,player,look,items){
    this.$('altN').textContent=Math.max(0,Math.floor(player.position.y));
    const mn=this.$('massN'), pz=gs.puzzle;
    if(pz&&pz.phase!=='idle'&&pz.phase!=='done'){
      let t;
      if(pz.solved) t='contenção · porta liberada';
      else if(pz.failed) t='contenção falhou';
      else { const r=Math.ceil(pz.timeRemaining), m=Math.floor(r/60), s=r%60; t=`contenção · ${m}:${String(s).padStart(2,'0')}`; }
      mn.textContent=t; mn.classList.toggle('hot',!pz.solved&&(pz.failed||pz.timeRemaining<30));
    }
    else if(gs.massDistance==null){ mn.textContent='silêncio abaixo'; mn.classList.remove('hot'); }
    else { mn.textContent=`algo a ${Math.max(0,gs.massDistance).toFixed(0)} m abaixo`+(gs.timeLeft!=null?` · ~${Math.ceil(gs.timeLeft)} s`:''); mn.classList.toggle('hot',gs.massDistance<12); }
    this.$('timeN').textContent=fmtTime(gs.time);
    this.$('scoreN').textContent=`${fmtInt(gs.score)} pts`;
    this.$('cpN').textContent=gs.currentCheckpoint?`Último marco: ${gs.currentCheckpoint}`:'';
    if(gs.checkpointJustCollected){ const c=gs.checkpointJustCollected; this.toast(c.optional?'Rota arriscada':'Marco alcançado',`${c.label}  +${c.bonus}`); }
    this.setReticle(look.reticle);
    player.hands.forEach((h,i)=>{
      const {el,rect}=this.handEls[i], s=h.stamina/player.maxStamina;
      rect.setAttribute('y',String(48*(1-s))); rect.setAttribute('height',String(48*s));
      el.style.color=staminaColor(h.stamina);
      el.classList.toggle('closed',h.isGrabbing||!!h.occupied); el.classList.toggle('contact',h.inContact);
      el.classList.toggle('busy',!!h.occupied);
      el.classList.toggle('critical',h.stamina<15&&(h.inContact||h.exhausted));
    });
    const pr=this.$('prompt');
    if(pr.dataset.k!==look.prompt){ pr.dataset.k=look.prompt||''; pr.textContent='';
      if(look.prompt){ const [k,txt]=look.prompt.split('|'); const kb=document.createElement('kbd'); kb.textContent=k; pr.append(kb,txt); } }
    this.renderInventory(items);
    this.$('vig').style.opacity=gs.massDistance!=null?clamp((14-gs.massDistance)/12,0,.85):0;
    // fadiga da puxada: pulsa de leve com o "batimento" quando está crítica
    const f=player.fatigueFx||0, st=f<.005?0:Math.min(1,f*(1+Math.max(0,f-.7)*.25*Math.sin(performance.now()/1000*7.5)));
    if(Math.abs(st-(this._strain||0))>.004||(st===0&&this._strain)){ this._strain=st; this.$('strain').style.opacity=st.toFixed(3); }
  }
}
