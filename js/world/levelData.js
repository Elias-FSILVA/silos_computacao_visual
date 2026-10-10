'use strict';
// ============================================================================
// js/world/levelData.js — textos das notas, pistas dos puzzles, parâmetros das salas e aberturas nas paredes
//
// Estrutura do jogo (TOP = 400 m, definido em js/core/utils.js):
//   Subida 1   0 – 100 m  →  DESTINO I   (100 m, lado leste)  A CASA DAS BOMBAS  · contenção  · final SELO
//   Subida 2 110 – 200 m  →  DESTINO II  (200 m, lado oeste)  A ESTUFA           · raiz        · final COMUNHÃO
//   Subida 3 210 – 300 m  →  DESTINO III (300 m, lado norte)  O ARQUIVO + LABIRINTO · memória · final TESTEMUNHO
//   Subida 4 310 – 400 m  →  FUGA até a porta da superfície (sem decisão = final FUGA)
// Cada destino é uma SALA GRANDE ligada ao poço por braços horizontais (o mapa é uma árvore: tronco + ramos + salões).
// O poço é selado com chapas de contenção (LOCK_BANDS) entre a soleira (H) e a saída (H+10): só se passa resolvendo a sala.
// ============================================================================
const NOTES={
  // ---- Subida 1 ----
  0:"AVISO · NÍVEL DE SERVIÇO S-0\n\nManutenção dos silos suspensa por tempo indeterminado.\nNão permanecer abaixo da primeira viga.\n\nSe o piso vibrar: suba.\nNão espere instruções.",
  20:"...terceiro turno sem contato com a equipe de baixo.\nO rádio só devolve um som, como respiração dentro de um cano.\n\nPedi pregos extras. O pedido voltou sem assinatura.",
  60:"Contagem de retorno: 3 / 7\n\nA diretoria nunca decidiu o que fazer com ela. Três frentes trabalharam em paralelo:\nALMEIDA quer SELAR o poço.\nHELENA quer CULTIVAR o que cresce nele.\nQUINTINO quer REGISTRAR tudo, para que alguém saiba.\n\nCada uma está numa sala grande. Cada uma pede um preço.",
  80:"> CONSULTA: NÍVEL ATUAL\n> DADO INDISPONÍVEL\n>\n> AVISO: CONTENÇÃO I — 100 m\n> TRECHO ACIMA SELADO COM CHAPAS.\n> ACESSO SOMENTE PELA CASA DAS BOMBAS (SALA GRANDE, LADO LESTE).\n>\n> A PASSAGEM SÓ ABRE QUANDO O CIRCUITO FOR RESTABELECIDO.\n> RECOMENDAÇÃO DO SISTEMA: OBSERVAR ANTES DE GIRAR",
  // ---- entre 1 e 2 ----
  110:"Passei pelas bombas. O circuito reiniciou duas vezes até eu entender: nada ali é sorte.\n\nSe você chegou até aqui: não volte para olhar.",
  // ---- Subida 2 ----
  150:"DIÁRIO · TURNO 5\n\nA escala tem sete nomes.\nEu só reconheço o meu.\nOs outros estão escritos na minha letra.",
  180:"ORDEM DE SERVIÇO 0412\n\nA Estufa fica no lado oeste, a 200 m. A raiz fechou a entrada: não é porta, é parede viva.\nO martelo conhece o caminho.\n\nO ciclo tem quatro estações. Nem todas as placas ficam à altura dos olhos.",
  196:"ESTUFA 7 — acesso\n\nAs luzes só aceitam a primeira e a última estação.\nA ordem em que se acende importa.\nO Coração só abre para quem trouxer o cartão da Manutenção.\n\n(o cartão de Almeida ficou na cabine da Casa das Bombas)",
  // ---- entre 2 e 3 ----
  210:"Se você ouviu as plantas pararem de respirar, não é bom sinal.\nÉ o silêncio que vem antes de subir.\n\nO resto do caminho eu não quis ler.",
  // ---- Subida 3 ----
  240:"RÁDIO · CANAL 3\n\nUma voz de criança lendo uma lista de nomes.\nTerminou no meu.\nDepois pediu desculpas.",
  270:"SETOR 300 — 'O ARQUIVO'\n\nQuintino pintou o código do cofre na parede da sala de leitura: conte o que está pintado, sem esquecer o que está no alto.\nA planta é projetada na entrada, uma vez, e some.\nDecore a rota ou desista.\n\nSete placas de nome. Cinco se perderam no labirinto.",
  296:"AVISO · SETOR 300\n\nA energia do setor é cortada após a leitura da planta.\nNão há luminárias. Não leve chama.\n\nO duto de saída está trancado por teclado de três dígitos: o mesmo número pintado na sala de leitura.\nSe errar o caminho, volte pelo mesmo caminho.",
  // ---- entre 3 e 4 ----
  310:"Você saiu.\nEu só ouvi os passos de quem entrou comigo,\ne eles não terminaram de sair.",
  // ---- Subida 4 (fuga) ----
  340:"Pregos acabando. Martelo com o cabo rachado.\nA massa já não sobe.\nEla acompanha.",
  370:"Falta pouco.\nA luz lá em cima não é lâmpada.\nÉ a porta, e está aberta há muito tempo.",
  395:"ÚLTIMA ANOTAÇÃO\n\nSe a porta abrir, não olhe para baixo.\nSe alguém chamar seu nome pelo vão do poço, é a sétima voz.\n\nContagem de retorno: 7 / 7."
};

