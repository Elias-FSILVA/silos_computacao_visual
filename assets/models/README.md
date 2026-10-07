# Modelos 3D

Coloque aqui os modelos do jogo em `.glb` (preferido) ou `.gltf`.

Para carregar no código:

```js
Models.load('mao.glb').then(gltf => {
  const obj = gltf.scene;     // grupo com as malhas
  scene.add(obj);
  // gltf.animations → animações prontas (THREE.AnimationMixer)
});
```

## Antes de adicionar um modelo

- **Até ~10 mil triângulos** por modelo (uma mão: 3–5 mil).
- **1 material** sempre que der; cada material a mais é mais um pedido de desenho à placa de vídeo.
- **Texturas de até 1024 px**, embutidas no `.glb`.
- **Escala em metros** (a mão do jogo tem ~19 cm do pulso à ponta dos dedos).
- **Confira a licença** (CC0 não exige nada; CC-BY exige dar crédito) e anote a fonte abaixo.

## Créditos

| Arquivo | Autor | Fonte | Licença |
|---|---|---|---|
