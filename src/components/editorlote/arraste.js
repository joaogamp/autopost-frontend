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

import { atualizarCorteNoConfig, CANVAS_LARGURA, caixaConteudoExplicita, caixaEnquadramentoVideo, congelarConteudoVideo, deslocamentoPorArraste, ENQUADRAMENTO_VIDEO_PADRAO, molduraContemConteudo } from '../../lib/configEditorLote';

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
 * Só a BARRA de controles do player (`[data-edl-controles]`: play/seek/volume)
 * NÃO arrasta; o vídeo em si segue arrastável.
 *
 * `opcoes.aoInteragir`/`opcoes.aoFinalizar` (opcionais) avisam início/fim do
 * arraste — usados para o cursor "grabbing" e a dica discreta no Preview.
 */
export function gerarArrastreArea(aoAtualizarConfig, opcoes = {}) {
  const { aoInteragir = null, aoFinalizar = null } = opcoes || {};
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

    if (typeof aoInteragir === 'function') aoInteragir({ ativo: true });

    // TEMPO REAL — durante o arraste a posição é aplicada DIRETO no DOM
    // (estado local, sem passar pelo config compartilhado), com rAF como
    // limitador; o `aoAtualizarConfig` (re-render de toda a árvore, incluindo
    // o <video> tocando) acontece UMA só vez, no `pointerup`.
    //
    // REGRA DA MARCAÇÃO — o VÍDEO FICA PARADO: só os nós que representam o
    // RETÂNGULO da área (o guia [data-elemento="area"] e/ou o próprio alvo)
    // são movidos no DOM. A camada do vídeo ([data-elemento="video"]) NUNCA
    // é tocada aqui — ela é o conteúdo que será ENQUADRADO depois (Preview),
    // não parte da marcação geométrica.
    const esc = Math.max(escala, 0.05);
    const nosMover = new Set(
      [el, canvasEl.querySelector('[data-elemento="area"]')].filter(Boolean)
    );
    let atual = { x: inicial.x, y: inicial.y };
    let pendente = false;
    let rafId = 0;

    function aplicarNoDom() {
      rafId = 0;
      if (!pendente) return;
      pendente = false;
      const px = `${atual.x * esc}px`;
      const py = `${atual.y * esc}px`;
      for (const no of nosMover) {
        no.style.left = px;
        no.style.top = py;
      }
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
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        areaVideo: {
          ...(cfg.areaVideo || {}),
          x: atual.x,
          y: atual.y,
        },
      }));
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
 * rAF) nos nós que REPRESENTAM o objeto redimensionado — NUNCA na própria
 * alça (o `currentTarget`): as alças são filhas ancoradas por
 * left/right/top/bottom, então acompanham as bordas sozinhas quando o nó muda.
 * A origem decide QUAIS nós: alça do GUIA da área (MARCAÇÃO) → só o retângulo
 * ([data-elemento="area"]) muda — vídeo/template 100% parados; alça do VÍDEO
 * selecionado (Preview) → camada + caixa do vídeo acompanham (recurso
 * estilo Canva, comportamento antigo preservado). O `aoAtualizarConfig`
 * (estado definitivo, com re-render) acontece UMA única vez, no `pointerup`. */