// ---- textos do labirinto (tela de planta + placa) ----
const MAZE_TEXT={
  title:'PLANTA DE EVACUAÇÃO · SETOR 300',
  standby:['PLANTA DE EVACUAÇÃO','SETOR 300 · O ARQUIVO','','APROXIME-SE PARA A LEITURA'],
  legend:['ENTRADA','ROTA DE SAÍDA','DUTO DE MANUTENÇÃO'],
  plate:"SETOR 300 — ARQUIVO\n\nLEITURA ÚNICA DA PLANTA.\nA TELA SE APAGA APÓS 3 SEGUNDOS.\n\nA saída é um duto de manutenção no fundo do setor.\nEle não tem placa."
};

// ============================================================================
// DESTINOS · cada um é uma sala grande com identidade, narrativa, itens e puzzles próprios
// ============================================================================
const HALL_GEO={arm:10,D:24,V:11,h:14,t:.4,armW:2.4,armH:2.6,gallery:2.2,gallY:10};   // sala: u∈[4.5+arm, +D], v∈[-V,V], altura h; galeria em H+gallY
const HALLS=[
  {id:'h1',kind:'foundry',   H:100,axis:'x',s: 1,m: 1,name:'A Casa das Bombas',tag:'CONTENÇÃO',route:'seal',   exitLabel:'Passarela das Bombas',exitId:'cp_duto1',exitNote:110},
  {id:'h2',kind:'greenhouse',H:200,axis:'x',s:-1,m:-1,name:'A Estufa',          tag:'RAIZ',     route:'commune',exitLabel:'Mirante da Estufa',   exitId:'cp_duto2',exitNote:210},
  {id:'h3',kind:'archive',   H:300,axis:'z',s:-1,m: 1,name:'O Arquivo',         tag:'MEMÓRIA',  route:'witness',exitLabel:'Duto do Arquivo',     exitId:'cp13',    exitNote:310}
];
const SYMBOLS={circle:'○',triangle:'△',square:'□',diamond:'◇',cross:'✚',star:'✶'};

