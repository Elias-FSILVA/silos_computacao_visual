'use strict';
// ============================================================================
// js/ui/UIManager.js — menu, configurações, HUD, retícula com mãos, ranking, resultado
// Consome apenas: estado simples do gameplay (score, time, timeLeft, currentCheckpoint,
// checkpointJustCollected, finished, result) e o estado público do Player.
// Inventário: a hotbar (1–4) e a mochila circular (Tab) LEEM items.inv / ItemSystem.
// A única escrita da UI no jogo é inv.bind / inv.unbind (vínculos de atalho); equipar e usar continuam no ItemSystem.
// As posições dos itens dentro do círculo (this.layout) são só apresentação: id do item → {x,y}; não são dados do inventário.
// Capacidade, limites de pilha e peso vêm do Inventory (INVENTORY_CONFIG / ITEM_DEFS); a UI não tem regras por item.
// ============================================================================
const HAND_OPEN='<rect x="9" y="21" width="22" height="21" rx="7"/><rect x="9" y="7" width="5" height="18" rx="2.5"/><rect x="15" y="3" width="5" height="21" rx="2.5"/><rect x="21" y="4" width="5" height="20" rx="2.5"/><rect x="27" y="9" width="4.5" height="16" rx="2.25"/><rect x="2" y="24" width="5" height="14" rx="2.5" transform="rotate(-35 4.5 31)"/>';
const HAND_CLOSED='<rect x="8" y="14" width="25" height="27" rx="8"/><rect x="4" y="25" width="15" height="6.5" rx="3.25"/>';
function staminaColor(s){ return s>60?'#c9d2d6':s>35?'#e3b341':s>15?'#e0633a':'#ff2a1a'; }
// textos de ajuda (só apresentação; nomes e quantidades vêm de ITEM_DEFS / Inventory). Item sem texto aqui mostra só o nome.
const ITEM_HINT={
  hammer:'Botão direito: golpear. Quebra painéis frágeis e crava pregos soltos.',
  nails:'Botão direito: cravar em parede de concreto, perto.',
  pills:'Botão direito (ou Q): devolve a força das mãos.',
  card:'Para leitores de acesso.'
};
// Geometria da mochila: percentuais do lado do quadrado #pack, origem no centro, y para baixo.
//  R = raio do círculo principal · itemD = diâmetro do ícone de item · quickD = lado de cada atalho quadrado.
// Os atalhos são centrados na própria borda do círculo (metade para dentro, metade para fora).
const PACK_GEO={ R:40, itemD:13, quickD:16 };
const iconSvg=id=>`<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor">${ICONS[id]}</g></svg>`;

// rótulos dos atributos que aparecem na prévia da estação
const PERK_ATTR_LABELS={gravity:'Gravidade',maxStamina:'Stamina máx.',jumpSpeed:'Salto',wallJumpSpeed:'Salto agarrado',wallJumpStaminaCost:'Custo do salto agarrado',
  reach:'Alcance',tiredReach:'Alcance cansado',gripDrainMultiplier:'Gasto da pegada (×)',groundRecovery:'Recuperação no chão',freeHandRecovery:'Recuperação da mão livre',
  fatigueGainMultiplier:'Fadiga (×)',fatigueRecoveryMultiplier:'Recuperação da fadiga (×)'};
