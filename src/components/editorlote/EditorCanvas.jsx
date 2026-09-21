import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageOff, Trash2 } from 'lucide-react';
import {
  CANVAS_LARGURA,
  CANVAS_ALTURA,
  familiaDeFonte,
  pesoDeTexto,
  areaVideoNormalizada,
  caixaEnquadramentoVideo,
  enquadramentoVideoEditado,
  enquadramentoVideoOriginal,
  deslocamentoSobZoom,
} from '../../lib/configEditorLote';
import {
  gerarArrasteDeRuta,
  gerarArrastreArea,
  gerarRedimensionarArea,
  gerarRedimensionarTextoLargura,
  gerarArrastarEnquadramentoVideo,
} from './arraste';
import ControlesVideo from './ControlesVideo';
import { ElementoIdentidadeTexto, ElementoIdentidadeSelo } from './ElementoIdentidade';
import ElementoImagem from './ElementoImagem';

/**
 * EDITOR EM LOTE — canvas de edición (EditorCanvas).
 *
 * Canvas 9:16 reutilizado em DOIS lugares:
 * - CÉLULA SELECIONADA da área central (interativo=true): canvas completo,
 *   editável — vídeo REAL com ControlesVideo + textos + identidade +
 *   guia da área arrastável/redimensionável;
 * - DEMAIS CÉLULAS (interativo=false): SOMENTE visualização do MESMO canvas
 *   com a MESMA config compartilhada (textos/identidade/área
 *   aparecem iguais), mas sem arrastes/manijas/áudio — SOLO thumbnail
 *   estática (parada), nunca un <video> con autoplay/loop en background.
 *
 * PRÉVIA x PROCESSAMENTO (uma ÚNICA fonte de verdade para a geometria do vídeo):
 * - A PRÉVIA desenha o vídeo na ÁREA de composição com a MESMA geometria do
 *   render (`caixaEnquadramentoVideo`): quadro = área × zoom, posicionado por
 *   deslocamentoX/Y e SEMPRE em cover (a ÁREA é exatamente o espaço do vídeo —
 *   ele preenche 100% da largura/altura dela, nunca fica pequeno/centralizado).
 *   O usuário amplia/reduz e move o vídeo com o MOUSE (arrastar + roda), e o
 *   vídeo final sai EXATAMENTE igual (compor.js materializa os mesmos valores);
 * - Sem corte de bordas: nenhuma linha/guia/clip-path de corte existe mais no
 *   Editor — a arte completa já vive no template importado;
 * - logo removida: o template é a fonte visual COMPLETA (fundo, textos,
 *   imagens, gráficos) — o Editor não adiciona nada por cima;
 * - os CONTROLES DO PLAYER (play/pause · progresso · volume) vivem numa camada
 *   FIXA própria (`data-edl-destino-controles`) no fundo do canvas.
 */

/** Altura MÁXIMA padrão do preview 9:16 na TELA (px). Pode ser sobrescrita
 * por célula via prop `alturaMaxima` (a área central usa valores menores
 * nos modos 2X/3X para caberem lado a lado). */
const ALTURA_MAXIMA_PADRAO = 500;

/** (Removido) A prévia NÃO usa mais um encaixe fixo 'contain' do canvas
 * inteiro: ela desenha o vídeo DENTRO da área de composição, sempre em
 * cover (a área é exatamente o espaço do vídeo), com o MESMO zoom/deslocamento
 * que o render final — prévia = render, por construção. */

