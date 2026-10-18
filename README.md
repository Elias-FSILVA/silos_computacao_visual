# Silos

Jogo de escalada em primeira pessoa feito com Three.js, inspirado em *White Knuckle*. Roda no navegador com mouse e teclado, ou em VR no Meta Quest (3/3S).

## O jogo

Você está no fundo de um silo industrial gigantesco: um cilindro de 400 m de altura. Escala-se pelo poço redondo do centro, com 12 m de diâmetro, e as alas, salas e corredores ficam construídos no corpo do silo, em volta dele. O poço continua além da luz, e uma massa escura começa a subir por ele, cada vez mais rápido. A única saída é escalar.

- **Escalada com duas mãos.** Cada botão do mouse (ou cada grip no VR) é uma mão. Você agarra tijolos e bordas, puxa o corpo para cima e administra a estamina de cada braço. Mão cansada escorrega.
- **Apoios variados.** Depois da passarela de 40 m a subida alterna trechos curtos de tijolo com rachaduras profundas (agarráveis em qualquer ponto, gastam um pouco mais a pegada), cordas, um cano para atravessar de lado, escadas de manutenção sem alguns degraus, vigas e um tubo que atravessam o poço, passarelas, andaimes e saliências de concreto para ficar em pé. Chapas de aço remendadas não aceitam prego: onde elas aparecem, o caminho é outro. Nenhum trecho contínuo passa de ~6 m.

  | Subida | Ideia | Apoios |
  |---|---|---|
  | 1 (40–100 m) | concreto em zigue-zague; cada apoio novo aparece com chão logo embaixo | primeira rachadura, primeiro prego, cano lateral sobre uma chapa, viga de lado a lado |
  | 2 (110–150 m) | o espaço do poço | andaimes, tubo gigante como ponte, passarelas, travessia lateral |
  | 2b (174–200 m) | corda | corda presa ao mezanino sobre uma parede de chapa |
  | 3a (224–246 m) | rachaduras | duas rachaduras com um andaime no meio, até o alçapão do insuflador |
  | 3b (252–300 m) | prego obrigatório | escada danificada; vão de 3 m numa chapa que só se cruza com prego; rachadura de lado |
  | 4 (310–400 m) | tudo combinado | rachadura + viga, tubo + passarela, corda presa à ponte, segundo vão de prego + escada, andaime |
- **Ferramentas.** Pregos cravados a martelo viram apoio nos trechos lisos da parede. O martelo também quebra paredes rachadas e destrava mecanismos, e as pílulas recuperam a estamina das mãos. Tudo fica numa mochila circular com atalhos de 1 a 4, que tem limite por pilha e peso por item.
- **Subida vertical e alas horizontais.** As subidas são espirais pela parede curva do poço. Em certas alturas o poço é fechado de verdade, por um diafragma de grade ou pelo próprio exaustor, e a parede vira chapa lisa. Para continuar é preciso sair por uma ala, resolver o que ela pede e voltar ao poço mais acima, por uma porta, uma escada, um elevador ou pelo fluxo de ar:

  | Altura | Ala | O que pede | Como volta ao poço | Final |
  |---|---|---|---|---|
  | 100 m | A Casa das Bombas | energia, tanques, ordem das bombas, Válvula-Mestra | porta da galeria (110 m) | **O Selo** |
  | 150 m | Galeria do exaustor | atravessar o corredor curvo protegido e fechar o registro de ar | escada do poço de serviço (174 m) | |
  | 200 m | Pátio das Máquinas | Casa de Força (energia do elevador) e Estufa (raízes, ciclo das estações, luzes: soltam o freio) | elevador de carga (224 m) | **A Raiz** (Coração, na Estufa) |
  | 246 m | Insuflador | deixar o fluxo levar o corpo | mirante (252 m) | |
  | 300 m | O Arquivo e o Labirinto | mural, labirinto no escuro, placas, cofre | duto (310 m) | **O Registro** |

  A primeira decisão tomada define o final. Quem chega ao topo sem decidir nada tem o final **Fuga**. Enquanto você está dentro de uma ala obrigatória, a massa fica contida abaixo dela.
