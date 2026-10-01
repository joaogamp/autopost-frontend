/**
 * EDITOR EM LOTE — helper de arrastre (drag) por % do canvas.
 *
 * Genera un `onPointerDown` que acompanha o movimento do ponteiro (mouse e
 * touch) e atualiza `x`/`y` (em % do canvas) do alvo na CONFIG
 * COMPARTILHADA via atualizador funcional.
 *
 * `gerarArrasteDeRuta` funciona com qualquer "ruta" (logo, textos.superior,
 * textos.inferior) — cada bloco é 100% independente: mover/redimensionar um
 * NUNCA altera o outro.
 */

import { atualizarCorteNoConfig, atualizarAreaVideoNoConfig, atualizarPosicaoVideoNoConfig, editarTodosOsVideos, areaVideoEfetivaDoVideo, areaSemCaixaDeConteudo, CANVAS_ALTURA, CANVAS_LARGURA, caixaConteudoExplicita, caixaEnquadramentoVideo, deslocamentoPorArraste, ENQUADRAMENTO_VIDEO_PADRAO, limitarMovimentoVideo } from '../../lib/configEditorLote';

/** ESCOPO da edição do vídeo, resolvido a partir da config.
 *
 * O toggle "Editar todos / Apenas este vídeo" (`config.editarTodos`) decide se
 * as alterações de ÁREA/enquadramento vão para o global (`areaVideo`) ou para
 * o override DESTE vídeo (`areaPorVideo[id]`). `videoId` é o da célula editável.
 * Sem vídeo selecionado não há escopo individual: cai no global.
 *
 * Esta é a ÚNICA porta de entrada do `arraste.js` para a área — o `arraste.js`
 * não conhece a estrutura do override, só chama a fonte única de escrita
 * (`atualizarAreaVideoNoConfig`), que aplica a precedência global ⊕ override. */
function escopoDaEdicao(cfg, videoId) {
  return { todos: editarTodosOsVideos(cfg) || !videoId, videoId: videoId || null };
}

/** Grava a área (moldura) respeitando o escopo. Substitui a escrita direta em
 * `cfg.areaVideo` — mesma matemática, agora com override individual. */
function gravarArea(cfg, videoId, mudancas) {
  return atualizarAreaVideoNoConfig(cfg, { ...escopoDaEdicao(cfg, videoId), mudancas });
}

/** Aplica `cambios` em uma ruta anidada da config (1 ou 2 niveles). */
function atualizarRuta(config, ruta, cambios) {
  if (!ruta || ruta.length === 0) return config;
  if (ruta.length === 1) {
    const [top] = ruta;
    return { ...config, [top]: { ...config[top], ...cambios } };
  }
  const [top, sub] = ruta;
  return {
    ...config,
    [top]: { ...config[top], [sub]: { ...config[top][sub], ...cambios } },
  };
}

/** Quita os listeners de `pointermove`/`pointerup` ao soltar (helper común). */
function quitarEscuchas(aoMover) {
  return function aoSoltar() {
    window.removeEventListener('pointermove', aoMover);
    window.removeEventListener('pointerup', aoSoltar);
  };
}

/** Sube pela árvore até achar um elemento com `dataset.escala` (o canvas). */
function encontrarCanvas(el) {
  let nodo = el;
  while (nodo && !nodo.dataset?.escala) nodo = nodo.parentElement;
  return nodo;
}

