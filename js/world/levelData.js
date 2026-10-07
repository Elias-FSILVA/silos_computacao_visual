'use strict';
// ============================================================================
// js/world/levelData.js — textos das notas, pista do puzzle e aberturas nas paredes do poço
// ============================================================================
const NOTES={
  0:"AVISO · NÍVEL DE SERVIÇO S-0\n\nManutenção dos silos suspensa por tempo indeterminado.\nNão permanecer abaixo da primeira viga.\n\nSe o piso vibrar: suba.\nNão espere instruções.",
  20:"...terceiro turno sem contato com a equipe de baixo.\nO rádio só devolve um som, como respiração dentro de um cano.\n\nPedi pregos extras. O pedido voltou sem assinatura.",
  60:"Contagem de retorno: 3 / 7\n\nOs outros quatro não constam como perdidos.\nO formulário não tem campo para o que aconteceu.",
  80:"> CONSULTA: NÍVEL ATUAL\n> DADO INDISPONÍVEL\n> ÚLTIMA LEITURA: [CORROMPIDO]\n> ÚLTIMA LEITURA: [CORROMPIDO]\n>\n> RECOMENDAÇÃO DO SISTEMA: SUBIR",
  100:"Não é água. Não é óleo.\nQuando a lâmpada pisca, parece que se inclina na direção da luz.\n\nTalvez seja só cansaço.\nTalvez não."
};


const CLUE_PZ50="REINÍCIO DAS BOMBAS — ORDEM OBRIGATÓRIA\n\no redondo abre o ciclo.\ndepois, quem vigia a porta.\nfecha quem dorme sob a luz que nunca falha.\n\ncada uma tem seu número na pl";
// aberturas nas paredes do poço (axis/s = parede; lat = coordenada ao longo da parede)
const OPENINGS=[
  {id:'secret1',axis:'x',s:-1,lat0:0.0,lat1:1.2,y0:20,y1:22.2},
  {id:'pz_in',axis:'z',s:-1,lat0:.8,lat1:3.2,y0:50,y1:52.6},
  {id:'pz_out',axis:'z',s:-1,lat0:-2.6,lat1:-.4,y0:60,y1:62.4},
  {id:'secret2',axis:'z',s:1,lat0:1.6,lat1:2.8,y0:100,y1:102}
];