- **Ventiladores.** O exaustor de 169 m puxa o ar do poço para cima: perto dele, a sucção gasta a pegada e, solto, o corpo é levado até as pás. O insuflador de 245 m sopra para cima e é a única rota até o mirante. Paredes e bordas fazem abrigo; grades deixam o ar passar.
- **Pontuação.** Somam pontos a altura máxima, os checkpoints, os puzzles e os segredos encontrados. Quem chega ao fim ganha bônus por velocidade e por não escorregar nem tomar pílulas. Cada escorregão e cada pílula descontam pontos. O ranking fica salvo no navegador.

## Controles

| Ação | Mouse e teclado | VR (Meta Quest) |
|---|---|---|
| Agarrar | botão esquerdo / direito | grip de cada mão |
| Subir | segurando, arrastar o mouse para baixo | segurando, descer o braço |
| Andar | WASD | analógico esquerdo |
| Pular / subir na borda | Espaço | A |
| Interagir | F | gatilho direito |
| Usar item | botão do mouse da mão que segura o item | gatilho da mão que segura o item |
| Picareta: cravar / soltar | segurar / soltar o botão daquela mão | segurar / soltar o gatilho (ou pinça) |
| Estação de melhoria | F; clique ou 1/2 seleciona, clique de novo ou Enter escolhe, Esc ignora | gatilho direito; selecionar e depois Escolher |
| Mochila / inventário | Tab, depois 1 a 4 | Y (inventário no pulso) |
| Guardar item | X (guarda as mãos livres; a picareta cravada fica) | A esquerdo (idem) |
| Pílula | Q | levar o frasco à boca |
| Pausa | Esc | clique no analógico esquerdo |

No VR também dá para jogar só com hand tracking: feche a mão para agarrar, faça pinça com a mão direita para interagir e pinça com a esquerda para pular.

## Rodar localmente

Precisa do Node.js 18 ou mais novo.

```bash
npm install
npm run dev        # abre o jogo em http://localhost:8080
```

## Build e deploy (Vercel)

```bash
npm run build      # gera dist/ (site estático, com o Three.js em dist/vendor)
npm run preview    # build + serve dist/ localmente para conferir
```

O `vercel.json` já configura tudo: a Vercel roda `npm ci` e `npm run build` e publica `dist/`. Basta importar o repositório na Vercel (Framework Preset: **Other**) ou rodar `npx vercel` na pasta do projeto.

## Escalada e impulso

- **Botões esquerdo/direito do mouse:** cada um controla a mão correspondente. Se houver item equipado, o botão usa esse item; com a mão vazia, segura/agarrra onde você mira. Solte para largar.
- **Atalhos 1–4:** hotbar dividida em dois grupos, **1–2 para a mão esquerda** e **3–4 para a direita**. Cada mão pode ter até dois itens atribuídos e manter um equipado; a separação visual marca os grupos. Em VR, o gatilho de cada controle usa o item daquela mão.
- **Mouse para baixo, segurando uma agarra:** puxa o corpo. Em VR, desça o braço que está segurando. Uma mão livre recupera stamina; duas mãos sustentando dividem a carga. Puxar e sustentar o corpo elevado acumulam fadiga.
- **Espaço agarrado:** impulso para cima, sem empurrão automático para fora da parede e sem herdar a oscilação horizontal do corpo. **WASD + Espaço** direciona o impulso em relação ao olhar. Em VR, A (ou pinça esquerda) usa o analógico esquerdo e o olhar do quadro atual.
- Cada mão apoiada gasta **12 de stamina** no impulso e espera **220 ms** para agarrar novamente. Sem força suficiente, mantém a pegada. Não há salto extra no vazio.
- **Bordas:** primeiro puxe o corpo; Espaço finaliza a subida (mantle). Uma puxada completa também pode iniciar o mantle. Soltar as mãos sem pular continua sendo uma ação diferente do impulso.
- Fadiga crítica já provoca cedidas antes da exaustão; uma mão sem stamina solta a pegada. Plataformas permitem recuperar stamina e fadiga.

### Itens nas duas mãos

