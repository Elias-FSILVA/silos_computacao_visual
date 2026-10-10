# Modelos 3D

Coloque aqui os modelos do jogo em `.glb` (preferido) ou `.gltf`, separados por pasta:

```text
player/   mãos
items/    martelo, prego, pílulas, cartão
world/    agarras, canos, portas, caixas
```

## Como adicionar um modelo

1. Salve o arquivo na pasta certa.
2. Registre em `js/core/modelDefs.js`: um id, o arquivo e o ajuste (`scale`, `rotation`, `offset`) para o modelo casar com o jogo.
3. No código, use `Models.get('id')`. Ele devolve uma cópia pronta, ou `null` se o modelo não carregou; por isso, sempre deixe um modelo padrão como reserva:

```js
const mesh = Models.get('hammer') || makeHammer();
```

Os modelos só carregam com o jogo rodando por `npm run dev`; aberto por duplo clique, o jogo usa os modelos padrão.

Para carregar um arquivo avulso, fora do catálogo:

```js
Models.load('items/martelo.glb').then(gltf => {
  scene.add(gltf.scene);       // grupo com as malhas
  // gltf.animations → animações prontas (THREE.AnimationMixer)
});
```

## Antes de adicionar um modelo

- **Até ~10 mil triângulos** por modelo (uma mão: 3–5 mil).
- **1 material** sempre que der; cada material a mais é mais um pedido de desenho à placa de vídeo.
- **Texturas de até 1024 px**, embutidas no `.glb`.
- **Escala em metros** (a mão do jogo tem ~19 cm do pulso à ponta dos dedos).
- **Mãos e personagens precisam de esqueleto (ossos)** para os dedos dobrarem.
- **Confira a licença** (CC0 não exige nada; CC-BY exige dar crédito) e anote a fonte abaixo.

## Créditos

| Arquivo | Autor | Fonte | Licença |
|---|---|---|---|
| `items/martelo.glb` | Quaternius | Poly Pizza | CC0 (confirmar na página do modelo) |
| `player/hand_lowpoly_rigged.glb` | ? | gerado ("procedural hand builder") | confirmar |
| `player/hand_lowpoly_rigged_left.glb` | ? | gerado ("procedural hand builder") | confirmar |
| `map/tijolo/_TEXTURES/Brick_Wall_017_*` (cor, AO, normal — usados em `js/world/assets.js`; o `.obj` não é carregado) | a confirmar | a confirmar | a confirmar |

## Mãos (`handR` / `handL`)

O `HandModel` move os ossos pelo nome, então um modelo novo de mão precisa seguir o mesmo esqueleto:
pulso na origem, dedos para +y, palma para +z, ossos `Index|Middle|Ring|Pinky` + `_Proximal|_Intermediate|_Distal`
e `Thumb_Metacarpal|Thumb_Proximal|Thumb_Distal`. As poses `Pose_Open` e `Pose_Fist` do arquivo definem o curso do polegar.
Se faltar algum osso, o jogo avisa no console e usa a mão procedural.