// ---- DESTINO I · Casa das Bombas ----
// 4 válvulas (parede leste) empurram 4 tanques (mostradores na parede oeste). Cada mostrador tem os 4 símbolos em ordem própria;
// o diário manda deixar TODAS as agulhas sobre △. Matriz [válvula][tanque]; cada volta soma 1 (mod 4).
const FOUNDRY={
  M:[[1,0,1,1],[0,0,1,1],[1,1,1,0],[1,1,0,0]],        // determinante ímpar → invertível mód 4 → UMA única combinação de voltas resolve
  faces:[['circle','square','triangle','diamond'],['triangle','diamond','circle','square'],['diamond','circle','square','triangle'],['square','triangle','diamond','circle']],
  target:'triangle',
  solution:[3,1,2,1],                                  // voltas por válvula (inicial = alvo − solução)
  pumps:['circle','triangle','square','diamond'],      // posição das bombas, de leste a oeste... (ordem física)
  order:['circle','diamond','square','triangle'],      // ordem correta de partida
  jam:3, cabinetCard:3, cabinetPage:2
};
const FOUNDRY_TEXT={
  log:"CASA DAS BOMBAS — DIÁRIO DO ENGENHEIRO-CHEFE ALMEIDA\n\nDia 41. A massa não respeita pressão, mas respeita ritmo.\nSe os quatro tanques forem levados ao mesmo ponto — a agulha sobre o △ de cada mostrador — ela afunda.\n\nO mostrador não repete a face: cada um tem os símbolos em outra ordem. Leia o símbolo, não o ângulo.\nCada válvula empurra mais de um tanque (esquema na parede da cabine). Cada volta soma um passo; depois do quarto, volta ao começo.\n\nSó então as bombas. As páginas do manual estão em três lugares: na cabine, lá em cima e o que está trancado.",
  p1:"MANUAL DAS BOMBAS — pág. 1\n\n○ nunca parte por último.\n□ não abre o ciclo.",
  p2:"MANUAL DAS BOMBAS — pág. 2\n\n◇ parte logo depois de ○, sem nenhuma bomba no meio.",
  p3:"MANUAL DAS BOMBAS — pág. 3\n\n△ só parte depois de □.\n\n(embaixo, a lápis) Se errar a ordem o circuito inteiro reinicia. Eu errei duas vezes.",
  breaker:"QUADRO GERAL — DISJUNTOR 1\nEmperrado pela ferrugem. Só cede à força.",
  master:"VÁLVULA-MESTRA\n\nGirar isto fecha o poço para sempre.\nTudo o que estiver abaixo fica abaixo. Não há como reabrir.",
  last:"ÚLTIMO REGISTRO DE ALMEIDA\n\nEu giro a válvula e fico do lado de lá.\nSe alguém ler isto e quiser decidir por mim: gire."
};

// ---- DESTINO II · A Estufa ----
const GREEN={
  seasons:['triangle','diamond','circle','square'],    // ordem do ciclo: semente, broto, flor, murcha
  stages:['SEMENTE','BROTO','FLOR','MURCHA'],
  bedOrder:['circle','square','triangle','diamond'],   // símbolo de cada canteiro, de leste a oeste
  lamps:[2,2],                                         // (calculado no World) primeira e última estação → canteiros
  lock:[15,30,60],                                     // castigo por tentativa errada (s)
  barrierHits:4
};
const GREEN_TEXT={
  log:"ESTUFA 7 — DRA. HELENA\n\nEla cresce onde há luz e água. Ela não ataca: sobe porque quer o sol.\nO altar das raízes aceita as quatro estações na ordem em que a vida acontece: do que começa ao que termina.\n\nCada placa desenha a fase. O símbolo ao lado é o nome da estação.\nNão estão todas à vista.",
  lamps:"CANTEIROS — REGRA DA LUZ\n\nA luz só toca os extremos do ciclo: a PRIMEIRA e a ÚLTIMA estação.\nAcenda a primeira antes da última.\nQualquer outra luz acorda o que dorme — e o reinício custa caro.",
  heart:"O CORAÇÃO\n\nO cartão da Manutenção abre a câmara. Só quem cuidou da máquina pode tocar na raiz.",
  decide:"O CORAÇÃO\n\nPôr a mão aqui. Ela deixa de perseguir você. Passa a seguir.\nO poço deixa de ser prisão — e você deixa de ser só você.",
  last:"ÚLTIMO REGISTRO DE HELENA\n\nNunca foi fome. Era vontade de subir.\nSe a deixarmos subir juntos, talvez chegue ao sol sem levar ninguém."
};

