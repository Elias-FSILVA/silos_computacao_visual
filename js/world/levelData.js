'use strict';
// ============================================================================
// js/world/levelData.js — textos das notas, pistas dos puzzles, parâmetros dos setores e aberturas na parede do poço
//
// O SILO (TOP = 400 m, SHAFT_R / SHELL_T / SILO_R em js/core/utils.js): um cilindro gigante. Escala-se pelo POÇO, o
// núcleo oco de 12 m de diâmetro; as alas ficam no corpo do silo, em volta dele, e se ligam ao poço por aberturas na
// parede curva. A progressão alterna os dois eixos:
//   SUBIDA (vertical) → ALA (horizontal) → PUZZLE → MECANISMO → ESCADA / ELEVADOR / PASSAGEM → poço, mais alto → …
//
//     0 –  40  início (sala secreta, depósito, bifurcação, passarela anelar)
//    40 – 100  Subida 1                         → I    CASA DAS BOMBAS (leste) · puzzle → porta da galeria · final SELO
//   110 – 150  Subida 2 (o vento do exaustor começa a puxar)
//   150 – 174  GALERIA DO EXAUSTOR: corredor curvo protegido → porta pressurizada → ESCADA do poço de serviço
//              (o exaustor de 169 m fecha o poço; a rota antiga, por fora, leva à zona de sucção)
//   174 – 200  Subida 2b                        → II   PÁTIO DAS MÁQUINAS: anel em volta do poço, Casa de Força (energia)
//              + Estufa (freio, final RAIZ) → ELEVADOR de carga até 224 m
//   224 – 246  Subida 3a → INSUFLADOR: o fluxo de baixo para cima é a única rota até o mirante (252 m)
//   252 – 300  Subida 3b                        → III  ARQUIVO + LABIRINTO (norte) · código → DUTO · final REGISTRO
//   310 – 400  Subida 4 (fuga) até a porta da superfície (sem decisão = final FUGA)
// Acima de cada ala obrigatória o poço é FECHADO por geometria: um diafragma de grade (DIAPHRAGMS) ou o próprio exaustor,
// e a parede vira chapa de contenção (LOCK_BANDS: sem agarras, sem prego) até a saída da ala.
// ============================================================================
const NOTES={
  // ---- Subida 1 ----
  0:"AVISO · NÍVEL DE SERVIÇO S-0\n\nManutenção dos silos suspensa por tempo indeterminado.\nNão permanecer abaixo da primeira viga.\n\nSe o piso vibrar: suba.\nNão espere instruções.",
  20:"...terceiro turno sem contato com a equipe de baixo.\nO rádio só devolve um som, como respiração dentro de um cano.\n\nPedi pregos extras. O pedido voltou sem assinatura.",
  60:"Contagem de retorno: 3 / 7\n\nA diretoria nunca decidiu o que fazer com ela. Três frentes trabalharam em paralelo:\nALMEIDA quer SELAR o poço.\nHELENA quer CULTIVAR o que cresce nele.\nQUINTINO quer REGISTRAR tudo, para que alguém saiba.\n\nCada uma está numa sala grande. Cada uma pede um preço.",
  80:"> CONSULTA: NÍVEL ATUAL\n> DADO INDISPONÍVEL\n>\n> AVISO: CONTENÇÃO I — 100 m\n> O POÇO ESTÁ FECHADO POR UM DIAFRAGMA DE GRADE LOGO ACIMA DA SOLEIRA.\n> ACESSO SOMENTE PELA CASA DAS BOMBAS (SALA GRANDE, LADO LESTE).\n>\n> A PASSAGEM SÓ ABRE QUANDO O CIRCUITO FOR RESTABELECIDO.\n> RECOMENDAÇÃO DO SISTEMA: OBSERVAR ANTES DE GIRAR",
  // ---- entre 1 e o exaustor ----
  110:"Passei pelas bombas. O circuito reiniciou duas vezes até eu entender: nada ali é sorte.\n\nSe você chegou até aqui: não volte para olhar.",
  130:"DIÁRIO · TURNO 5\n\nA escala tem sete nomes.\nEu só reconheço o meu.\nOs outros estão escritos na minha letra.\n\nLá em cima o ar começa a subir sozinho. É o exaustor.",
  148:"AVISO · EXAUSTOR PRINCIPAL (169 m)\n\nO exaustor puxa o ar do poço para cima. Acima desta boca, a sucção arranca qualquer um da parede.\nNÃO SUBA PELA ROTA ANTIGA.\n\nUse a GALERIA DE MANUTENÇÃO: ela contorna o poço por dentro da parede, protegida do fluxo, e leva à escada do poço de serviço.\nA porta pressurizada só abre com o registro de ar fechado.",
  // ---- acima do exaustor ----
  175:"Subi pela escada do poço de serviço com as pás girando do outro lado da parede.\nDaqui o barulho parece respiração.\n\nO Pátio das Máquinas fica a 200 m. Lá o poço também está fechado por grade: só o elevador de carga sobe.",
  186:"ORDEM DE SERVIÇO 0412\n\nO elevador do Pátio está parado por dois motivos: falta de energia e o freio de segurança, que a raiz da Estufa travou.\nA Casa de Força fica no lado leste do Pátio. A Estufa, no oeste. O martelo conhece o caminho.\n\nO ciclo tem quatro estações. Nem todas as placas ficam à altura dos olhos.",
  196:"PÁTIO DAS MÁQUINAS — acesso\n\nO elevador de carga só sobe com ENERGIA e com o FREIO liberado.\nEnergia: Casa de Força, leste. Freio: as raízes da Estufa, oeste.\n\nAs luzes da Estufa só aceitam a primeira e a última estação.\nO Coração só abre para quem trouxer o cartão da Manutenção.\n(o cartão de Almeida ficou na cabine da Casa das Bombas)",
  // ---- acima do Pátio ----
  224:"Se você ouviu as plantas pararem de respirar, não é bom sinal.\nÉ o silêncio que vem antes de subir.\n\nO resto do caminho eu não quis ler.",
  240:"RÁDIO · CANAL 3\n\nUma voz de criança lendo uma lista de nomes.\nTerminou no meu.\nDepois pediu desculpas.",
  246:"INSUFLADOR · 245 m\n\nO ventilador debaixo da grade empurra o ar para cima, e a parede acima é chapa lisa.\nQuem pisa no círculo pintado sobe com o fluxo.\n\nDeixe o ar levar. Quando passar da borda do mirante, incline-se para a parede: fora do fluxo, o corpo desce sozinho.",
  // ---- Subida 3b ----
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
// theta = direção da sala a partir do eixo do poço (0 leste · π/2 sul · π oeste · −π/2 norte). Salas retangulares ficam
// sempre numa direção cardeal (sólidos alinhados); o que acompanha a circunferência é feito de setores anelares.
// ============================================================================
const HALL_GEO={arm:10,D:24,V:11,h:14,t:.4,armW:2.4,armH:2.6,gallery:2.2,gallY:10};   // sala: u∈[uN=14.5, uN+D], v∈[-V,V], altura h; galeria em H+gallY
const HALLS=[
  {id:'h1',kind:'foundry',   H:100,theta:0,         m:1,name:'A Casa das Bombas',tag:'CONTENÇÃO',route:'seal',   exitLabel:'Passarela das Bombas',exitId:'cp_duto1',exitNote:110},
  {id:'h2',kind:'greenhouse',H:200,theta:Math.PI,   m:1,name:'A Estufa',          tag:'RAIZ',     route:'commune',hub:'p200'},
  {id:'h3',kind:'archive',   H:300,theta:-Math.PI/2,m:1,name:'O Arquivo',         tag:'MEMÓRIA',  route:'witness',exitLabel:'Duto do Arquivo',exitId:'cp13',exitNote:310}
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

// ---- DESTINO II · A Estufa (setor oeste do Pátio das Máquinas) ----
// O ciclo completo faz as raízes soltarem o FREIO DE SEGURANÇA do elevador de carga (segundo objetivo do Pátio).
const GREEN={
  seasons:['triangle','diamond','circle','square'],    // ordem do ciclo: semente, broto, flor, murcha
  stages:['SEMENTE','BROTO','FLOR','MURCHA'],
  bedOrder:['circle','square','triangle','diamond'],   // símbolo de cada canteiro, de leste a oeste
  lamps:[2,2],                                         // (calculado no World) primeira e última estação → canteiros
  lock:[15,30,60],                                     // castigo por tentativa errada (s)
  barrierHits:4
};
const GREEN_TEXT={
  log:"ESTUFA 7 — DRA. HELENA\n\nEla cresce onde há luz e água. Ela não ataca: sobe porque quer o sol.\nO altar das raízes aceita as quatro estações na ordem em que a vida acontece: do que começa ao que termina.\n\nCada placa desenha a fase. O símbolo ao lado é o nome da estação.\nNão estão todas à vista.\n\nQuando a estufa respira, as raízes soltam o que estão apertando — inclusive o freio do elevador.",
  lamps:"CANTEIROS — REGRA DA LUZ\n\nA luz só toca os extremos do ciclo: a PRIMEIRA e a ÚLTIMA estação.\nAcenda a primeira antes da última.\nQualquer outra luz acorda o que dorme — e o reinício custa caro.",
  heart:"O CORAÇÃO\n\nO cartão da Manutenção abre a câmara. Só quem cuidou da máquina pode tocar na raiz.",
  decide:"O CORAÇÃO\n\nPôr a mão aqui. Ela deixa de perseguir você. Passa a seguir.\nO poço deixa de ser prisão — e você deixa de ser só você.",
  last:"ÚLTIMO REGISTRO DE HELENA\n\nNunca foi fome. Era vontade de subir.\nSe a deixarmos subir juntos, talvez chegue ao sol sem levar ninguém."
};

// ============================================================================
// II · O PÁTIO DAS MÁQUINAS (200 m) — a ala intermediária, maior e aberta
// Um ANEL de circulação em volta do poço (r de 6,5 a 14,2 m, 8 m de pé-direito) com máquinas distribuídas, uma
// plataforma segura e poucos recursos. Dois setores de puzzle: CASA DE FORÇA (leste, energia do elevador) e ESTUFA
// (oeste, freio de segurança). O ELEVADOR DE CARGA (sul) só sobe com os dois e leva o jogador até 224 m, onde um braço
// devolve ao poço acima do diafragma.
// ============================================================================
const HUB={id:'p200',H:200,rOut:14.2,t:.3,h:8,entryA:-Math.PI/2,
  power:{theta:0,u1:25.5,V:7,h:7},                         // Casa de Força: u∈[14.5, u1], v∈[−V, V]
  elevator:{theta:Math.PI/2,u1:18.0,V:1.75,top:224,speed:2.2},
  exitLabel:'Patamar do elevador',exitId:'cp_duto2',exitNote:224};
// Casa de Força: geradores na ordem física (G1…G4); a placa do MOTOR (no anel, junto ao elevador) pede 'demand' MW.
// Regra do barramento: geradores vizinhos não operam juntos. Só {G1, G4} soma 9 sem vizinhos → solução única.
const POWER={ratings:[3,5,4,6],demand:9,jam:[0,0,0,2],lockout:4};
const POWER_TEXT={
  log:"CASA DE FORÇA — ENG.ª DAGMAR\n\nO elevador de carga pede exatamente a carga escrita na placa do motor, lá no anel, junto à porta dele.\nNem mais, nem menos: o barramento desarma.\nCada gerador tem a potência pintada na porta.\n\nE nunca ligue dois geradores vizinhos ao mesmo tempo: o cabo entre eles não aguenta.\nLigue os geradores certos e só então feche o barramento.",
  rule:"BARRAMENTO — ORDEM DE OPERAÇÃO\n\n1. Ligar os geradores necessários.\n2. Geradores VIZINHOS não operam juntos.\n3. Fechar o barramento.\n\nCarga diferente da demanda do motor = desarme.",
  motor:"MOTOR DO ELEVADOR DE CARGA\n\nDEMANDA: 9 MW\nFREIO DE SEGURANÇA: hidráulico, com trava manual.\n\n(rabiscado) a raiz entrou pelo poço do elevador e abraçou o freio. Ela só solta quando a Estufa estiver bem.",
  elevator:"ELEVADOR DE CARGA — 200 m → 224 m\n\nSobe com ENERGIA e FREIO liberado.\nUm só sentido: o patamar de cima devolve ao poço acima da grade."
};

// ============================================================================
// O EXAUSTOR (169 m) e a GALERIA DE MANUTENÇÃO (150 m)
// O exaustor gigante fecha o poço e puxa o ar para cima: quanto mais perto, mais forte (fan). A rota antiga continua
// alguns metros pela parede, dentro da zona de sucção. A galeria é um corredor curvo dentro da parede (r 6,5–9,3),
// protegida do fluxo, com uma porta pressurizada (registro emperrado) e, no fim, o poço de serviço com a escada
// até o braço de 174 m, que volta ao poço acima do exaustor.
// ============================================================================
const EXHAUST={id:'ex150',H:150,entryA:.55,a0:.32,a1:Math.PI+.24,r1:9.3,h:3.2,doorA:Math.PI/2,shaftTheta:Math.PI,top:174,
  fan:{y:169,radius:5.75,range:24,speed:19,p:.9,kill:1.4}, // sucção cresce mais cedo; alcance e pico preservados
  oldRoute:{a0:1.05,y0:152.4,a1:1.25,y1:160.2},            // rota antiga (tentação): termina dentro da zona de sucção
  registerJam:2};
const EXHAUST_TEXT={
  door:"PORTA PRESSURIZADA\n\nNão abre com o registro de ar aberto: a diferença de pressão prende a folha.\nFeche o registro (volante vermelho ao lado). Ele costuma emperrar.",
  danger:"PERIGO\nZONA DE SUCÇÃO",
  service:"POÇO DE SERVIÇO · ESCADA\n\nSobe até o braço de 174 m, acima do exaustor."
};

// ============================================================================
// O INSUFLADOR (245 m) — um ventilador sob uma grade empurra o ar para cima. A parede acima é chapa lisa (LOCK_BANDS):
// a única rota até o mirante (252 m) é deixar o fluxo levar o corpo e inclinar-se para a parede no alto.
// ============================================================================
const INSUF={a:3.6,grateTop:246,grateR0:1.4,grateSpan:1.7,
  fan:{r:3.0,y:244.9,radius:1.9,range:12.5,speed:15.7,p:.5},   // flutua com os pés ~0,7 m acima do mirante; cair da coluna até a grade não mata
  ledge:{top:251.6,r0:4.6,w:3.2}};

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

// ---- ramais opcionais (câmaras curvas) ligados aos descansos do poço: exploração, história e pistas dos três caminhos ----
// finish = acabamento das paredes (FINISH em assets.js): cada ramal tem o seu — dormitório de tijolo, capela de pedra…
const WINGS=[
  {id:'w1',after:'cp3', finish:'brick',       name:'Dormitório',  text:"DORMITÓRIO DA EQUIPE\n\nSete beliches, seis arrumados. Na sétima, o cobertor ainda está quente.\nNa cabeceira de Almeida, escrito a carvão: 'SELAR'.\nNa de Helena: 'CULTIVAR'. Na de Quintino: 'REGISTRAR'."},
  {id:'w2',after:'cp6', finish:'concretePale',name:'Refeitório',  text:"REFEITÓRIO\n\nUma mesa posta para sete. Só há seis pratos sujos.\nNo quadro de avisos: 'quem tiver o cartão de Almeida ainda pode ir ao Coração'."},
  {id:'w3',after:'cp11',finish:'brickSoot',   name:'Sala do rádio',text:"SALA DO RÁDIO\n\nO rádio só pega uma estação: três vozes discutindo o que fazer. Quando uma cala, as outras duas continuam.\nA terceira voz sempre pergunta: 'e o que você acha?'"},
  {id:'w4',after:'cp15',finish:'stone',       name:'Capela',      text:"CAPELA\n\nVelas de sebo, ainda acesas. Três bilhetes no altar, um por caminho.\n'Quem sela fica em silêncio. Quem cultiva nunca está sozinho. Quem registra nunca mais descansa.'"}
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
// arm = braço reto entre a face externa do poço e a parede da frente da sala (a sala é retangular; o poço, redondo)
const MAZE={id:'mz300',H:300,cols:9,rows:7,cell:2.4,wall:.3,height:8,ante:9.0,arm:1.5,
  seed:126,straight:.6,entrance:4,exit:5,
  countdown:3,        // segundos até a tela apagar (após o jogador chegar perto)
  near:6,             // distância (m) que dispara a contagem
  hideMapUntilNear:true};  // false = mapa visível já de longe (permite ler sem contagem)

// ---- ESCALADA: ajuste fino das linhas de tijolos (as linhas à mão do início, 0–40 m, continuam como eram) ----
// Os trechos de subida depois da passarela (rachaduras, corda, canos, escadas, saliências, vãos de prego) ficam em
// js/world/Climbs.js; aqui só os parâmetros das linhas de tijolos.
// Alcance real do jogador: ~2,0 m do olho; pendurado o olho fica 0,85 m abaixo da agarra, puxado 0,2 m (1,7 m com pouca stamina).
// step      = distância entre tijolos (m). 0,8 → mesmo pulando UM tijolo que desmoronou ainda há outro firme ao alcance.
// blank     = vão LISO (m) com soquete de prego no meio, nas linhas das alas (Halls.js)
// crumble   = chance de um tijolo EXTRA, que desmorona, ao lado da linha (por subida: 1 · 2 e 2b · 3a e 3b · 4)
const CLIMB={step:.8,jitterLat:.14,jitterY:.07,blank:2.4,crumble:[.10,.14,.16,.20],scatterCrumble:[.08,.16]};

// ---- trechos de poço selados: parede de chapa de contenção (sem agarras soltas, sem prego) ----
// Acima de cada ala obrigatória até a saída dela. O fechamento físico do poço vem dos diafragmas e do exaustor.
const LOCK_BANDS=[
  {H:100,y0:102.7,y1:109.6,label:'Casa das Bombas'},
  {y0:160.9,y1:173.6,label:'exaustor'},
  {H:200,y0:202.7,y1:223.6,label:'Pátio das Máquinas'},
  {y0:246.3,y1:251.3,label:'insuflador'},
  {H:300,y0:302.7,y1:309.6,label:'Arquivo'}
];
// diafragmas de grade: discos que fecham o poço inteiro logo acima da soleira das alas (y = base do disco)
const DIAPHRAGMS=[102.9,202.9,302.9];

// ---- acabamento das paredes do poço (direção de arte: folha de referência de texturas) ----
// O poço foi erguido em FASES: cada fase a partir de y tem um material por quadrante [leste, sul, oeste, norte]
// (chaves de FINISH em assets.js), separados por nervuras de aço. band → cinta de concreto de SHELL_BAND m no início da
// fase: a troca de material sempre acontece numa junta estrutural. As chapas de contenção (LOCK_BANDS) também fazem a transição.
// O quadrante oeste da fase 0 PRECISA ser 'concrete': o painel rachado da sala secreta (MAT.concreteCracked) é esse concreto trincado.
const SHELL_BAND=.35;
const SHELL_FINISH=[
  {y:-30,  band:false,mats:['concrete',    'concrete',    'concrete',    'stone'       ]},   // S-0: concreto moldado; o norte é a fundação de pedra
  {y:17.6, band:true, mats:['brick',       'concrete',    'brick',       'brick'       ]},   // depósito e bifurcação: alvenaria antiga
  {y:47,   band:true, mats:['concreteCold','stone',       'concreteCold','concreteCold']},   // casa de máquinas, sala de controle
  {y:109.6,band:false,mats:['stone',       'stone',       'brickSoot',   'concreteCold']},   // acima da Casa das Bombas: fuligem no oeste
  {y:152,  band:true, mats:['concrete',    'brick',       'stone',       'brick'       ]},   // galeria do exaustor
  {y:173.6,band:false,mats:['concreteCold','brick',       'concreteCold','stone'       ]},   // acima do exaustor (umidade da Estufa)
  {y:223.6,band:false,mats:['concreteCold','brick',       'concreteCold','concreteCold']},
  {y:256,  band:true, mats:['brickSoot',   'stone',       'brick',       'brick'       ]},   // acima do insuflador, antessala do Arquivo
  {y:309.6,band:false,mats:['concretePale','stone',       'concretePale','stone'       ]},
  {y:352,  band:true, mats:['concretePale','concretePale','brick',       'concretePale']}    // último trecho até a superfície
];

// ---- aberturas na parede do poço ----
// Duas formas: {theta, v0, v1} → braço reto (sala cardinal): a abertura vai do ângulo theta+asin(v0/R) a theta+asin(v1/R);
//              {a, w}          → abertura centrada no ângulo a, com w m de largura (corredores curvos, ramais).
// grate:true → a abertura vira janela de grade (sólida). Os ramais acrescentam as suas no World.
const OPENINGS=[
  {id:'secret0',theta:Math.PI,v0:-1.5,v1:1.5,y0:0,y1:3.0},            // sala secreta inicial, atrás de quem começa a subir
  {id:'secret1',theta:Math.PI,v0:-1.2,v1:0,y0:20,y1:22.2},            // nicho vazio sobre o Depósito (easter egg)
  // I · Casa das Bombas (leste): entrada em H, saída (galeria) em H+10
  {id:'h1_in', theta:0,v0:.6, v1:3.0, y0:100,y1:102.6},
  {id:'h1_out',theta:0,v0:-3.0,v1:-.6,y0:110,y1:112.6},
  // Galeria do exaustor: boca em 150, janelas de grade para o poço, braço de volta em 174 (oeste)
  {id:'ex150_in',a:EXHAUST.entryA,w:2.2,y0:150,y1:152.6},
  {id:'ex150_w1',a:1.42,w:1.6,y0:150.9,y1:152.7,grate:true},
  {id:'ex150_w2',a:2.45,w:1.6,y0:150.9,y1:152.7,grate:true},
  {id:'ex174_out',theta:Math.PI,v0:-1.2,v1:1.2,y0:174,y1:176.6},
  // II · Pátio das Máquinas: entrada pelo norte em 200, janelas de grade (acima do diafragma), saída do elevador em 224 (sul)
  {id:'p200_in', theta:-Math.PI/2,v0:-1.2,v1:1.2,y0:200,y1:202.6},
  {id:'p200_w1', a:0,w:2.6,y0:203.6,y1:206.8,grate:true},
  {id:'p200_w2', a:Math.PI,w:2.6,y0:203.6,y1:206.8,grate:true},
  {id:'p200_out',theta:Math.PI/2,v0:-1.2,v1:1.2,y0:224,y1:226.6},
  // III · O labirinto (norte): entrada em 300, duto de saída em 310
  {id:'mz300_in', theta:-Math.PI/2,v0:-1.2,v1:1.2,y0:300,y1:302.6},
  {id:'mz300_out',theta:-Math.PI/2,v0:1.2,v1:3.6,y0:310,y1:312.4}
];