// ícones dos perks (SVG por código, currentColor)
const PERK_ICONS={
  economical_grip:'<path d="M7 20c0-5 2-8 5-8s5 3 5 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 12V7M12 12V5M15 12V7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  quick_recovery:'<path d="M12 4v8l5 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2"/>',
  powerful_launch:'<path d="M12 3l6 7h-4v6h-4v-6H6z" fill="currentColor"/><path d="M8 20h8" stroke="currentColor" stroke-width="2"/>',
  light_body:'<path d="M12 4c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v8" stroke="currentColor" stroke-width="1.6"/>'
};
function perkIcon(id){ return `<svg class="perk-svg" viewBox="0 0 24 24" aria-hidden="true">${PERK_ICONS[id]||''}</svg>`; }
class UIManager{
  constructor(){
    this.$=id=>document.getElementById(id);
    this.screens=['menu','settings','ranking','quit','pause','result'];
    this.msgT=0; this.toastT=0; this.noteOpen=false;
    this.packOpen=false; this.pk=null; this._packSig=null; this._packKey=null; this._invKey=null;
    this._it=null; this._pl=null; this._live=undefined; this._pd=null; this._noClick=false; this.onPackClose=null;
    this.layout=new Map();   // posição de cada item no círculo (só apresentação)
    this.handEls=[this._buildHand('handL','L',true),this._buildHand('handR','R',false)];
    this._bindPack();
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
  setHUD(v){ this.$('hud').hidden=!v; if(v) this._live=undefined; else this.setPack(false); }
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
      [[String(i+1),'n'],[e.name,''],[fmtInt(e.score),'n'],[fmtTime(e.time),'n'],[e.result==='finish'?('Saiu'+(e.ending&&ENDINGS[e.ending]?` · ${ENDINGS[e.ending].name}`:'')):e.result==='mass'?'Alcançado':e.result==='fan'?'Sugado':'Caiu','']]
        .forEach(([s,c])=>{ const td=r.insertCell(); td.textContent=s; if(c) td.className=c; });
    });
    body.appendChild(t);
  }
  // ---------- resultado ----------
  showResult(r){
    const t=this.$('resT');
    const E=r.result==='finish'&&ENDINGS[r.ending||'escape'];
    t.textContent=r.result==='finish'?(E?E.name:'Subida completa'):r.result==='mass'?'A massa te alcançou':r.result==='fan'?'O exaustor te puxou':'Você caiu';
    const et=this.$('resEnd'); et.textContent=E?`FINAL · ${E.tag}\n\n${E.text}`:''; et.hidden=!E;
    t.className=r.result==='finish'?'win':'danger';
    this.$('resName').textContent=r.name; this.$('resTime').textContent=fmtTime(r.time);
    this.$('resH').textContent=`${Math.floor(r.height)} m de ${TOP} m`; this.$('resScore').textContent=fmtInt(r.breakdown.total);
    const br=this.$('resBreak'); br.textContent='';
    [['Altura',r.breakdown.height],['Marcos',r.breakdown.checkpoints],['Destinos',r.breakdown.puzzle||0],['Segredos',r.breakdown.secrets||0],['Velocidade',r.breakdown.speed],['Desempenho',r.breakdown.performance],['Penalidades',-r.breakdown.penalties]]
      .forEach(([k,v])=>{ const dt=document.createElement('dt'); dt.textContent=k; const dd=document.createElement('dd'); dd.textContent=(v<0?'−':'')+fmtInt(Math.abs(v)); br.append(dt,dd); });
    this.$('resSaved').textContent=''; const b=this.$('btnSave'); b.disabled=false; b.textContent='Salvar pontuação';
    this.show('result');
  }
  // ---------- cinematic ----------
  showCine(v){ this.$('cine').hidden=!v; }
  cine(fade,text,op){ this.$('cineFade').style.opacity=fade; const t=this.$('cineText'); if(t.textContent!==text) t.textContent=text; t.style.opacity=op; }
  // ---------- retícula contextual ----------
  setReticle(mode){
    if(this._ret===mode) return; this._ret=mode;
    // interação disponível (F, ou clique no painel de senha): mão petrificada com a ponta do indicador no centro da mira (css/cursor.css)
    if(mode==='pickup'||mode==='panel'){ this.$('ring').innerHTML='<span class="stone-hand" aria-hidden="true"></span>'; return; }
    const S='var(--sodium)', B='var(--bone)', OK='#9fd6a4', NO='var(--flesh)';
    const svg={
      dot:`<circle cx="12" cy="12" r="2.4" fill="${B}" opacity=".7"/>`,
      grab:`<circle cx="12" cy="12" r="7" fill="none" stroke="${S}" stroke-width="1.6"/>`,
      'nail-ok':`<path d="M12 4v16M4 12h16" stroke="${OK}" stroke-width="1.7"/><circle cx="12" cy="12" r="2" fill="${OK}"/>`,
      'nail-bad':`<path d="M12 5v14M5 12h14" stroke="${NO}" stroke-width="1.4" opacity=".7"/><path d="M8 8l8 8" stroke="${NO}" stroke-width="1.6"/>`,
      impact:`<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" stroke="${B}" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="${B}"/>`,
      fragile:`<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6.3 6.3l2.4 2.4M17.7 17.7l-2.4-2.4M17.7 6.3l-2.4 2.4M6.3 17.7l2.4-2.4" stroke="${B}" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="${B}"/>`,
      axe:`<path d="M7 17l7.5-7.5M10.5 6.5c2.6-1.6 5.6-1.4 7.5.4" stroke="${OK}" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="${OK}"/>`,
      'axe-bad':`<path d="M8 8l8 8M16 8l-8 8" stroke="${NO}" stroke-width="1.4" opacity=".75"/>`,
      'hammer-nail':`<circle cx="12" cy="12" r="7" fill="none" stroke="${S}" stroke-width="1.6"/><path d="M12 8.5v7M8.5 12h7" stroke="${S}" stroke-width="1.6"/>`
    }[mode]||'';
    this.$('ring').innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${svg}</svg>`;
  }
  // ---------- estações de melhoria e perks ativos (só leitura: view do Game, PERK_DEFS, attributes) ----------
  showStation(v){
    const P=this.$('stationPanel'), fmt=n=>(Math.round(n*100)/100).toLocaleString('pt-BR');
    const lines=pv=>pv?Object.keys(pv.after).filter(k=>Math.abs(pv.after[k]-pv.before[k])>1e-9).map(k=>
      `<li><span>${PERK_ATTR_LABELS[k]||k}</span> <b>${fmt(pv.before[k])} → ${fmt(pv.after[k])}</b></li>`).join(''):'';
    const cards=v.offers.map((o,i)=>`<button type="button" class="pcard${v.sel===i?' sel':''}" data-i="${i}" aria-pressed="${v.sel===i}">`+
      `<span class="pk">${i+1}</span>${perkIcon(o.id)}<span class="pn">${o.name}</span>`+
      `<span class="pb">+ ${o.benefit}</span><span class="pt">− ${o.tradeoff}</span><ul class="pp">${lines(o.preview)}</ul></button>`).join('');
    const act=v.active.length?v.active.map(id=>`${perkIcon(id)}<span>${PERK_DEFS[id].name}</span>`).join(' · '):'nenhuma';
    P.innerHTML=`<div class="sp-head"><span class="sp-kicker">Estação de melhoria</span><h2>${v.station.label}</h2><p class="sp-ahead">${v.station.ahead}</p></div>`+
      `<div class="sp-cards">${cards}</div>`+
      `<div class="sp-foot"><span class="sp-active">Ativas: ${act} <b>${v.count}/${v.max}</b></span>`+
      `<button type="button" class="mbtn" data-act="confirm"${v.sel<0?' disabled':''}>Escolher <kbd>Enter</kbd></button>`+
      `<button type="button" class="mbtn ghost" data-act="ignore">Ignorar <kbd>Esc</kbd></button></div>`+
      `<p class="sp-legend"><kbd>1</kbd> <kbd>2</kbd> selecionam · <kbd>Enter</kbd> confirma · <kbd>Esc</kbd> ignora (a estação continua disponível)</p>`;
    P.hidden=false; if(typeof document!=='undefined'&&document.body) document.body.classList.add('station-open');
  }
  hideStation(){ const P=this.$('stationPanel'); P.hidden=true; P.innerHTML=''; if(typeof document!=='undefined'&&document.body) document.body.classList.remove('station-open'); }
  // HUD: um ícone por perk ativo, sem texto; o novo pisca uma vez (flashPerk)
  renderPerkHud(player){
    const ids=player.attributes.activePerks, k=ids.join(','); if(this._perkKey===k) return; this._perkKey=k;
    this.$('perkHud').innerHTML=ids.map(id=>`<span class="perk-ic${this._flashId===id?' flash':''}" title="${PERK_DEFS[id].name}">${perkIcon(id)}</span>`).join('');
  }
  flashPerk(id){ this._flashId=id; this._perkKey=null; setTimeout(()=>{ if(this._flashId===id){ this._flashId=null; this._perkKey=null; } },1200); }
  // mochila: área "Melhorias" com nome, benefício e contrapartida de cada perk ativo
  renderPackPerks(player){
    const ids=player.attributes.activePerks, E=this.$('packPerks'), k=ids.join(',');
    if(this._packPerkKey===k) return; this._packPerkKey=k;
    if(!ids.length){ E.hidden=true; E.innerHTML=''; return; }
    E.hidden=false;
    E.innerHTML='<span class="hn">Melhorias</span>'+ids.map(id=>{ const d=PERK_DEFS[id];
      return `<div class="perk-row">${perkIcon(id)}<span class="pn">${d.name}</span><span class="pb">+ ${d.benefit}</span><span class="pt">− ${d.tradeoff}</span></div>`; }).join('');
  }
  // ---------- inventário: estado dos slots ----------
  // derivado só de Inventory/ItemSystem/Player (nada é guardado aqui)
  //  empty · eq (na mão) · out (pilha esgotada) · lock (mão direita agarrada: select() recusaria) · ready
  // k (atalho) diz a mão; sem k, a mão sai do vínculo (perHand: a mão que o tiver equipado)
  slotInfo(items,player,i,k=-1){
    const s=items.inv.slots[i]; if(!s) return {k:'empty',label:'Vazio'};
    const kSide=k>=0?(k<2?'left':'right'):null;
    if(kSide?items.isSelected(i,kSide):items.isSelected(i)){
      const side=kSide||(items.isSelected(i,'left')&&items.isSelected(i,'right')?'both':items.isSelected(i,'left')?'left':items.isSelected(i,'right')?'right':items.sideOf(i));
      if(side==='both') return {k:'eq',label:'Nas duas mãos'};
      const ph=items.phaseFor(side);
      return {k:'eq',label:ph==='equipping'?'Pegando':ph==='holstering'?'Guardando':`Na mão ${side==='left'?'esquerda':'direita'}`};
    }
    if(ITEM_DEFS[s.id].stack&&s.count<=0) return {k:'out',label:'Esgotado'};
    const hand=(kSide||items.sideOf(i))==='left'?player.leftHand:player.rightHand;
    if(hand.inContact) return {k:'lock',label:'Mão ocupada'};
    return {k:'ready',label:'Guardado'};
  }
  _slotKey(items,player){
    const inv=items.inv;
    return inv.version+'|'+inv.binds.join(',')+'|'+items.left.sel+'|'+items.sel+'|'+items.left.phase+'|'+items.phase+'|'+(player.leftHand.inContact?1:0)+(player.rightHand.inContact?1:0)+'|'+inv.slots.map(s=>s?s.id+s.count:'-').join(',');
  }
  // ---------- hotbar de atalhos (1–4) ----------
  renderInventory(items,player){
    this._it=items;
    const inv=items.inv, key=this._slotKey(items,player);
    if(this._invKey===key) return; this._invKey=key;
    const bar=this.$('slots'); bar.textContent='';
    for(let k=0;k<inv.quick;k++){
      const i=inv.boundSlot(k), s=i>=0?inv.slots[i]:null, st=s?this.slotInfo(items,player,i,k):{k:'empty',label:'Vazio'}, L=QUICK_KEYS[k].label;
      const d=document.createElement('div');
      d.className='slot'+(s?'':' empty')+(st.k==='eq'?' sel':'')+(st.k==='out'?' out':'')+(st.k==='lock'?' lock':'');
      d.dataset.k=k; d.dataset.hand=k<2?'left':'right'; d.classList.add(k<2?'left-hand':'right-hand'); d.setAttribute('role','listitem');
      const kk=document.createElement('span'); kk.className='k'; kk.textContent=L; d.appendChild(kk);
      if(s){
        const def=ITEM_DEFS[s.id];
        d.insertAdjacentHTML('beforeend',iconSvg(s.id));
        if(def.stack){ const c=document.createElement('span'); c.className='c'+(s.count<=0?' zero':''); c.textContent='×'+s.count; d.appendChild(c); }
        d.title=def.name;
        d.setAttribute('aria-label',`Atalho ${L}, mão ${k<2?'esquerda':'direita'}: ${def.name}${def.stack?`, ${s.count}`:''}, ${st.label}`);
      } else d.setAttribute('aria-label',`Atalho ${L}, mão ${k<2?'esquerda':'direita'}: vazio`);
      bar.appendChild(d);
    }
    const left=items.left.equipped, right=items.equipped;
    this.$('slotName').textContent=[left&&`E: ${ITEM_DEFS[left].name}`,right&&`D: ${ITEM_DEFS[right].name}`].filter(Boolean).join('  ·  ');
  }
  // pulso ao pegar um item: acontece no atalho a que ele está vinculado (se houver)
  slotPulse(i){
    const it=this._it; if(!it) return; const s=it.inv.slots[i]; if(!s) return;
    const k=it.inv.binds.indexOf(s.id); if(k<0) return;
    setTimeout(()=>{ const el=this.$('slots').querySelector(`[data-k="${k}"]`); if(el){ el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); } },30);
  }
  // ---------- mochila circular ----------
  _say(t){ this.$('invLive').textContent=t; }
  _keysText(inv){ const l=QUICK_KEYS.slice(0,inv.quick).map(q=>q.label); return l.length<2?l.join(''):l.slice(0,-1).join(', ')+' ou '+l[l.length-1]; }
  setPack(v,items,player){
    v=!!v; if(this.packOpen===v) return;
    if(v){
      if(items){ this._it=items; this._pl=player||this._pl; }
      if(!this._it||!this._pl) return;
      this._ensurePack(this._it.inv);
      this.packOpen=true; this.pk.sel=-1; this._packKey=null;
      this.$('packWrap').hidden=false; document.body.classList.add('inv-open');
      this.renderPack(this._it,this._pl);
      const first=this.pk.store.find(o=>!o.el.hidden)||this.pk.quick[0];
      if(first) first.el.focus({preventScroll:true});
      this._say(`Inventário aberto. Setas navegam, Shift e setas movem o item no círculo, ${this._keysText(this._it.inv)} atribuem o item ao atalho, Delete remove o atalho, Tab fecha.`);
    } else {
      this.packOpen=false; this._endDrag(); this._packKey=null;
      this.$('packWrap').hidden=true; document.body.classList.remove('inv-open');
    }
  }
  // novo jogo: fecha a mochila e esquece onde cada item estava
  resetPack(){ this.setPack(false); this.layout.clear(); }
  // geometria do atalho k: simétrico nas laterais do círculo (1 e 2 à esquerda; 3 e 4 à direita)
  _quickGeo(k,Q){
    const G=PACK_GEO;
    const angles=[206,154,-26,26];
    const deg=angles[k]!==undefined?angles[k]:(-90+k*360/Q);
    const a=deg*Math.PI/180, ux=Math.cos(a), uy=Math.sin(a);
    return {ux,uy,x:ux*G.R,y:uy*G.R,h:G.quickD/2};
  }
  _quickRects(){
    const Q=this._it?this._it.inv.quick:QUICK_KEYS.length, out=[]; for(let k=0;k<Q;k++) out.push(this._quickGeo(k,Q)); return out;
  }
  // constrói os elementos fixos uma vez (reconstrói só se a capacidade mudar); renderPack só atualiza o conteúdo
  _ensurePack(inv){
    const sig=inv.size+'x'+inv.quick; if(this._packSig===sig&&this.pk) return; this._packSig=sig;
    const G=PACK_GEO, N=inv.size, Q=inv.quick, $=this.$;
    const storeEl=$('packStore'), quickEl=$('packQuick'), pipsEl=$('packPips');
    storeEl.textContent=''; quickEl.textContent=''; pipsEl.textContent='';
    const pk=this.pk={sel:-1,store:[],quick:[],pips:[],hn:$('packHn'),hs:$('packHs'),hd:$('packHd'),hh:$('packHh')};
    // um elemento por entrada de armazenamento (inv.size); fica oculto enquanto a entrada está vazia e é posicionado por this.layout
    for(let i=0;i<N;i++){
      const el=document.createElement('button'); el.type='button'; el.className='ps store'; el.dataset.kind='store'; el.dataset.i=i; el.hidden=true;
      el.style.width=G.itemD+'%'; el.style.height=G.itemD+'%';
      el.innerHTML='<span class="ic"></span><span class="ct"></span><span class="bk"></span><span class="eb">MÃO</span>';
      storeEl.appendChild(el);
      pk.store.push({el,id:null,ic:el.querySelector('.ic'),ct:el.querySelector('.ct'),bk:el.querySelector('.bk')});
      const pip=document.createElement('i'); pipsEl.appendChild(pip); pk.pips.push(pip);
    }
    // atalhos quadrados presos às laterais do círculo: 1 e 2 à esquerda, 3 e 4 à direita
    for(let k=0;k<Q;k++){
      const q=this._quickGeo(k,Q), L=QUICK_KEYS[k].label, isLeft=k<2;
      const el=document.createElement('button'); el.type='button'; el.className='ps quick'; el.dataset.kind='quick'; el.dataset.i=k;
      el.dataset.side=isLeft?'left':'right';
      el.style.left=(50+q.x)+'%'; el.style.top=(50+q.y)+'%'; el.style.width=G.quickD+'%'; el.style.height=G.quickD+'%';
      el.setAttribute('aria-keyshortcuts',L);
      el.innerHTML=`<span class="kc">${L}</span><span class="ic"></span><span class="ct"></span><span class="eb">MÃO</span>`;
      quickEl.appendChild(el);
      // botão de remover o atalho, no canto superior externo do quadrado (Delete e botão direito também removem)
      const clr=document.createElement('button'); clr.type='button'; clr.className='pclr'; clr.dataset.i=k; clr.tabIndex=-1; clr.textContent='×'; clr.hidden=true;
      clr.style.left=(50+q.x+(isLeft?-q.h:q.h))+'%'; clr.style.top=(50+q.y-q.h)+'%';
      quickEl.appendChild(clr);
      pk.quick.push({el,clr,id:null,ic:el.querySelector('.ic'),ct:el.querySelector('.ct')});
    }
  }
  // ---- posicionamento livre dentro do círculo (sem sobreposição) ----
  // Um item é um disco de diâmetro itemD cujo centro fica a até maxR da origem, a pelo menos minD de qualquer outro item
  // e a pelo menos `need` de cada atalho quadrado. As coordenadas só existem aqui (this.layout), nunca no Inventory.
  _ctx(){ const G=PACK_GEO, r=G.itemD/2; return {maxR:G.R-r-1.5, minD:G.itemD+.8, need:r+1, sq:this._quickRects()}; }
  // o ponto (x,y) é uma posição válida para o item `skip`? (os demais itens vêm de this.layout)
  _clear(x,y,skip,C){
    if(Math.hypot(x,y)>C.maxR+.01) return false;
    for(const [id,o] of this.layout) if(id!==skip&&Math.hypot(x-o.x,y-o.y)<C.minD-.01) return false;
    for(const q of C.sq){
      const nx=clamp(x,q.x-q.h,q.x+q.h), ny=clamp(y,q.y-q.h,q.y+q.h);
      if(Math.hypot(x-nx,y-ny)<C.need-.01) return false;
    }
    return true;
  }
  // empurra (x,y) para fora de itens e atalhos e para dentro do círculo (relaxação iterativa; pode não convergir em layouts apertados)
  _push(x,y,skip,C){
    const others=[]; this.layout.forEach((o,id)=>{ if(id!==skip) others.push(o); });
    for(let n=0;n<30;n++){
      let moved=false; const d=Math.hypot(x,y);
      if(d>C.maxR){ x*=C.maxR/d; y*=C.maxR/d; }
      for(const o of others){
        let dx=x-o.x, dy=y-o.y, dd=Math.hypot(dx,dy);
        if(dd<C.minD){ if(dd<.01){ dx=1; dy=0; dd=1; } x=o.x+dx/dd*C.minD; y=o.y+dy/dd*C.minD; moved=true; }
      }
      for(const q of C.sq){
        const nx=clamp(x,q.x-q.h,q.x+q.h), ny=clamp(y,q.y-q.h,q.y+q.h), dx=x-nx, dy=y-ny, dd=Math.hypot(dx,dy);
        if(dd<C.need){
          if(dd<.001){ const L=Math.hypot(q.x,q.y)||1; x=q.x-q.x/L*(q.h+C.need); y=q.y-q.y/L*(q.h+C.need); }   // centro dentro do atalho: empurra para o círculo
          else { x=nx+dx/dd*C.need; y=ny+dy/dd*C.need; }
          moved=true;
        }
      }
      if(!moved) break;
    }
    const d=Math.hypot(x,y); if(d>C.maxR){ x*=C.maxR/d; y*=C.maxR/d; }
    return {x,y};
  }
  // ponto livre mais próximo de (x,y), numa grade de 1% do lado da mochila; null se o círculo não tem mais lugar
  _nearest(x,y,skip,C){
    let best=null, bd=Infinity;
    for(let gy=-Math.floor(C.maxR);gy<=C.maxR;gy++) for(let gx=-Math.floor(C.maxR);gx<=C.maxR;gx++){
      const d=(gx-x)*(gx-x)+(gy-y)*(gy-y); if(d>=bd) continue;
      if(this._clear(gx,gy,skip,C)){ best={x:gx,y:gy}; bd=d; }
    }
    return best;
  }
  // posição final de um item solto/empurrado perto de (x,y): sempre válida; `fb` (posição anterior) é a rede de segurança
  _fit(x,y,skip,fb){
    const C=this._ctx(), p=this._push(x,y,skip,C);
    if(this._clear(p.x,p.y,skip,C)) return p;
    return this._nearest(x,y,skip,C)||fb||p;
  }
  // lugar inicial de um item novo: as quatro diagonais, depois o ponto livre mais próximo do centro; null se não houver
  _defaultSpot(id){
    const C=this._ctx();
    for(const [x,y] of [[-12,-12],[12,-12],[-12,12],[12,12],[0,0]]) if(this._clear(x,y,id,C)) return {x,y};
    return this._nearest(0,0,id,C);
  }
  // raro: o círculo está tão fragmentado que um item novo não acha lugar; reorganiza TODOS os itens do zero, compactos
  _relayout(inv,exceptId){
    const ids=inv.slots.filter(s=>s&&s.id!==exceptId).map(s=>s.id);
    this.layout.clear();
    ids.forEach(id=>{ this.layout.set(id,this._defaultSpot(id)||{x:0,y:0}); });
  }
  // mantém this.layout alinhado ao inventário: esquece itens que não existem mais e posiciona os novos (os existentes não se movem)
  _syncLayout(inv){
    const ids=new Set(); inv.slots.forEach(s=>{ if(s) ids.add(s.id); });
    for(const id of [...this.layout.keys()]) if(!ids.has(id)) this.layout.delete(id);
    inv.slots.forEach(s=>{
      if(!s||this.layout.has(s.id)) return;
      let p=this._defaultSpot(s.id);
      if(!p){ this._relayout(inv,s.id); p=this._defaultSpot(s.id)||{x:0,y:0}; }
      this.layout.set(s.id,p);
    });
  }
  renderPack(items,player){
    const pk=this.pk; if(!pk||!this.packOpen) return;
    this.renderPackPerks(player);
    const inv=items.inv, key=this._slotKey(items,player)+'|'+pk.sel+'|'+(items.equipped||'')+'|'+(player.rightHand.occupied?1:0);
    if(this._packKey===key) return; this._packKey=key;
    if(pk.sel>=0&&!inv.slots[pk.sel]) pk.sel=-1;
    this._syncLayout(inv);
    const tg=(el,c,on)=>el.classList.toggle(c,!!on);
    const icon=(o,id)=>{ if(o.id===id) return; o.id=id; o.ic.innerHTML=id?iconSvg(id):''; };
    const dragging=(this._pd&&this._pd.on&&this._pd.kind==='store')?this._pd.i:-1;   // o item arrastado é posicionado pelo ponteiro
    pk.store.forEach((o,i)=>{
      const s=inv.slots[i]; o.el.hidden=!s;
      if(!s){ icon(o,null); return; }
      const def=ITEM_DEFS[s.id], st=this.slotInfo(items,player,i), bk=inv.binds.indexOf(s.id), L=this.layout.get(s.id);
      if(i!==dragging){ o.el.style.left=(50+L.x)+'%'; o.el.style.top=(50+L.y)+'%'; }
      icon(o,s.id);
      o.ct.textContent=def.stack?'×'+s.count:''; tg(o.ct,'zero',def.stack&&s.count<=0);
      o.bk.textContent=bk>=0?QUICK_KEYS[bk].label:'';
      tg(o.el,'eq',st.k==='eq'); tg(o.el,'sel',pk.sel===i); tg(o.el,'out',st.k==='out'); tg(o.el,'lock',st.k==='lock');
      o.el.setAttribute('aria-pressed',pk.sel===i?'true':'false');
      o.el.setAttribute('aria-label',`${def.name}${def.stack?`, ${s.count} unidades`:''}, ${st.label}, ${bk>=0?`atalho ${QUICK_KEYS[bk].label}`:'sem atalho'}`);
    });
    pk.pips.forEach((p,i)=>tg(p,'on',inv.slots[i]));
    pk.quick.forEach((o,k)=>{
      const i=inv.boundSlot(k), s=i>=0?inv.slots[i]:null, L=QUICK_KEYS[k].label, P=QUICK_KEYS[k].place;
      const def=s?ITEM_DEFS[s.id]:null, st=s?this.slotInfo(items,player,i):null;
      icon(o,s?s.id:null);
      o.ct.textContent=s&&def.stack?'×'+s.count:''; tg(o.ct,'zero',s&&def.stack&&s.count<=0);
      tg(o.el,'none',!s); tg(o.el,'eq',st&&st.k==='eq'); tg(o.el,'sel',s&&pk.sel===i); tg(o.el,'out',st&&st.k==='out'); tg(o.el,'lock',st&&st.k==='lock');
      o.clr.hidden=!s;
      if(s){
        o.el.setAttribute('aria-label',`Atalho ${L} (${P}): ${def.name}${def.stack?`, ${s.count} unidades`:''}, ${st.label}. Delete remove o atalho.`);
        o.clr.setAttribute('aria-label',`Remover ${def.name} do atalho ${L}`);
      } else o.el.setAttribute('aria-label',`Atalho ${L} (${P}): vazio`);
    });
    // painel de detalhe: item selecionado ou resumo de ocupação (ex.: "6 / 10 espaços")
    const L=player.leftHand, R=player.rightHand, keys=this._keysText(inv), selSlot=pk.sel>=0?inv.slots[pk.sel]:null;
    const leftText=items.left.equipped?`Esquerda: ${ITEM_DEFS[items.left.equipped].name}`:L.inContact?'Esquerda agarrada':'Esquerda livre';
    const rightText=items.equipped?`Direita: ${ITEM_DEFS[items.equipped].name}`:R.inContact?'Direita agarrada':'Direita livre';
    pk.hh.textContent=`${leftText} · ${rightText}`;
    if(selSlot){
      const def=ITEM_DEFS[selSlot.id], st=this.slotInfo(items,player,pk.sel), bk=inv.binds.indexOf(selSlot.id);
      pk.hn.textContent=def.name;
      pk.hs.textContent=st.label+(def.stack?` · ×${selSlot.count} (máx. ${inv.stackLimitOf(selSlot.id)})`:'')+(bk>=0?` · atalho ${QUICK_KEYS[bk].label}`:' · sem atalho');
      pk.hd.textContent=`${ITEM_HINT[selSlot.id]||''} Escolha ${keys} para atribuir.`.trim();
    } else {
      pk.hn.textContent='Mochila'; pk.hs.textContent=`${inv.usedSlots} / ${inv.size} espaços`+(inv.isFull?' · cheia':'');
      pk.hd.textContent=`Arraste os itens dentro do círculo para organizá-los. Selecione ou arraste um item para ${keys}.`;
    }
  }
  _select(i){ this.pk.sel=i; this._packKey=null; this.renderPack(this._it,this._pl); }
  _changed(k,text){
    this._packKey=null; this.renderPack(this._it,this._pl);
    const q=this.pk.quick[k]; if(q){ q.el.classList.remove('flash'); void q.el.offsetWidth; q.el.classList.add('flash'); }
    this._say(text);
  }
  _assign(k,si){
    const inv=this._it.inv, s=inv.slots[si]; if(!s) return;
    this.pk.sel=-1;
    if(inv.bind(k,s.id)) this._changed(k,`${ITEM_DEFS[s.id].name} atribuído ao atalho ${QUICK_KEYS[k].label}.`);
    else { this._packKey=null; this.renderPack(this._it,this._pl); }
  }
  _clearQuick(k){
    const inv=this._it&&this._it.inv; if(!inv) return;
    const id=inv.binds[k]; if(!id) return;
    inv.unbind(k); this._changed(k,`${ITEM_DEFS[id].name} removido do atalho ${QUICK_KEYS[k].label}. O item continua na mochila.`);
  }
  _nudge(i,dx,dy){
    const s=this._it.inv.slots[i], L=s&&this.layout.get(s.id); if(!L) return;
    this.layout.set(s.id,this._fit(L.x+dx,L.y+dy,s.id,L)); this._packKey=null; this.renderPack(this._it,this._pl);
  }
  // ---------- mochila: ponteiro (clique, arrastar e soltar) ----------
  _bindPack(){
    const wrap=this.$('packWrap');
    this._pmove=e=>this._dragMove(e); this._pup=e=>this._dragUp(e); this._pcancel=()=>this._cancel();
    wrap.addEventListener('pointerdown',e=>this._dragDown(e));
    wrap.addEventListener('click',e=>this._packClick(e));
    wrap.addEventListener('contextmenu',e=>{ e.preventDefault(); const q=e.target.closest&&e.target.closest('.ps.quick'); if(q&&this._it) this._clearQuick(+q.dataset.i); });
  }
  _packClick(e){
    if(this._noClick||!this._it||!this.pk) return;
    const t=e.target, inv=this._it.inv;
    if(t.closest('#packClose')){ if(this.onPackClose) this.onPackClose(); return; }
    const clr=t.closest('.pclr'); if(clr){ this._clearQuick(+clr.dataset.i); return; }
    const el=t.closest('.ps');
    if(!el){ this._select(-1); return; }                        // fundo ou área vazia: limpa a seleção
    const i=+el.dataset.i;
    if(el.dataset.kind==='store') this._select(inv.slots[i]&&this.pk.sel!==i?i:-1);
    else if(this.pk.sel>=0&&inv.slots[this.pk.sel]) this._assign(i,this.pk.sel);   // item selecionado + clique no atalho
    else this._select(inv.boundSlot(i));                                          // sem seleção: destaca o item do atalho
  }
  _geo(){ const r=this.$('pack').getBoundingClientRect(); return {cx:r.left+r.width/2,cy:r.top+r.height/2,S:r.width||1}; }
  _dragDown(e){
    if(this._pd||!this._it) return;
    if(e.pointerType==='mouse'&&e.button!==0) return;
    const el=e.target.closest&&e.target.closest('.ps'); if(!el) return;
    const inv=this._it.inv, kind=el.dataset.kind, i=+el.dataset.i;
    const id=kind==='store'?(inv.slots[i]&&inv.slots[i].id):inv.binds[i];
    if(!id||inv.slotOf(id)<0) return;
    try{ el.releasePointerCapture(e.pointerId); }catch(err){}   // toque: sem captura implícita, para o hit-test funcionar durante o arrasto
    const g=this._geo(), L=this.layout.get(id)||{x:0,y:0};
    this._pd={x:e.clientX,y:e.clientY,kind,i,id,el,on:false,ghost:null,over:null,g,
      ox:L.x-(e.clientX-g.cx)/g.S*100, oy:L.y-(e.clientY-g.cy)/g.S*100, nx:L.x, ny:L.y};
    document.addEventListener('pointermove',this._pmove); document.addEventListener('pointerup',this._pup); document.addEventListener('pointercancel',this._pcancel);
  }
  _dragStart(d){
    d.on=true; d.el.classList.add('dragging'); this.$('pack').classList.add('dragging');
    if(d.kind==='quick'){ const g=document.createElement('div'); g.className='pghost'; g.innerHTML=iconSvg(d.id); document.body.appendChild(g); d.ghost=g; }
  }
  _overQuick(e){ const t=document.elementFromPoint(e.clientX,e.clientY); return t&&t.closest?t.closest('.ps.quick'):null; }
  _dragMove(e){
    const d=this._pd; if(!d) return;
    if(!d.on){ if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<7) return; this._dragStart(d); }
    if(d.kind==='quick') d.ghost.style.transform=`translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
    else {
      // o próprio ícone acompanha o ponteiro, preso ao círculo; a posição final (sem sobrepor) é resolvida ao soltar
      const G=PACK_GEO, mx=G.R-G.itemD/2-1.5;
      let x=(e.clientX-d.g.cx)/d.g.S*100+d.ox, y=(e.clientY-d.g.cy)/d.g.S*100+d.oy; const m=Math.hypot(x,y);
      if(m>mx){ x*=mx/m; y*=mx/m; }
      d.nx=x; d.ny=y; d.el.style.left=(50+x)+'%'; d.el.style.top=(50+y)+'%';
    }
    const q=this._overQuick(e);
    if(d.over!==q){ if(d.over) d.over.classList.remove('drop'); if(q) q.classList.add('drop'); d.over=q; }
  }
  _dragUp(e){
    const d=this._pd; if(!d) return;
    let redraw=false;
    if(d.on){
      const q=this._overQuick(e);
      if(d.kind==='store'){
        if(q) this._drop(d,+q.dataset.i);                                                       // soltou sobre um atalho: atribui; o ícone volta ao seu lugar
        else this.layout.set(d.id,this._fit(d.nx,d.ny,d.id,this.layout.get(d.id)));             // soltou no círculo: guarda a nova posição (sem sobrepor)
      } else this._drop(d,q?+q.dataset.i:-1);
      redraw=true;
      this._noClick=true; setTimeout(()=>{ this._noClick=false; },0);       // o click que o navegador dispara após o arrasto é ignorado
    }
    this._endDrag();
    if(redraw){ this._packKey=null; this.renderPack(this._it,this._pl); }
  }
  // atalho solto sobre outro atalho atribui (ou troca); atalho solto fora de qualquer atalho remove o vínculo
  _drop(d,k){
    const inv=this._it.inv;
    if(k>=0){
      if(d.kind==='quick'&&d.i===k) return;
      this.pk.sel=-1;
      if(inv.bind(k,d.id)) this._changed(k,`${ITEM_DEFS[d.id].name} atribuído ao atalho ${QUICK_KEYS[k].label}.`);
    } else if(d.kind==='quick') this._clearQuick(d.i);
  }
  _cancel(){ const on=this.cancelDrag(); if(on&&this._it) this._say('Arrasto cancelado.'); }
  _endDrag(){
    const d=this._pd; if(!d) return;
    document.removeEventListener('pointermove',this._pmove); document.removeEventListener('pointerup',this._pup); document.removeEventListener('pointercancel',this._pcancel);
    if(d.ghost) d.ghost.remove();
    d.el.classList.remove('dragging'); if(d.over) d.over.classList.remove('drop');
    this.$('pack').classList.remove('dragging');
    this._pd=null;
  }
  // Esc durante um arrasto: o item volta à posição que o layout guarda
  cancelDrag(){
    const on=!!(this._pd&&this._pd.on); this._endDrag();
    if(on&&this._it&&this.packOpen){ this._packKey=null; this.renderPack(this._it,this._pl); }
    return on;
  }
  // ---------- mochila: teclado (chamado pelo listener único do Game.js) ----------
  // Enter e Espaço ativam o botão focado pelo próprio navegador (evento click), então não são tratados aqui.
  packKey(e){
    const pk=this.pk, inv=this._it&&this._it.inv; if(!pk||!inv) return;
    const code=e.code, act=document.activeElement, el=act&&act.closest?act.closest('.ps'):null;
    const arrow={ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[code];
    if(arrow){
      e.preventDefault();
      if(e.shiftKey&&el&&el.dataset.kind==='store') this._nudge(+el.dataset.i,arrow[0]*3,arrow[1]*3);   // Shift + setas: move o item no círculo
      else this._moveFocus(arrow[0]+arrow[1]);
      return;
    }
    const qk=QUICK_KEYS.findIndex(q=>q.code===code);
    if(qk>=0&&qk<inv.quick){
      e.preventDefault();
      let si=pk.sel;
      if(el) si=el.dataset.kind==='store'?+el.dataset.i:inv.boundSlot(+el.dataset.i);
      if(si>=0&&inv.slots[si]) this._assign(qk,si);
      return;
    }
    if(code==='Delete'||code==='Backspace'){
      e.preventDefault(); if(!el) return;
      if(el.dataset.kind==='quick') this._clearQuick(+el.dataset.i);
      else { const s=inv.slots[+el.dataset.i]; if(s){ const k=inv.binds.indexOf(s.id); if(k>=0) this._clearQuick(k); } }
    }
  }
  _moveFocus(d){
    const pk=this.pk; if(!pk) return;
    const list=[...pk.store.filter(o=>!o.el.hidden).map(o=>o.el),...pk.quick.map(o=>o.el),this.$('packClose')];
    let i=list.indexOf(document.activeElement); i=i<0?0:(i+d+list.length)%list.length;
    list[i].focus({preventScroll:true});
  }
  // avisa leitores de tela quando o que está na mão direita muda (sem repetir a cada quadro)
  _announce(items){
    const eq=`${items.left.equipped||''}|${items.equipped||''}`;
    if(this._live===eq) return;
    const first=this._live===undefined; this._live=eq;
    if(first) return;
    this._say(`${items.left.equipped?ITEM_DEFS[items.left.equipped].name:'Mão esquerda livre'} · ${items.equipped?ITEM_DEFS[items.equipped].name:'mão direita livre'}`);
  }
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
      el.classList.toggle('busy',!!h.occupied&&h.anchor!=='axe'); el.classList.toggle('axe',h.anchor==='axe');   // picareta cravada: mão de escalada, com ícone
      el.classList.toggle('critical',h.stamina<15&&(h.inContact||h.exhausted));
    });
    const pr=this.$('prompt');
    if(pr.dataset.k!==look.prompt){ pr.dataset.k=look.prompt||''; pr.textContent='';
      if(look.prompt){ const [k,txt]=look.prompt.split('|'); const kb=document.createElement('kbd'); kb.textContent=k; pr.append(kb,txt); } }
    this.renderInventory(items,player);
    this.renderPerkHud(player);
    this._announce(items);
    this.$('vig').style.opacity=gs.massDistance!=null?clamp((14-gs.massDistance)/12,0,.85):0;
    // fadiga da puxada: pulsa de leve com o "batimento" quando está crítica
    const f=player.fatigueFx||0, st=f<.005?0:Math.min(1,f*(1+Math.max(0,f-.7)*.25*Math.sin(performance.now()/1000*7.5)));
    if(Math.abs(st-(this._strain||0))>.004||(st===0&&this._strain)){ this._strain=st; this.$('strain').style.opacity=st.toFixed(3); }
  }
}