/** Arrastre genérico por ruta (1 o 2 niveles: ['logo'] | ['textos','superior']). */
export function gerarArrasteDeRuta(ruta, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();

    // Lê a posição inicial direto dos atributos data-x/data-y do elemento
    // (sempre atuais — evita stale closure com a config compartilhada).
    const el = e.currentTarget;
    const inicial = { x: parseFloat(el.dataset.x) || 0, y: parseFloat(el.dataset.y) || 0 };

    const startX = e.clientX;
    const startY = e.clientY;

    function aoMover(ev) {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      aoAtualizarConfig((cfg) =>
        atualizarRuta(cfg, ruta, {
          x: Math.min(100, Math.max(0, (inicial.x || 0) + dx)),
          y: Math.min(100, Math.max(0, (inicial.y || 0) + dy)),
        })
      );
    }
    const aoSoltar = quitarEscuchas(aoMover);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/** Arrastre de um alvo de nível superior (logo, etc.) — equivalência antigua. */
export function gerarArraste(alvo, aoAtualizarConfig) {
  return gerarArrasteDeRuta([alvo], aoAtualizarConfig);
}
/* ---------------------------------------------------------------------------
 * ÁREA DO VÍDEO — mover/redimensionar a região onde o vídeo fica (px do canvas).
 * ------------------------------------------------------------------------- */

/** Fração MÍNIMA da região do vídeo que precisa continuar visível dentro do
 * canvas ao arrastar. Sem isso a região ficaria presa às bordas do canvas
 * (folga zero quando `área == canvas`) e o vídeo não se moveria — foi
 * exatamente o defeito: o arraste era limitado a [0, canvas - área] e, no
 * enquadramento padrão, esse intervalo é um único ponto (nada se move). */
const MARGEM_MINIMA_VISIVEL = 0.3;

/** Limita um valor a um intervalo (helper local, sem dependências). */
function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

/** ESCALA de um canvas (`data-escala`) — nunca zero/NaN. */
function escalaDoCanvas(canvasEl) {
  const n = parseFloat(canvasEl?.dataset?.escala || '1');
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Canvas que COMPÕEM a área: onde o vídeo é posicionado por `areaVideo`.
 * O EditorCanvas marca a raiz com `[data-area-composicao]` quando a composição
 * está ativa (Preview) e a camada do vídeo é montada. A grade do centro mostra
 * o MESMO vídeo na MESMA área em VÁRIAS células (1X/2X/3X/6X) — todas precisam
 * acompanhar o arraste, não só a célula onde o ponteiro está. */
function canvasesDeComposicao() {
  try {
    return Array.from(document.querySelectorAll('[data-area-composicao]'));
  } catch {
    return [];
  }
}

/** Conjunto de canvases que devem acompanhar o arraste da ÁREA: o canvas onde
 * o ponteiro está (a gaveta de marcação, por exemplo — que não tem vídeo
 * montado) + TODOS os canvas de composição da página. */
function canvasesParaSincronizar(canvasEl) {
  const conjunto = new Set();
  if (canvasEl) conjunto.add(canvasEl);
  for (const canvas of canvasesDeComposicao()) conjunto.add(canvas);
  return Array.from(conjunto);
}

/** Enquadramento (zoom/deslocamentos) MOSTRADO pela camada do vídeo de um
 * canvas — lido do PRÓPRIO dataset (sempre atual, nunca closure velha). */
function enquadramentoDaCamada(camada) {
  if (!camada) return { ...ENQUADRAMENTO_VIDEO_PADRAO };
  const numero = (valor, padrao) => {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : padrao;
  };
  return {
    zoom: numero(camada.dataset.enqZoom, ENQUADRAMENTO_VIDEO_PADRAO.zoom),
    deslocamentoX: numero(camada.dataset.enqX, ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX),
    deslocamentoY: numero(camada.dataset.enqY, ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY),
  };
}

/** CAIXA DE CONTEÚDO em coords ABSOLUTAS do canvas para uma moldura + um
 * enquadramento — a MESMA conta do render (`caixaEnquadramentoVideo`), SEM os
 * campos `conteudo*`: a caixa congelada por um redimensionamento do vídeo fica
 * obsoleta assim que a MOLDURA muda (é exatamente o que o commit grava). */
function caixaAbsolutaDaMoldura(moldura, enquadramento = {}) {
  const caixa = caixaEnquadramentoVideo({
    x: moldura.x,
    y: moldura.y,
    largura: moldura.largura,
    altura: moldura.altura,
    zoom: enquadramento.zoom,
    deslocamentoX: enquadramento.deslocamentoX,
    deslocamentoY: enquadramento.deslocamentoY,
  });
  return {
    x: moldura.x + caixa.x,
    y: moldura.y + caixa.y,
    largura: caixa.largura,
    altura: caixa.altura,
  };
}

/**
 * GEOMETRIA DA ÁREA NA TELA (durante o arraste, sem re-render do React).
 *
 * ÁREA DE MARCAÇÃO ≠ CAMADA VISUAL DO VÍDEO — `alvos` separa as duas coisas:
 *  · 'guia'  → escreve SOMENTE o retângulo de marcação
 *    (`[data-elemento="area"]`). É o caso do arraste/alças do GUIA: mexer na
 *    marcação NÃO reposiciona o vídeo (ele continua exatamente onde estava; só
 *    é re-enquadrado na nova área quando a composição é (re)ATIVADA —
 *    "Mostrar Preview" — ver EditorCanvas);
 *  · 'todos' → escreve a MOLDURA (guia + camada `[data-elemento="video"]` +
 *    caixa de seleção) e a CAIXA DE CONTEÚDO (`[data-elemento="video-caixa"]`).
 *    É o caso do PRÓPRIO VÍDEO sendo editado (arraste do corpo no Preview,
 *    `origemArraste === 'video'` e as alças do objeto de vídeo): aí o vídeo É o
 *    alvo do gesto e acompanha o ponteiro em TEMPO REAL — o commit do
 *    `pointerup` grava essa MESMA geometria, então não há salto no release.
 *
 * `caixaAbs` (coords absolutas do canvas) é OPCIONAL: sem ela a caixa é
 * derivada da moldura + enquadramento da própria camada.
 */
function sincronizarGeometriaDaArea(canvasEl, moldura, { caixaAbs = null, alvos = 'todos' } = {}) {
  if (!moldura) return;
  const x = Number(moldura.x) || 0;
  const y = Number(moldura.y) || 0;
  const largura = Math.max(2, Number(moldura.largura) || 0);
  const altura = Math.max(2, Number(moldura.altura) || 0);
  // 'guia' → a marcação NUNCA toca na camada visual do vídeo.
  const movimentaVideo = alvos !== 'guia';
  for (const canvas of canvasesParaSincronizar(canvasEl)) {
    const esc = escalaDoCanvas(canvas);
    const px = `${x * esc}px`;
    const py = `${y * esc}px`;
    const pw = `${largura * esc}px`;
    const ph = `${altura * esc}px`;
    const camada = canvas.querySelector('[data-elemento="video"][data-enq-zoom]');
    if (camada && movimentaVideo) {

      camada.style.left = px;
      camada.style.top = py;
      camada.style.width = pw;
      camada.style.height = ph;
      const caixa = caixaAbs
        || caixaAbsolutaDaMoldura({ x, y, largura, altura }, enquadramentoDaCamada(camada));
      for (const no of camada.querySelectorAll('[data-elemento="video-caixa"]')) {
        no.style.left = `${(caixa.x - x) * esc}px`;
        no.style.top = `${(caixa.y - y) * esc}px`;
        no.style.width = `${caixa.largura * esc}px`;
        no.style.height = `${caixa.altura * esc}px`;
      }
      const selecao = canvas.querySelector('[data-elemento="selecao-video"]');
      if (selecao) {
        selecao.style.left = px;
        selecao.style.top = py;
        selecao.style.width = pw;
        selecao.style.height = ph;
      }
    }
    const guia = canvas.querySelector('[data-elemento="area"]');
    if (guia) {
      guia.style.left = px;
      guia.style.top = py;
      guia.style.width = pw;
      guia.style.height = ph;
    }
  }
}

/**
 * MOVE O VÍDEO (região de composição `areaVideo.x/y`, px do canvas) —
 * usado pelo GUIA da área E PELO PRÓPRIO VÍDEO no Preview (um único
 * caminho: o mesmo estado que o render usa no pad final do canvas).
 *
 * Move 1:1 com o ponteiro (px do canvas, independe do zoom da interface) e
 * permite que a região saia PARCIALMENTE do canvas, mantendo sempre
 * `MARGEM_MINIMA_VISIVEL` visível — assim o vídeo segue o mouse em todas as
 * direções mesmo quando preenche a área inteira (padrão).
 *
 * DOIS CASOS, DOIS ALVOS:
 * · GUIA da área (`somenteGuia: true`) — MARCAR a área é geometria PURA: o
 *   retângulo tracejado ANDA (e só ele). A CAMADA VISUAL DO VÍDEO não é tocada:
 *   ela é enquadrada na nova área quando a composição é (re)ativada (Mostrar
 *   Preview). Marcar a área NUNCA move o vídeo;
 * · VÍDEO no Preview (`somenteGuia: false` — arrastar o próprio vídeo com
 *   zoom ≤ 1) — o vídeo É o alvo do gesto: MOLDURA e CAIXA de conteúdo andam
 *   com o ponteiro em TEMPO REAL em TODOS os canvas que compõem a área e o
 *   commit grava essa MESMA geometria → zero salto no `pointerup`.
 *
 * Só a BARRA de controles do player (`[data-edl-controles]`: play/seek/volume)
 * NÃO arrasta; o vídeo em si segue arrastável.
 *
 * `opcoes.aoInteragir`/`opcoes.aoFinalizar` (opcionais) avisam início/fim do
 * arraste — usados para o cursor "grabbing" e a dica discreta no Preview.
 */
export function gerarArrastreArea(aoAtualizarConfig, opcoes = {}) {
  const { aoInteragir = null, aoFinalizar = null, somenteGuia = false, videoId = null } = opcoes || {};
  return function aoPointerDown(e) {
    const objetivo = e.target;
    if (typeof objetivo.closest === 'function' && objetivo.closest('[data-edl-controles]')) return;
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cW = parseFloat(canvasEl.dataset.canvasLargura || '1080');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicial = {
      x: parseFloat(el.dataset.x) || 0,
      y: parseFloat(el.dataset.y) || 0,
      largura: parseFloat(el.dataset.largura) || 0,
      altura: parseFloat(el.dataset.altura) || 0,
    };
    // Limites: a região pode sair parcialmente do canvas (mantendo a margem
    // mínima visível) — intervalo com folga REAL, nunca um ponto só.
    const xMin = -(inicial.largura * (1 - MARGEM_MINIMA_VISIVEL));
    const xMax = cW - inicial.largura * MARGEM_MINIMA_VISIVEL;
    const yMin = -(inicial.altura * (1 - MARGEM_MINIMA_VISIVEL));
    const yMax = cH - inicial.altura * MARGEM_MINIMA_VISIVEL;
    const startX = e.clientX;
    const startY = e.clientY;

    // VÍDEO (somenteGuia=false): congela a caixa explícita ATUAL (coords
    // absolutas do canvas, via data-conteudo-* da camada) para que o conteúdo
    // acompanhe a moldura durante o arraste. GUIA (somenteGuia=true): null —
    // comportamento da Fase 3 inalterado (conteúdo parado).
    let caixaInicial = null;
    if (!somenteGuia) {
      const camadaVideo = (canvasEl && typeof canvasEl.querySelector === 'function'
        ? canvasEl.querySelector('[data-elemento="video"][data-enq-zoom]')
        : null) || null;
      if (camadaVideo && camadaVideo.dataset) {
        caixaInicial = caixaConteudoExplicita({
          conteudoX: parseFloat(camadaVideo.dataset.conteudoX),
          conteudoY: parseFloat(camadaVideo.dataset.conteudoY),
          conteudoLargura: parseFloat(camadaVideo.dataset.conteudoLargura),
          conteudoAltura: parseFloat(camadaVideo.dataset.conteudoAltura),
        });
      }
    }

    if (typeof aoInteragir === 'function') aoInteragir({ ativo: true });

    // TEMPO REAL — a geometria da área é aplicada DIRETO no DOM (estado local,
    // sem passar pelo config compartilhado), com rAF como limitador; o
    // `aoAtualizarConfig` (re-render de toda a árvore, incluindo o <video>
    // tocando) acontece UMA só vez, no `pointerup` — e grava EXATAMENTE o que
    // o arraste já colocou na tela (ver a REGRA ANTI-SALTO acima).
    const esc = Math.max(escala, 0.05);
    let atual = { x: inicial.x, y: inicial.y };
    let pendente = false;
    let rafId = 0;

    function aplicarNoDom() {
      rafId = 0;
      if (!pendente) return;
      pendente = false;
      // A moldura NÃO muda de tamanho aqui (só x/y). 'guia' = marcação: escreve
      // só o retângulo (a camada visual do vídeo fica onde está); 'todos' =
      // arraste do PRÓPRIO vídeo: moldura + caixa acompanham o ponteiro.
      // VÍDEO com caixa explícita: a caixa acompanha a moldura pelo MESMO delta
      // (offset relativo constante => sem salto). GUIA: caixaAbs=null (ignorado
      // com alvos:'guia'); VÍDEO sem caixa: null => fórmula legada (inalterado).
      const deslocX = atual.x - inicial.x;
      const deslocY = atual.y - inicial.y;
      const caixaAcompanha = (!somenteGuia && caixaInicial) ? {
        x: caixaInicial.x + deslocX,
        y: caixaInicial.y + deslocY,
        largura: caixaInicial.largura,
        altura: caixaInicial.altura,
      } : null;
      sincronizarGeometriaDaArea(canvasEl, {
        x: atual.x,
        y: atual.y,
        largura: inicial.largura,
        altura: inicial.altura,
      }, { caixaAbs: caixaAcompanha, alvos: somenteGuia ? 'guia' : 'todos' });
    }

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / esc;
      const dy = (ev.clientY - startY) / esc;
      atual = {
        x: limitar(inicial.x + dx, xMin, xMax),
        y: limitar(inicial.y + dy, yMin, yMax),
      };
      pendente = true;
      if (!rafId) rafId = requestAnimationFrame(aplicarNoDom);
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      aplicarNoDom();
      // COMMIT ÚNICO — só agora o estado compartilhado é atualizado (re-render).
      // Grava a MESMA geometria que o arraste já aplicou no DOM. POLÍTICA A
      // (GUIA, somenteGuia=true): a caixa de conteúdo (conteudo* — coords
      // ABSOLUTAS do canvas) é PRESERVADA: mover só a moldura desloca a JANELA
      // sobre o MESMO conteúdo (as coords absolutas continuam válidas depois
      // do movimento — não há o que reancorar). VÍDEO (somenteGuia=false) com
      // caixa explícita: translada conteudoX/Y pelo MESMO delta da moldura
      // (largura/altura preservadas) — o conteúdo acompanha o arraste sem
      // salto. Sem caixa explícita (config antiga) nada é criado: fallback
      // legado intacto. O ENQUADRAMENTO (zoom/deslocamentoX/Y) também é
      // preservado — o re-render do `pointerup` reproduz a tela (o vídeo NÃO
      // pula ao soltar).
      //
      // ESCOPO: a escrita passa por `gravarArea`, que respeita o toggle
      // "Editar todos / Apenas este vídeo" (global x `areaPorVideo[id]`).
      aoAtualizarConfig((cfg) => {
        const deslocFinalX = atual.x - inicial.x;
        const deslocFinalY = atual.y - inicial.y;
        // ÁREA EFETIVA deste vídeo (global ⊕ override) como base do commit —
        // arrastar a partir de uma área já individual não apaga o resto.
        const base = areaVideoEfetivaDoVideo(cfg, (cfg.editarTodos === false ? (videoId || null) : null));
        const mudancas = { x: atual.x, y: atual.y };
        if (!somenteGuia && caixaInicial) {
          mudancas.conteudoX = Math.round((caixaInicial.x + deslocFinalX) * 100) / 100;
          mudancas.conteudoY = Math.round((caixaInicial.y + deslocFinalY) * 100) / 100;
        }
        return gravarArea({ ...cfg, areaVideo: base }, videoId, mudancas);
      });
      if (typeof aoFinalizar === 'function') aoFinalizar();
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };
}
/** Redimensiona a ÁREA DO VÍDEO desde as manijas (4 lados + 4 cantos).
 * Eixos suportados (todos movem SOMENTE `areaVideo`, px do canvas):
 * - 'direita' | 'esquerda' | 'abaixo' | 'acima' (4 lados);
 * - 'canto' (alias legado = canto sudeste) + 4 cantos explícitos
 *   ('canto-noroeste' | 'canto-nordeste' | 'canto-sudoeste' | 'canto-sudeste').
 *
 * REGRA DA ÂNCORA (cada linha altera SOMENTE o próprio lado): no pointerdown
 * são capturadas as 4 referências originais (leftOriginal = x, topOriginal =
 * y, rightOriginal = x + largura, bottomOriginal = y + altura) e a borda
 * OPOSTA permanece fixa durante TODO o arraste — nunca é recalculada a partir
 * da nova largura/altura:
 *   TOP    → novoY = mouse;              novaAltura = bottomOriginal - novoY
 *   BOTTOM → novaAltura = mouse - topOriginal (topo fixo)
 *   LEFT   → novoX = mouse;              novaLargura = rightOriginal - novoX
 *   RIGHT  → novaLargura = mouse - leftOriginal (esquerda fixa)
 * Cantos combinam os dois eixos livres (NO: topo+esquerda · NE: topo+direita
 * · SO: baixo+esquerda · SE: baixo+direita), sem travar proporção — a
 * marcação é geometria livre x/y/largura/altura.
 *
 * TEMPO REAL: durante o arraste a geometria é aplicada DIRETO no DOM (via
 * rAF) nos nós que REPRESENTAM a área — NUNCA na própria alça (o
 * `currentTarget`): as alças são filhas ancoradas por left/right/top/bottom,
 * então acompanham as bordas sozinhas quando o nó muda.
 * O QUE é sincronizado depende da ORIGEM do arraste (ver `origemArraste`):
 * · GUIA da área (marcação) → SÓ o retângulo ([data-elemento="area"]). A camada
 *   visual do vídeo NÃO anda com a marcação: ela permanece exatamente onde
 *   estava e só é re-enquadrada na nova área quando a composição é (re)ativada
 *   (Mostrar Preview) — ver EditorCanvas;
 * · VÍDEO (alças do objeto de vídeo) → moldura + caixa de conteúdo em TODOS os
 *   canvas que compõem a área, cada um com a sua escala: o vídeo acompanha o
 *   gesto e o commit grava a MESMA geometria → zero salto no release.
 * O `aoAtualizarConfig` (estado definitivo, com re-render) acontece UMA única
 * vez, no `pointerup`. */
export function gerarRedimensionarArea(eixo, aoAtualizarConfig, opcoes = {}) {
  const { aoInteragir = null, aoFinalizar = null, videoId = null } = opcoes || {};
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof aoInteragir === 'function') aoInteragir();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala) || 1;
    // FASE 8 — canvasLargura/canvasAltura: o fallback vai DEPOIS do parseFloat
    // (mesmo invariante da `escala` acima, e mesma razão). Com o fallback
    // ANTES — `parseFloat(ds || '1080')` — uma string não-numérica mas
    // truthy (ex.: 'abc') passava pelo `||` e virava `NaN`; aí `cW - inicial.x`
    // é NaN, `limitar(…, TAM_MIN, NaN)` devolve NaN e o NaN é GRAVADO na config
    // (o objeto do vídeo some e o payload/render herdam geometria inválida).
    // `Number.isFinite` fecha também o caso `Infinity`/`-Infinity`.
    // Usa as CONSTANTES importadas (e não '1080'/'1920' literais), como já
    // fazem as linhas de logo/imagem/selo abaixo.
    const cW = parseFloat(canvasEl.dataset.canvasLargura);
    const cH = parseFloat(canvasEl.dataset.canvasAltura);
    const larguraCanvas = Number.isFinite(cW) && cW > 0 ? cW : CANVAS_LARGURA;
    const alturaCanvas = Number.isFinite(cH) && cH > 0 ? cH : CANVAS_ALTURA;

    // GEOMETRIA DA ÁREA — as alças do GUIA (`[data-elemento="area"]`, modo
    // "Marcar espaço do vídeo") e as ALÇAS DO VÍDEO selecionado (Preview,
    // recurso estilo Canva) mudam a MESMA coisa: a moldura `areaVideo`
    // (x/y/largura/altura). Por isso as duas seguem o MESMO caminho.
    //
    // TEMPO REAL (ver o cabeçalho): a ORIGEM decide o alvo. Alças do GUIA
    // (marcação) escrevem SÓ o retângulo — a camada visual do vídeo não é
    // tocada; alças do VÍDEO escrevem moldura + caixa em todos os canvas.
    const guia = canvasEl.querySelector('[data-elemento="area"]');
    // SELEÇÃO DAS CAMADAS (Preview): a camada do vídeo é a ÚNICA
    // `[data-elemento="video"]` com `data-enq-zoom` (a caixa de seleção agora é
    // `data-elemento="selecao-video"`, irmã fora da camada — fim da duplicata).
    const camadaVideo = canvasEl.querySelector('[data-elemento="video"][data-enq-zoom]');
    const noSelecao = typeof e.currentTarget.closest === 'function'
      ? (e.currentTarget.closest('[data-elemento="selecao-video"]')
        || e.currentTarget.closest('[data-elemento="video"]'))
      : null;
    // Origem do arraste: 'area' = alças do GUIA (só a moldura muda) ·
    // 'video' = alças do VÍDEO selecionado (a caixa de conteúdo fica FIXA).
    const origemArraste = noSelecao && camadaVideo ? 'video' : 'area';

    // CAIXA DE CONTEÚDO FIXA (origem 'video', opção A): congelada no
    // pointerdown em coords do canvas (cx, cy, cw, ch) via
    // caixaEnquadramentoVideo; fica PARADA durante e depois do arraste — só a
    // moldura muda (recorte). Fallback: se o cálculo falhar, caixaFixa = null
    // e o comportamento legado é preservado.
    let caixaFixa = null;
    if (origemArraste === 'video') {
      try {
        // PRIORIDADE — CAIXA EXPLÍCITA (data-conteudo-* da camada, coords
        // absolutas do canvas): em arrastes consecutivos moldura×zoom ≠ caixa
        // de conteúdo, então recalcular de x/y/zoom daria a caixa ERRADA (o
        // conteúdo "acompanhava a linha" no 2º drag). A caixa verdadeira vem
        // do render (caixaEnquadramentoVideo com os campos conteudo* da config).
        const cx0 = parseFloat(camadaVideo?.dataset?.conteudoX);
        const cy0 = parseFloat(camadaVideo?.dataset?.conteudoY);
        const cw0 = parseFloat(camadaVideo?.dataset?.conteudoLargura);
        const ch0 = parseFloat(camadaVideo?.dataset?.conteudoAltura);
        if ([cx0, cy0, cw0, ch0].every(Number.isFinite) && cw0 > 0 && ch0 > 0) {
          caixaFixa = { cx: cx0, cy: cy0, cw: cw0, ch: ch0 };
        } else {
        // FALLBACK (configs antigas, sem data-conteudo-*): congela do DATASET DA
        // CAMADA — nunca do guia (null no Preview) nem da seleção.
        const z0 = parseFloat(camadaVideo?.dataset?.enqZoom);
        const dx0 = parseFloat(camadaVideo?.dataset?.enqX);
        const dy0 = parseFloat(camadaVideo?.dataset?.enqY);
        const baseX = parseFloat(camadaVideo?.dataset?.x ?? e.currentTarget.dataset?.x);
        const baseY = parseFloat(camadaVideo?.dataset?.y ?? e.currentTarget.dataset?.y);
        const baseW = parseFloat(camadaVideo?.dataset?.largura ?? e.currentTarget.dataset?.largura);
        const baseH = parseFloat(camadaVideo?.dataset?.altura ?? e.currentTarget.dataset?.altura);
        const areaParaCaixa = {
          x: Number.isFinite(baseX) ? baseX : 0,
          y: Number.isFinite(baseY) ? baseY : 0,
          largura: Number.isFinite(baseW) && baseW > 0 ? baseW : 0,
          altura: Number.isFinite(baseH) && baseH > 0 ? baseH : 0,
          zoom: Number.isFinite(z0) && z0 > 0 ? z0 : 1,
          deslocamentoX: Number.isFinite(dx0) ? dx0 : 50,
          deslocamentoY: Number.isFinite(dy0) ? dy0 : 50,
        };
        if (areaParaCaixa.largura > 0 && areaParaCaixa.altura > 0) {
          const c0 = caixaEnquadramentoVideo(areaParaCaixa);
          caixaFixa = {
            cx: areaParaCaixa.x + c0.x,
            cy: areaParaCaixa.y + c0.y,
            cw: c0.largura,
            ch: c0.altura,
          };
        }
        }
      } catch { caixaFixa = null; }
    }

    // Referências iniciais lidas do DATASET DA CAMADA (origem 'video') ou do
    // guia (origem 'area') — sempre atuais, nunca closure velha. As alças da
    // seleção carregam os mesmos valores (fallback só se a camada sumir).
    const refDataset = (origemArraste === 'video' && camadaVideo) ? camadaVideo : (guia || e.currentTarget);
    const inicial = {
      x: parseFloat(refDataset.dataset.x) || 0,
      y: parseFloat(refDataset.dataset.y) || 0,
      largura: parseFloat(refDataset.dataset.largura) || 0,
      altura: parseFloat(refDataset.dataset.altura) || 0,
    };
    const startX = e.clientX;
    const startY = e.clientY;

    const esc = Math.max(escala, 0.05);
    // Estado atual COMPLETO (x/y/largura/altura) — alças de topo/esquerda
    // movem a origem, então o estado precisa carregar as 4 dimensões.
    let atual = { x: inicial.x, y: inicial.y, largura: inicial.largura, altura: inicial.altura };
    let pendente = false;
    let rafId = 0;
    // Guarda anti-duplo-fire (origem 'video'): o Chrome entrega às vezes dois
    // pointerdown para o mesmo gesto (alça + bubble); o segundo freeze
    // recalcularia caixaFixa do meio do gesto e o conteúdo "acompanha a linha".
    if (origemArraste === 'video' && canvasEl.__edlResizeVideoAtivo) return;
    if (origemArraste === 'video') canvasEl.__edlResizeVideoAtivo = true;

    const TAM_MIN = 100; // px mínimos do canvas (largura/altura nunca somem)

    // Quais dimensões cada eixo altera (conjuntos EXPLÍCITOS — matching por
    // substring engana: 'nordeste' não contém 'norte', 'sudoeste' contém
    // 'oeste', etc.):
    //  - lados:  'direita' → largura | 'abaixo' → altura
    //            'esquerda' → x+largura | 'acima' → y+altura
    //  - cantos: combinam os dois eixos livres; 'canto' = legado (sudeste).
    const EIXOS_ESQUERDA = new Set(['esquerda', 'canto-noroeste', 'canto-sudoeste']);
    const EIXOS_ACIMA = new Set(['acima', 'canto-noroeste', 'canto-nordeste']);
    const EIXOS_LARGURA = new Set(['direita', 'esquerda', 'canto', 'canto-sudeste', 'canto-nordeste', 'canto-noroeste', 'canto-sudoeste']);
    const EIXOS_ALTURA = new Set(['abaixo', 'acima', 'canto', 'canto-sudeste', 'canto-nordeste', 'canto-noroeste', 'canto-sudoeste']);
    const puxaEsquerda = EIXOS_ESQUERDA.has(eixo);
    const puxaAcima = EIXOS_ACIMA.has(eixo);
    const mudaLargura = EIXOS_LARGURA.has(eixo);
    const mudaAltura = EIXOS_ALTURA.has(eixo);

    function calcularNovo(ev) {
      const dx = (ev.clientX - startX) / esc;
      const dy = (ev.clientY - startY) / esc;
      const nova = { x: inicial.x, y: inicial.y, largura: inicial.largura, altura: inicial.altura };
      if (mudaLargura) {
        if (puxaEsquerda) {
          // Borda esquerda segue o mouse; a direita fica FIXA (x+largura constante).
          const xNova = limitar(inicial.x + dx, 0, inicial.x + inicial.largura - TAM_MIN);
          nova.x = xNova;
          nova.largura = inicial.x + inicial.largura - xNova;
        } else {
          // Borda direita segue o mouse; a esquerda fica FIXA.
          nova.largura = limitar(inicial.largura + dx, TAM_MIN, larguraCanvas - inicial.x);
        }
      }
      if (mudaAltura) {
        if (puxaAcima) {
          // Borda superior segue o mouse; a inferior fica FIXA (y+altura constante).
          const yNova = limitar(inicial.y + dy, 0, inicial.y + inicial.altura - TAM_MIN);
          nova.y = yNova;
          nova.altura = inicial.y + inicial.altura - yNova;
        } else {
          // Borda inferior segue o mouse; a superior fica FIXA.
          nova.altura = limitar(inicial.altura + dy, TAM_MIN, alturaCanvas - inicial.y);
        }
      }
      // CLAMP COVER (origem 'video' com caixa fixa): a moldura NÃO pode passar
      // da caixa de conteúdo — novoX>=cx, novoX+novaLargura<=cx+cw (idem y).
      // Mantém TAM_MIN e a borda oposta fixa.
      if (origemArraste === 'video' && caixaFixa) {
        const direitaFixa = inicial.x + inicial.largura;
        const baixoFixo = inicial.y + inicial.altura;
        if (mudaLargura) {
          if (puxaEsquerda) {
            const xMin = Math.max(0, caixaFixa.cx);
            const xMax = Math.min(direitaFixa - TAM_MIN, caixaFixa.cx + caixaFixa.cw - TAM_MIN);
            nova.x = limitar(nova.x, xMin, Math.max(xMin, xMax));
            nova.largura = direitaFixa - nova.x;
          } else {
            const largMin = TAM_MIN;
            const largMax = Math.max(largMin, (caixaFixa.cx + caixaFixa.cw) - nova.x);
            nova.largura = limitar(nova.largura, largMin, largMax);
          }
        }
        if (mudaAltura) {
          if (puxaAcima) {
            const yMin = Math.max(0, caixaFixa.cy);
            const yMax = Math.min(baixoFixo - TAM_MIN, caixaFixa.cy + caixaFixa.ch - TAM_MIN);
            nova.y = limitar(nova.y, yMin, Math.max(yMin, yMax));
            nova.altura = baixoFixo - nova.y;
          } else {
            const altMin = TAM_MIN;
            const altMax = Math.max(altMin, (caixaFixa.cy + caixaFixa.ch) - nova.y);
            nova.altura = limitar(nova.altura, altMin, altMax);
          }
        }
      }
      return nova;
    }

    function aplicarNoDom() {
      rafId = 0;
      if (!pendente) return;
      pendente = false;
      // TEMPO REAL EM TODOS OS CANVAS (cada um com a sua escala) — mas com
      // ALVOS diferentes por origem (área de marcação ≠ camada visual do vídeo):
      //  · ALÇAS DO VÍDEO (origem 'video'): a CAIXA DE CONTEÚDO fica FIXA
      //    (caixaFixa, coords absolutas do canvas) e só a moldura muda → a
      //    caixa é reposicionada relativa à nova moldura, então o conteúdo fica
      //    PARADO na tela (recorte). Sem caixaFixa (cálculo falhou) o commit cai
      //    no enquadramento padrão → a caixa é derivada desse padrão.
      //  · ALÇAS DO GUIA (origem 'area'): SÓ o retângulo de marcação é escrito —
      //    a camada visual do vídeo não é tocada (ele continua exatamente onde
      //    estava; só é re-enquadrado quando a composição é (re)ativada).
      const caixaAbs = origemArraste === 'video'
        ? (caixaFixa || caixaAbsolutaDaMoldura(atual, ENQUADRAMENTO_VIDEO_PADRAO))
        : null;
      sincronizarGeometriaDaArea(canvasEl, atual, {
        caixaAbs,
        alvos: origemArraste === 'video' ? 'todos' : 'guia',
      });
    }

    function aoMover(ev) {
      atual = calcularNovo(ev);
      pendente = true;
      if (!rafId) rafId = requestAnimationFrame(aplicarNoDom);
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      // Libera a guarda anti-duplo-fire (origem 'video').
      if (origemArraste === 'video') {
        try { canvasEl.__edlResizeVideoAtivo = false; } catch { /* noop */ }
      }
      aplicarNoDom();
      // COMMIT ÚNICO (pointerup) — estado definitivo, com re-render.
      //
      // A geometria gravada é EXATAMENTE a que já está na tela
      // (`sincronizarGeometriaDaArea` durante o arraste): o re-render do React
      // não muda nada visualmente — o vídeo NÃO pula ao soltar a área.
      //
      // ALÇAS DO VÍDEO (origem 'video', Preview): mantém o anti-vão antigo — a
      // caixa de conteúdo fica FIXA (opção A — campos explícitos
      // conteudoX/Y/Largura/Altura em coords do canvas), congelada no
      // pointerdown: caixaEnquadramentoVideo(novaArea) devolve a MESMA caixa
      // (erro < 0.5px). Se a caixa não pôde ser congelada (caixaFixa=null), cai
      // no legado: enquadramento padrão (cover 100% centralizado).
      //
      // ALÇAS DO GUIA (origem 'area'/'mover'): a moldura mudou, mas a CAIXA DE
      // CONTEÚDO (conteudo* — coords ABSOLUTAS do canvas) representa o MESMO
      // conteudo na tela: mover/redimensionar a moldura NÃO mexe nela (janela
      // sobre o mesmo conteúdo — Política A). Ela é PRESERVADA como está; sem
      // caixa explícita (config antiga) o fallback legado continua valendo.
      // O ENQUADRAMENTO (zoom/deslocamentoX/Y) também é PRESERVADO. Quem volta
      // ao estado legado (cover) é o botão "↺ Redefinir" (limpa conteudo*).
      //
      // ÁREA MARCADA = CONTAINER REAL DO VÍDEO: quando o gesto é sobre o GUIA
      // (a marcação do espaço), o vídeo tem de se RE-ENQUADRAR na caixa nova.
      // Uma `conteudo*` herdada de outra área descreveria o conteúdo ANTIGO e
      // a prévia mostraria um recorte que não corresponde à caixa marcada — por
      // isso o commit do GUIA descarta a caixa de conteúdo herdada
      // (`areaSemCaixaDeConteudo`): o vídeo volta ao cover sobre a área nova,
      // exatamente como o `drawbox`/`scale+crop` do render faz com a área nova.
      // (Nas alças do VÍDEO — `origem === 'video'` — a caixa é preservada: aí o
      // usuário está posicionando o CONTEÚDO, não marcando a área.)
      //
      // ESCOPO: a escrita passa por `gravarArea`, que respeita o toggle
      // "Editar todos / Apenas este vídeo" (global x `areaPorVideo[id]`).
      aoAtualizarConfig((cfg) => {
        const mudancas = {
          x: atual.x,
          y: atual.y,
          largura: atual.largura,
          altura: atual.altura,
        };
        let base = areaVideoEfetivaDoVideo(cfg, videoId || null);
        if (origemArraste === 'video') {
          if (caixaFixa) {
            mudancas.conteudoX = Math.round(caixaFixa.cx * 100) / 100;
            mudancas.conteudoY = Math.round(caixaFixa.cy * 100) / 100;
            mudancas.conteudoLargura = Math.round(caixaFixa.cw * 100) / 100;
            mudancas.conteudoAltura = Math.round(caixaFixa.ch * 100) / 100;
          } else {
            mudancas.zoom = ENQUADRAMENTO_VIDEO_PADRAO.zoom;
            mudancas.deslocamentoX = ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX;
            mudancas.deslocamentoY = ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY;
          }
        } else {
          // GUIA/ÁREA: re-enquadra o vídeo na caixa nova (container real).
          base = areaSemCaixaDeConteudo(base);
          mudancas.zoom = ENQUADRAMENTO_VIDEO_PADRAO.zoom;
          mudancas.deslocamentoX = ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX;
          mudancas.deslocamentoY = ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY;
        }
        return gravarArea({ ...cfg, areaVideo: base }, videoId, mudancas);
      });
      if (typeof aoFinalizar === 'function') aoFinalizar();
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };
}

