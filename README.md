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
| Usar item | botão direito com o item na mão | gatilho direito |
| Mochila / inventário | Tab, depois 1 a 4 | Y (inventário no pulso) |
| Guardar item | X | X |
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

### Referência e escopo desta etapa

[White Knuckle](https://whiteknuckle.net/) é descrito oficialmente como *speed-climbing* com movimento preciso e gestão de recursos. [Relatos da comunidade](https://steamcommunity.com/app/3195790/discussions/0/838377222874139765/) descrevem saltos encadeados entre agarrões: tratar o salto como algo necessariamente raro não é uma reprodução confirmada da referência. Os valores de Silos são ajustes próprios, não parâmetros extraídos daquele jogo.

Esta etapa corrige o recuo e testa o ciclo já existente de agarrar → puxar/impulsionar → agarrar acima → descansar. Não altera o mapa nem rebalanceia stamina/fadiga. Reestruturação completa dos estados, atributos efetivos com buffs/debuffs e economia continuam fora desta etapa. `PlayerStats` contém métricas de percurso e um placeholder de modificadores, ainda sem efeito na simulação; os ajustes de movimento ficam em `PLAYER_PHYSICS`.

### Validar

```bash
node tools/test_player.js     # Player real + vetores/raycast Three.js, sem renderização
for test in tools/test_*.js; do node "$test" || exit 1; done
npm run build
```

Playtest sugerido: agarrado a uma parede, salte sem WASD e confira a subida sem recuo; repita com A/D mirando outra agarra. Alterne mãos, compare com duas mãos apoiadas e teste uma borda antes/depois da puxada. Em Quest, confira A e pinça esquerda com/sem analógico. Testes automáticos não substituem a avaliação de sensação e conforto no headset.

## Jogar em VR (Meta Quest)

O WebXR só funciona em HTTPS ou em `localhost`:

- **Pelo deploy:** abra a URL da Vercel no navegador do Quest, digite o nome e toque em **Começar em VR**.
- **Pelo PC, sem deploy:** ative o modo desenvolvedor no Quest, ligue por USB, rode `npm run dev` e `adb reverse tcp:8080 tcp:8080`, e abra `http://localhost:8080` no Quest.

Os ajustes finos do VR (ganho da puxada, alcance do agarre, encaixe da mão no controle, limites do hand tracking) ficam em `VR_TUNE`, no topo de `js/player/VRPlayer.js`.

## Para desenvolvedores

**Modo espectador.** É uma câmera livre para voar pelo mapa inteiro, com paredes transparentes, nomes das partes e régua de altura. Para abrir, use a tecla F2 no menu ou abra o endereço com `?espectador` no final. Os comandos estão em [COMO_RODAR.txt](COMO_RODAR.txt).

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
