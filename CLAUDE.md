# BrinquedoVR

Batalhão de Brinquedo: tática de esquadrão por turnos em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. Num quintal de verdade num dia de sol (gramado, cerca, árvores, a parede da casa), uma mesa
de jardim tem um quintal em miniatura com grade de 12 x 10 casas: grama, vasos, regador, tijolos, mangueira
e pedras como cobertura. Você comanda 4 soldadinhos de plástico azul contra 4 robôs de corda de lata.
Cada boneco tem 2 ações por turno; chance de acerto por distância e cobertura (meia ou inteira) mostrada
antes de atirar, linha de visão de verdade, flanco anula a cobertura, névoa de guerra. Dá para "olhar do
soldado" (no PC a câmera desce até o boneco; no VR, um retrato na mão). Batalha contra 3 generais robôs e
10 missões com 3 estrelas. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/BrinquedoVR/`
e apertar "Entrar em VR". (Publicação é com o Eduardo: `python publicar.py BrinquedoVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8886` (o painel de visualização usa
`.claude/launch.json`). `python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Escolher soldado | Pegar com o botão lateral (ou pinça perto), ou raio + gatilho | Clicar nele ou teclas 1 a 4 (Tab: o próximo) |
| Andar | Pegar o boneco e soltar na casa; ou raio + gatilho na casa | Clicar na casa azul (1 ação) ou amarela (corrida, 2 ações) |
| Mirar e atirar | Raio no robô mostra a chance; de novo atira (ou botão Atirar) | Clicar no robô (chance aparece), clicar de novo ou Enter |
| Granada / Curar | Botões na beirada da mesa, depois a casa ou o vizinho | G e C |
| Vigiar / Agachar | Botões na beirada da mesa | V e B |
| Olhar do soldado | Botão "Olhar": retrato na mão esquerda | Q (Q ou Esc volta) |
| Fim do turno | Botão vermelho | Espaço |
| Só com as mãos | Pinça perto pega o boneco ou aperta botão; pinça apontando escolhe de longe | |
| Pausa | B ou Y | Esc ou P |
| Câmera | (sua cabeça) | Botão direito arrastando ou A/D/W/S; roda do mouse aproxima |
| FPS | Menu → FPS | Tecla F |

No VR você fica em pé na beirada da mesa (tampo a 78 cm); o tabuleiro tem 90 x 75 cm e os bonecos uns 7 cm.

### Regras

- Cada unidade tem 2 ações. Andar até o alcance gasta 1; correr (até o dobro) gasta 2. Atirar, granada,
  curar, vigiar e agachar encerram a vez daquele boneco. Quando todos agiram (ou "Fim do turno"), os robôs jogam.
- Tipos (`TYPES` em `js/rules.js`): **Fuzileiro** (vida 5, anda 4, mira 72, alcance 9, 2 de dano),
  **Granadeiro** (vida 5, mira 62, 2 granadas: até 5 casas, área 3x3, 2 de dano, ignora cobertura),
  **Batedor** (vida 4, anda 5, enxerga 11), **Médico** (vida 4, dano 1, 2 curas de +2 no vizinho). Os robôs
  têm os mesmos tipos (Robô Fuzil, Robô Morteiro, Robô Corredor, Robô Reparo).
- Chance: mira - 3 por casa além de 4 - 20 (meia cobertura) ou - 40 (cobertura inteira); agachado tira mais
  20 (ou 15 sem cobertura); flanco (alvo com cobertura, mas nenhuma do lado de quem atira) dá +10 e +1 de
  dano; vigiar atira com -15. Entre 5% e 95%.
- Cobertura: tijolo baixo, mangueira e pedra são meia; vaso, regador e muro de tijolos são inteira e também
  tapam a visão (menos quando estão encostados em quem atira ou em quem leva o tiro: o boneco espia).
- Névoa de guerra: você só vê os robôs que algum soldado enxerga; onde viu um robô pela última vez fica um
  fantasma com "?". A IA tem a mesma regra (o teste confere).
- Vigiar: atira no primeiro inimigo que andar na vista dele, uma vez.
- Generais (`GENERALS` em `js/ai.js`): **General Engrenagem** (avança em massa, quase ignora cobertura),
  **Capitã Mira** (atiradora: fica na cobertura, vigia, só atira com boa chance), **Major Manivela**
  (flanqueador: procura o lado sem cobertura, usa granada; é o mais forte).
- Batalha: 4 contra 4, até 20 turnos (no fim, ganha quem tem mais vida somada). Mapa sorteado entre
  `quintal` e `canteiro`.
- Missões (`js/challenges.js`): 1 Primeira Patrulha, 2 Resgate do Cabo (buscar o Cabo Tampinha e trazer),
  3 Segurar a Mangueira (3 rodadas na faixa sem robô), 4 Atravessar o Canteiro, 5 Sabotagem (pisar nas 2
  chaves de corda), 6 Sem Baixas, 7 Emboscada (robôs começam vigiando), 8 Só o Batedor, 9 Relâmpago,
  10 O General. Medida: turnos de sobra, soldados de pé ou vida somada.
- Progresso salvo no navegador (localStorage, chave `brinquedovr.v1`).

## Como testar