/* ---------------------------------------------------------------------------
 * LOGO — redimensionar desde una manija (esquina inferior derecha).
 * La alça está DENTRO del elemento de la logo, así que el padre es la logo y
 * el abuelo el canvas (de donde salen escala/canvasLargura).
 * ------------------------------------------------------------------------- */

/** Redimensiona la LOGO (anchura en % del canvas; la altura la da la imagen). */
export function gerarRedimensionarLogo(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cW = parseFloat(canvasEl.dataset.canvasLargura || String(CANVAS_LARGURA));

    const el = e.currentTarget;
    const inicialLargura = parseFloat(el.dataset.largura) || 20;
    const startX = e.clientX;

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / Math.max(escala, 0.05);
      const largura = inicialLargura + (dx / cW) * 100;
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        logo: { ...cfg.logo, largura: Math.min(60, Math.max(2, largura)) },
      }));
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/* --------------------------------------------------------------------------- 
 * IMAGEM (Editor em Lote) — mover/redimensionar um elemento de imagem
 * independente (config.imagens[], localizado por `id` — nunca por índice,
 * pra não trocar de alvo quando a lista muda). Mesma matemática da logo:
 * posição em % do canvas e largura em % da largura do canvas.
 * ------------------------------------------------------------------------- */

/** Aplica `cambios` na imagem `id` dentro de cfg.imagens (imutável). */
function atualizarImagem(config, id, cambios) {
  return {
    ...config,
    imagens: (config.imagens || []).map((im) => (im && im.id === id ? { ...im, ...cambios } : im)),
  };
}