// ---- DESTINO III · O Arquivo ---- (labirinto + sala de leitura)
const ARCHIVE={
  counts:{circle:3,triangle:5,square:2},   // símbolos pintados no mural → código do teclado "352"
  names:['ALMEIDA','HELENA','QUINTINO','MARLON','DAGMAR','ÍCARO'],   // 6 nomes + o seu (a 7ª placa)
  deadEnds:5                               // placas escondidas em becos do labirinto
};
const ARCHIVE_TEXT={
  mural:"CÓDIGO DO ARQUIVO — QUINTINO\n\nPintei o código na parede da sala de leitura. Conte o que está pintado: primeiro os círculos, depois os triângulos, depois os quadrados.\nNão esqueça o que está no alto. Quem para de olhar para cima perde sempre a mesma parte.",
  desk:"CARTÃO DE FICHÁRIO\n\nSete placas de nome. Seis são de quem veio antes: cinco ficaram nos becos do labirinto, uma nesta gaveta.\nA sétima está em branco, em cima da estante mais alta. É a sua.",
  vault:"COFRE DO REGISTRO\n\nSete placas. Sete vozes. Quem as carrega, testemunha.",
  decide:"O REGISTRO\n\nLevar os sete nomes para a superfície.\nO que aconteceu aqui deixa de ser segredo — e você passa a ser a prova.",
  last:"ÚLTIMO REGISTRO DE QUINTINO\n\nNão consegui selar nem cultivar. Só escrevi.\nSe alguém carregar isto para cima, a contagem de retorno finalmente fecha."
};

// ---- ramais opcionais (salas pequenas) ligados aos descansos do poço: exploração, história e pistas dos três caminhos ----
const WINGS=[
  {id:'w1',after:'cp3', name:'Dormitório',  text:"DORMITÓRIO DA EQUIPE\n\nSete beliches, seis arrumados. Na sétima, o cobertor ainda está quente.\nNa cabeceira de Almeida, escrito a carvão: 'SELAR'.\nNa de Helena: 'CULTIVAR'. Na de Quintino: 'REGISTRAR'."},
  {id:'w2',after:'cp7', name:'Refeitório',  text:"REFEITÓRIO\n\nUma mesa posta para sete. Só há seis pratos sujos.\nNo quadro de avisos: 'quem tiver o cartão de Almeida ainda pode ir ao Coração'."},
  {id:'w3',after:'cp11',name:'Sala do rádio',text:"SALA DO RÁDIO\n\nO rádio só pega uma estação: três vozes discutindo o que fazer. Quando uma cala, as outras duas continuam.\nA terceira voz sempre pergunta: 'e o que você acha?'"},
  {id:'w4',after:'cp15',name:'Capela',      text:"CAPELA\n\nVelas de sebo, ainda acesas. Três bilhetes no altar, um por caminho.\n'Quem sela fica em silêncio. Quem cultiva nunca está sozinho. Quem registra nunca mais descansa.'"}
];

// ---- finais ----
const ENDINGS={
  seal:{name:'O Selo',tag:'CONTENÇÃO',
    text:"Você girou a Válvula-Mestra até o fim. Abaixo de você, o som parou de uma vez, como uma respiração que se cansou de voltar.\nNo poço, a massa não sobe mais. Ela fica onde está, sob toneladas de aço e concreto, para sempre.\nNo alto, a porta se abre para um dia comum. Ninguém vai saber o que foi selado. Contagem de retorno: 7 / 7 — o sétimo é quem fechou."},
  commune:{name:'A Raiz',tag:'COMUNHÃO',
    text:"Você pôs a mão no Coração. Ela não era fome; era vontade de subir.\nA massa deixou de te perseguir. Agora acompanha, devagar, como maré, e onde passa as lâmpadas ficam verdes.\nNo alto, a porta se abre para o sol, e algo atrás de você sobe junto. Contagem de retorno: 7 / 7 — o sétimo não saiu sozinho."},
  witness:{name:'O Registro',tag:'TESTEMUNHO',
    text:"Você levou os sete nomes. Cada placa pesa mais do que parece.\nNo alto, ao ar livre, você as lê em voz alta, uma a uma, e a sua é a última.\nOs silos serão interditados e a história será contada, mesmo que ninguém acredite. Contagem de retorno: 7 / 7 — o sétimo é a testemunha."},
  escape:{name:'Fuga',tag:'SEM DECISÃO',
    text:"Você chegou à superfície sem selar, sem cultivar e sem registrar.\nO poço continua lá embaixo, e a massa continua sua. Ela vai subir de novo; é só questão de tempo.\nContagem de retorno: 6 / 7. Alguém ainda precisa decidir."}
};

