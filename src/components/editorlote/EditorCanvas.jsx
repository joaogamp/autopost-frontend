import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ImageOff, Trash2 } from 'lucide-react';
import {
  CANVAS_LARGURA,
  CANVAS_ALTURA,
  CORTE_MAXIMO,
  corteEfetivoDoVideo,
  familiaDeFonte,
  pesoDeTexto,
  areaVideoNormalizada,
  areaVideoEfetivaDoVideo,
  areaJanelaDeComposicao,
  caixaEnquadramentoVideo,
  geometriaEnquadramentoVideo,
  geometriaVideoFinal,
  posicaoEfetivaDoVideo,
  limiteDeMovimento,
  editarTodosOsVideos,
  dimensoesDoItem,
  deslocamentoSobZoom,
  normalizarZoomVideo,
  pixelsDeCorte,
  atualizarAreaVideoNoConfig,
  ZOOM_VIDEO_MIN,
  ZOOM_VIDEO_MAX,
} from '../../lib/configEditorLote';
import {
  gerarArrasteDeRuta,
  gerarRedimensionarTextoLargura,
  gerarArrastarCorteSuperior,
  gerarArrastarCorteInferior,
  gerarArrastarPosicaoVideo,
} from './arraste';
import ControlesVideo from './ControlesVideo';
import { ElementoIdentidadeTexto, ElementoIdentidadeSelo } from './ElementoIdentidade';
import ElementoImagem from './ElementoImagem';

/**
 * EDITOR EM LOTE — canvas de edición (EditorCanvas).
 *
 * Canvas 9:16 reutilizado em DOIS lugares:
 * - CÉLULA SELECIONADA da área central (interativo=true): canvas completo com
 *   vídeo REAL + ControlesVideo + textos + identidade + corte de bordas;
 * - DEMAIS CÉLULAS (interativo=false): SOMENTE visualização do MESMO canvas
 *   com a MESMA config compartilhada (textos/identidade/área/corte aparecem
 *   iguais), sem áudio — SOLO thumbnail estática (parada), nunca un <video>
 *   con autoplay/loop en background.
 *
 * PREVIEW SIMPLES — O VÍDEO NÃO É EDITÁVEL NO CANVAS:
 * - NÃO existe caixa de seleção, borda, alça/handle, outline de seleção,
 *   arraste, cursor de arraste, zoom (roda do mouse ou toque), botão
 *   "Redefinir" nem dica flutuante sobre o vídeo. O preview mostra o vídeo e
 *   nada mais;
 * - a `areaVideo` CONTINUA EXISTINDO como DADO interno (não é removida): é ela
 *   que posiciona o vídeo dentro do canvas 1080×1920. `areaVideo` é gravada
 *   pelo sistema (canvas inteiro por padrão) e viaja intacta no payload;
 * - ARQUITETURA (template = FUNDO, vídeo = CAPA): o `template.png` 1080×1920 é
 *   o fundo do quadro (z-index 1) e o vídeo recortado é a capa por cima
 *   (z-index 2) — mesma ordem do engine (`[fundo][v_rec]overlay=x:y`). Onde o
 *   vídeo não cobre, aparece a arte do template; nunca branco;
 * - CORTE DE BORDAS = RECORTE REAL: o wrapper do vídeo tem o tamanho exato do
 *   vídeo já cortado e o player é deslocado pelo topo cortado. É o MESMO crop
 *   do FFmpeg (`crop=iw:ih*(1-top-bottom):0:ih*top` + `scale=W:-2`), feito no
 *   elemento. O que foi cortado NÃO EXISTE na prévia — sem `clip-path: inset`,
 *   sem faixas com `background: corFondo`, sem buraco `path(evenodd)`;
 * - PRÉVIA = RENDER por construção: ambos consomem a MESMA função pura
 *   `geometriaVideoFinal()` (crop → escala → posição), e é dela que sai o
 *   payload `corteCrop`/`larguraAlvoVideo`/`posicaoVideo`;
 * - ARRASTE do vídeo: grava `offsetX`/`offsetY` em px da base 1080×1920 —
 *   exatamente o `x`/`y` do `overlay`. Respeita o escopo "Todos os vídeos" e a
 *   região de trava opcional (`limiteMovimento`);
 * - PRÉVIA x PROCESSAMENTO (uma ÚNICA fonte de verdade para a geometria): a
 *   PRÉVIA desenha o vídeo na ÁREA de composição com a MESMA geometria do
 *   render (`caixaEnquadramentoVideo`): quadro = área × zoom, posicionado por
 *   deslocamentoX/Y e SEMPRE em cover (a ÁREA é exatamente o espaço do vídeo —
 *   ele preenche 100% da largura/altura dela, nunca fica pequeno/centralizado);
 * - Corte de bordas: DUAS ferramentas independentes na mesma tela.
 *   (a) O VALOR EFETIVO é sempre o override DESTE vídeo
 *   (`corteEfetivoDoVideo`) — venha ele do detector automático ou da linha
 *   arrastada; a prévia o mostra com `clip-path` + as faixas de cor de fundo
 *   (o mesmo `drawbox` do FFmpeg), em TODAS as células do lote, porque é o
 *   resultado que o vídeo final terá;
 *   (b) as LINHAS são a FERRAMENTA MANUAL: só na célula editável e só quando
 *   o painel liga "Corte manual por linhas". Arrastar grava o override com
 *   `origem:'manual'` e NUNCA toca no resultado bruto do detector. FORA desse
 *   modo, NENHUMA linha/haste/caixa de edição aparece sobre o vídeo;
 * - template removido da lista de edição: o template é a fonte visual
 *   COMPLETA (fundo, textos, imagens, gráficos) — o Editor não adiciona nada
 *   por cima;
 * - os CONTROLES DO PLAYER (play/pause · progresso · volume) vivem numa camada
 *   FIXA própria (`data-edl-destino-controles`) no fundo do canvas.
 */

/** Altura MÁXIMA padrão do preview 9:16 na TELA (px). Pode ser sobrescrita
 * por célula via prop `alturaMaxima` (a área central usa valores menores
 * nos modos 2X/3X para caberem lado a lado). */
const ALTURA_MAXIMA_PADRAO = 500;

/** (Removido) O retângulo de vídeo PADRÃO usado como fallback do buraco do
 * template não existe mais: o buraco vem do campo DEDICADO `areaTemplate`
 * (`configEditorLote.areaTemplateEfetiva`). A área física do vídeo
 * (`areaVideo`) nunca é mais reduzida para criar moldura — o vídeo ocupa
 * 100% do canvas 1080×1920, com ou sem template. */

/** (Removido) A prévia NÃO usa mais um encaixe fixo 'contain' do canvas
 * inteiro: ela desenha o vídeo DENTRO da área de composição, sempre em
 * cover (a área é exatamente o espaço do vídeo), com o MESMO enquadramento
 * que o render final — prévia = render, por construção. */

