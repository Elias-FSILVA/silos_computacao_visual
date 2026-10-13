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