- `npm test` (ou `node tests/run.js`): grade e ações (2 ações, andar 1, correr 2, obstáculo, granada,
  cura, agachar encerra), linha de visão (muro tapa, tijolo baixo não), cobertura meia e inteira, flanco
  (+chance e +1 dano), distância, agachado, acertos batendo com a chance mostrada, vigiar atira uma vez;
  névoa (atrás do muro é névoa, visão pública só com os inimigos à vista, **a IA não espia**: soldados
  escondidos em outro lugar não mudam a decisão, a memória é de onde viu); IA (ação válida, menos de 100 ms,
  Engrenagem avança mais, Mira vigia mais, Manivela pega mais de flanco); IA contra IA em 160 batalhas por
  par, metade de cada lado (Manivela ganha dos dois, Engrenagem da Mira; mostra os placares); robô tira 3
  estrelas nas 10 missões e "só agachar" não dá 3; e fumaça do `main.js` (carrega o jogo no Node com
  navegador e WebGL de mentira: clique no soldado e na casa anda, Q olha do boneco, clique no robô mira e
  de novo atira, B agacha, Espaço passa a vez e os robôs jogam, controle de VR de mentira pega o boneco e
  solta na casa, mão de mentira anda apontando de longe e aperta Vigiar com a pinça, retrato no VR, robô
  termina a batalha, as 10 missões com 3 estrelas dentro do jogo, `dev.win()`, `dev.cheat()`, pausa, sem
  erro no console). Tem que terminar com "Tudo certo"; sai com código 1 se algo falhar (ou 200 s). Não toca som.
- O teste de fumaça usa `module.registerHooks` do Node (22.15 ou mais novo).
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()`, `dev.cheat()` (onde estão
  os robôs), `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.win()`, `dev.place(id, x, y)` (teleporte, só para
  teste), `dev.screenOf({ unit } | { cell: [x, y] } | { button })`, `dev.resetSave()`. `window.brinquedo` tem
  `battle`, `challenge`, `save`, `camera`, `scene`, `renderer`, `world`, `shell`, `models`.
- **Só dá para testar no óculos:** pegar o boneco pequeno e soltar na casa, raio, mãos, o retrato na mão,
  legibilidade dos botões e corações, FPS (sombra de 1 luz, mapa 2048, render extra do retrato).

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar e dica do PC |
| `js/rules.js` | Mapas, tipos, linha de visão, cobertura e flanco (`shotInfo`), movimento (`reachable`), ações (`applyAction`), vigiar, névoa (`visibleCells`, `publicView`), missões. Sem navegador |
| `js/ai.js` | Os 3 generais e o robô (`chooseAction`, `playTurn`, `playBattle`). Sem navegador |
| `js/challenges.js` | As 10 missões, medida e estrelas (`runChallenge`, `naive`). Sem navegador |
| `js/shell.js` | Casca: render, câmera, VR, mouse/teclado, painel, placas, FPS, laço (igual ao dos outros jogos) |
| `js/main.js` | O jogo: escolher, andar, mirar, atirar, botões, animação dos eventos, vez dos robôs, névoa e fantasmas, olhar do soldado, menus, HUD, `dev` |
| `js/scene.js` | Quintal, mesa, tabuleiro, obstáculos, soldadinhos e robôs, casas coloridas, escudinhos de cobertura, tiros e explosões, botões, retrato |
| `js/visual3d.js`, `js/materiais3d.js` | Da skill `dudu`: céu, sol com sombra, chanfro, halo, madeira e tijolo em textura gerada |
| `js/ui.js`, `js/audio.js`, `js/save.js` | Painel/placas, sons (passinho de plástico, catraca do robô, tiro de brinquedo, granada, corneta, passarinhos), progresso |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8886, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Casa (x, y): x de 0 a 11 da esquerda para a direita, y = 0 no fundo (robôs) e y = 9 na sua beirada.
Tabuleiro centrado em (0; -0,52), casa de 7,5 cm (`cellPos`), botões em z = `BTN_Z`.

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não usam navegador nem Three.js.
- A IA só olha `publicView` (as próprias unidades, os inimigos à vista e os fantasmas). Se ela tenta andar
  para uma casa ocupada por alguém escondido, "esbarra" e escolhe outra.
- Os tiros usam um sorteio que depende da semente e de quantos tiros já houve: a missão é sempre igual
  para a mesma sequência de ações, e o robô do jogo faz o mesmo que o do teste.
- Mexeu em regras, IA ou missões: rodar `npm test`. As metas das missões saem do resultado do robô.
- Testes nunca tocam som; eventos disparados por script não destravam o áudio (`isTrusted`).

## Decisões

- Direção de arte: brinquedo de plástico liso, dia de sol. Paleta dominante verde da grama (#78a84c /
  #5f8f3c), secundária terracota e madeira (#c8643a, #c89a6a), destaque azul dos soldadinhos (#3a78d8)
  contra o vermelho de lata dos robôs (#c8463a). Sol quente em 3/4 com sombra (mapa 2048 numa área de 1 m),
  céu azul.
- Soldadinhos azuis, não verdes: verde de plástico some na grama.
- Atirar encerra a vez do boneco (como no XCOM): sem isso o jogo virava "atira duas vezes".
- Cobertura inteira encostada no alvo não tapa a visão (só tira 40): senão o vaso deixava o alvo intocável.
- Batedor anda 5 (era 6): com 6 ele atravessava o tabuleiro de 10 casas numa corrida.
- Ordem dos generais pela força: Manivela > Engrenagem > Mira (a Mira, cautelosa demais, perde para quem avança).
- Porta do servidor local 8886.

## Pendências / problemas conhecidos

- Falta testar no Quest: pegar o boneco de 7 cm com a mão, soltar na casa certa, raio, mãos, o retrato na
  mão (render extra a cada quadro), corações e botões legíveis, FPS.
- A Manivela ganha do Engrenagem por pouco (104 x 56 em 160); contra gente só jogando para saber.
- Visto de cima, o tabuleiro fica um pouco chapado (contraste 13 no `analisar_print.py`, o bom é 15 a 28).
