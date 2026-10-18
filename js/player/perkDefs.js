'use strict';
// Benefício e contrapartida pertencem ao mesmo ID; nenhum perk começa ativo.
// Valores provisórios: aquisição e balanceamento em playtest ficam para a próxima etapa.
const PERK_DEFS=Object.freeze(Object.fromEntries([
  {id:'economical_grip',name:'Pegada econômica',benefit:'15% menos consumo de pegada.',tradeoff:'15% menos recuperação de stamina.',
    multipliers:{gripDrainMultiplier:.85,groundRecovery:.85,freeHandRecovery:.85}},
  {id:'quick_recovery',name:'Recuperação rápida',benefit:'20% mais recuperação de stamina.',tradeoff:'10% mais consumo de pegada.',
    multipliers:{groundRecovery:1.2,freeHandRecovery:1.2,gripDrainMultiplier:1.1}},
  {id:'powerful_launch',name:'Impulso potente',benefit:'10% mais velocidade vertical no salto agarrado.',tradeoff:'25% mais custo de stamina nesse salto.',
    multipliers:{wallJumpSpeed:1.1,wallJumpStaminaCost:1.25}},
  {id:'light_body',name:'Corpo leve',benefit:'25% menos gravidade pessoal.',tradeoff:'40% menos stamina máxima por mão.',
    multipliers:{gravity:.75,maxStamina:.6}},
  {id:'long_arms',name:'Braços longos',benefit:'10% mais alcance para agarrar.',tradeoff:'15% mais consumo de pegada.',
    multipliers:{reach:1.1,tiredReach:1.1,gripDrainMultiplier:1.15}},
  {id:'calloused_hands',name:'Mãos calejadas',benefit:'A fadiga dos braços acumula 25% mais devagar.',tradeoff:'A fadiga passa 25% mais devagar.',
    multipliers:{fatigueGainMultiplier:.75,fatigueRecoveryMultiplier:.75}},
  {id:'short_breath',name:'Respiro curto',benefit:'A mão livre recupera 40% mais rápido durante a escalada.',tradeoff:'20% menos recuperação no chão.',
    multipliers:{freeHandRecovery:1.4,groundRecovery:.8}},
  {id:'economical_launch',name:'Salto econômico',benefit:'30% menos custo de stamina no salto agarrado.',tradeoff:'8% menos velocidade vertical nesse salto.',
    multipliers:{wallJumpStaminaCost:.7,wallJumpSpeed:.92}},
  {id:'anchor',name:'Âncora',benefit:'20% menos consumo de pegada.',tradeoff:'10% mais gravidade pessoal.',
    multipliers:{gripDrainMultiplier:.8,gravity:1.1}},
  {id:'deep_breath',name:'Fôlego fundo',benefit:'25% mais stamina máxima por mão.',tradeoff:'20% menos recuperação de stamina.',
    multipliers:{maxStamina:1.25,groundRecovery:.8,freeHandRecovery:.8}}
].map(def=>[def.id,Object.freeze({...def,multipliers:Object.freeze(def.multipliers)})])));
