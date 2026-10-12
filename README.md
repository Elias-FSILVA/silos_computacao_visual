# Silos

Jogo de escalada em primeira pessoa com Three.js. Roda no navegador com mouse e teclado, ou em VR no Meta Quest (3/3S) pelo navegador do headset.

## Rodar localmente

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

Os controles de VR estão no menu do jogo. Os ajustes finos (ganho da puxada, alcance do agarre, encaixe da mão no controle, limites do hand tracking) ficam em `VR_TUNE`, no topo de `js/player/VRPlayer.js`.