- Cada mão tem estado próprio: usar, segurar ou soltar o botão de uma mão nunca mexe no item da outra. Pausa, mochila e console soltam os botões das duas mãos.
- A mão com item comum não agarra. A **outra mão escala e puxa normalmente, inclusive pelo mouse**. O mouse só deixa de puxar durante o uso ativo de um item que mira (golpe do martelo, colocar prego, cartão, golpe da picareta). Pendurado num braço com a outra mão ocupada, o braço fica travado e gasta menos pegada (como antes, agora para as duas mãos).
- Cada item está em **uma mão só** (exceto a picareta, que tem duas unidades). Pegar com uma mão o item que está na outra o transfere: ele sai da outra mão, sem duplicar. Se a outra mão estiver no meio do uso (golpe, colocar, tomar), a troca é recusada com aviso.
- Item que acaba (última pílula, último prego) **some da mochila e do atalho**; a mão que o segurava esvazia ao fim da animação. Coletar de novo cria uma entrada nova.
- Poses e itens são desenhados no espaço da mão direita e espelhados para a esquerda (`js/player/Handedness.js`), sem escala negativa.

### Picareta (Climbing Axe)

- Item **Picareta**: até 2 na mochila; cada mão equipada usa uma. A 1ª está na caixa do **Andaime norte** (128 m) e a 2ª na do **Corredor de serviço** (269,6 m). Com uma só, a outra mão recebe "Você só tem uma picareta".
- Crava fundo em **rachaduras** (que a mão nua também agarra) e nas **faixas de rocha** escuras com lâmpada amarela (R1 a 145 m, R2 a 237 m, R3 a 324 m), onde a mão nua não se segura. Ali não há desgaste.
- **Concreto, tijolo e pedra** (as paredes que aceitam prego) recebem uma **fincada rasa**: custa o dobro de stamina para fixar (10), gasta o dobro pendurado e a ponta escapa sozinha depois de 2,5 s. O retículo fica âmbar e tracejado. Piso e teto não aceitam. Não crava em chapa, grade, corda, cano, prego, porta nem puzzle.
- **Desgaste:** cada picareta aguenta 10 fincadas no concreto (a barra embaixo do atalho mostra o que resta; fica vermelha nas 3 últimas). A última fincada segura; quando ela sai da parede, a picareta quebra e some da mochila. Com duas, cada uma tem o seu desgaste, e a mão pega a menos gasta.
- Segure o botão (ou o gatilho) para cravar e manter; solte para desprender. O retículo indica se dá para cravar ali (verde: rocha; âmbar: concreto). Fixar custa 5 de stamina (× o gasto de pegada dos perks). Pendurada, ela gasta como a mão, mas sem o custo extra da rachadura. A cravada é uma âncora: puxar, mantle e salto agarrado funcionam como com a mão.
- **Quando não crava**, a reação diz o motivo, sem gastar stamina nem a picareta:
  - **nada ao alcance:** o golpe segue no vazio e volta, sem som de impacto;
  - **superfície errada** (chapa, grade, caixa, piso ou teto de concreto): faísca, recuo seco, som metálico e o retículo pulsa. Nas 2 primeiras vezes da subida aparece a dica de onde ela crava;
  - **a mão não aguenta** (sem stamina ou caindo rápido): a ponta raspa, a mão treme e o motivo aparece ("Mão direita sem stamina para cravar.", "Caindo rápido demais para cravar.").
  - No VR, cada caso vibra diferente.
