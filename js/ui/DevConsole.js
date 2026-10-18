'use strict';
// Console de desenvolvimento com allowlist explícita. Não interpreta JavaScript.
class DevConsole{
  static execute(raw,game){
    const parts=String(raw||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '';
    const [command,...args]=parts.map(s=>s.toLowerCase());
    if(command==='help'&&args.length===0) return 'Comandos: help · clear · status · perks · perks add help · perk add <id> · perk remove <id> · perk clear · spectator · diag · setores'
      +'\nNavegação (só desktop, partida viva em jogo ou pausa): goto list · goto <id> · back · noclip · noclip on · noclip off · noclip speed <1–50>'
      +'\nVoo: WASD pela direção da vista, Space sobe, Ctrl desce, Shift ×4. Itens, agarre e interação ficam bloqueados; noclip off desliga onde você estiver (como no CS/Half-Life: no ar, fora do mapa ou dentro de parede); a física volta dali e você pode cair.'
      +'\ngoto/back/noclip marcam a run como assistida: a pontuação fica fora do ranking até uma nova run.'
      +'\nVida (partida viva): health · health set <1–100> · damage <1–100> · heal <1–100>. Mudar a vida marca a run como assistida.'
      +'\nGatilhos (marcos, salas, massa) ficam protegidos após o salto: saia e reentre na região andando normalmente para rearmá-los (veja “status”).';
    if(command==='diag'&&args.length===0){ if(!game.perf) return 'Erro: diagnóstico indisponível.'; return game.perf.toggle()?'Diagnóstico ligado (F3 também alterna).':'Diagnóstico desligado.'; }
    if(command==='setores'&&args.length===0){
      const s=game.sectors; if(!s) return 'Erro: setores indisponíveis.';
      const i=s.info(), y=game.camera.getWorldPosition(new THREE.Vector3()).y;
      const near=s.list.filter(x=>x.state==='active').map(x=>`${x.id} [${x.y0.toFixed(0)}–${x.y1.toFixed(0)}]${x.pinned?' (fixo)':''}`);
      return `Setores: ${i.active} ativos · ${i.ready} prontos · ${i.loading} carregando · ${i.unloaded} descarregados (de ${i.total}) · olhos a ${y.toFixed(1)} m${i.region?' · região: '+i.region:''}\nAtivos: ${near.join(', ')||'nenhum'}`;
    }
    if(command==='clear'&&args.length===0){ if(game.clearDevConsoleOutput) game.clearDevConsoleOutput(); return ''; }
    if(command==='perks'&&args.length===2&&args[0]==='add'&&args[1]==='help'){
      return `Perks disponíveis para “perk add <id>”: ${Object.keys(PERK_DEFS).map(id=>`${id} — ${PERK_DEFS[id].name}`).join('; ')}`;
    }
    if(command==='status'&&args.length===0){
      const p=game.player, pos=p.position, hands=p.hands;
      let out=`Estado: ${game.state}\nPosição: x ${pos.x.toFixed(1)}, y ${pos.y.toFixed(1)}, z ${pos.z.toFixed(1)} · altura ${pos.y.toFixed(1)} m\nStamina: ${hands.map(h=>`${Math.round(h.stamina)}/${p.maxStamina}`).join(' · ')}`;
      const n=game.debugNavigation;
      if(n){
        const e=n.eligibility(), t=n.guard.protectedTriggers();
        out+=`\n${e.assisted?`Run assistida (motivos: ${e.debugReasons.join(', ')}) — fora do ranking`:'Run normal (competitiva)'}`
          +`\nNoclip: ${n.noclipActive?'ligado':'desligado'} · velocidade ${n.speed} m/s · Retorno: ${n.backPose?'registrado':'nenhum'}`
          +`\nGatilhos protegidos: ${t.length?t.map(x=>`\n  ${x.id} (${x.phase}) — ${x.instruction}`).join(''):'nenhum'}`;
      }
      return out;
    }
    if(command==='goto'||command==='back'||command==='noclip') return DevConsole._navigation(command,args,game);
    if(command==='health'||command==='damage'||command==='heal') return DevConsole._health(command,args,game);
    if(command==='perks'&&args.length===0){
      const active=game.player.attributes.activePerks, max=(game.stations&&game.stations.max)||3, n=`${active.length}/${max}`;
      if(!active.length) return `Perks ativos: nenhum (${n})`;
      const warn=active.length>max?` · aviso: acima do limite das estações (${max}); só o console passa dele`:'';
      return `Perks ativos (${n}): ${active.map(id=>`${id} — ${PERK_DEFS[id].name}`).join('; ')}${warn}`;
    }
    if(command==='perk'){
      const [action,id,...extra]=args, attrs=game.player.attributes;
      if(action==='clear'&&args.length===1){attrs.clearPerks();return 'Perks removidos.';}
      if((action==='add'||action==='remove')&&id&&!extra.length){
        if(!Object.prototype.hasOwnProperty.call(PERK_DEFS,id)) return `Erro: perk desconhecido “${id}”.`;
        const changed=action==='add'?attrs.addPerk(id):attrs.removePerk(id);
        if(!changed) return `Erro: não foi possível ${action==='add'?'adicionar':'remover'} perk “${id}”; confira o ID e o estado atual.`;
        return `Perk ${action==='add'?'adicionado':'removido'}: ${id}`;
      }
      return 'Erro: uso: perk add <id> · perk remove <id> · perk clear';
    }
    if(command==='spectator'&&args.length===0){if(game.closeDevConsole) game.closeDevConsole();game.spectator.enter();return 'Modo espectador ativado.';}
    return 'Erro: comando inválido. Digite “help” para ver os comandos disponíveis.';
  }
  // Vida (spec Health §4.5, D8): inteiros 1–100; mudar o HP marca a run assistida ('health'); damage pode matar e a
  // morte segue o fluxo normal (endRun) quando o console fecha. Nada desmarca a assistida.
  static _health(command,args,game){
    const n=game.debugNavigation; if(!n) return 'Erro: navegação de debug indisponível.';
    const live=n.liveRun(); if(!live.ok) return `Erro: ${live.reason}`;
    const p=game.player, H=p.health, L={healthy:'Saudável',hurt:'Machucado',injured:'Ferido',critical:'Crítico',dead:'Morto'};
    const now=()=>`${H.value}/${H.max}`, ASS=' Run assistida (fora do ranking).';
    const num=s=>/^\d{1,3}$/.test(s||'')?Number(s):NaN, ok=v=>v>=1&&v<=100;
    if(command==='health'){
      if(args.length===0) return `Vida: ${now()} · ${L[H.state]}`;
      if(args[0]!=='set') return 'Uso: health · health set <1–100>';
      const v=args.length===2?num(args[1]):NaN;
      if(v===0) return 'Use damage para testar a morte (health set aceita 1–100).';
      if(!ok(v)) return 'Uso: health set <1–100>';
      if(v===H.value) return `Vida já está em ${now()} · ${L[H.state]}.`;
      H.set(v,{source:'debug'}); n.markAssisted('health'); return `Vida definida: ${now()} · ${L[H.state]}.${ASS}`;
    }
    const v=args.length===1?num(args[0]):NaN;
    if(!ok(v)) return `Uso: ${command} <1–100>`;
    if(command==='heal'){
      if(H.value>=H.max) return `Vida já está cheia (${now()}).`;
      const r=p.heal(v,'debug'); n.markAssisted('health'); return `Cura ${r.applied}: ${now()} · ${L[H.state]}.${ASS}`;
    }
    const r=p.damage(v,'debug'); n.markAssisted('health');
    return r.died?`Dano ${r.applied}: ${now()} · a morte acontece ao fechar o console.${ASS}`:`Dano ${r.applied}: ${now()} · ${L[H.state]}.${ASS}`;
  }
  // Navegação de debug: só despacha; contexto, segurança e marca de run assistida ficam em DeveloperNavigation.
  static _navigation(command,args,game){
    const n=game.debugNavigation; if(!n) return 'Erro: navegação de debug indisponível.';
    const done=r=>r.ok?r.message:`Erro: ${r.message}`;
    if(command==='goto'){
      if(args.length===1&&args[0]==='list'){
        const list=n.safety.catalog().filter(d=>d.listed!==false);
        const m=h=>h==null?'?':(Math.round(h*10)/10).toLocaleString('pt-BR')+' m';
        const wi=Math.max(...list.map(d=>d.id.length)),wn=Math.max(...list.map(d=>d.name.length)),wh=Math.max(...list.map(d=>m(d.height).length));
        const out=['Destinos — goto <id>. Portas, puzzles e caixas ficam como estão; a run vira assistida.'];let band=null;
        for(const d of list){const b=d.height==null?null:Math.floor(d.height/100);
          if(b!==band){band=b;out.push(b==null?'— sem altura —':`— ${b*100}–${b*100+100} m —`);}
          out.push(`  ${d.id.padEnd(wi)}  ${d.name.padEnd(wn)}  ${m(d.height).padStart(wh)}  ${d.note}`);}
        return out.join('\n');
      }
      if(args.length===1&&/^[a-z0-9_]+$/.test(args[0])) return done(n.goto(args[0]));
      return 'Erro: uso: goto list · goto <id> (IDs em “goto list”).';
    }
    if(command==='back') return args.length===0?done(n.back()):'Erro: uso: back';
    if(args.length===0) return done(n.setNoclip(!n.noclipActive));
    if(args.length===1&&(args[0]==='on'||args[0]==='off')) return done(n.setNoclip(args[0]==='on'));
    if(args.length===2&&args[0]==='speed'){
      if(!/^(\d+(\.\d+)?|\.\d+)$/.test(args[1])) return 'Erro: velocidade deve ser um número decimal entre 1 e 50 (m/s).';
      return done(n.setSpeed(Number(args[1])));
    }
    return 'Erro: uso: noclip · noclip on · noclip off · noclip speed <1–50>';
  }
}