/** Arraste da IMAGEM (x% = centro, y% = topo — mesma convenção da logo). */
export function gerarArrasteImagem(id, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    if (!aoAtualizarConfig) return;
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();

    // Posição inicial lida dos data-x/data-y (sempre atuais — sem stale closure).
    const el = e.currentTarget;
    const inicial = { x: parseFloat(el.dataset.x) || 0, y: parseFloat(el.dataset.y) || 0 };
    const startX = e.clientX;
    const startY = e.clientY;

    function aoMover(ev) {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      aoAtualizarConfig((cfg) =>
        atualizarImagem(cfg, id, {
          x: Math.min(100, Math.max(0, (inicial.x || 0) + dx)),
          y: Math.min(100, Math.max(0, (inicial.y || 0) + dy)),
        })
      );
    }
    const aoSoltar = quitarEscuchas(aoMover);
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/** Alça de redimensionar a IMAGEM (largura em % do canvas; altura via
 * `alturaProporcao` natural — sem distorção, igual à logo/selo). */
export function gerarRedimensionarImagem(id, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    if (!aoAtualizarConfig) return;
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cW = parseFloat(canvasEl.dataset.canvasLargura || String(CANVAS_LARGURA));

    const el = e.currentTarget;
    const inicialLargura = parseFloat(el.dataset.largura) || 30;
    const startX = e.clientX;

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / Math.max(escala, 0.05);
      const largura = inicialLargura + (dx / cW) * 100;
      aoAtualizarConfig((cfg) =>
        atualizarImagem(cfg, id, { largura: Math.min(100, Math.max(2, largura)) })
      );
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/* --------------------------------------------------------------------------- 
 * TEXTO — redimensionar la anchura del bloque desde una manija lateral.
 * Ruta: ['textos','superior'] | ['textos','inferior'] (independientes).
 * ------------------------------------------------------------------------- */

/** Redimensiona la LARGURA (%) de un bloque de texto desde su manija derecha. */
export function gerarRedimensionarTextoLargura(ruta, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const textoEl = e.currentTarget.parentElement;
    if (!textoEl) return;

    const el = e.currentTarget;
    const inicialLargura = parseFloat(el.dataset.largura) || 50;
    const startX = e.clientX;
    const rect = textoEl.getBoundingClientRect();
    const anchoBase = rect && rect.width > 0 ? rect.width : 1;

    function aoMover(ev) {
      const dx = ev.clientX - startX;
      const pctDelta = (dx / anchoBase) * 100;
      aoAtualizarConfig((cfg) =>
        atualizarRuta(cfg, ruta, {
          largura: Math.min(100, Math.max(10, inicialLargura + pctDelta)),
        })
      );
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/* ---------------------------------------------------------------------------
 * IDENTIDADE DO CANAL — alças dos elementos (nome, @ e selo azul).
 * ------------------------------------------------------------------------- */

/** Redimensiona a LARGURA (%) de um elemento por rota anidada — delta
 * relativo à LARGURA DO CANVAS (mesma matemática da alça da logo). Serve pro
 * selo e pros textos da identidade (nome/@). */
export function gerarRedimensionarLarguraRuta(ruta, minPct, maxPct, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cW = parseFloat(canvasEl.dataset.canvasLargura || String(CANVAS_LARGURA));

    const el = e.currentTarget;
    const inicialLargura = parseFloat(el.dataset.largura) || 10;
    const startX = e.clientX;

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / Math.max(escala, 0.05);
      const largura = inicialLargura + (dx / cW) * 100;
      aoAtualizarConfig((cfg) =>
        atualizarRuta(cfg, ruta, { largura: Math.min(maxPct, Math.max(minPct, largura)) })
      );
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/** Aumenta/diminui o TAMANHO DA FONTE de um texto da identidade (alça de
 * canto): arrastar pra baixo/direita aumenta, pra cima/esquerda diminui. */
export function gerarRedimensionarTextoTamanho(ruta, aoAtualizarConfig, minPx = 10, maxPx = 400) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');

    const el = e.currentTarget;
    const inicialTamanho = parseFloat(el.dataset.tamanho) || 40;
    const startX = e.clientX;
    const startY = e.clientY;

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / Math.max(escala, 0.05);
      const dy = (ev.clientY - startY) / Math.max(escala, 0.05);
      const tamanho = inicialTamanho + ((dx + dy) / 2) * 0.6;
      aoAtualizarConfig((cfg) =>
        atualizarRuta(cfg, ruta, { tamanho: Math.min(maxPx, Math.max(minPx, tamanho)) })
      );
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/* ---------------------------------------------------------------------------
 * CORTE DE BORDAS — arrastar linhas superior/inferior (em % da ALTURA DO
 * VÍDEO). Superior e inferior são INDEPENDENTES: mudar uma linha NUNCA altera a
 * outra. AMBAS escrevem pela MESMA função do painel (atualizarCorteNoConfig) —
 * slider ⇄ linha ficam sempre sincronizados e a margem mínima visível é imposta
 * na escrita (a linha que se move para antes de cruzar a outra).
 *
 * A linha é uma TESOURA: o arraste dela só escreve `corteBordas.*` e NUNCA
 * toca em `posicaoVideo` — o vídeo não se move quando a tesoura se move.
 *
 * BASE DA CONVERSÃO: `corteBordas.superior/inferior` é fração da ALTURA DO
 * VÍDEO, e o preview calcula `topPx`/`basePx` sobre a altura do vídeo JÁ
 * ESCALADO. Então o delta de tela precisa ser convertido contra a MESMA altura
 * escalada (`data-altura-video` da linha), e não contra a altura do canvas —
 * com o canvas a tesoura escapava da linha que o usuário arrasta sempre que o
 * vídeo não ocupava a altura toda. Sem o atributo, cai na altura do canvas
 * (comportamento anterior).
 * ------------------------------------------------------------------------- */

/** Altura-base da conversão de % (px escalados do vídeo; fallback = canvas). */
function alturaBaseDoCorte(el, canvasEl) {
  const doVideo = parseFloat(el?.dataset?.alturaVideo || '0');
  if (Number.isFinite(doVideo) && doVideo > 0) return doVideo;
  return parseFloat(canvasEl?.dataset?.canvasAltura || '1920');
}

/** Handler de arrastre da linha de corte SUPERIOR (`data-posy` = % desde o
 * topo). Mueve solo `corteBordas.superior` (0..CORTE_MAXIMO). */
export function gerarArrastarCorteSuperior(aoAtualizarConfig, videoId = null) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = alturaBaseDoCorte(e.currentTarget, canvasEl);

    const el = e.currentTarget;
    const pointerId = e.pointerId;
    if (pointerId !== undefined && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(pointerId); } catch {}
    }
    const inicialPos = parseFloat(el.dataset.posy) || 0;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / Math.max(escala, 0.05);
      // A linha vive em `top: superior%`: arrastar para BAIXO (dy > 0) leva a
      // linha mais para baixo e CORTE mais topo. `inferior` fica EXATAMENTE
      // como estava (as duas bordas são independentes).
      const pct = clampPct(inicialPos + percentFromDelta(cH, dy));
      // FONTE ÚNICA (mesma escrita do slider do painel): grava o override
      // DESTE vídeo (nunca o corte global — os demais do lote ficam intactos),
      // com a margem mínima visível imposta.
      aoAtualizarConfig((cfg) => atualizarCorteNoConfig(cfg, videoId, { superior: pct }));
    }
    function aoSoltar() {
      if (pointerId !== undefined && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch {}
      }
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };
}

/** Handler de arrastre da linha de corte INFERIOR. A linha vive em
 * `top: (100 − inferior)%`; `data-posy` = essa posição. Arrastrar para CIMA
 * aumenta `corteBordas.inferior` (independiente de `superior`). */
export function gerarArrastarCorteInferior(aoAtualizarConfig, videoId = null) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = alturaBaseDoCorte(e.currentTarget, canvasEl);

    const el = e.currentTarget;
    const pointerId = e.pointerId;
    if (pointerId !== undefined && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(pointerId); } catch {}
    }
    const inicialPos = parseFloat(el.dataset.posy) || 100;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / Math.max(escala, 0.05);
      const pos = clampPct(inicialPos + percentFromDelta(cH, dy));
      // A linha vive em `top: (100 − inferior)%`: arrastar para CIMA (dy < 0)
      // sobe a linha e CORTE mais base. `superior` não é alterado.
      const inferior = clampPct(100 - pos);
      // FONTE ÚNICA (mesma escrita do slider do painel): grava o override
      // DESTE vídeo (nunca o corte global — os demais do lote ficam intactos),
      // com a margem mínima visível imposta.
      aoAtualizarConfig((cfg) => atualizarCorteNoConfig(cfg, videoId, { inferior }));
    }
    function aoSoltar() {
      if (pointerId !== undefined && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch {}
      }
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };
}