// ---- labirinto (puzzle difícil, 300 m) ----
// grade cols × rows de células de 'cell' m (sentido de entrada = -z). seed/straight definem o labirinto (fixo, igual em toda partida).
// seed 126 · straight .6 → rota de 24 células com 8 curvas e 9 becos (conferido em tools de teste).
const MAZE={id:'mz300',H:300,cols:9,rows:7,cell:2.4,wall:.3,height:8,ante:9.0,
  seed:126,straight:.6,entrance:4,exit:5,
  countdown:3,        // segundos até a tela apagar (após o jogador chegar perto)
  near:6,             // distância (m) que dispara a contagem
  hideMapUntilNear:true};  // false = mapa visível já de longe (permite ler sem contagem)

// ---- ESCALADA: ajuste fino das subidas geradas (as linhas à mão do início, 0–40 m, continuam como eram) ----
// Alcance real do jogador: ~2,0 m do olho; pendurado o olho fica 0,85 m abaixo da agarra, puxado 0,2 m (1,7 m com pouca stamina).
// step      = distância entre tijolos (m). 0,8 → mesmo pulando UM tijolo que desmoronou ainda há outro firme ao alcance.
// blank     = vão LISO (m) com soquete de prego no meio (1 prego + martelo). Mantido curto: cada metade fica a ≤ 1,2 m.
// crumble   = chance de um tijolo desmoronar por subida (nunca dois seguidos, nunca ao lado de um vão liso).
const CLIMB={step:.8,jitterLat:.14,jitterY:.07,blank:2.4,crumble:[.10,.14,.16,.20],scatterCrumble:[.08,.16]};

// ---- trechos de poço selados por chapas (impedem escalar por fora das salas) ----
const LOCK_BANDS=[100,200,300].map(H=>({H,y0:H+2.7,y1:H+9.6}));

// ---- aberturas nas paredes do poço (axis/s = parede; lat = coordenada ao longo da parede) ----
// secret0  : sala secreta inicial (0 m), parede -x, atrás de quem começa a subir (painel de concreto rachado)
// secret1  : nicho vazio sobre o Depósito (20 m) — reservado para um easter egg
// pzNNN_in / pzNNN_out : entrada (soleira) e saída (duto) de cada puzzle; a saída fica 10 m acima da entrada
const OPENINGS=[
  {id:'secret0',axis:'x',s:-1,lat0:-1.5,lat1:1.5,y0:0,y1:3.0},
  {id:'secret1',axis:'x',s:-1,lat0:0.0,lat1:1.2,y0:20,y1:22.2},
  // Destino I (lado leste): entrada em H, saída (galeria) em H+10 — lat = z
  {id:'h1_in', axis:'x',s: 1,lat0: .6,lat1:3.0,y0:100,y1:102.6},
  {id:'h1_out',axis:'x',s: 1,lat0:-3.0,lat1:-.6,y0:110,y1:112.6},
  // Destino II (lado oeste, espelhado): lat = z
  {id:'h2_in', axis:'x',s:-1,lat0:-3.0,lat1:-.6,y0:200,y1:202.6},
  {id:'h2_out',axis:'x',s:-1,lat0: .6,lat1:3.0,y0:210,y1:212.6},
  // Destino III (lado norte): o labirinto — lat = x
  {id:'mz300_in', axis:'z',s:-1,lat0:-1.2,lat1:1.2,y0:300,y1:302.6},
  {id:'mz300_out',axis:'z',s:-1,lat0:1.2,lat1:3.6,y0:310,y1:312.4}
];