- Exausta, a picareta é arrancada (som de raspão) e só volta a cravar com a mão recuperada. Cravada, ela não pode ser guardada nem trocada ("A picareta está cravada"). A mão com picareta não agarra apoios comuns: guarde para usar a mão nua.
- Modelo 3D: "Climbing Axe (Low Poly)" de [Tiko](https://sketchfab.com/tikoavp), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — crédito completo em `assets/models/items/climbing_axe_low_poly.CREDITS.txt`.

### Estações de melhoria (perks)

- Três estações físicas: **Sala de controle** (76,6 m), **Mezanino** (188,6 m) e **Cabine de guincho** (331 m). Cada uma oferece 2 melhorias com contrapartida, sorteadas no começo de cada subida: nenhuma se repete entre as três estações, e ignorar e voltar não troca as ofertas. *Âncora* aparece a partir do Mezanino; *Fôlego fundo* e *Corpo leve*, só na última.
- Uma escolha por estação, no máximo **3 melhorias por subida**. Ignorar não consome a estação. Escolher não restaura stamina.
- Morte, fim ou reinício da subida limpam as melhorias e liberam as estações; pausa, mochila, console e checkpoints preservam. O console de desenvolvimento pode ativar qualquer uma para testes (`perks add help` lista os ids) (`perks` mostra `n/3`).
- As 10 melhorias (valores provisórios, para ajustar no playtest):

| Melhoria | Vantagem | Contrapartida | Onde |
|---|---|---|---|
| Pegada econômica | −15% gasto de pegada | −15% recuperação | todas |
| Recuperação rápida | +20% recuperação | +10% gasto de pegada | todas |
| Impulso potente | +10% no salto agarrado | +25% custo desse salto | todas |
| Braços longos | +10% alcance | +15% gasto de pegada | todas |
| Mãos calejadas | fadiga acumula 25% mais devagar | fadiga passa 25% mais devagar | todas |
| Respiro curto | mão livre recupera +40% na escalada | −20% recuperação no chão | todas |
| Salto econômico | −30% custo do salto agarrado | −8% de impulso nele | todas |
| Âncora | −20% gasto de pegada | +10% gravidade | Mezanino e Cabine |
| Fôlego fundo | +25% stamina máxima | −20% recuperação | só Cabine |
| Corpo leve | −25% gravidade | −40% stamina máxima | só Cabine |

- HUD: um ícone por melhoria ativa perto do retículo; na mochila, a área "Melhorias" mostra benefício e contrapartida. No VR, os ícones ficam no pulso.

### Referência e escopo desta etapa

[White Knuckle](https://whiteknuckle.net/) é descrito oficialmente como *speed-climbing* com movimento preciso e gestão de recursos. [Relatos da comunidade](https://steamcommunity.com/app/3195790/discussions/0/838377222874139765/) descrevem saltos encadeados entre agarrões: tratar o salto como algo necessariamente raro não é uma reprodução confirmada da referência. Os valores de Silos são ajustes próprios, não parâmetros extraídos daquele jogo.

Esta etapa corrige o recuo e testa o ciclo já existente de agarrar → puxar/impulsionar → agarrar acima → descansar. Não altera o mapa nem rebalanceia stamina/fadiga. Reestruturação completa dos estados, atributos efetivos com buffs/debuffs e economia continuam fora desta etapa. `PlayerStats` contém métricas de percurso e um placeholder de modificadores, ainda sem efeito na simulação; os ajustes de movimento ficam em `PLAYER_PHYSICS`.

### Validar

```bash
node tools/test_player.js     # Player real + vetores/raycast Three.js, sem renderização
for test in tools/test_*.js; do node "$test" || exit 1; done
npm run build
```

Suítes desta etapa: `test_hand_visuals.js` (espelhamento e mãos independentes), `test_climbing_axe.js` (superfícies, inventário, física, estados e VR por mock), `test_axe_concrete.js` (fincada rasa no concreto e desgaste), `test_axe_feedback.js` (reação quando a picareta não crava), `test_axe_routes.js` (faixas e caixas no grafo de alcance) `test_perk_stations.js` (ofertas, estações no mundo, painel e VR por mock) e `test_perk_rotation.js` (sorteio por subida e perks novos).

Playtest sugerido: agarrado a uma parede, salte sem WASD e confira a subida sem recuo; repita com A/D mirando outra agarra. Alterne mãos, compare com duas mãos apoiadas e teste uma borda antes/depois da puxada. Em Quest, confira A e pinça esquerda com/sem analógico. Testes automáticos não substituem a avaliação de sensação e conforto no headset.

## Jogar em VR (Meta Quest)

O WebXR só funciona em HTTPS ou em `localhost`:

- **Pelo deploy:** abra a URL da Vercel no navegador do Quest, digite o nome e toque em **Começar em VR**.
- **Pelo PC, sem deploy:** ative o modo desenvolvedor no Quest, ligue por USB, rode `npm run dev` e `adb reverse tcp:8080 tcp:8080`, e abra `http://localhost:8080` no Quest.

Os ajustes finos do VR (ganho da puxada, alcance do agarre, encaixe da mão no controle, limites do hand tracking) ficam em `VR_TUNE`, no topo de `js/player/VRPlayer.js`.

## Para desenvolvedores

**Modo espectador.** É uma câmera livre para voar pelo mapa inteiro, com paredes transparentes, nomes das partes e régua de altura. Para abrir, use a tecla F2 no menu ou abra o endereço com `?espectador` no final. Os comandos estão em [COMO_RODAR.txt](COMO_RODAR.txt).

**Navegação de debug (console).** Ative o console em Configurações e abra com `~`. Só no desktop (VR recusa), numa partida viva em jogo ou pausa:

- `goto list` lista os lugares por trecho de 100 m, com altura e o que há em cada um (caixa, estação, ala). Os atalhos `subida1`…`subida4` e `mezanino` levam ao mesmo ponto de um checkpoint: não aparecem na lista, mas o `goto` os aceita. `goto <id>` leva o corpo inteiro para um apoio seguro. Um destino sem apoio seguro no momento (por exemplo `atalho`) é recusado com o motivo, sem mexer em nada.
- `back` volta uma vez à posição de antes do último `goto`. Se aquele ponto não for mais seguro (porta, elevador ou piso mudaram), usa uma correção local anunciada como fallback; se não houver nenhuma, recusa e mantém o registro.
- `noclip`, `noclip on` / `off`, `noclip speed <1–50>` (padrão 10 m/s). Em voo, WASD segue a vista, Space sobe, Ctrl desce e Shift multiplica por 4. Física, timer, puzzles, massa, portas e elevador ficam congelados; itens, agarre, pulo e interação ficam bloqueados. Pausa, mochila e console interrompem o voo e voltam a ele com o timer parado. `noclip off` desliga onde você estiver, como no CS/Half-Life: no ar, fora do mapa ou dentro de parede. Não há teleporte nem recusa; a física normal volta daquele ponto (você pode cair, ficar preso ou morrer) e o console avisa o risco da posição (sem apoio, dentro de geometria, massa, pás). Os gatilhos continuam protegidos até você sair e reentrar.
- Marcos, salas, tela do Arquivo e o limiar da massa não disparam por teleporte nem voo. Depois do salto, eles ficam protegidos até você sair e reentrar na região andando, escalando ou pulando normalmente. `status` lista cada gatilho protegido e o que falta para rearmá-lo. Ficar parado, o vento, o elevador ou a gravidade não rearmam.
- Qualquer `goto`, `back` ou `noclip on` marca a run como **assistida** até a próxima run: o HUD mostra RUN ASSISTIDA (e NOCLIP quando ligado), o resultado avisa “pontuação não competitiva” e a pontuação nunca entra no ranking, nem pelo desktop nem pelo VR. Ajustar a velocidade, consultar e errar comandos não marcam.
- O Quest não foi testado com esses comandos; eles são recusados em VR.

**Ajuste da escalada.** Os trechos de subida depois da passarela ficam em `js/world/Climbs.js` (`_subida1` … `_subida4`), escritos em coordenadas polares (ângulo na parede, altura); lá também estão as peças (rachadura, corda, cano, escada, saliência, andaime, passarela, tubo, chapa, luminária). As linhas de tijolos usam `CLIMB` em `js/world/levelData.js` (distância entre tijolos e tijolos que desmoronam). Os ventiladores ficam em `EXHAUST.fan` e `INSUF.fan`. Depois de mexer numa subida, rode `node tools/test_ritmo.js`.

**Geometria e colisão.** O poço, os pisos e as passarelas circulares são setores anelares; os objetos fora das direções cardeais são caixas giradas. As três formas convivem em `world.platforms`, e `js/world/Collision.js` resolve o corpo do jogador contra todas elas. A parede do poço só se atravessa pelas aberturas, garantido por `world.guard`.

**Testes sem navegador.**

```bash
node tools/test_cilindro.js     # o poço é um cilindro: geometria, colisão, volta completa, aberturas, diafragmas
node tools/test_ventiladores.js # fluxo de ar: direção, intensidade, abrigo, sucção, insuflador
node tools/test_mundo.js        # trancas, conectividade, alas a pé, escada, elevador e insuflador (Player real)
node tools/test_rota.js         # um robô sobe a rota inteira com a física real (estamina, pílulas, quedas)
node tools/test_ritmo.js        # trecho inicial intacto, trechos curtos, variedade por subida, vãos de prego, ritmo lento
node tools/test_escalada.js     # alcance real da escalada
node tools/test_halls.js        # puzzles das alas
node tools/test_espectador.js
node tools/test_final.js        # os quatro finais
node tools/test_scripts.js      # ordem dos scripts no index.html
node tools/test_setores.js      # janela de renderização com o Three.js real: colisão e raycast intactos, estados, histerese, liberação
node tools/test_developer_navigation.js  # goto/back atômicos, cancelamento nas duas mãos, console real
node tools/test_items_ownership.js      # item em uma mão só (troca sem duplicar), esgotados somem da mochila
node tools/test_debug_simulation.js      # noclip: voo, congelamento real, porta por dt, bloqueio de ações/overlays/XR
node tools/test_navigation_progression.js # gatilhos protegidos e rearme só por locomoção normal
node tools/test_debug_ranking.js         # run assistida fora do ranking (Game + Ranking), aviso no resultado e HUD
```

### Desempenho, distância de renderização e VR

O mapa inteiro é montado na carga (a colisão e as agarras sempre completas), mas só o que está em volta dos olhos é desenhado. Tudo é regulado em [js/core/renderConfig.js](js/core/renderConfig.js): perfis `pc` e `vr`, distância da neblina, janela acima/abaixo, histerese, pré-carga, descarga, LOD, luzes e escala do framebuffer do Quest, além de ajustes por região (salas fechadas com janela menor, insuflador com mais pré-carga acima). No menu, **Qualidade** e **Distância de visão** escolhem a variação do perfil.

- **Setores** ([js/world/SectorManager.js](js/world/SectorManager.js)): faixas de 10 m do poço e uma por sala de `world.puzzleRooms`. Estados descarregado → carregando → pronto → ativo, com histerese na saída e atraso na descarga. Sala com puzzle em andamento não descarrega. Descarregar libera só as texturas específicas do setor; colisão, agarras, pregos, portas e puzzles nunca mudam.
- **Desenho**: peças estáticas viram uma malha por material e por setor (as originais ficam invisíveis, como alvo do raycast); as agarras de tijolo viram `InstancedMesh` (a que desmorona volta a ser desenhada sozinha); andaimes e luminárias glTF trocam por uma caixa da mesma cor além de `lod` metros.
- **Luzes**: as luzes das salas são virtuais. Um pool fixo copia as mais relevantes, e o shader nunca recompila no meio do jogo.
- **Neblina**: `FogExp2` radial (distância real ao olho), igual em qualquer direção e nos dois olhos do VR. O fim da janela fica dentro da neblina opaca.
- **VR**: escala do framebuffer pela qualidade, aplicada antes de `setSession`; foveação fixa do Quest. O Three.js r128 não tem multiview nem `setFoveation`.

**Diagnóstico.** F3 (ou `?diag` no endereço, ou `diag` no console) mostra FPS, tempo de quadro, draw calls, triângulos, memória de GPU, setores, luzes e região; em VR aparece num painel preso à vista e no console a cada 5 s. O comando `setores` no console lista os ativos. Chaves de comparação: `?nobatch`, `?nosectors`, `?perfil=vr` (perfil do VR na tela do PC).

**Banco de desempenho** (Chrome headless, mesmas posições e ângulos):

```bash
node tools/perf_bench.js                    # 11 posições × 4 direções, idas e voltas a 30 m/s, 3 reinícios
node tools/perf_bench.js --query perfil=vr  # perfil do VR emulado no PC
node tools/perf_bench.js --audit            # o que existe no mapa: malhas, triângulos e luzes por tipo e altura
```

### Estrutura

```
js/
  Game.js          estados da partida, entrada e loop principal
  player/          escalada com duas mãos, modelo das mãos, VR
  world/           mapa (poço cilíndrico, colisão, subidas, alas, ventiladores, elevador), texturas e dados do nível
  items/           itens, inventário e animações de uso
  interaction/     objetos interativos (painéis, válvulas, alavancas, leitores…)
  systems/         massa que sobe, puzzles, cronômetro, modo espectador
  ui/              menus, HUD, mochila, cinemática de abertura, painéis do VR
  atmosphere/      áudio e clima
assets/models/     modelos glTF e texturas (créditos em assets/models/README.md)
tools/             testes que rodam no Node, sem navegador
scripts/build.mjs  build estático para dist/
```