/** Converte delta em px para mudança relativa (%) sobre altura base. */
function percentFromDelta(alturaBase, deltaPx) {
  return (deltaPx / Math.max(alturaBase, 1)) * 100;
}

function clampPct(v) {
  return Math.min(100, Math.max(0, v));
}

/* ---------------------------------------------------------------------------
 * ARRASTE DO VÍDEO SOBRE O TEMPLATE (offsetX/offsetY em px da base 1080×1920).
 *
 * O vídeo recortado é a CAPA do quadro e o template é o FUNDO; arrastar muda
 * `offsetX`/`offsetY`, que é EXATAMENTE o `x`/`y` do `overlay` no FFmpeg. Por
 * isso prévia e vídeo final ficam visualmente idênticos.
 *
 * Os valores de partida saem dos atributos `data-video-*` do próprio elemento
 * (sempre atuais — nada de closure velha no meio do arraste). A escrita passa
 * por `atualizarPosicaoVideoNoConfig`, que respeita o escopo "Editar todos":
 * com o toggle ligado grava no global; desligado grava só neste vídeo.
 *
 * `limite` (opcional) trava o vídeo dentro de uma região — sem região, o
 * arrasto é livre (comportamento padrão).
 * ------------------------------------------------------------------------- */
export function gerarArrastarPosicaoVideo(aoAtualizarConfig, videoId = null, editarTodos = true, limite = null) {
  return function aoPointerDown(e) {
    if (!aoAtualizarConfig) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    // A BARRA DE CONTROLES tem `pointer-events` próprio e nunca chega aqui:
    // play/seek/volume seguem funcionando durante o arraste.
    const escala = parseFloat(el.dataset.escala || '1') || 1;
    const inicioX = parseFloat(el.dataset.videoX || '0') || 0;
    const inicioY = parseFloat(el.dataset.videoY || '0') || 0;
    const larguraVideo = parseFloat(el.dataset.videoLargura || '0') || 0;
    const alturaVideo = parseFloat(el.dataset.videoAltura || '0') || 0;
    // A trava é sobre o VÍDEO INTEIRO e não recebe o corte: é o que garante
    // que a posição do vídeo não dependa da linha de corte (ver
    // `limitarMovimentoVideo` no configEditorLote).
    const inicioClientX = e.clientX;
    const inicioClientY = e.clientY;
    const pointerId = e.pointerId;
    if (pointerId !== undefined && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(pointerId); } catch { /* sem captura: segue no window */ }
    }

    function aoMover(ev) {
      // Delta em px de TELA -> px da BASE 1080×1920 (divide pela escala da célula).
      const dx = (ev.clientX - inicioClientX) / Math.max(escala, 0.0001);
      const dy = (ev.clientY - inicioClientY) / Math.max(escala, 0.0001);
      const reg = limite || null;
      const movido = limitarMovimentoVideo({
        x: inicioX + dx,
        y: inicioY + dy,
        largura: larguraVideo,
        altura: alturaVideo,
        limite: reg,
      });
      aoAtualizarConfig((cfg) => atualizarPosicaoVideoNoConfig(cfg, {
        todos: editarTodos,
        videoId,
        mudancas: { offsetX: movido.x, offsetY: movido.y },
      }));
    }
    function aoSoltar() {
      if (pointerId !== undefined && typeof el.releasePointerCapture === 'function') {
        try { el.releasePointerCapture(pointerId); } catch { /* já liberado */ }
      }
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };
}