/** Leitura tolerante de número vindo de `dataset` (0 é válido — nunca `||`). */
function numeroDoDataset(valor, padrao) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : padrao;
}


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
  // FLUXO SIMPLIFICADO — "Mostrar Preview" (REGRA 12): `previewAtivo=false`
  // mostra SOMENTE o vídeo importado (sem template, sem composição na área,
  // sem guias). `previewAtivo=true` desenha a composição
  // final (template + vídeo dentro da área marcada + overlays), a MESMA
  // geometria do render. `forcarTemplateVisivel=true` (modo de marcação no
  // painel direito) mostra template + retângulo da área — SEM vídeo (Estado A:
  // apenas geometria; o vídeo só existe no Preview — Estado B).
  previewAtivo = true,
  forcarTemplateVisivel = false,
}) {
  // A composição (template/overlays/guias) só aparece com o Preview ativo ou
  // dentro do modo de marcação — o centro mostra "somente vídeos" antes disso.
  const composicaoAtiva = previewAtivo || forcarTemplateVisivel;
  // ESTADO A — MARCAÇÃO: a gaveta do painel direito (forcarTemplateVisivel)
  // mostra SOMENTE template + retângulo. O vídeo NÃO é renderizado aqui, não
  // acompanha o arraste e não sofre nenhuma transformação (Regra 3/12).
  const modoMarcacao = forcarTemplateVisivel && !previewAtivo;
  // O GUIA tracejado da área do vídeo é FERRAMENTA DE MARCAÇÃO/edição: na
  // prévia composta (Mostrar Preview) o centro mostra o resultado LIMPO,
  // exatamente como o render final — a marcação nunca fica permanente sobre
  // os vídeos. Durante a MARCAÇÃO o guia fica SEMPRE visível (é ele o
  // retângulo geométrico que o usuário arrasta/redimensiona).
  const mostraGuiaArea = modoMarcacao;
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
  // FLUXO SIMPLIFICADO: sem "Mostrar Preview" o centro mostra SOMENTE os
  // vídeos importados — nada de composição, guias ou arraste de enquadramento.
  // MARCAÇÃO (`forcarTemplateVisivel` sem preview): o vídeo NÃO é renderizado
  // nem arrastável — só o template + o retângulo da área (Estado A). O vídeo
  // só volta a existir dentro da área marcada no PREVIEW (Estado B).
  const podeEditarVideo = podeEditar && !conferencia && previewAtivo;

  // Handlers — arrastre genérico por ruta: cada elemento es independente.
  // Nas células NÃO selecionadas (podeEditar=false) os handlers viram no-op.
  const arrastarTextoSuperior = gerarArrasteDeRuta(['textos', 'superior'], atualizador);
  const arrastarTextoInferior = gerarArrasteDeRuta(['textos', 'inferior'], atualizador);
  const redimensionarTextoSup = gerarRedimensionarTextoLargura(['textos', 'superior'], atualizador);
  const redimensionarTextoInf = gerarRedimensionarTextoLargura(['textos', 'inferior'], atualizador);
  const arrastarArea = gerarArrastreArea(atualizador);
  const redimensionarAreaDireita = gerarRedimensionarArea('direita', atualizador);
  const redimensionarAreaAbaixo = gerarRedimensionarArea('abaixo', atualizador);
  const redimensionarAreaCanto = gerarRedimensionarArea('canto', atualizador);

  // SELEÇÃO — clicar num elemento do preview seleciona a camada dele (Painel
  // de Camadas + painel de configuração sincronizam). Clicar no FUNDO do
  // canvas (fora de qualquer [data-elemento]) deseleciona. Sem X/Y: seleção,
  // movimento e redimensionamento acontecem 100% no preview com o mouse.
  const selecionar = (id) => {
    if (podeEditar && typeof aoSelecionarElemento === 'function') aoSelecionarElemento(id);
  };

  // ENQUADRAMENTO DO VÍDEO (zoom + mover — SOMENTE MOUSE, direto no preview).
  // `dimsVideoRef`: dimensões REAIS do vídeo em exibição (reportadas pelo
  // ControlesVideo no onLoadedMetadata) — usadas para o arraste 1:1 e o zoom
  // sob o cursor. Ref (não estado): atualizar não re-renderiza.
  const dimsVideoRef = useRef(null);
  const camadaVideoRef = useRef(null);
  const dicaTimerRef = useRef(null);
  // CONTROLES DO PLAYER — camada FIXA do preview. O nó vive no fundo do canvas,
  // FORA da camada do vídeo; o ControlesVideo PORTA a barra pra cá
  // (createPortal): play/pause, progresso e volume seguem fixos no fundo do
  // canvas e 100% interativos. Estado (não ref) porque o portal precisa
  // re-renderizar quando o nó fica disponível (pós-commit).
  const destinoControlesRef = useRef(null);
  const [destinoControles, setDestinoControles] = useState(null);
  // Dica DISCRETA durante a interação (some sozinha — nada de controles X/Y,
  // sliders ou caixa fixa: só o vídeo e, momentaneamente, um texto pequeno).
  const [dicaEnquadramento, setDicaEnquadramento] = useState(null);
  const [arrastandoVideo, setArrastandoVideo] = useState(false);


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
    (forcarTemplateVisivel ? true : templateFundo.visivel !== false);
  const area = config.areaVideo;
  // CORREÇÃO — editar/marcar a ÁREA DO VÍDEO NÃO depende de ter vídeo
  // selecionado: depende só de a célula ser interativa (`podeEditar`) e da
  // marcação/template estarem ativos. A edição do VÍDEO (`podeEditarVideo`,
  // acima) sim exige um vídeo ativo (`urlVideoAtiva` nos usos).
  const podeEditarArea = podeEditar && (area.mostrarMarcacao || temTemplateFundo);
  const areaN = areaVideoNormalizada(area);
  // Geometria do enquadramento — MESMA matemática do render (compor.js):
  // quadro = área × zoom, posicionado pela folga com deslocamentoX/Y.
  const caixa = caixaEnquadramentoVideo(area);
  const enquadramentoEditado = enquadramentoVideoEditado(area);
  // OBJETO de vídeo fora do "canvas inteiro"? (redimensionado/movido pelas
  // alças do Preview) — só para o botão discreto de redefinir aparecer.
  const videoRedimensionado = Math.round(Number(area.largura) || 0) !== CANVAS_LARGURA
    || Math.round(Number(area.altura) || 0) !== CANVAS_ALTURA
    || Math.round(Number(area.x) || 0) !== 0
    || Math.round(Number(area.y) || 0) !== 0;
  const videoEditadoNoPreview = enquadramentoEditado || videoRedimensionado;
  // Dimensões reais do vídeo (reportadas pelo <video> no onLoadedMetadata).
  const aoDimensoesVideo = useCallback((d) => {
    if (d && Number(d.largura) > 0 && Number(d.altura) > 0) dimsVideoRef.current = d;
  }, []);

  // ---------- ENQUADRAMENTO: handlers de MOUSE (arrastar + zoom na roda) ----
  /** Dica discreta que desaparece sozinha (~900 ms) após a interação. */
  const mostrarDicaEnquadramento = useCallback((texto) => {
    setDicaEnquadramento(texto);
    if (dicaTimerRef.current) clearTimeout(dicaTimerRef.current);
    dicaTimerRef.current = setTimeout(() => setDicaEnquadramento(null), 900);
  }, []);
  useEffect(() => () => { if (dicaTimerRef.current) clearTimeout(dicaTimerRef.current); }, []);

  /** Fase do vídeo em exibição (dims reais + fit NORMALIZADO da área — a área
   * é sempre 'cobrir': o vídeo preenche 100% dela na prévia e no render). */
  const fitNormalizado = areaN.fit;
  const obterQuadro = useCallback(() => ({
    dimsVideo: dimsVideoRef.current,
    fit: fitNormalizado,
  }), [fitNormalizado]);

  /** Arrastar o VÍDEO: gerado com a MESMA config compartilhada do lote. */
  const arrastarEnquadramento = gerarArrastarEnquadramentoVideo(
    atualizador,
    obterQuadro,
    (i) => { setArrastandoVideo(!!i?.ativo); mostrarDicaEnquadramento('Movendo o vídeo…'); },
    () => setArrastandoVideo(false),
  );

  /**
   * ARRASTAR O VÍDEO DIRETO NO PREVIEW — UM único caminho, sem depender do
   * guia da área (`mostrarMarcacao`) e sem X/Y:
   *
   *  · zoom > 1 → o quadro é MAIOR que a área e existe folga de enquadramento:
   *    o arraste desloca o enquadramento (crop) — `arrastarEnquadramento`;
   *  · zoom ≤ 1 → NÃO existe folga (`quadro == área`): o arraste move a
   *    POSIÇÃO do vídeo no canvas (`areaVideo.x/y`) — o MESMO estado que a
   *    prévia usa (a camada é posicionada por x/y) e que o render usa no pad
   *    final do canvas. É este caminho que estava morto: o arraste das
   *    bordas só existia no guia e, com `área == canvas`, o intervalo era
   *    `[0, 0]` (nada se movia).
   */
  const arrastarVideoNoCanvas = gerarArrastreArea(atualizador, {
    aoInteragir: () => { setArrastandoVideo(true); mostrarDicaEnquadramento('Movendo o vídeo…'); },
    aoFinalizar: () => setArrastandoVideo(false),
  });

  /** O arraste no vídeo usa o enquadramento (folga) quando o quadro foi
   * ampliado; abaixo disso move a posição do vídeo no canvas. */
  const moverVideo = (e) => {
    if (areaN.zoom > 1) arrastarEnquadramento(e);
    else arrastarVideoNoCanvas(e);
  };

  /**
   * REDIMENSIONAR O OBJETO DE VÍDEO (alças do Preview, estilo Canva) — MESMO
   * mecanismo já existente da área (`gerarRedimensionarArea`), agora também
   * usado pelo VÍDEO selecionado. Muda só `areaVideo.largura/altura` (+ `x`/`y`
   * quando a alça é da borda esquerda/superior) — a MESMA geometria que o
   * render materializa (scale/crop/pad do FFmpeg): prévia = render. Cantos
   * mantêm a PROPORÇÃO; as laterais ajustam uma dimensão. NÃO mexe em
   * `zoom`/`deslocamentoX/Y` (roda do mouse = enquadramento interno).
   */
  const aoRedimensionarVideo = (eixo) => gerarRedimensionarArea(eixo, atualizador, {
    aoInteragir: () => mostrarDicaEnquadramento('Redimensionando o vídeo…'),
  });
  const redimVideoDireita = aoRedimensionarVideo('direita');
  const redimVideoEsquerda = aoRedimensionarVideo('esquerda');
  const redimVideoAbaixo = aoRedimensionarVideo('abaixo');
  const redimVideoAcima = aoRedimensionarVideo('acima');
  const redimVideoCantoSD = aoRedimensionarVideo('canto-sudeste');
  const redimVideoCantoSE = aoRedimensionarVideo('canto-sudoeste');
  const redimVideoCantoNE = aoRedimensionarVideo('canto-nordeste');
  const redimVideoCantoNO = aoRedimensionarVideo('canto-noroeste');

  /**
   * ALÇAS do objeto de vídeo (Preview, estilo Canva): 4 CANTOS (mantêm a
   * proporção) + 4 LATERAIS (largura/altura). Ficam DENTRO do objeto (inset
   * 2px) porque o canvas tem `overflow-hidden`: alças centradas na borda
   * seriam cortadas quando o vídeo encosta na borda do canvas (caso padrão =
   * vídeo ocupando o canvas inteiro). Só aparecem com o vídeo SELECIONADO.
   */
  const alcasDoVideo = [
    { rotulo: 'canto superior esquerdo', largura: 14, altura: 14, estilo: { left: 2, top: 2 }, cursor: 'nwse-resize', onPointerDown: redimVideoCantoNO },
    { rotulo: 'canto superior direito', largura: 14, altura: 14, estilo: { right: 2, top: 2 }, cursor: 'nesw-resize', onPointerDown: redimVideoCantoNE },
    { rotulo: 'canto inferior esquerdo', largura: 14, altura: 14, estilo: { left: 2, bottom: 2 }, cursor: 'nesw-resize', onPointerDown: redimVideoCantoSE },
    { rotulo: 'canto inferior direito', largura: 14, altura: 14, estilo: { right: 2, bottom: 2 }, cursor: 'nwse-resize', onPointerDown: redimVideoCantoSD },
    { rotulo: 'lateral esquerda', largura: 12, altura: 26, estilo: { left: 2, top: '50%', transform: 'translateY(-50%)' }, cursor: 'ew-resize', onPointerDown: redimVideoEsquerda },
    { rotulo: 'lateral direita', largura: 12, altura: 26, estilo: { right: 2, top: '50%', transform: 'translateY(-50%)' }, cursor: 'ew-resize', onPointerDown: redimVideoDireita },
    { rotulo: 'lateral superior', largura: 26, altura: 12, estilo: { top: 2, left: '50%', transform: 'translateX(-50%)' }, cursor: 'ns-resize', onPointerDown: redimVideoAcima },
    { rotulo: 'lateral inferior', largura: 26, altura: 12, estilo: { bottom: 2, left: '50%', transform: 'translateX(-50%)' }, cursor: 'ns-resize', onPointerDown: redimVideoAbaixo },
  ];

  // Alternativa touch à roda: mesma geometria, ancorada no centro do vídeo.
  const zoomTouch = (sentido) => {
    atualizador((cfg) => {
      const a = areaVideoNormalizada(cfg.areaVideo);
      const novo = deslocamentoSobZoom({
        area: a, dimsVideo: dimsVideoRef.current, fit: a.fit,
        novoZoom: a.zoom + sentido * Math.max(0.05, Math.min(0.25, 0.12 * a.zoom)),
        mx: a.largura / 2, my: a.altura / 2,
      });
      return { ...cfg, areaVideo: { ...cfg.areaVideo, ...novo } };
    });
  };

  /** RESET: volta tamanho e posição originais (sem controles X/Y). */
  const redefinirEnquadramento = useCallback(() => {
    atualizador((cfg) => ({
      ...cfg,
      areaVideo: {
        ...(cfg.areaVideo || {}),
        ...enquadramentoVideoOriginal(),
        // TAMANHO do objetivo de vídeo volta a ser o canvas inteiro (a
        // geometria passou a ser redimensionável pelas alças do Preview).
        x: 0,
        y: 0,
        largura: CANVAS_LARGURA,
        altura: CANVAS_ALTURA,
      },
    }));
    mostrarDicaEnquadramento('Enquadramento redefinido');
  }, [atualizador, mostrarDicaEnquadramento]);

  // ZOOM NA RODA (sobre a camada do vídeo): mesma matemática do render —
  // `deslocamentoSobZoom` mantém o ponto sob o cursor fixo (sem salto).
  useEffect(() => {
    if (!podeEditarVideo || !urlVideoAtiva) return;
    const el = camadaVideoRef.current;
    if (!el) return;
    function aoRoda(e) {
      e.preventDefault();
      const canvasEl = el.closest('[data-escala]') || el.parentElement;
      const escalaPx = numeroDoDataset(canvasEl?.dataset?.escala, 1) || 1;
      const rect = el.getBoundingClientRect();
      // Posição do cursor em px do CANVAS, relativa à área de composição —
      // independe do tamanho da janela/zoom do navegador (responsividade).
      const mx = (e.clientX - rect.left) / escalaPx;
      const my = (e.clientY - rect.top) / escalaPx;
      const sentido = e.deltaY > 0 ? -1 : 1;
      const passo = Math.max(0.05, Math.min(0.25, 0.12 * (areaN?.zoom || 1)));
      const novoZoom = (areaN?.zoom || 1) + sentido * passo;
      atualizador((cfg) => {
        const a = areaVideoNormalizada(cfg.areaVideo);
        const novo = deslocamentoSobZoom({
          area: a,
          dimsVideo: dimsVideoRef.current,
          fit: a.fit,
          novoZoom,
          mx,
          my,
        });
        return { ...cfg, areaVideo: { ...(cfg.areaVideo || {}), ...novo } };
      });
      mostrarDicaEnquadramento(`Zoom: ${Math.round(novoZoom * 100)}%`);
    }
    el.addEventListener('wheel', aoRoda, { passive: false });
    return () => el.removeEventListener('wheel', aoRoda);
  }, [podeEditarVideo, urlVideoAtiva, atualizador, areaN?.zoom, areaN, mostrarDicaEnquadramento]);
  // --------------------------------------------------------------------------

  const identidade = config.identidade || null;
  const item = itemSelecionado;
  // Geometria do player: modo normal = ÁREA de composição (prévia = render);
  // conferência = canvas inteiro (o MP4 final já é o quadro completo).
  // A ÁREA DO VÍDEO é exatamente o espaço que o vídeo deve preencher — por
  // isso o player usa SEMPRE cover nesta camada (ocupa 100% da largura/altura
  // da área, com o enquadramento definido por caixaEnquadramentoVideo).
  // SEM PREVIEW (`composicaoAtiva === false`): o vídeo aparece NORMAL, no
  // quadro inteiro 9:16 — a área marcada NÃO reposiciona/redimensiona o vídeo
  // fora do preview (o centro mostra só os vídeos importados, sem véu/fosco).
  // COM PREVIEW: a camada do vídeo ocupa EXATAMENTE `areaVideo` — a
  // MESMA geometria (x/y/largura/altura) que o render final usa. Na MARCAÇÃO
  // (Estado A) a camada de vídeo nem é montada (ver `!modoMarcacao` abaixo).
  const areaSemComposicao = { x: 0, y: 0, largura: CANVAS_LARGURA, altura: CANVAS_ALTURA };
  const areaPlayer = conferencia || !composicaoAtiva ? areaSemComposicao : area;
  const caixaPlayer = conferencia || !composicaoAtiva
    ? caixaEnquadramentoVideo(areaSemComposicao)
    : caixa;
  // A ÁREA DO VÍDEO é exatamente o espaço que o vídeo deve preencher: o vídeo
  // preenche 100% da área (cover) no Preview e no render — nunca pequeno /
  // centralizado dentro dela. O `fit` do template é normalizado para 'cobrir'
  // (configEditorLote/mapearEditorLote/templateParaConfigEditor), então Preview
  // e FFmpeg usam a mesma geometria de preenchimento. `fitPlayer` é o valor
  // CSS (object-fit: cover) — o template usa 'cobrir' (mesmo significado).
  const fitPlayer = 'cover';

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
      <div
        ref={canvasRef}
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
        {/* TEMPLATE DE FUNDO IMPORTADO - camada de FUNDO do canvas: PNG/imagem via
            Importar Template PREENCHE o canvas 9:16 por completo (cover: 100%
            largura/altura, centralizado, proporção preservada). O video ocupa
            SOMENTE a areaVideo sobre ele. Somente leitura. */}
        {composicaoAtiva && temTemplateFundo ? (
          <div data-template-fundo="true" className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
            <img src={templateFundo.url} alt={templateFundo.nome || 'Template de fundo'} draggable={false} className="pointer-events-none select-none" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
          </div>
        ) : null}
        {/* VÍDEO (original + edições da prévia) — NUNCA no ESTADO A (marcação):
            só o template + o retângulo da área existem nessa tela (a marcação é
            apenas geometria — o retângulo NÃO é container visual do vídeo). Fora
            da marcação o vídeo aparece: no canvas INTEIRO (sem preview — vídeos
            normais no centro), dentro da ÁREA marcada (Preview — cover, MESMA
            geometria do render) ou em conferência (MP4 pronto). Os CONTROLES do
            player NÃO estão aqui — são portados pra camada fixa
            `data-edl-destino-controles` (abaixo). */}
        {!modoMarcacao && (
        <div className="absolute inset-0">
            {/* CAMADA DO VÍDEO — ocupa EXATAMENTE a ÁREA de composição: a área
              definida no Preview é o espaço real do vídeo no template (o vídeo
              preenche 100% da largura/altura da área, com o enquadramento/cover
              definido por caixaEnquadramentoVideo). SEM caixa fixa, SEM moldura,
              SEM controles X/Y: o usuário arrasta o próprio vídeo e usa a RODA
              DO MOUSE para ampliar/reduzir (zoom sob o cursor). Nas células não
              selecionadas: mesma geometria, mas pointer-events-none (só
              visualização). */}
          <div
            ref={camadaVideoRef}
            role={podeEditarVideo && urlVideoAtiva ? 'button' : undefined}
            tabIndex={podeEditarVideo && urlVideoAtiva ? 0 : undefined}
            aria-label="Mover o vídeo (arraste com o mouse) e ampliar/reduzir (roda do mouse)"
            data-elemento="video"
            data-x={String(area.x)}
            data-y={String(area.y)}
            data-largura={String(area.largura)}
            data-altura={String(area.altura)}
            data-enq-zoom={String(areaN.zoom)}
            data-enq-x={String(areaN.deslocamentoX)}
            data-enq-y={String(areaN.deslocamentoY)}
            data-area-largura={String(areaN.largura)}
            data-area-altura={String(areaN.altura)}
            data-area-fit={areaN.fit}
            onPointerDown={podeEditarVideo && urlVideoAtiva ? (e) => { selecionar('video'); moverVideo(e); } : undefined}
            className={`absolute overflow-hidden ${podeEditarVideo && urlVideoAtiva ? (arrastandoVideo ? 'cursor-grabbing' : 'cursor-grab') : 'pointer-events-none'} ${elementoSelecionado === 'video' ? 'edl-elemento-selecionado' : ''}`}
            style={{
              left: areaPlayer.x * escala,
              top: areaPlayer.y * escala,
              width: Math.max(2, areaPlayer.largura) * escala,
              height: Math.max(2, areaPlayer.altura) * escala,
              touchAction: 'none',
              zIndex: 5,
              userSelect: 'none',
            }}
          >
            {/* Conteúdo escalado (quadro) dentro da área: a área é exatamente o espaço
                do vídeo — o <video>/<img> preenche 100% do quadro da área
                (cover), com o enquadramento/cover definido por
                caixaEnquadramentoVideo. O render materializa este exato quadro
                (scale/crop/pad do FFmpeg). */}
            <div
              key={item && item.id ? `video-${item.id}` : 'video-vazio'}
              data-elemento="video-caixa"
              className="absolute"
              style={{
                left: caixaPlayer.x * escala,
                top: caixaPlayer.y * escala,
                width: caixaPlayer.largura * escala,
                height: caixaPlayer.altura * escala,
              }}
            >
              {podeEditar && urlVideoAtiva ? (
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
                  style={{ objectFit: fitPlayer }}
                />
              ) : item && (
                <div className="flex flex-col items-center justify-center w-full h-full pointer-events-none">
                  <ImageOff className="w-5 h-5" style={{ color: 'rgba(236,72,153,0.6)' }} />
                  <span className="text-[8px] font-black tracking-widest" style={{ color: 'rgba(139,92,246,0.75)' }}>
                    VÍDEO ORIGINAL
                  </span>
                </div>
              )}
            </div>

            {/* Dica DISCRETA durante a interação — desaparece sozinha. */}
            {dicaEnquadramento && (
              <span
                className="edl-selo-base absolute z-30 text-[9px] font-black px-1.5 py-0.5 rounded pointer-events-none"
                style={{ top: 6, left: '50%', transform: 'translateX(-50%)' }}
              >
                {dicaEnquadramento}
              </span>
            )}
          </div>
        </div>
        )}

        {/* CAIXA DE SELEÇÃO + ALÇAS DO OBJETO DE VÍDEO (vídeo selecionado).
            Vive FORA da camada do vídeo (não bloqueia o arraste do corpo: o
            contêiner é `pointer-events-none` e SÓ as alças capturam o ponteiro).
            Arrastar o corpo move; roda do mouse = zoom interno; ALÇA =
            redimensiona o OBJETO (mesma geometria do render). */}
        {podeEditarVideo && urlVideoAtiva && elementoSelecionado === 'video' && (
          <div
            data-elemento="video"
            className="edl-elemento-selecionado absolute z-30"
            style={{
              left: area.x * escala,
              top: area.y * escala,
              width: Math.max(2, area.largura) * escala,
              height: Math.max(2, area.altura) * escala,
              pointerEvents: 'none',
            }}
          >
            {alcasDoVideo.map((alca) => (
              <span
                key={alca.rotulo}
                role="slider"
                aria-label={`Redimensionar vídeo (${alca.rotulo})`}
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={alca.onPointerDown}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{
                  ...alca.estilo,
                  width: alca.largura,
                  height: alca.altura,
                  background: '#94a3b8',
                  cursor: alca.cursor,
                  touchAction: 'none',
                  pointerEvents: 'auto',
                }}
              />
            ))}
          </div>
        )}

        {/* REDEFINIR — discreto, aparece SÓ quando o usuário mexeu no
            enquadramento ou no TAMANHO/POSIÇÃO do objeto de vídeo. Volta
            tamanho e posição originais (zoom 1, centro, canvas inteiro). */}
        {podeEditarVideo && urlVideoAtiva && videoEditadoNoPreview && (
          <button
            type="button"
            onClick={redefinirEnquadramento}
            onPointerDown={(e) => e.stopPropagation()}
            title="Voltar o vídeo ao tamanho e posição originais"
            aria-label="Redefinir enquadramento do vídeo"
            className="edl-selo-base edl-ring-foco absolute z-40 h-6 px-2 rounded-md text-[9px] font-black flex items-center gap-1"
            style={{ top: 6, right: base ? 40 : 6, cursor: 'pointer' }}
          >
            ↺ Redefinir
          </button>
        )}

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

        {/* ÁREA DO VÍDEO — GUIA da COMPOSIÇÃO FINAL (nunca recorta a prévia).
            O retângulo tracejado mostra ONDE o vídeo entra no vídeo FINAL
            (`areaVideo` → scale/crop/pad do FFmpeg). É SOMENTE marcação
            geométrica (x/y/largura/altura): NÃO é container do vídeo — o
            vídeo só aparece dentro dela no Preview (Estado B). Com a
            "Marcação da área" DESLIGADA fica invisível e `pointer-events-none`
            (nunca atrapalha o player); no MODO DE MARCAÇÃO o guia fica
            SEMPRE visível. Na célula selecionada pode ser arrastado/
            redimensionado (as alças exigem a camada "Área do vídeo"
            selecionada). MODO CONFERÊNCIA (vídeo PRONTO): a guia NÃO é
            desenhada — o final já está composto e nada de edição sobrepõe o
            MP4. */}
        {composicaoAtiva && !conferencia && (
        <div
          role={podeEditarArea ? 'button' : undefined}
          tabIndex={podeEditarArea ? 0 : undefined}
          aria-label="Mover a área do vídeo (composiçom final)"
          data-elemento="area"
          data-x={String(area.x)}
          data-y={String(area.y)}
          data-largura={String(area.largura)}
          data-altura={String(area.altura)}
          onPointerDown={podeEditarArea ? (e) => { selecionar('area'); arrastarArea(e); } : undefined}
          className={`edl-area-video absolute overflow-hidden flex items-center justify-center touch-none select-none ${(area.mostrarMarcacao || mostraGuiaArea) ? 'edl-guia-ativa' : ''} ${podeEditarArea ? '' : 'pointer-events-none'} ${elementoSelecionado === 'area' ? 'edl-elemento-selecionado' : ''}`}
          style={{
            left: area.x * escala,
            top: area.y * escala,
            width: area.largura * escala,
            height: area.altura * escala,
            borderRadius: 8 * escala,
            cursor: podeEditarArea ? 'move' : 'default',
            // Acima do template (z=1) e do vídeo (z=5): com o toggle ligado,
            // o guia aparece SOBRE o template em TODAS as células — antes ele
            // ficava por trás (z-auto) e o template o tapava. DESLIGADO, o
            // guia é invisível E pointer-events-none: nunca atrapalha o player.
            zIndex: 10,
            border: (area.mostrarMarcacao || mostraGuiaArea) ? undefined : '2px dashed transparent',
            backgroundColor: (area.mostrarMarcacao || mostraGuiaArea) ? undefined : 'transparent',
          }}
        >

          {/* Manijas de redimensionar (SÓ quando a ÁREA está selecionada) */}
          {podeEditarArea && elementoSelecionado === 'area' && (
            <>
              <span
                role="slider"
                aria-label="Redimensionar largura da área"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaDireita}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ right: -5, top: '50%', transform: 'translateY(-50%)', width: 12, height: 26, background: '#94a3b8', cursor: 'ew-resize', touchAction: 'none' }}
              />
              <span
                role="slider"
                aria-label="Redimensionar altura da área"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaAbaixo}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 26, height: 12, background: '#94a3b8', cursor: 'ns-resize', touchAction: 'none' }}
              />
              <span
                role="slider"
                aria-label="Redimensionar área (canto)"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaCanto}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ right: -5, bottom: -5, width: 14, height: 14, background: '#94a3b8', cursor: 'nwse-resize', touchAction: 'none' }}
              />
            </>
          )}
        </div>
        )}

        {/* DOIS TEXTOS INDEPENDENTES (superior e inferior) — cada um tem
            conteúdo, posição, tamanho, largura, fonte, peso, cor, alinhamento,
            opacidade e visibilidade PRÓPRIOS. Arrastáveis SÓ na célula
            selecionada; nas demais são SOMENTE visualização.
            Na marcação (Estado A) não aparecem: só o template + o retângulo da
            área existem nessa tela (o vídeo entra apenas no Preview). */}
        {composicaoAtiva && !conferencia && !modoMarcacao && [
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
        {composicaoAtiva && !conferencia && !modoMarcacao && (
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
        {composicaoAtiva && !conferencia && !modoMarcacao && (config.imagens || []).map((im) => (
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

      {podeEditarVideo && urlVideoAtiva && (
        <div className="edl-zoom-touch" role="group" aria-label="Zoom do vídeo">
          <button type="button" className="edl-botao-fantasma edl-ring-foco rounded-lg" aria-label="Diminuir zoom" onClick={() => zoomTouch(-1)}>−</button>
          <span className="self-center text-xs" style={{ color: 'var(--edl-texto-dim)' }}>{Math.round(areaN.zoom * 100)}%</span>
          <button type="button" className="edl-botao-fantasma edl-ring-foco rounded-lg" aria-label="Aumentar zoom" onClick={() => zoomTouch(1)}>+</button>
        </div>
      )}

      {/* Rodapé do canvas (só no modo editor único; células usam o próprio rodapé) */}
      {mostrarRodape && (
        <p className="text-[9px] font-semibold mt-3" style={{ color: 'var(--edl-texto-mut)' }}>
          {item ? `Editando: ${item.nome}` : 'Selecione um vídeo na lista'} • {CANVAS_LARGURA}×{CANVAS_ALTURA} (9:16) • {composicaoAtiva ? 'prévia: template + vídeo na área marcada' : 'prévia: somente os vídeos importados'} • encaixe do final: {area.fit}
        </p>
      )}
    </div>
  );
}