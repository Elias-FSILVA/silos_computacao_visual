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
    multipliers:{gravity:.75,maxStamina:.6}}
].map(def=>[def.id,Object.freeze({...def,multipliers:Object.freeze(def.multipliers)})])));