/* ---------------------------------------------------------------------------
 * ENQUADRAMENTO DO VÍDEO — mover o vídeo com o mouse, direto no preview.
 * ------------------------------------------------------------------------- */

function numeroOu(valor, padrao) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : padrao;
}

/**
 * CLIQUE-E-ARRASTE NO VÍDEO (preview): o vídeo acompanha o ponteiro 1:1
 * (px do canvas), sem salto e sem inversão. O delta é convertido na MESMA
 * representação usada pelo render (`deslocamentoX/Y`), pela função pura
 * `deslocamentoPorArraste` — prévia e vídeo final sempres coincidem.
 *
 * `obterQuadro()` devolve { dimsVideo, fit } do vídeo em exibição (dimensões
 * reais do vídeo, para o 1:1 ser exato). Os valores de partida são lidos dos
 * atributos `data-enq-*` do próprio elemento (sempre atuais — nunca fica com
 * closure velha no meio do arraste). Os controles do player
 * (`[data-edl-controles]`) não arrastam: play/seek/volume seguem funcionando.
 */
export function gerarArrastarEnquadramentoVideo(aoAtualizarConfig, obterQuadro = null, aoInteragir = null, aoFinalizar = null, videoId = null) {
  return function aoPointerDown(e) {
    if (!aoAtualizarConfig) return;
    const alvo = e.target;
    if (typeof alvo?.closest === 'function' && alvo.closest('[data-edl-controles]')) return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    e.preventDefault();

    const el = e.currentTarget;
    const canvasEl = encontrarCanvas(el) || el.parentElement;
    const escala = numeroOu(canvasEl?.dataset?.escala, 1) || 1;
    const quadro = (typeof obterQuadro === 'function' ? obterQuadro() : null) || {};
    const inicial = {
      zoom: numeroOu(el.dataset.enqZoom, 1),
      deslocamentoX: numeroOu(el.dataset.enqX, 50),
      deslocamentoY: numeroOu(el.dataset.enqY, 50),
      largura: numeroOu(el.dataset.areaLargura, 0),
      altura: numeroOu(el.dataset.areaAltura, 0),
      fit: el.dataset.areaFit === 'ajustar' ? 'ajustar' : 'cobrir',
    };
    const startX = e.clientX;
    const startY = e.clientY;

    if (typeof aoInteragir === 'function') aoInteragir({ ativo: true, zoom: inicial.zoom });

    function aoMover(ev) {
      // Px do CANVAS (não da tela) — a prévia pode estar escalada/responsiva.
      const dx = (ev.clientX - startX) / escala;
      const dy = (ev.clientY - startY) / escala;
      aoAtualizarConfig((cfg) => {
        // ÁREA EFETIVA (global ⊕ override) como base: arrastar o vídeo nunca
        // parte de um objeto stale. `gravarArea` reaplica a mesma base e decide
        // ONDE grava conforme o ESCOPO (toggle) — nada é escrito duas vezes.
        const base = areaVideoEfetivaDoVideo(cfg, videoId || null);
        const novo = deslocamentoPorArraste({
          area: { ...base, ...inicial },
          dimsVideo: quadro.dimsVideo,
          fit: inicial.fit,
          deltaX: dx,
          deltaY: dy,
        });
        return gravarArea(cfg, videoId, novo);
      });
      if (typeof aoInteragir === 'function') aoInteragir({ ativo: true, zoom: inicial.zoom });
    }

    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      if (typeof aoFinalizar === 'function') aoFinalizar();
    }

    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  };
}

/* ---------------------------------------------------------------------------
 * CORTE DE BORDAS — ativar/desativar o corte (toggle da flag 'ativo').
 * ------------------------------------------------------------------------- */

/** Botão para ativar/desativar o corte de bordas. Atualiza
 * `cfg.corteBordas.ativo`. */
export function gerarAlternarCorteBordas(aoAtualizarConfig) {
  return function aoToggle() {
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      corteBordas: {
        ...cfg.corteBordas,
        ativo: !cfg.corteBordas.ativo,
      },
    }));
  };
}
