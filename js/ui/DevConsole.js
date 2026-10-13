'use strict';
// Console de desenvolvimento com allowlist explícita. Não interpreta JavaScript.
class DevConsole{
  static execute(raw,game){
    const parts=String(raw||'').trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return '';
    const [command,...args]=parts.map(s=>s.toLowerCase());
    if(command==='help'&&args.length===0) return 'Comandos: help · clear · status · perks · perks add help · perk add <id> · perk remove <id> · perk clear · spectator · diag · setores';
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
      return `Estado: ${game.state}\nPosição: x ${pos.x.toFixed(1)}, y ${pos.y.toFixed(1)}, z ${pos.z.toFixed(1)} · altura ${pos.y.toFixed(1)} m\nStamina: ${hands.map(h=>`${Math.round(h.stamina)}/${p.maxStamina}`).join(' · ')}`;
    }
    if(command==='perks'&&args.length===0){
      const active=game.player.attributes.activePerks;
      if(!active.length) return 'Perks ativos: nenhum';
      return `Perks ativos: ${active.map(id=>`${id} — ${PERK_DEFS[id].name}`).join('; ')}`;
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
}
