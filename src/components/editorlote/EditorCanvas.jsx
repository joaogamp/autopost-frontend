import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageOff, Trash2 } from 'lucide-react';
import {
  CORTE_MAXIMO,
  CANVAS_LARGURA,
  CANVAS_ALTURA,
  familiaDeFonte,
  pesoDeTexto,
  corteEfetivoDoVideo,
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
  gerarRedimensionarLogo,
  gerarRedimensionarTextoLargura,
  gerarArrastarCorteSuperior,
  gerarArrastarCorteInferior,
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
 *   editável — vídeo REAL com ControlesVideo + logo + textos + identidade +
 *   guia da área arrastável/redimensionável + cortes arrastáveis;
 * - DEMAIS CÉLULAS (interativo=false): SOMENTE visualização do MESMO canvas
 *   com a MESMA config compartilhada (logo/textos/identidade/área/cortes
 *   aparecem iguais), mas sem arrastes/manijas/áudio — SOLO thumbnail
 *   estática (parada), nunca un <video> con autoplay/loop en background.
 *
 * PRÉVIA x PROCESSAMENTO (uma ÚNICA fonte de verdade para o corte E para o
 * enquadramento do vídeo):
 * - A PRÉVIA desenha o vídeo na ÁREA de composição com a MESMA geometria do
 *   render (`caixaEnquadramentoVideo`): quadro = área × zoom, posicionado por
 *   deslocamentoX/Y e com o MESMO `fit` (cobrir/ajustar) do template — o
 *   usuário amplia/reduz e move o vídeo com o MOUSE (arrastar + roda), e o
 *   vídeo final sai EXATAMENTE igual (compor.js materializa os mesmos valores);
 * - O CORTE (manual ou o resultado SALVO do "Corte automático de bordas")
 *   aparece na prévia como recorte visual (clip-path) usando EXATAMENTE os
 *   mesmos % (`corteEfetivoDoVideo`) que viajam no template — e o FFmpeg
 *   materializa com o MESMO valor (drawbox single-pass). NENHUMA detecção
 *   acontece no processamento: o render nunca re-detecta nem re-enquadra;
 * - logo, textos e identidade continuam sendo renderizados por cima do vídeo
 *   (posiçom/tamanho/proporçom preservados; editáveis normalmente).
 */

/** Altura MÁXIMA padrão do preview 9:16 na TELA (px). Pode ser sobrescrita
 * por célula via prop `alturaMaxima` (a área central usa valores menores
 * nos modos 2X/3X para caberem lado a lado). */
const ALTURA_MAXIMA_PADRAO = 500;

/** (Removido) A prévia NÃO usa mais um encaixe fixo 'contain' do canvas
 * inteiro: ela desenha o vídeo DENTRO da área de composição com o MESMO
 * `fit` (`area.fit` = 'cobrir'|'ajustar') e o MESMO zoom/deslocamento que o
 * render final — prévia = render, por construção. */

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
  // ('logo', 'textoSuperior', 'video', 'area', 'corte', 'selo', 'imagem:<id>'…)
  // e callback pra selecionar/desselecionar. SÓ a célula editável seleciona.
  elementoSelecionado = null,
  aoSelecionarElemento,
}) {
  const canvasRef = useRef(null);
  const contenedorRef = useRef(null);
  const [escala, setEscala] = useState(1);

  // Somente a célula selecionada da área central edita: as demais são
  // SOMENTE visualização (mesmos overlays, sem arraste/manijas).
  const podeEditar = interativo && typeof aoAtualizarConfig === 'function';
  const atualizador = podeEditar ? aoAtualizarConfig : () => {};

  // Handlers — arrastre genérico por ruta: cada elemento es independente.
  // Nas células NÃO selecionadas (podeEditar=false) os handlers viram no-op.
  const arrastarLogo = gerarArrasteDeRuta(['logo'], atualizador);
  const arrastarTextoSuperior = gerarArrasteDeRuta(['textos', 'superior'], atualizador);
  const arrastarTextoInferior = gerarArrasteDeRuta(['textos', 'inferior'], atualizador);
  const redimensionarLogo = gerarRedimensionarLogo(atualizador);
  const redimensionarTextoSup = gerarRedimensionarTextoLargura(['textos', 'superior'], atualizador);
  const redimensionarTextoInf = gerarRedimensionarTextoLargura(['textos', 'inferior'], atualizador);
  const arrastarArea = gerarArrastreArea(atualizador);
  const redimensionarAreaDireita = gerarRedimensionarArea('direita', atualizador);
  const redimensionarAreaAbaixo = gerarRedimensionarArea('abaixo', atualizador);
  const redimensionarAreaCanto = gerarRedimensionarArea('canto', atualizador);
  const corredorSuperior = gerarArrastarCorteSuperior(atualizador, itemSelecionado?.id || null);
  const corredorInferior = gerarArrastarCorteInferior(atualizador, itemSelecionado?.id || null);

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
  const area = config.areaVideo;
  const areaN = areaVideoNormalizada(area);
  // Geometria do enquadramento — MESMA matemática do render (compor.js):
  // quadro = área × zoom, posicionado pela folga com deslocamentoX/Y.
  const caixa = caixaEnquadramentoVideo(area);
  const enquadramentoEditado = enquadramentoVideoEditado(area);
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

  /** Fase do vídeo em exibição (dims reais + fit do template) para os cálculos. */
  const obterQuadro = useCallback(() => ({
    dimsVideo: dimsVideoRef.current,
    fit: area?.fit,
  }), [area?.fit]);

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

  /** RESET: volta tamanho e posição originais (sem controles X/Y). */
  const redefinirEnquadramento = useCallback(() => {
    atualizador((cfg) => ({
      ...cfg,
      areaVideo: { ...(cfg.areaVideo || {}), ...enquadramentoVideoOriginal() },
    }));
    mostrarDicaEnquadramento('Enquadramento redefinido');
  }, [atualizador, mostrarDicaEnquadramento]);

  // ZOOM NA RODA (sobre a camada do vídeo): mesma matemática do render —
  // `deslocamentoSobZoom` mantém o ponto sob o cursor fixo (sem salto).
  useEffect(() => {
    if (!podeEditar || !urlVideoAtiva) return;
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
  }, [podeEditar, urlVideoAtiva, atualizador, areaN?.zoom, areaN, mostrarDicaEnquadramento]);
  // --------------------------------------------------------------------------

  const logo = config.logo || {};
  const identidade = config.identidade || null;
  const corte = corteEfetivoDoVideo(config, itemSelecionado?.id);
  const corteGlobal = config.corteBordas || {};
  const corteAtivo = !!corte.ativo || !!(itemSelecionado?.id && config?.overridesPorVideo?.[itemSelecionado.id]);
  const corteSup = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.superior) || 0));
  const corteInf = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.inferior) || 0));
  // CORTE — PREVIEW = RENDER (CORREÇÃO 3): o recorte visual (clip-path) usa a
  // MESMA condição e os MESMOS valores que o render (template.corteBordas.
  // ativo || override → drawbox no FFmpeg). Toggle desligado e sem override =
  // prévia inteira E vídeo inteiro no render — nenhuma das pontas corta.
  const corteMostraClip = corteAtivo && (corteSup > 0 || corteInf > 0);
  const corteSupEfetivo = corteSup;
  const corteInfEfetivo = corteInf;
  // Linha inferior vive em 100%−inf. Evita que cruce la superior si el usuario
  // força valores extremos (superior + inferior ≥ 100) — los valores siguen
  // sendo independentes en la config.
  const posLinhaInferior = Math.max(corteSup + 1, 100 - corteInf);
  const item = itemSelecionado;
  // NOTA: `area.fit` (cobrir/ajustar) é usado na prévia E no vídeo final —
  // o mesmo valor viaja no template (scale/crop/pad do FFmpeg). O enquadramento
  // do usuário (zoom + deslocamentoX/Y, editado com o MOUSE) também é o mesmo
  // dos dois lados: a prévia desenha o quadro com `caixaEnquadramentoVideo`.

  // Escalada do canvas 9:16: observa o CONTENEDOR da célula (contenedorRef)
  // e calcula a maior escala que mantiene a proporção 1080×1920 cabendo inteira
  // (ancho e alto). As linhas/faixas de corte usam top/height em % — posicionamento
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
        {/* CORTE DE BORDAS — linhas pontilhadas (arrastáveis SÓ na célula
            selecionada; nas demais são SOMENTE visualização). São APENAS
            GUIAS de ediçom. A área cortada revela o FUNDO DO CANVAS puro
            (`corFundo` — BRANCO por padrão), SEM véu/faixa escura por cima:
            é o MESMO `corFundo` que o render final usa pra cobrir o corte,
            então prévia e processamento ficam visualmente idênticos. */}
        {(corteAtivo || podeEditar) && (
          <>
            {/* Linha superior de corte */}
            <div
              role={podeEditar ? 'slider' : undefined}
              aria-label="Corte superior"
              aria-valuemin={0}
              aria-valuemax={CORTE_MAXIMO}
              aria-valuenow={Math.round(corteSup)}
              aria-valuetext={`${Math.round(corteSup)}% da altura`}
              data-elemento="corte"
              data-posy={String(corteSup)}
              onPointerDown={podeEditar ? (e) => { selecionar('corte'); corredorSuperior(e); } : undefined}
              className={`edl-corredor-corte absolute left-0 right-0 z-20 touch-none ${podeEditar ? 'cursor-row-resize' : 'pointer-events-none'}`}
              style={{
                top: `${corteSup}%`,
                borderTop: '2px dashed var(--edl-roxo)',
              }}
            >
              {/* Alça visual central (só na célula editável) */}
              {podeEditar && (
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: 'var(--edl-roxo)' }} />
              )}
            </div>

            {/* Linha inferior de corte */}
            <div
              role={podeEditar ? 'slider' : undefined}
              aria-label="Corte inferior"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(posLinhaInferior)}
              aria-valuetext={`${Math.round(posLinhaInferior)}% da altura`}
              data-elemento="corte"
              data-posy={String(posLinhaInferior)}
              onPointerDown={podeEditar ? (e) => { selecionar('corte'); corredorInferior(e); } : undefined}
              className={`edl-corredor-corte absolute left-0 right-0 z-20 touch-none ${podeEditar ? 'cursor-row-resize' : 'pointer-events-none'}`}
              style={{
                top: `${posLinhaInferior}%`,
                borderBottom: '2px dashed var(--edl-roxo)',
              }}
            >
              {/* Alça visual central (só na célula editável) */}
              {podeEditar && (
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: 'var(--edl-roxo)' }} />
              )}
            </div>

            {/* FASE 2: o corte EFETIVO (global + override do video) APARECE
                na previa via clip-path (feedback imediato do arraste e da
                deteccao); a área cortada revela o `corFundo` PURO — sem véu
                escuro (o render final cobre o corte com o mesmo `corFundo`).
                O arquivo original segue intacto; o mesmo % vai ao render (Fase 3). */}
          </>
        )}

        {/* VÍDEO (original + edicoes da previa): sem corte mostra o quadro
            completo (`contain`); com corte efetivo, a camada leva `clip-path`
            com o mesmo % do render. Arquivo original intacto; `areaVideo` segue
            como guia (so o FINAL compoe). */}
        <div className="absolute inset-0" style={corteMostraClip ? { clipPath: `inset(${corteSupEfetivo}% 0 ${corteInfEfetivo}% 0)` } : undefined}>
          {/* CAMADA DO VÍDEO — ocupa a ÁREA de composição e desenha o vídeo
              EXATAMENTE como no vídeo final: quadro = área × zoom, posicionado
              por deslocamentoX/Y e com o MESMO `fit` do template. SEM caixa
              fixa, SEM moldura, SEM controles X/Y: o usuário arrasta o próprio
              vídeo e usa a RODA DO MOUSE para ampliar/reduzir (zoom sob o
              cursor). Nas células não selecionadas: mesma geometria, mas
              pointer-events-none (só visualização). */}
          <div
            ref={camadaVideoRef}
            role={podeEditar && urlVideoAtiva ? 'button' : undefined}
            tabIndex={podeEditar && urlVideoAtiva ? 0 : undefined}
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
            data-area-fit={area.fit}
            onPointerDown={podeEditar && urlVideoAtiva ? (e) => { selecionar('video'); moverVideo(e); } : undefined}
            className={`absolute overflow-hidden ${podeEditar && urlVideoAtiva ? (arrastandoVideo ? 'cursor-grabbing' : 'cursor-grab') : 'pointer-events-none'} ${elementoSelecionado === 'video' ? 'edl-elemento-selecionado' : ''}`}
            style={{
              left: area.x * escala,
              top: area.y * escala,
              width: Math.max(2, area.largura) * escala,
              height: Math.max(2, area.altura) * escala,
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {/* Conteúdo escalado (quadro) dentro da área — MESMA geometria do
                FFmpeg: o render materializa este exato quadro (scale/crop/pad). */}
            <div
              className="absolute"
              style={{
                left: caixa.x * escala,
                top: caixa.y * escala,
                width: caixa.largura * escala,
                height: caixa.altura * escala,
              }}
            >
              {podeEditar && urlVideoAtiva ? (
                <ControlesVideo
                  key={`${urlVideoAtiva}|${claveReproductor}`}
                  src={urlVideoAtiva}
                  encaixe={area.fit}
                  onDimensoes={aoDimensoesVideo}
                />
              ) : item && item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt={item.nome || 'Video'}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="w-full h-full pointer-events-none"
                  style={{ objectFit: area.fit }}
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

        {/* REDEFINIR — discreto, aparece SÓ quando o usuário mexeu no
            enquadramento. Volta tamanho e posição originais (zoom 1, centro). */}
        {podeEditar && urlVideoAtiva && enquadramentoEditado && (
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
            (`areaVideo` → scale/crop/pad do FFmpeg), mas a prévia segue
            mostrando o VÍDEO ORIGINAL inteiro. É só ferramenta de ediçom: com a
            "Marcação da área" DESLIGADA fica invisível e `pointer-events-none`
            (nunca atrapalha o player); LIGADA, pode ser arrastado/
            redimensionado na célula selecionada. */}
        <div
          role={podeEditar && area.mostrarMarcacao ? 'button' : undefined}
          tabIndex={podeEditar && area.mostrarMarcacao ? 0 : undefined}
          aria-label="Mover a área do vídeo (composiçom final)"
          data-elemento="area"
          data-x={String(area.x)}
          data-y={String(area.y)}
          data-largura={String(area.largura)}
          data-altura={String(area.altura)}
          onPointerDown={podeEditar && area.mostrarMarcacao ? (e) => { selecionar('area'); arrastarArea(e); } : undefined}
          className={`edl-area-video absolute overflow-hidden flex items-center justify-center touch-none select-none ${podeEditar && area.mostrarMarcacao ? '' : 'pointer-events-none'} ${elementoSelecionado === 'area' ? 'edl-elemento-selecionado' : ''}`}
          style={{
            left: area.x * escala,
            top: area.y * escala,
            width: area.largura * escala,
            height: area.altura * escala,
            borderRadius: 8 * escala,
            cursor: podeEditar && area.mostrarMarcacao ? 'move' : 'default',
            border: area.mostrarMarcacao ? undefined : '2px dashed transparent',
            backgroundColor: area.mostrarMarcacao ? undefined : 'transparent',
          }}
        >

          {/* Manijas de redimensionar (SÓ na célula editável) */}
          {podeEditar && area.mostrarMarcacao && (
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
                style={{ right: -5, top: '50%', transform: 'translateY(-50%)', width: 12, height: 26, background: 'var(--edl-rosa)', cursor: 'ew-resize', touchAction: 'none' }}
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
                style={{ bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 26, height: 12, background: 'var(--edl-roxo)', cursor: 'ns-resize', touchAction: 'none' }}
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
                style={{ right: -5, bottom: -5, width: 14, height: 14, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
              />
            </>
          )}
        </div>

        {/* LOGO sobre o canvas — arrastável SÓ na célula selecionada. O onLoad
            captura a proporção da imagem (altura/largura) que o template usa pra
            calcular a altura em px do overlay. */}
        {logo.visivel && logo.url && (
          <div
            role={podeEditar ? 'button' : undefined}
            tabIndex={podeEditar ? 0 : undefined}
            aria-label="Arrastar logo"
            data-elemento="logo"
            data-x={logo.x}
            data-y={logo.y}
            onPointerDown={podeEditar ? (e) => { selecionar('logo'); arrastarLogo(e); } : undefined}
            className={`edl-logo absolute ${podeEditar ? '' : 'pointer-events-none'} ${elementoSelecionado === 'logo' ? 'edl-elemento-selecionado' : ''}`}
            style={{
              left: `${logo.x}%`,
              top: `${logo.y}%`,
              width: `${logo.largura}%`,
              transform: 'translate(-50%, 0)',
              opacity: (logo.opacidade ?? 100) / 100,
              // Acima da camada do vídeo original e do guia da área — mesma
              // ordem do FFmpeg (vídeo/composição antes do overlay da logo).
              zIndex: 17,
            }}
          >
            <img
              src={logo.url}
              alt="Logo"
              draggable={false}
              onLoad={(e) => {
                if (!podeEditar) return;
                const img = e.currentTarget;
                if (img.naturalWidth > 0) {
                  const prop = img.naturalHeight / img.naturalWidth;
                  if (Math.abs((logo.alturaProporcao || 0) - prop) > 0.001) {
                    atualizador((cfg) => ({ ...cfg, logo: { ...cfg.logo, alturaProporcao: prop } }));
                  }
                }
              }}
              className="w-full h-auto pointer-events-none"
            />
            {/* Manija de redimensionar a logo (SÓ na célula editável) */}
            {podeEditar && (
              <span
                role="slider"
                aria-label="Redimensionar logo"
                data-largura={String(logo.largura)}
                onPointerDown={redimensionarLogo}
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow"
                style={{ right: -8, bottom: -8, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
              />
            )}
          </div>
        )}

        {/* DOIS TEXTOS INDEPENDENTES (superior e inferior) — cada um tem
            conteúdo, posição, tamanho, largura, fonte, peso, cor, alinhamento,
            opacidade e visibilidade PRÓPRIOS. Arrastáveis SÓ na célula
            selecionada; nas demais são SOMENTE visualização. */}
        {[
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
                  style={{ right: -9, top: '50%', transform: 'translateY(-50%)', background: 'var(--edl-rosa)', cursor: 'ew-resize', touchAction: 'none' }}
                />
              )}
            </div>
          );
        })}

        {/* IDENTIDADE DO CANAL — nome do canal, @ do canal e selo azul de
            verificado: elementos INDEPENDENTES (posição/tamanho próprios).
            Editáveis SÓ na célula selecionada (nas demais, somente leitura).
            Cada um seleciona sua camada no clique (Camadas ⇄ Preview). */}
        <ElementoIdentidadeTexto chave="nome" t={identidade?.nome} escala={escala} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} selecionado={elementoSelecionado === 'identidadeNome'} aoSelecionar={selecionar} />
        <ElementoIdentidadeTexto chave="usuario" t={identidade?.usuario} escala={escala} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} selecionado={elementoSelecionado === 'identidadeUsuario'} aoSelecionar={selecionar} />
        <ElementoIdentidadeSelo selo={identidade?.selo} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} selecionado={elementoSelecionado === 'selo'} aoSelecionar={selecionar} />

        {/* IMAGENS (Adicionar elementos → Imagem): cada imagem é UMA camada
            independente — arrastável, redimensionável e selecionável direto no
            preview. MESMA geometria que o render compõe (prévia = render). */}
        {(config.imagens || []).map((im) => (
          <ElementoImagem
            key={im.id}
            imagem={im}
            aoAtualizarConfig={atualizador}
            selecionado={elementoSelecionado === `imagem:${im.id}`}
            aoSelecionar={selecionar}
            somenteLeitura={!podeEditar}
          />
        ))}
      </div>

      {/* Rodapé do canvas (só no modo editor único; células usam o próprio rodapé) */}
      {mostrarRodape && (
        <p className="text-[9px] font-semibold mt-3" style={{ color: 'var(--edl-texto-mut)' }}>
          {item ? `Editando: ${item.nome}` : 'Selecione um vídeo na lista'} • {CANVAS_LARGURA}×{CANVAS_ALTURA} (9:16) • prévia: vídeo original • encaixe do final: {area.fit}
        </p>
      )}
    </div>
  );
}