export function gerarRedimensionarArea(eixo, aoAtualizarConfig, opcoes = {}) {
  const { aoInteragir = null, aoFinalizar = null } = opcoes || {};
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof aoInteragir === 'function') aoInteragir();
    const canvasEl = encontrarCanvas(e.currentTarget);
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cW = parseFloat(canvasEl.dataset.canvasLargura || '1080');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    // REGRA DA MARCAÇÃO — só o RETÂNGULO muda: quando o arraste vem de uma
    // alça do GUIA da área ([data-elemento="area"] — modo "Marcar espaço do
    // vídeo"), o ÚNICO nó manipulado em tempo real é esse guia. A camada do
    // vídeo ([data-elemento="video"]) e a caixa interna
    // ([data-elemento="video-caixa"]) NUNCA entram aqui: o TEMPLATE e o VÍDEO
    // ficam parados durante a marcação — o vídeo só é ENQUADRADO dentro da
    // área quando o usuário clicar em "Mostrar Preview" (e o processamento
    // final usa a MESMA geometria da config.areaVideo).
    //
    // EXCEÇÃO (Preview, fora da marcação): as ALÇAS DO PRÓPRIO VÍDEO
    // selecionado (`[data-elemento="video"]` — recurso estilo Canva) usam esta
    // MESMA função; aí o objeto que o usuário redimensiona É o vídeo, e a
    // camada/caixa continuam recebendo o tamanho em tempo real como antes.
    const guia = canvasEl.querySelector('[data-elemento="area"]');
    // SELEÇÃO DAS CAMADAS (Preview): a camada do vídeo é a ÚNICA
    // `[data-elemento="video"]` com `data-enq-zoom` (a caixa de seleção agora é
    // `data-elemento="selecao-video"`, irmã fora da camada — fim da duplicata).
    const camadaVideo = canvasEl.querySelector('[data-elemento="video"][data-enq-zoom]');
    const noSelecao = typeof e.currentTarget.closest === 'function'
      ? (e.currentTarget.closest('[data-elemento="selecao-video"]')
        || e.currentTarget.closest('[data-elemento="video"]'))
      : null;
    const alvoVideo = noSelecao ? camadaVideo : null;
    const nosVideo = camadaVideo && noSelecao ? [camadaVideo] : [];
    const nosCaixa = camadaVideo && noSelecao
      ? [...camadaVideo.querySelectorAll('[data-elemento="video-caixa"]')]
      : [];
    const nosTamanho = alvoVideo ? [...nosVideo, ...nosCaixa] : [guia].filter(Boolean);
    const nosOrigem = alvoVideo ? [...nosVideo] : [guia].filter(Boolean);
    // Origem do arraste: 'area' = marcação (só retângulo) · 'video' = alças do vídeo.
    const origemArraste = alvoVideo ? 'video' : 'area';

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
          nova.largura = limitar(inicial.largura + dx, TAM_MIN, cW - inicial.x);
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
          nova.altura = limitar(inicial.altura + dy, TAM_MIN, cH - inicial.y);
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
      // ORIGEM 'video' COM CAIXA FIXA: altera SÓ a moldura no DOM direto e
      // reposiciona o video-caixa para o conteúdo ficar parado:
      // left=(cx-novoX)*esc, top=(cy-novoY)*esc, width=cw*esc, height=ch*esc.
      if (origemArraste === 'video' && caixaFixa && alvoVideo) {
        const mx = `${atual.x * esc}px`;
        const my = `${atual.y * esc}px`;
        const mw = `${atual.largura * esc}px`;
        const mh = `${atual.altura * esc}px`;
        for (const no of nosVideo) {
          no.style.left = mx;
          no.style.top = my;
          no.style.width = mw;
          no.style.height = mh;
        }
        if (guia) {
          guia.style.left = mx;
          guia.style.top = my;
          guia.style.width = mw;
          guia.style.height = mh;
        }
        for (const cxNo of nosCaixa) {
          cxNo.style.left = `${(caixaFixa.cx - atual.x) * esc}px`;
          cxNo.style.top = `${(caixaFixa.cy - atual.y) * esc}px`;
          cxNo.style.width = `${caixaFixa.cw * esc}px`;
          cxNo.style.height = `${caixaFixa.ch * esc}px`;
        }
        // Caixa de seleção do vídeo (irmã, fora da camada): acompanha a moldura.
        const selecao = canvasEl.querySelector('[data-elemento="selecao-video"]');
        if (selecao) {
          selecao.style.left = mx;
          selecao.style.top = my;
          selecao.style.width = mw;
          selecao.style.height = mh;
        }
        return;
      }
      const w = `${atual.largura * esc}px`;
      const h = `${atual.altura * esc}px`;
      // Alças de esquerda/topo também MOVEM a origem (left/top), não só o
      // tamanho — a borda oposta (âncora) fica parada no valor original.
      if (atual.x !== inicial.x || atual.y !== inicial.y) {
        const px = `${atual.x * esc}px`;
        const py = `${atual.y * esc}px`;
        for (const no of nosOrigem) {
          no.style.left = px;
          no.style.top = py;
        }
      }
      for (const no of nosTamanho) {
        no.style.width = w;
        no.style.height = h;
      }
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
      // MARCAÇÃO (origem 'area'): altera SOMENTE a geometria da área
      // (x/y/largura/altura de config.areaVideo). O enquadramento do vídeo
      // (zoom/deslocamentoX/deslocamentoY) NÃO é tocado: o vídeo é ENQUADRADO
      // (resize/crop para preencher exatamente a área marcada) apenas no
      // Preview — `caixaEnquadramentoVideo` lê a MESMA config.areaVideo, então
      // preview e render final coincidem sempre.
      //
      // ALÇAS DO VÍDEO (origem 'video', Preview): preserva o anti-vão antigo —
      // reseta zoom/deslocamentos para o padrão, pois ali o objeto redimensionado
      // É o vídeo e ele deve voltar a preencher 100% do novo tamanho (cover
      // nunca deixa vão).
      // ALÇAS DO VÍDEO (origem 'video', Preview): a caixa de conteúdo fica FIXA
      // (opção A — campos explícitos conteudoX/Y/Largura/Altura em coords do
      // canvas). Commit único grava a nova moldura + a caixa congelada no
      // pointerdown: caixaEnquadramentoVideo(novaArea) devolve a MESMA caixa
      // (erro < 0.5px). NUNCA reseta para ENQUADRAMENTO_VIDEO_PADRAO. Se a
      // caixa não pôde ser congelada (caixaFixa=null), cai no legado (reset).
      aoAtualizarConfig((cfg) => {
        const area = {
          ...(cfg.areaVideo || {}),
          x: atual.x,
          y: atual.y,
          largura: atual.largura,
          altura: atual.altura,
        };
        if (origemArraste === 'video') {
          if (caixaFixa) {
            area.conteudoX = Math.round(caixaFixa.cx * 100) / 100;
            area.conteudoY = Math.round(caixaFixa.cy * 100) / 100;
            area.conteudoLargura = Math.round(caixaFixa.cw * 100) / 100;
            area.conteudoAltura = Math.round(caixaFixa.ch * 100) / 100;
          } else {
            area.zoom = ENQUADRAMENTO_VIDEO_PADRAO.zoom;
            area.deslocamentoX = ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX;
            area.deslocamentoY = ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY;
          }
        }
        return { ...cfg, areaVideo: area };
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
 * CORTE DE BORDAS — arrastar linhas superior/inferior (em % do canvas).
 * Superior e inferior são INDEPENDENTES: mudar uma linha NUNCA altera a outra.
 * AMBAS escrevem pela MESMA função do painel (atualizarCorteNoConfig) — slider
 * ⇄ linha ficam sempre sincronizados e a margem mínima visível é imposta na
 * escrita (a linha que se move para antes de cruzar a outra).
 * ------------------------------------------------------------------------- */

/** Handler de arrastre da linha de corte SUPERIOR (`data-posy` = % desde o
 * topo). Mueve solo `corteBordas.superior` (0..CORTE_MAXIMO). */
export function gerarArrastarCorteSuperior(aoAtualizarConfig, videoId = null) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicialPos = parseFloat(el.dataset.posy) || 0;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / Math.max(escala, 0.05);
      const pct = clampPct(inicialPos + percentFromDelta(cH, dy));
      // FONTE ÚNICA (mesma escrita do slider do painel): global + override do
      // vídeo atual, margem mínima visível imposta. Mover para CIMA aumenta
      // o corte; `inferior` fica EXATAMENTE como estava.
      aoAtualizarConfig((cfg) => atualizarCorteNoConfig(cfg, videoId, { superior: pct }));
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
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
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicialPos = parseFloat(el.dataset.posy) || 100;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / Math.max(escala, 0.05);
      const pos = clampPct(inicialPos + percentFromDelta(cH, dy));
      const inferior = clampPct(100 - pos);
      // FONTE ÚNICA (mesma escrita do slider do painel): global + override do
      // vídeo atual, margem mínima visível imposta. Arrastar para CIMA
      // aumenta `inferior`; `superior` não é alterado.
      aoAtualizarConfig((cfg) => atualizarCorteNoConfig(cfg, videoId, { inferior }));
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
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
export function gerarArrastarEnquadramentoVideo(aoAtualizarConfig, obterQuadro = null, aoInteragir = null, aoFinalizar = null) {
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
        const areaAtual = { ...(cfg.areaVideo || {}), ...inicial };
        const novo = deslocamentoPorArraste({
          area: areaAtual,
          dimsVideo: quadro.dimsVideo,
          fit: inicial.fit,
          deltaX: dx,
          deltaY: dy,
        });
        return { ...cfg, areaVideo: { ...(cfg.areaVideo || {}), ...novo } };
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