export default function EditorCanvas({
  config,
  aoAtualizarConfig,
  itemSelecionado,
  urlVideoAtiva,
  // Quando `false`, o canvas vira SOMENTE visualização (célula NÃO
  // selecionada da área central): sem arrastes, sem manijas, sem ControlesVideo
  // com áudio — mostra thumbnail/vídeo mutado + overlays da config compartilhada.
  interativo = true,
  alturaMaxima = ALTURA_MAXIMA_PADRAO,
  // Rodapé "Editando: ..." (modo editor único). Nas células da área central
  // o nome/status é renderizado pela própria área — então fica desligado.
  mostrarRodape = true,
  // Layout compacto de célula (área central): sem `flex-1`, largura total.
  compacto = false,
  // Token de "remontaje" del reproductor: a área central muda de modo (1X→2X→3X)
  // y al cambiar, el ControlesVideo DEBE remontar-se pausado (nunca queda un
  // vídeo antiguo reproduciendo). Se concatena a la `key` do reproductor.
  claveReproductor = '',
  // Card do VÍDEO BASE (célula selecionada na área central): mostra o selo
  // discreto "Base" + a LIXEIRA pequena no canto do canvas.
  base = false,
  // Remove o VÍDEO BASE deste card (removçom LOCAL: sai da lista do Editor e do
  // localStorage; o arquivo original continua na Biblioteca — sem DELETE).
  aoRemoverBase,
  // SELEÇÃO DE ELEMENTOS (Camadas ⇄ Preview): id do elemento selecionado
  // ('textoSuperior', 'video', 'area', 'selo', 'imagem:<id>'…)
  // e callback pra selecionar/desselecionar. SÓ a célula editável seleciona.
  elementoSelecionado = null,
  aoSelecionarElemento,
  // O TEMPLATE é SEMPRE VISÍVEL: assim que um template é importado ele passa a
  // compor o canvas, sem depender de nenhum outro estado. A prévia é montada
  // na MESMA ordem do engine (compor.js): vídeo → corte → template por cima →
  // textos/imagens. O template traz o BURACO no retângulo VAZADO
  // (`areaTemplate` — separado de `areaVideo`, que é só a posição do vídeo),
  // o mesmo `dest-out` que o construirOverlay.js faz no PNG — sem buraco ele
  // entra como arte cheia por cima.
  //
  // CORTE MANUAL POR LINHAS — liga a FERRAMENTA (as duas linhas arrastáveis)
  // na célula editável. Desligado, o canvas mostra só o EFEITO do corte
  // (clip-path do valor efetivo, vindo do detector ou da linha) e nada é
  // arrastável. Vem do PainelFluxo ("Corte manual por linhas").
  linhasCorteAtivas = false,
}) {
  // A composição (vídeo na área + corte + template + textos) é SEMPRE ativa:
  // não existe mais "Estado A" (template sem vídeo) nem um toggle de preview.
  // A marcação da área do vídeo foi removida, então o vídeo acompanha a
  // `areaVideo` em tempo real, sem congelamento de geometria.
  const composicaoAtiva = true;
  const canvasRef = useRef(null);
  const contenedorRef = useRef(null);
  const [escala, setEscala] = useState(1);

  // Somente a célula selecionada da área central edita: as demais são
  // SOMENTE visualização (mesmos overlays, sem arraste/manijas).
  const podeEditar = interativo && typeof aoAtualizarConfig === 'function';
  const atualizador = podeEditar ? aoAtualizarConfig : () => {};

  // -------------------------------------------------------------------------
  // MODO CONFERÊNCIA — VÍDEO PRONTO (declarado ANTES de qualquer uso, inclusive
  // nas dependências dos effects abaixo). O player já aponta para o MP4 FINAL
  // (/arquivos/publicados/{filaId}.mp4): é o quadro COMPLETO 1080×1920 com
  // o template JÁ aplicado pelo engine. Nesse modo o canvas
  // mostra SÓ esse MP4 (sem overlay, guia, alça ou clip de edição) e o player
  // ocupa o CANVAS INTEIRO — reaplicar a composição sobre o final duplicaria
  // a arte. A edição continua idêntica para os vídeos que ainda NÃO
  // foram implementados.
  const conferencia = !!(
    itemSelecionado &&
    itemSelecionado.filaId &&
    itemSelecionado.status === 'concluido' &&
    Number(itemSelecionado.percentual) === 100
  );
  // Em conferência a EDIÇÃO fica desligada (sem arraste/zoom/alças/overlays),
  // mas o player CONTINUA montado — é o que o usuário precisa assistir.
  // A edição do VÍDEO é livre na célula editável: a marcação da área não existe
  // mais, então o objeto de vídeo É o próprio retângulo da composição.
  const podeEditarVideo = podeEditar && !conferencia;

  // Handlers — arrastre genérico por ruta: cada elemento es independente.
  // Nas células NÃO selecionadas (podeEditar=false) os handlers viram no-op.
  const arrastarTextoSuperior = gerarArrasteDeRuta(['textos', 'superior'], atualizador);
  const arrastarTextoInferior = gerarArrasteDeRuta(['textos', 'inferior'], atualizador);
  const redimensionarTextoSup = gerarRedimensionarTextoLargura(['textos', 'superior'], atualizador);
  const redimensionarTextoInf = gerarRedimensionarTextoLargura(['textos', 'inferior'], atualizador);
  // ID DESTE VÍDEO NA CÉLULA (o mesmo `corte` usa) — a área vigente do preview
  // é a EFETIVA (global ⊕ `areaPorVideo[id]`). Cada célula da grade lê o seu
  // override, então "Apenas este vídeo" só move o vídeo selecionado e os outros
  // continuam lendo o global. Mesma função que o payload consome: prévia = render.
  // DECLARADO AQUI, ANTES do primeiro uso (handlers de área/corte): um `const`
  // usado acima da sua linha cai na TDZ e derrubava a tela inteira com
  // "Cannot access 'idVideoDaCelula' before initialization".
  const idVideoDaCelula = itemSelecionado?.id || null;
  // O ITEM DESTA CÉLULA — declarado AQUI, ANTES de qualquer uso. `videoSobreTemplate`
  // (mais abaixo) lê `item.thumbnail`: com o `const` depois do uso, o lado direito
  // do `||` caía na TDZ e derrubava a tela inteira em células sem player
  // ("Cannot access 'item' before initialization").
  const item = itemSelecionado;
  // SELEÇÃO — clicar num elemento do preview seleciona a camada dele (Painel
  // de Camadas + painel de configuração sincronizam). Clicar no FUNDO do
  // canvas (fora de qualquer [data-elemento]) deseleciona. Sem X/Y: seleção,
  // movimento e redimensionamento acontecem 100% no preview com o mouse.
  const selecionar = (id) => {
    if (podeEditar && typeof aoSelecionarElemento === 'function') aoSelecionarElemento(id);
  };

  /* ---------------------------------------------------------------------------
   * CORTE DE BORDAS — DUAS FONTES, UMA SÓ REPRESENTAÇÃO (AUTOMÁTICO ≠ MANUAL).
   *
   * O VALOR EFETIVO (o que a prévia recorta e o render materializa) vem
   * SEMPRE de `corteEfetivoDoVideo(config, videoIdDesteCelula)` — o MESMO
   * cálculo do pipeline, sem segunda conta. Ele já resolve a precedência:
   * override DESTE vídeo (seja vindo do detector ou da linha arrastada) >
   * `corteBordas` global.
   *
   * · O clip-path abaixo é a REPRESENTAÇÃO do valor efetivo. Ele NÃO sabe (e
   *   não precisa saber) se a origem foi o detector ou a mão do usuário — é
   *   o resultado final, o que interessa na tela e no vídeo.
   * · As LINHAS são a FERRAMENTA MANUAL: aparecem só na célula editável e
   *   só quando o usuário liga o "Corte manual" no painel. Arrastar grava
   *   `overridesPorVideo[videoId]` com `origem:'manual'` — o detector nunca é
   *   chamado aqui e o `automatico` gravado por ele NÃO é sobrescrito.
   *   A REPRESENTAÇÃO visual é o RECORTE REAL do wrapper do vídeo (abaixo),
   *   calculado pela MESMA função pura `geometriaVideoFinal` que o render usa.
   * ------------------------------------------------------------------------- */
  // O VALOR EFETIVO do corte usa o MESMO `idVideoDaCelula` (declarado acima, no
  // bloco dos handlers): o override DESTE vídeo vence o `corteBordas` global.
  const corte = corteEfetivoDoVideo(config, idVideoDaCelula);
  const corteAtivo = !!corte.ativo && (corte.superior > 0 || corte.inferior > 0);
  const corteSup = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.superior) || 0));
  const corteInf = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.inferior) || 0));
  // O corte é materializado pelo RECORTE REAL do wrapper do vídeo (abaixo).
  // Estas duas posições alimentavam o antigo `clip-path: inset(...)` e o
  // `drawbox` do FFmpeg — que pintavam uma caixa de cor por cima do vídeo.
  // `posLinhaInferior` segue em uso como `aria-valuenow` da linha inferior.
  const posLinhaInferior = 100 - corteInf;
  // As linhas SÓ existem na célula editável e fora de conferência (MP4 pronto)
  // — e NÃO dependem de `previewAtivo`, do antigo modo de marcação nem da
  // "Área do vídeo": elas são a FERRAMENTA manual, acima de todas as camadas.
  const linhasCorteVisiveis = podeEditar && !conferencia && linhasCorteAtivas;
  const corredorSuperior = gerarArrastarCorteSuperior(atualizador, idVideoDaCelula);
  const corredorInferior = gerarArrastarCorteInferior(atualizador, idVideoDaCelula);

  // `dimsVideoRef`/`dimsVideo`: dimensões REAIS do vídeo em exibição, reportadas
  // pelo ControlesVideo no `onLoadedMetadata` do `<video>`.
  //
  // ELAS NÃO SÃO A FONTE DA GEOMETRIA (era o bug): o `<video>` só existe na célula
  // SELECIONADA, então usar só isto fazia o card da grade calcular com dims
  // ausentes. A ordem de precedência agora é:
  //
  //   1) `dimensoesDoItem(item)` — ffprobe do UPLOAD, gravado na Biblioteca. É a
  //      MESMA fonte que o `compor.js` lê no render, e está disponível para
  //      QUALQUER item, selecionado ou não. É a fonte PRIMÁRIA.
  //   2) `dimsVideo` — o `<video>` em execução, quando existe. Serve de reforço
  //      (ex.: MP4 final, que pode ter dims diferentes do original) e de
  //      recuperação se o item ainda não foi enriquecido pelo servidor.
  //
  // Consequência: selecionar/desselecionar um vídeo NÃO muda mais a geometria —
  // o card e a célula editável calculam a MESMA conta com as MESMAS dims.
  const dimsVideoRef = useRef(null);
  const [dimsVideo, setDimsVideo] = useState(null);
  // Dims oficiais do item (ffprobe do upload). `useMemo` para a referência não
  // mudar a cada render e não invalidar o `useMemo` de `geomVideo` à toa.
  const dimsDoItem = useMemo(() => dimensoesDoItem(item), [item]);
  //
  // CONFERÊNCIA (MP4 PRONTO): o player deixa de mostrar o ORIGINAL e passa a
  // mostrar o FINAL (/arquivos/publicados/{filaId}.mp4), que JÁ é 1080×1920 pelo
  // próprio enquadramento do canvas. Nesse modo as dims do item (originais) não
  // servem — quem manda é o `<video>` realmente em exibição. Por isso a
  // precedência é INVERTIDA aqui, e só aqui.
  const dimsDaCelula = conferencia
    ? (dimsVideo || dimsDoItem || null)
    : (dimsDoItem || dimsVideo || null);
  const dimsLargura = dimsDaCelula?.largura ?? 0;
  const dimsAltura = dimsDaCelula?.altura ?? 0;

  // ---------------------------------------------------------------------------
  // GEOMETRIA DO VÍDEO SOBRE O TEMPLATE (fonte única: preview = render).
  //
  // `geometriaVideoFinal` reproduz exatamente o filtergraph do FFmpeg:
  //   crop=iw:<alturaCropPx>:0:<cropTopPx>  (crop REAL em PIXELS INTEIROS)
  //   scale=<larguraAlvo>:-2                (mantendo proporção, sem pad)
  //   overlay=x:y                           (posição arrastada, base 1080×1920)
  //
  // Os valores de recorte abaixo são os MESMOS pixels inteiros que o `compor.js`
  // manda para o FFmpeg (`pixelsDeCorte`) — nada é recalculado a partir de `%`.
  //
  // Não existe mais `clip-path: inset(...)` nem caixa de cor: o corte é um
  // recorte de verdade da imagem, e o que sobra ao redor é o TEMPLATE.
  // ---------------------------------------------------------------------------
  const posicaoVideo = posicaoEfetivaDoVideo(config, idVideoDaCelula);
  const limiteMov = limiteDeMovimento(config);
  // `dimsLargura`/`dimsAltura` são PRIMITIVOS: a dependência do memo passa a ser
  // o VALOR resolvido, não a referência do objeto — a geometria é recalculada
  // exatamente quando as dimensões mudam de verdade.
  const geomVideo = useMemo(
    () => geometriaVideoFinal({
      dimsVideo: dimsLargura > 0 && dimsAltura > 0 ? { largura: dimsLargura, altura: dimsAltura } : null,
      corte: { ativo: corteAtivo, superior: corteSup, inferior: corteInf },
      posicao: posicaoVideo,
      limite: limiteMov,
      canvasLargura: CANVAS_LARGURA,
      canvasAltura: CANVAS_ALTURA,
    }),
    [dimsLargura, dimsAltura, corteAtivo, corteSup, corteInf, posicaoVideo.offsetX, posicaoVideo.offsetY, limiteMov],
  );
  // Só existe vídeo para mostrar quando há player ativo ou miniatura.
  const videoSobreTemplate = !!urlVideoAtiva || !!(item && item.thumbnail);
  const podeArrastarVideo = podeEditarVideo && !!urlVideoAtiva && !conferencia;
  // ARRASTE do vídeo: grava `posicaoVideo.offsetX/offsetY` em px da base
  // 1080×1920 pelo MESMO caminho do render (`atualizarPosicaoVideoNoConfig`),
  // respeitando o escopo "Editar todos". Sem região de trava = livre.
  const aoArrastarVideo = useMemo(
    () => gerarArrastarPosicaoVideo(atualizador, idVideoDaCelula, editarTodosOsVideos(config), limiteMov),
    [atualizador, idVideoDaCelula, config.editarTodos, limiteMov],
  );

  // ENQUADRAMENTO DO VÍDEO (zoom + mover — SOMENTE MOUSE, direto no preview).
  const camadaVideoRef = useRef(null);
  // CONTROLES DO PLAYER — camada FIXA do preview. O nó vive no fundo do canvas,
  // FORA da camada do vídeo; o ControlesVideo PORTA a barra pra cá
  // (createPortal): play/pause, progresso e volume seguem fixos no fundo do
  // canvas e 100% interativos. Estado (não ref) porque o portal precisa
  // re-renderizar quando o nó fica disponível (pós-commit).
  const destinoControlesRef = useRef(null);
  const [destinoControles, setDestinoControles] = useState(null);


  // Compatibilidade com configs legadas (antes de `textos` superior/inferior).
  const textos = config.textos && (config.textos.superior || config.textos.inferior)
    ? config.textos
    : { superior: config.texto || {}, inferior: {} };
  const textoSup = textos.superior || {};
  const textoInf = textos.inferior || {};

  const corFundo = config.canvas.corFundo;
  const templateFundo = config.templateFundo || {};
  const temTemplateFundo =
    typeof templateFundo.url === 'string' &&
    templateFundo.url.startsWith('data:image/') &&
    templateFundo.visivel !== false;
  // URL/alt do template resolvidos AQUI (fora do JSX): o `src` é o que decide se
  // existe buraco, e o `alt` é texto puro. Nada de lógica no markup.
  const urlTemplate = templateFundo.url;
  const altTemplate = templateFundo.nome || 'Template de fundo';
  const area = areaVideoEfetivaDoVideo(config, idVideoDaCelula);
  // ÁREA/VÍDEO são a MESMA coisa agora (a marcação da área foi removida): o
  // objeto de vídeo é arrastado/redimensionado direto no preview e escreve
  // `areaVideo` pelo MESMO caminho do render. Sem guia, sem congelamento e sem
  // alças de área paralelas — o arraste.js grava a MESMA geometria que
  // `areaPlayer`/`caixaPlayer` já desenham, então não existe salto.
  const areaN = areaVideoNormalizada(area);
  // O ANTIGO "BURACO DO TEMPLATE" (`areaTemplate` + `path(evenodd)` +
  // `dest-out`) foi REMOVIDO: com o template virando FUNDO do quadro não existe
  // buraco a abrir. `areaTemplate` continua salvo na config/payload apenas por
  // compatibilidade com designs antigos — nada o consome na renderização.
  // Geometria do enquadramento — MESMA matemática do render (compor.js):
  // quadro = área × zoom, posicionado pela folga com deslocamentoX/Y.
  const caixa = caixaEnquadramentoVideo(area);
  // Dimensões reais do vídeo (reportadas pelo <video> no onLoadedMetadata).
  const aoDimensoesVideo = useCallback((d) => {
    if (d && Number(d.largura) > 0 && Number(d.altura) > 0) {
      dimsVideoRef.current = d;
      // Estado (além do ref): o crop do preview depende da ALTURA ORIGINAL do
      // vídeo, então o wrapper recortado precisa re-renderizar quando ela chega.
      setDimsVideo((atual) => (atual && atual.largura === d.largura && atual.altura === d.altura ? atual : { largura: d.largura, altura: d.altura }));
    }
  }, []);
  // ---------------------------------------------------------------------------
  // PRÉVIA SIMPLES — SEM EDIÇÃO DO OBJETO DE VÍDEO: não existe arraste, zoom,
  // alça, borda, caixa de seleção, outline, cursor de arraste, botão de
  // redefinir nem dica sobre o vídeo. A `areaVideo` continua existindo como
  // DADO: é ela que posiciona o vídeo no canvas e abre o buraco do template,
  // e é exatamente a mesma que o render (compor.js) materializa.
  // O que o usuário ainda EDITA no preview são os overlays independentes
  // (textos, identidade, imagens) e o CORTE DE BORDAS (linhas arrastáveis),
  // que só aparece com `linhasCorteAtivas` ligado.
  // ---------------------------------------------------------------------------

  // (sem arraste do objeto de vídeo: a `areaVideo` é dada pelo sistema)

  // (sem redimensionamento do objeto de vídeo: nem alças, nem bordas)

  // (sem bordas, sem alças, sem controles de zoom)

  // (sem "Redefinir", sem zoom na roda do mouse)
  // --------------------------------------------------------------------------

  const identidade = config.identidade || null;
  // Geometria do player = a ÁREA de composição (prévia = render). Em
  // conferência o player ocupa o CANVAS INTEIRO (o MP4 final já é o quadro
  // completo, com o template aplicado pelo engine).
  // A ÁREA DO VÍDEO é exatamente o espaço que o vídeo deve preencher — por
  // isso o player usa SEMPRE cover nesta camada (ocupa 100% da largura/altura
  // da área, com o enquadramento definido por caixaEnquadramentoVideo).
  // NÃO existe congelamento: a área da config é a única fonte, e o arraste.js
  // grava exatamente a geometria que estas duas linhas já desenham.
  const areaSemComposicao = { x: 0, y: 0, largura: CANVAS_LARGURA, altura: CANVAS_ALTURA };
  const composicaoVisivel = composicaoAtiva && !conferencia;
  const areaPlayer = composicaoVisivel ? area : areaSemComposicao;
  const caixaPlayer = composicaoVisivel
    ? caixa
    : caixaEnquadramentoVideo(areaSemComposicao);
  // A ÁREA DO VÍDEO é exatamente o espaço que o vídeo deve preencher: o vídeo
  // preenche 100% da área (cover) no Preview e no render — nunca pequeno /
  // centralizado dentro dela. O `fit` do template é normalizado para 'cobrir'
  // (configEditorLote/mapearEditorLote/templateParaConfigEditor), então Preview
  // e FFmpeg usam a mesma geometria de preenchimento. `fitPlayer` é o valor
  // CSS (object-fit: cover) — o template usa 'cobrir' (mesmo significado).
  const fitPlayer = 'cover';

  // ------------------------------------------------------------------ *
  // ÁREA + ENQUADRAMENTO (zoom/deslocamento) — A MESMA MATEMÁTICA DO RENDER.
  //
  // `geometriaEnquadramentoVideo` é o espelho exato de
  // `autopost-engine-completo/src/enquadramentoVideo.js` (mesma função, mesmo
  // predicado, mesmos números). Ela devolve `null` na COMPATIBILIDADE: quando
  // a área cobre o canvas e o enquadramento é o original (zoom 1, 50/50), o
  // preview continua desenhando pelo caminho legado (`geomVideo`), e nenhum
  // template/config existente muda de resultado.
  //
  // Quando devolve geometria, o preview passa a ter TRÊS camadas aninhadas,
  // na MESMA ordem do filtergraph do FFmpeg:
  //   1. MOLDURA  = `areaVideo` (x/y/largura/altura) — a janela do template;
  //   2. QUADRO   = `caixa` (área × zoom) deslocado por `deslocamentoX/Y` —
  //      o vídeo COBRE o quadro (`object-fit: cover`, igual ao
  //      `force_original_aspect_ratio=increase` do render);
  //   3. TESOURA  = o `corteBordas`, que só ESCONDE linhas (nunca move).
  // ------------------------------------------------------------------ */
  const janelaComposicao = useMemo(
    () => geometriaEnquadramentoVideo({
      area: areaPlayer,
      dimsVideo: dimsLargura > 0 && dimsAltura > 0 ? { largura: dimsLargura, altura: dimsAltura } : null,
      canvasLargura: CANVAS_LARGURA,
      canvasAltura: CANVAS_ALTURA,
    }),
    [areaPlayer.x, areaPlayer.y, areaPlayer.largura, areaPlayer.altura,
      areaPlayer.zoom, areaPlayer.deslocamentoX, areaPlayer.deslocamentoY,
      areaPlayer.conteudoX, areaPlayer.conteudoY, areaPlayer.conteudoLargura, areaPlayer.conteudoAltura,
      dimsLargura, dimsAltura],
  );

  /* CONTRATO DE DADOS DA CAMADA DE VÍDEO — o MESMO nos dois caminhos.
     O caminho de JANELA (`janelaComposicao`) expõe `data-enq-zoom/x/y`; o
     caminho LEGADO (área = canvas inteiro + enquadramento original) precisa
     expor o MESMO contrato, porque:
       · `arraste.js` localiza a camada por `[data-elemento="video"][data-enq-zoom]`
         — é o atributo que DESAMBIGUA a camada de vídeo dos outros nós;
       · os testes leem esses atributos para conferir o enquadramento real.
     Derivado de `areaPlayer` normalizado (nunca fixo no JSX): o contrato
     reflecte sempre a área que o preview está desenhando. */
  const enqCamada = useMemo(() => {
    const a = areaVideoNormalizada(areaPlayer);
    return {
      zoom: a.zoom,
      deslocamentoX: a.deslocamentoX,
      deslocamentoY: a.deslocamentoY,
    };
  }, [areaPlayer.x, areaPlayer.y, areaPlayer.largura, areaPlayer.altura,
      areaPlayer.zoom, areaPlayer.deslocamentoX, areaPlayer.deslocamentoY,
      areaPlayer.conteudoX, areaPlayer.conteudoY, areaPlayer.conteudoLargura, areaPlayer.conteudoAltura]);


  /* TESOURA no modo JANELA — a MESMA conta do render (`pixelsDeCorte` do
     `compor.js`), com a altura do vídeo JÁ ESCALADO em COVER
     (`alturaEscalada`) como base. Sem dims do vídeo, cai na altura da área
     (fail-open: nada some, o corte só fica proporcional ao que se sabe).
     A tesoura NUNCA move nem escala: é uma máscara. */
  const tesouraJanela = useMemo(() => {
    if (!janelaComposicao) return { topPx: 0, basePx: 0, alturaVisivelPx: 0 };
    // A MESMA base do `compor.js`: no modo janela, a tesoura é medida sobre o
    // frame que SAI do recorte de volta para a área (a altura da ÁREA), nunca
    // sobre a altura escalada do vídeo (que daria um corte maior que a janela).
    const base = janelaComposicao.alturaArea || janelaComposicao.caixa.altura;
    const px = pixelsDeCorte({ superior: corteSup / 100, inferior: corteInf / 100, alturaVideo: base });
    return { topPx: px.topPx, basePx: px.bottomPx, alturaVisivelPx: px.alturaPx };
  }, [janelaComposicao, corteSup, corteInf]);

  /* ZOOM PELA RODA DO MOUSE SOBRE O VÍDEO — grava `areaVideo.zoom` +
     `deslocamentoX/Y` (o valor viaja no payload e vira o `scale`/`crop` do
     FFmpeg). `deslocamentoSobZoom` mantém o ponto sob o cursor, então o
     conteúdo não "salta". Fora da célula editável é no-op. */
  const aoGirarZoom = useCallback((e) => {
    if (!podeEditarVideo || !janelaComposicao) return;
    const sentido = e.deltaY < 0 ? 1 : -1;
    const passo = sentido > 0 ? 0.1 : -0.1;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const esc = escala > 0 ? escala : 1;
    // Cursor em px do CANVAS, relativo à área (o mesmo referencial do helper).
    const mx = (e.clientX - rect.left) / esc;
    const my = (e.clientY - rect.top) / esc;
    e.preventDefault();
    atualizador((cfg) => {
      const base = areaVideoEfetivaDoVideo(cfg, idVideoDaCelula);
      const alvo = normalizarZoomVideo((Number(base.zoom) || 1) + passo);
      const novo = deslocamentoSobZoom({
        area: base,
        dimsVideo: dimsLargura > 0 && dimsAltura > 0 ? { largura: dimsLargura, altura: dimsAltura } : null,
        novoZoom: alvo,
        mx,
        my,
      });
      return atualizarAreaVideoNoConfig(cfg, {
        todos: editarTodosOsVideos(cfg) || !idVideoDaCelula,
        videoId: idVideoDaCelula,
        mudancas: novo,
      });
    });
  }, [podeEditarVideo, janelaComposicao, atualizador, idVideoDaCelula, escala, dimsLargura, dimsAltura]);

  /* O CONTEÚDO do vídeo (player real OU miniatura OU placeholder) — o MESMO
     elemento nos dois caminhos de composição (janela/legado): só a geometria
     externa muda, nunca o que é desenhado. */
  const renderizarConteudoDoVideo = useCallback(() => (podeEditar && urlVideoAtiva ? (
    <ControlesVideo
      key={`${urlVideoAtiva}|${claveReproductor}`}
      src={urlVideoAtiva}
      onDimensoes={aoDimensoesVideo}
      destinoControles={destinoControles}
    />
  ) : item && item.thumbnail ? (
    <img
      src={item.thumbnail}
      alt={item.nome || 'Video'}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="w-full h-full pointer-events-none"
      style={{ objectFit: 'cover' }}
    />
  ) : (
    <div className="flex flex-col items-center justify-center w-full h-full pointer-events-none">
      <ImageOff className="w-5 h-5" style={{ color: 'rgba(77, 255, 136,0.6)' }} />
      <span className="text-[8px] font-black tracking-widest" style={{ color: 'rgba(124, 255, 155,0.75)' }}>
        VÍDEO ORIGINAL
      </span>
    </div>
  )), [podeEditar, urlVideoAtiva, claveReproductor, aoDimensoesVideo, destinoControles, item]);

  // Escalada do canvas 9:16: observa o CONTENEDOR da célula (contenedorRef)
  // e calcula a maior escala que mantiene a proporção 1080×1920 cabendo inteira
  // (ancho e alto). O guia da área usa top/height em % — posicionamento
  // independente da escala.
  const aoAtualizarDataset = useCallback(() => {
    const el = canvasRef.current;
    const cont = contenedorRef.current;
    if (!el) return;
    const cw = cont ? cont.clientWidth : 0;
    const ch = cont ? cont.clientHeight : 0;
    const novaEscala =
      cw > 0 && ch > 0
        ? Math.min(cw / CANVAS_LARGURA, ch / CANVAS_ALTURA, alturaMaxima / CANVAS_ALTURA)
        : 1;
    setEscala(novaEscala);
    el.dataset.canvasLargura = String(CANVAS_LARGURA);
    el.dataset.canvasAltura = String(CANVAS_ALTURA);
    el.dataset.escala = String(novaEscala);
  }, [alturaMaxima]);

  useEffect(() => {
    aoAtualizarDataset();
    const cont = contenedorRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(aoAtualizarDataset);
    ro.observe(cont);
    return () => ro.disconnect();
  }, [aoAtualizarDataset]);

  // Portal dos controles: precisa do nó REAL do DOM (disponível pós-commit).
  useEffect(() => {
    setDestinoControles(destinoControlesRef.current);
  }, []);

  return (
    <div
      ref={contenedorRef}
      className={
        compacto
          ? 'w-full flex flex-col items-center justify-start relative overflow-hidden px-1 pt-1 pb-0'
          : 'flex-1 min-w-0 flex flex-col items-center justify-center relative overflow-hidden px-2 pt-2 pb-1'
      }
    >
      {/* Canvas 9:16 (fundo = corFundo que vai pro template). Clicar fora de
          qualquer elemento ([data-elemento]) deseleciona — sem caixas de
          seleção permanentes poluindo a interface. */}
      {/* `data-area-composicao` — marca ESTE canvas como "o vídeo é posicionado
          por `areaVideo`" (composição ativa e fora da conferência). O arraste.js
          lê essa marca para acompanhar o arraste da ÁREA em TEMPO REAL em TODAS
          as instâncias do canvas (grade 1X/2X/3X/6X — cada uma com a sua
          escala): sem isso o vídeo ficaria parado durante o arraste e PULARIA
          no `pointerup`, quando a config é gravada (REGRA ANTI-SALTO). Sem o
          atributo (preview desligado / conferência), a camada do vídeo NUNCA é
          tocada pelo arraste — ela é o canvas inteiro. */}
      <div
        ref={canvasRef}
        data-area-composicao={composicaoAtiva && !conferencia ? '1' : undefined}
        className="edl-canvas-branco relative overflow-hidden"
        onPointerDown={(e) => {
          if (podeEditar && typeof aoSelecionarElemento === 'function') {
            const alvo = e.target;
            if (!(typeof alvo?.closest === 'function' && alvo.closest('[data-elemento]'))) {
              aoSelecionarElemento(null);
            }
          }
        }}
        style={{
          width: Math.round(CANVAS_LARGURA * escala),
          height: Math.round(CANVAS_ALTURA * escala),
          borderRadius: 14,
          background: corFundo,
        }}
      >
        {/* LINHAS DO CORTE MANUAL POR LINHAS — FERRAMENTA, não resultado.
            Filhas DIRETAS do canvas. Agora o RESULTADO do corte é um recorte
            REAL do vídeo (o wrapper `overflow:hidden` logo abaixo), então as
            linhas são posicionadas sobre as BORDAS REAIS desse recorte — em
            px de tela, derivados da mesma `geomVideo` que o render consome —
            e não mais em % do canvas. Arrastar continua gravando o MESMO
            `corteBordas.superior/inferior` (em % da altura ORIGINAL), que é o
            que vira `crop=...` no FFmpeg: prévia e render idênticos.
            O `gerarArrastarCorte*` continua lendo `data-escala`/`data-canvasAltura`
            do canvas (PAI direto) para converter o delta de tela em %. */}
        {linhasCorteVisiveis ? (
          <>
            {/* Linha SUPERIOR — borda de cima do vídeo recortado. */}
            <div
              role="slider"
              aria-label="Corte manual — borda superior"
              aria-valuemin={0}
              aria-valuemax={CORTE_MAXIMO}
              aria-valuenow={Math.round(corteSup)}
              aria-valuetext={`${Math.round(corteSup)}% da altura`}
              title="Arraste para baixo para aumentar o corte superior deste vídeo"
              data-elemento="corte"
              data-altura-video={String(geomVideo.altura)}
              data-posy={String(corteSup)}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function') {
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                }
                selecionar('corte');
                corredorSuperior(e);
              }}
              className="edl-corredor-corte absolute touch-none cursor-row-resize flex items-center justify-center"
              style={{
                left: geomVideo.x * escala,
                // Borda SUPERIOR da faixa visível = `y + topPx` (não `y`).
                top: (geomVideo.y + geomVideo.topPx) * escala,
                width: Math.max(2, geomVideo.largura) * escala,
                height: 24,
                marginTop: -12,
                // z-index da FERRAMENTA: a linha precisa continuar agarravel
                // mesmo quando cai EM CIMA da barra de controles do player
                // (colada no fundo do canvas, z-20/z-30). Como as linhas só
                // existem enquanto o "Corte manual por linhas" está ligado,
                // elas ganham a precedência somente nesse modo.
                zIndex: 35,
              }}
            >
              {/* Linha visual fina (2px dashed) centralizada na hit-box */}
              <div
                className="w-full pointer-events-none"
                style={{
                  borderTop: '2px dashed rgba(56,189,248,0.95)',
                }}
              />
              {/* Alça visual central */}
              <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm pointer-events-none" style={{ background: '#38bdf8', top: '50%' }} />
            </div>

            {/* Linha INFERIOR — borda de baixo do vídeo recortado. Arrastar para CIMA aumenta o corte inferior. */}
            <div
              role="slider"
              aria-label="Corte manual — borda inferior"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(posLinhaInferior)}
              aria-valuetext={`${Math.round(posLinhaInferior)}% da altura`}
              title="Arraste para cima para aumentar o corte inferior deste vídeo"
              data-elemento="corte"
              data-altura-video={String(geomVideo.altura)}
              data-posy={String(posLinhaInferior)}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.currentTarget && typeof e.currentTarget.setPointerCapture === 'function') {
                  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
                }
                selecionar('corte');
                corredorInferior(e);
              }}
              className="edl-corredor-corte absolute touch-none cursor-row-resize flex items-center justify-center"
              style={{
                left: geomVideo.x * escala,
                // Borda INFERIOR da faixa visível = `y + altura - basePx`.
                top: (geomVideo.y + geomVideo.altura - geomVideo.basePx) * escala,
                width: Math.max(2, geomVideo.largura) * escala,
                height: 24,
                marginTop: -12,
                // Mesmo z-index da FERRAMENTA da linha superior: a linha de
                // baixo é justamente a que fica em cima da barra de controles
                // do player (fundo do canvas) — sem esta precedência ela nunca
                // recebia o pointerdown.
                zIndex: 35,
              }}
            >
              {/* Linha visual fina (2px dashed) centralizada na hit-box */}
              <div
                className="w-full pointer-events-none"
                style={{
                  borderBottom: '2px dashed rgba(56,189,248,0.95)',
                }}
              />
              {/* Alça visual central */}
              <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm pointer-events-none" style={{ background: '#38bdf8', top: '50%' }} />
            </div>
          </>
        ) : null}

        {/* VÍDEO (CAPA) — A TESOURA. O <video> fica INTEIRO, com o tamanho e a
            posição do vídeo já ESCALADO (`geomVideo.x/y/largura/altura`), e a
            janela `overflow-hidden` abaixo é a única coisa que o corte move: ela
            mostra só a faixa [y+topPx, y+altura-basePx]. Trocar o corte NUNCA
            altera `left/top/width/height` do <video> — o conteúdo que continua
            visível permanece EXATAMENTE no mesmo lugar da tela, e a parte
            cortada deixa vazar o TEMPLATE (nada é pintado: sem branco, sem
            preto, sem faixa). É o MESMO filtergraph do FFmpeg
            (`scale=W:H` → `crop=W:(H-topPx-basePx):0:topPx` →
            `overlay=x:(y+topPx)`), só que feito no elemento. */}
        {videoSobreTemplate && janelaComposicao ? (
          /* MOLDURA = `areaVideo` (a janela do template) → QUADRO = área × zoom,
             deslocado por `deslocamentoX/Y`. É a MESMA ordem do filtergraph do
             FFmpeg e a MESMA matemática (`geometriaEnquadramentoVideo`, espelho
             de `enquadramentoVideo.js`). Quando `janelaComposicao` é `null` a
             camada legada abaixo é usada — é a compatibilidade (área = canvas +
             enquadramento original), com resultado idêntico ao de sempre. */
          <div
            data-elemento="video-area"
            data-area-largura={String(janelaComposicao.larguraArea)}
            data-area-altura={String(janelaComposicao.alturaArea)}
            data-enq-zoom={String(janelaComposicao.zoom)}
            data-enq-x={String(janelaComposicao.deslocamentoX)}
            data-enq-y={String(janelaComposicao.deslocamentoY)}
            data-video-x={String(janelaComposicao.x)}
            data-video-y={String(janelaComposicao.y)}
            data-video-largura={String(janelaComposicao.larguraArea)}
            data-video-altura={String(janelaComposicao.alturaEscalada || janelaComposicao.caixa.altura)}
            data-video-crop-topo={String(tesouraJanela.topPx)}
            data-video-crop-base={String(tesouraJanela.basePx)}
            data-video-altura-visivel={String(tesouraJanela.alturaVisivelPx)}
            data-escala={String(escala)}
            className={`absolute overflow-hidden ${podeArrastarVideo ? '' : 'pointer-events-none'}`}
            style={{
              left: janelaComposicao.x * escala,
              top: janelaComposicao.y * escala,
              width: Math.max(2, janelaComposicao.larguraArea) * escala,
              height: Math.max(2, janelaComposicao.alturaArea) * escala,
              zIndex: 2,
              userSelect: 'none',
              cursor: podeArrastarVideo ? 'grab' : undefined,
              touchAction: 'none',
            }}
            onPointerDown={podeArrastarVideo ? aoArrastarVideo : undefined}
            onWheel={aoGirarZoom}
          >
            {/* QUADRO — área × zoom, deslocado. É ele que "aperta" a imagem e
                escolhe a região visível; o `overflow-hidden` é o recorte de
                volta para a área. */}
            <div
              data-elemento="video-caixa"
              className="absolute overflow-hidden"
              style={{
                left: janelaComposicao.caixa.x * escala,
                top: janelaComposicao.caixa.y * escala,
                width: Math.max(2, janelaComposicao.caixa.largura) * escala,
                height: Math.max(2, janelaComposicao.caixa.altura) * escala,
              }}
            >
              {/* TESOURA — só ESCONDE linhas, nunca move/escala. É a MESMA ordem
                  do FFmpeg (`scale` cover → `crop` de volta p/ a área → `crop`
                  da tesoura): a janela é posicionada dentro do QUADRO e mede a
                  altura da ÁREA, exatamente como `pixelsDeCorte` no render. */}
              <div
                data-elemento="video-janela"
                className="absolute left-0 overflow-hidden"
                style={{
                  top: tesouraJanela.topPx * escala,
                  width: Math.max(2, janelaComposicao.larguraArea) * escala,
                  height: Math.max(2, tesouraJanela.alturaVisivelPx) * escala,
                }}
              >
                {/* CONTEÚDO: o vídeo JÁ ESCALADO em cover, posicionado pelo
                    `object-position` da prévia (o excesso distribuído por
                    `deslocamentoX/Y`) dentro do quadro, e deslocado por
                    `topPx` para que a tesoura só esconda. */}
                <div
                  key={item && item.id ? `video-${item.id}` : 'video-vazio'}
                  data-elemento="video-conteudo"
                  className="absolute left-0"
                  style={{
                    top: (-tesouraJanela.topPx - janelaComposicao.conteudoY + janelaComposicao.caixa.y) * escala,
                    left: (-janelaComposicao.conteudoX + janelaComposicao.caixa.x) * escala,
                    width: Math.max(2, janelaComposicao.larguraEscalada || janelaComposicao.caixa.largura) * escala,
                    height: Math.max(2, janelaComposicao.alturaEscalada || janelaComposicao.caixa.altura) * escala,
                  }}
                >
                  {renderizarConteudoDoVideo()}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {videoSobreTemplate && !janelaComposicao ? (
          <div
            data-elemento="video"
            data-video-x={String(geomVideo.x)}
            data-video-y={String(geomVideo.y)}
            data-video-largura={String(geomVideo.largura)}
            data-video-altura={String(geomVideo.altura)}
            data-video-crop-topo={String(geomVideo.topPx)}
            data-video-crop-base={String(geomVideo.basePx)}
            data-video-altura-visivel={String(geomVideo.alturaVisivelPx)}
            data-enq-zoom={String(enqCamada.zoom)}
            data-enq-x={String(enqCamada.deslocamentoX)}
            data-enq-y={String(enqCamada.deslocamentoY)}

            data-escala={String(escala)}
                className={`absolute ${podeArrastarVideo ? '' : 'pointer-events-none'}`}
                style={{
                  left: geomVideo.x * escala,
                  top: geomVideo.y * escala,
                  width: Math.max(2, geomVideo.largura) * escala,
                  height: Math.max(2, geomVideo.altura) * escala,
                  zIndex: 2,
                  userSelect: 'none',
                  cursor: podeArrastarVideo ? 'grab' : undefined,
                  touchAction: 'none',
                }}
                onPointerDown={podeArrastarVideo ? aoArrastarVideo : undefined}
              >
                {/* JANELA DA TESOURA — `overflow:hidden` que revela só a faixa
                    visível. É ELA que se move quando o corte muda; o vídeo dentro
                    nunca sai do lugar. */}
                <div
                  data-elemento="video-janela"
                  className="absolute left-0 overflow-hidden"
                  style={{
                    top: geomVideo.topPx * escala,
                    width: Math.max(2, geomVideo.largura) * escala,
                    height: Math.max(2, geomVideo.alturaVisivelPx) * escala,
                  }}
                >
                  {/* CONTEÚDO: o vídeo INTEIRO, na MESMA posição do passo 2 da
                      geometria. Nunca deslocado pelo corte. */}
                  <div
                    key={item && item.id ? `video-${item.id}` : 'video-vazio'}
                    data-elemento="video-conteudo"
                    className="absolute left-0"
                    style={{
                      top: -geomVideo.topPx * escala,
                      width: Math.max(2, geomVideo.largura) * escala,
                      height: Math.max(2, geomVideo.altura) * escala,
                    }}
                  >
                    {renderizarConteudoDoVideo()}
                  </div>
                </div>
              </div>
            ) : null}

        {/* TEMPLATE — O FUNDO DO QUADRO (z-index 1, ABAIXO do vídeo).
            Arquitetura corrigida: o `template.png` 1080×1920 é a base e o vídeo
            recortado é a CAPA por cima (mesma ordem do engine:
            `[fundo][v_rec]overlay=x:y`). Não existe mais `clip-path path(evenodd)`
            nem `dest-out`: o template é fundo, então não há buraco a abrir —
            onde o vídeo não cobre, aparece a ARTE do template, nunca branco.
            `pointer-events-none`: o template NUNCA captura o ponteiro. */}
        {temTemplateFundo ? (
          <div
            data-template-fundo="true"
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 1 }}
            aria-hidden="true"
          >
            <img src={urlTemplate} alt={altTemplate} draggable={false} className="pointer-events-none select-none" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
          </div>
        ) : null}

        {/* SEM CAIXA DE SELEÇÃO, SEM BORDAS, SEM ALÇAS E SEM "REDEFINIR" SOBRE O
            VÍDEO: a prévia mostra só o vídeo. A `areaVideo` continua sendo o
            dado interno que posiciona o vídeo e abre o buraco do template —
            nada aqui é representation visual dela. O que ainda aparece sobre o
            vídeo: o CORTE DE BORDAS (clip-path + faixas, que é o resultado, e as
            linhas arrastáveis apenas no modo de corte), o template, os overlays
            e os controles reais do player. */}

        {/* VÍDEO BASE — selo discreto + LIXEIRA (só no card do vídeo base).
            A lixeira remove o vídeo base da lista do Editor (e do localStorage):
            é removçom LOCAL — o arquivo original NÃO é apagado da Biblioteca/
            Oracle nem da fila, e os demais vídeos do lote ficam intactos. */}
        {base && (
          <span
            className="edl-selo-base absolute z-40 text-[8px] font-black px-1.5 py-0.5 rounded"
            style={{ top: 6, left: 6 }}
          >
            BASE
          </span>
        )}
        {base && typeof aoRemoverBase === 'function' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              aoRemoverBase();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Remover vídeo base do Editor"
            title="Remover vídeo base do Editor (o arquivo original continua na Biblioteca)"
            className="edl-lixeira edl-ring-foco absolute z-40 w-6 h-6 rounded-md flex items-center justify-center"
            style={{ top: 6, right: 6, cursor: 'pointer' }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}

        {/* SEM GUIAS DE ÁREA: a ferramenta "Marcar espaço do vídeo" e o retângulo
            tracejado foram removidos. A área do vídeo continua existindo como
            DADO (`areaVideo`) e como BURACO do template — o retângulo visível
            agora é o próprio objeto de vídeo, arrastado/redimensionado pelas
            próprias alças (acima), que escrevem exatamente a mesma geometria. */}

        {/* DOIS TEXTOS INDEPENDENTES (superior e inferior) — cada um tem
            conteúdo, posição, tamanho, largura, fonte, peso, cor, alinhamento,
            opacidade e visibilidade PRÓPRIOS. Arrastáveis SÓ na célula
            selecionada; nas demais são SOMENTE visualização.
            Na marcação (Estado A) não aparecem: só o template + o retângulo da
            área existem nessa tela (o vídeo entra apenas no Preview). */}
        {composicaoAtiva && !conferencia && [
          { chave: 'superior', rotulo: 'Texto superior', t: textoSup },
          { chave: 'inferior', rotulo: 'Texto inferior', t: textoInf },
        ].map(({ chave, rotulo, t }) => {
          if (!t.visivel || String(t.conteudo || '').trim() === '') return null;
          const idElemento = chave === 'superior' ? 'textoSuperior' : 'textoInferior';
          const arrastar = chave === 'superior' ? arrastarTextoSuperior : arrastarTextoInferior;
          const redimensionar = chave === 'superior' ? redimensionarTextoSup : redimensionarTextoInf;
          return (
            <div
              key={chave}
              role={podeEditar ? 'button' : undefined}
              tabIndex={podeEditar ? 0 : undefined}
              aria-label={`Arrastar ${rotulo.toLowerCase()}`}
              data-elemento={idElemento}
              data-x={String(t.x)}
              data-y={String(t.y)}
              onPointerDown={podeEditar ? (e) => { selecionar(idElemento); arrastar(e); } : undefined}
              className={`edl-texto-canvas absolute ${podeEditar ? '' : 'pointer-events-none'} ${elementoSelecionado === idElemento ? 'edl-elemento-selecionado' : ''}`}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.largura}%`,
                transform: 'translate(-50%, 0)',
                textAlign: t.alinhamento || 'centro',
                fontFamily: familiaDeFonte(t.fonte),
                fontSize: (t.tamanho || 40) * escala,
                fontWeight: pesoDeTexto(t.peso),
                color: t.cor,
                opacity: (t.opacidade ?? 100) / 100,
                // Acima da camada do vídeo original e do guia da área — mesma
                // ordem do FFmpeg (vídeo/composição antes dos textos).
                zIndex: 17,
              }}
            >
              {t.conteudo}
              {/* Manija de largura (SÓ na célula editável) */}
              {podeEditar && (
                <span
                  role="slider"
                  aria-label={`Redimensionar largura do ${rotulo.toLowerCase()}`}
                  data-largura={String(t.largura)}
                  onPointerDown={redimensionar}
                  className="absolute w-2.5 h-9 rounded-sm border-2 border-white shadow"
                  style={{ right: -9, top: '50%', transform: 'translateY(-50%)', background: '#94a3b8', cursor: 'ew-resize', touchAction: 'none' }}
                />
              )}
            </div>
          );
        })}

        {/* IDENTIDADE DO CANAL — nome do canal, @ do canal e selo azul de
            verificado: elementos INDEPENDENTES (posição/tamanho próprios).
            Editáveis SÓ na célula selecionada (nas demais, somente leitura).
            Cada um seleciona sua camada no clique (Camadas ⇄ Preview).
            Na marcação (Estado A) não aparecem: só o template + o retângulo da
            área existem nessa tela. */}
        {composicaoAtiva && !conferencia && (
          <>
            <ElementoIdentidadeTexto chave="nome" t={identidade?.nome} escala={escala} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} selecionado={elementoSelecionado === 'identidadeNome'} aoSelecionar={selecionar} />
            <ElementoIdentidadeTexto chave="usuario" t={identidade?.usuario} escala={escala} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} selecionado={elementoSelecionado === 'identidadeUsuario'} aoSelecionar={selecionar} />
            <ElementoIdentidadeSelo selo={identidade?.selo} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} selecionado={elementoSelecionado === 'selo'} aoSelecionar={selecionar} />
          </>
        )}

        {/* IMAGENS (Adicionar elementos → Imagem): cada imagem é UMA camada
            independente — arrastável, redimensionável e selecionável direto no
            preview. MESMA geometria que o render compõe (prévia = render).
            Na marcação (Estado A) não aparecem: só o template + o retângulo da
            área existem nessa tela. */}
        {composicaoAtiva && !conferencia && (config.imagens || []).map((im) => (
          <ElementoImagem
            key={im.id}
            imagem={im}
            aoAtualizarConfig={atualizador}
            selecionado={elementoSelecionado === `imagem:${im.id}`}
            aoSelecionar={selecionar}
            somenteLeitura={!podeEditar}
          />
        ))}

        {/* CONTROLES DO PLAYER — CAMADA FIXA do preview.
            Estrutura desejada do Preview:
              ├── camada do VÍDEO      → vídeo na área marcada (cover)
              ├── overlays             → Texto · Imagem · Selo
              └── CONTROLES DO PLAYER  → Play/Pause · Progresso · Volume
            O ControlesVideo porta a barra exatamente pra cá: os controles
            ficam fixos no fundo do preview, sempre visíveis e 100%
            interativos. (O contêiner tem altura zero: a barra ancorada nele
            cresce pra cima a partir do fundo do canvas.) */}
        <div
          ref={destinoControlesRef}
          data-edl-destino-controles="true"
          className="absolute left-0 right-0 bottom-0 z-30"
        />
      </div>

      {/* SEM CONTROLES DE ZOOM POR TOQUE: o vídeo é mostrado como está, sem
          qualquer ajuste de enquadramento oferecido pela interface. */}

      {/* Rodapé do canvas (só no modo editor único; células usam o próprio rodapé) */}
      {mostrarRodape && (
        <p className="text-[9px] font-semibold mt-3" style={{ color: 'var(--edl-texto-mut)' }}>
          {item ? `Editando: ${item.nome}` : 'Selecione um vídeo na lista'} • {CANVAS_LARGURA}×{CANVAS_ALTURA} (9:16) • {composicaoAtiva ? 'prévia: vídeo + corte + template' : 'prévia: somente os vídeos importados'} • encaixe do final: {area.fit}
        </p>
      )}
    </div>
  );
}
