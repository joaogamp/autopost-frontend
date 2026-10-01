/**
 * EDITOR EM LOTE — configuração COMPARTILHADA do lote.
 *
 * Um ÚNICO objeto de configuração para TODO o lote. NÃO existe configuração
 * por vídeo: qualquer alteração no painel ou no canvas atualiza automaticamente
 * todos os previews (sem botão "Aplicar a todos", sem detecção automática de
 * logo). Os textos superior/inferior viajan DENTRO do template (`texto` e
 * `textoInferior`) — `tituloIA` só como fallback de templates antigos.
 *
 * Coordenadas: % do canvas para logo/texto; pixels do canvas (1080×1920) para
 * a área de vídeo. Ao processar, `mapearEditorLote.js` converte a config para
 * o formato do template do servidor (tudo em px) — a prévia e o render ficam
 * idênticos.
 *
 * NÃO existe limite de quantidade de vídeos: o lote aceita o que o usuário
 * importar (grade progressiva + pool de 3 vídeos completos na interface).
 */

export const CANVAS_LARGURA = 1080;
export const CANVAS_ALTURA = 1920;
export const LIMITE_VIDEOS_COMPLETOS = 3;

export const CORES_FUNDO = ['#000000', '#ffffff', '#f8fafc', '#fdf2f8', '#f5f3ff', '#fff1f2', '#fafafa'];

/** BRANCO PURO — o swatch `#ffffff` é o branco ABSOLUTO do canvas: com ele,
 * a área cortada (revelada pelo clip-path na prévia e coberta pelo drawbox
 * opaco no render) é BRANCO PURO — sem cinza, sombra, transparência ou
 * tingimento. A cor escolhida é usada EXATAMENTE como escolhida: nada aqui
 * normaliza/reescreve `canvas.corFundo` (as outras cores da paleta valem
 * exatamente o seu hex). */
export const BRANCO_PURO = '#ffffff';

/** Identificação EXPLÍCITA de cada swatch da paleta (hex → rótulo). O
 * `#ffffff` é o único "Branco puro"; os demais são quase-brancos tingidos
 * (#f8fafc gelo, #fdf2f8 rosado, #f5f3ff lilás, #fff1f2 rosé, #fafafa cinza
 * claríssimo) — escolhê-los pinta o canvas/fundo com o TOM do hex, não com
 * branco puro. */
export const ROTULOS_CORES_FUNDO = {
  '#000000': 'Preto',
  '#ffffff': 'Branco puro',
  '#f8fafc': 'Branco gelo (quase branco)',
  '#fdf2f8': 'Branco rosado (quase branco)',
  '#f5f3ff': 'Branco lilás (quase branco)',
  '#fff1f2': 'Branco rosé (quase branco)',
  '#fafafa': 'Cinza claríssimo (quase branco)',
};

/* ---------------------------------------------------------------------------
 * ENQUADRAMENTO DO VÍDEO (zoom + mover) — SOMENTE MOUSE, direto no preview.
 *
 * O vídeo do lote é composto DENTRO da área do template (`areaVideo`, em px do
 * canvas). O enquadramento é o mesmo objeto compartilhado — NÃO existe segundo
 * sistema de composição:
 *
 *   zoom          → escala do vídeo dentro da área (1 = preenche EXATAMENTE
 *                   a área; > 1 amplia para enquadrar o conteúdo). NUNCA < 1:
 *                   a ÁREA DO VÍDEO é a janela e o vídeo SEMPRE preenche 100%
 *                   dela (cover) — um zoom abaixo de 1 produziria um vídeo
 *                   pequeno/centralizado dentro do retângulo, o comportamento
 *                   que este fluxo proíbe (a ÁREA nunca fica maior que o
 *                   vídeo). Valores menores salvos em configs/templates
 *                   antigos são normalizados para 1 pela
 *                   `normalizarZoomVideo`/`areaVideoNormalizada`;
 *   deslocamentoX → posição horizontal do vídeo dentro da área, em % da
 *                   "folga" disponível (0 = encostado à esquerda, 50 = centro,
 *                   100 = encostado à direita);
 *   deslocamentoY → idem, vertical.
 *
 * A representação é RELATIVA (%, não px de tela): o mesmo valor vale para
 * todos os vídeos do lote, em qualquer resolução/proporção, e o FFmpeg
 * materializa exatamente o mesmo enquadramento — prévia = render.
 * ------------------------------------------------------------------------- */
/** MÍNIMO do zoom = 1 (INVARIANTE do fluxo): o vídeo nunca fica menor que a
 * Área do vídeo. Ampliar (zoom > 1) continua permitido para enquadrar o
 * conteúdo; "reduzir" abaixo da área não existe mais — era o caminho que
 * materializava o vídeo pequeno/centralizado no retângulo (prévia e render). */
export const ZOOM_VIDEO_MIN = 1;
export const ZOOM_VIDEO_MAX = 4;
export const ENQUADRAMENTO_VIDEO_PADRAO = Object.freeze({ zoom: 1, deslocamentoX: 50, deslocamentoY: 50 });

/** CAIXA DE CONTEÚDO EXPLÍCITA (px do canvas, coordenadas absolutas do canvas).
 * Quando presente em `areaVideo` ({ conteudoX, conteudoY, conteudoLargura,
 * conteudoAltura }), ela é a fonte de verdade da posição/escala do conteúdo:
 * puxar borda/canto muda SÓ a moldura (x/y/largura/altura) e a caixa de
 * conteúdo fica parada na tela — o recorte. Fallback: configs antigas sem os
 * 4 campos usam a conta legada (área × zoom + deslocamentoX/Y). */
function numeroCaixa(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : NaN;
}

export function caixaConteudoExplicita(area) {
  const a = area && typeof area === 'object' ? area : null;
  if (!a) return null;
  const cx = numeroCaixa(a.conteudoX);
  const cy = numeroCaixa(a.conteudoY);
  const cw = numeroCaixa(a.conteudoLargura);
  const ch = numeroCaixa(a.conteudoAltura);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cw) || !Number.isFinite(ch)) return null;
  if (!(cw >= 2 && ch >= 2)) return null;
  return { x: cx, y: cy, largura: cw, altura: ch };
}

/** Caixa de conteúdo cobre a moldura atual? (invariante cover: sem vão).
 * Com zoom >= 1 a caixa LEGÍTIMA é sempre >= moldura; uma caixa MENOR que a
 * moldura ou deslocada fora dela é a JANELA da Política A (moldura movida/
 * expandida após o congelamento) — NÃO é descartada: o predicado só informa
 * a cadeia de composição (cover atual × janela com vão em corFundo),
 * espelhando o engine (compor.js). */
export function conteudoCobreMoldura(area) {
  const caixa = caixaConteudoExplicita(area);
  if (!caixa) return true;
  const a = area && typeof area === 'object' ? area : {};
  const x = Number(a.x) || 0;
  const y = Number(a.y) || 0;
  const w = Number(a.largura) || 0;
  const h = Number(a.altura) || 0;
  const EPS = 0.51;
  return caixa.x <= x + EPS && caixa.y <= y + EPS
    && caixa.x + caixa.largura >= x + w - EPS
    && caixa.y + caixa.altura >= y + h - EPS;
}

/** Moldura (x/y/largura/altura) contém a caixa de conteúdo? (cover sem vão). */
export function molduraContemConteudo(area) {
  const caixa = caixaConteudoExplicita(area);
  if (!caixa) return true;
  const a = area && typeof area === 'object' ? area : {};
  const x = Number(a.x) || 0;
  const y = Number(a.y) || 0;
  const w = Number(a.largura) || 0;
  const h = Number(a.altura) || 0;
  const EPS = 0.51;
  return x <= caixa.x + EPS && y <= caixa.y + EPS
    && x + w >= caixa.x + caixa.largura - EPS
    && y + h >= caixa.y + caixa.altura - EPS;
}

/** Zoom válido (1 = original). */
export function normalizarZoomVideo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return ENQUADRAMENTO_VIDEO_PADRAO.zoom;
  const limitado = Math.min(ZOOM_VIDEO_MAX, Math.max(ZOOM_VIDEO_MIN, n));
  return Math.round(limitado * 100) / 100;
}

/** Deslocamento válido (0..100; 50 = centro). */
export function normalizarDeslocamentoVideo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}

/** `areaVideo` com o enquadramento normalizado (tolerante a configs antigas).
 * A ÁREA DO VÍDEO é exatamente o espaço que o vídeo deve preencher: o vídeo
 * SEMPRE preenche 100% da área (cover) — nunca pequeno/centralizado dentro
 * dela. Templates antigos com fit 'ajustar' são normalizados para 'cobrir'
 * para que prévia e render usem a mesma geometria.
 * CAIXA EXPLÍCITA (opção A): se os 4 campos conteudoX/Y/Largura/Altura
 * estiverem presentes e válidos, são preservados (fonte de verdade do
 * conteúdo); parciais/NaN/null são descartados (fallback legado). */
export function areaVideoNormalizada(area) {
  const a = area && typeof area === 'object' ? area : {};
  const normalizada = {
    ...a,
    fit: 'cobrir',
    zoom: normalizarZoomVideo(a.zoom),
    deslocamentoX: normalizarDeslocamentoVideo(a.deslocamentoX ?? ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX),
    deslocamentoY: normalizarDeslocamentoVideo(a.deslocamentoY ?? ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY),
  };
  const temAlgumCampoCaixa = a.conteudoX !== undefined || a.conteudoY !== undefined
    || a.conteudoLargura !== undefined || a.conteudoAltura !== undefined;
  if (!temAlgumCampoCaixa) {
    delete normalizada.conteudoX;
    delete normalizada.conteudoY;
    delete normalizada.conteudoLargura;
    delete normalizada.conteudoAltura;
    return normalizada;
  }
  const caixa = caixaConteudoExplicita(a);
  if (!caixa) {
    // Parcial/inválida/null → descarta (fallback legado, configs antigas).
    delete normalizada.conteudoX;
    delete normalizada.conteudoY;
    delete normalizada.conteudoLargura;
    delete normalizada.conteudoAltura;
    return normalizada;
  }
  normalizada.conteudoX = Math.round(caixa.x * 100) / 100;
  normalizada.conteudoY = Math.round(caixa.y * 100) / 100;
  normalizada.conteudoLargura = Math.round(caixa.largura * 100) / 100;
  normalizada.conteudoAltura = Math.round(caixa.altura * 100) / 100;
  return normalizada;
}

/** Congela a caixa de conteúdo atual em coords absolutas do canvas.
 * Usado no pointerdown do resize (origem 'video'): a partir daí a caixa fica
 * FIXA e só a moldura muda. Retorna os 4 campos para gravar em areaVideo. */
export function congelarConteudoVideo(area) {
  const caixa = caixaEnquadramentoVideo(area);
  const a = areaVideoNormalizada(area);
  const x = (Number(a.x) || 0) + caixa.x;
  const y = (Number(a.y) || 0) + caixa.y;
  return {
    conteudoX: Math.round(x * 100) / 100,
    conteudoY: Math.round(y * 100) / 100,
    conteudoLargura: Math.round(caixa.largura * 100) / 100,
    conteudoAltura: Math.round(caixa.altura * 100) / 100,
  };
}

/**
 * A `areaVideo` é uma JANELA REAL do template (menor que o canvas) OU o
 * usuário mexeu no enquadramento (zoom/deslocamentos/caixa explícita)?
 *
 * É o INTERRUPTOR DE COMPATIBILIDADE entre os dois caminhos da composição:
 *   · `false` → a área cobre o canvas e o enquadramento é o ORIGINAL
 *     (zoom 1, deslocamentos 50/50, sem caixa explícita). O vídeo mantém a
 *     geometria de sempre (largura alvo + altura proporcional + posição) —
 *     nenhum template/config existente muda de resultado;
 *   · `true`  → a área é a moldura: o vídeo COBRE a caixa de enquadramento
 *     (zoom/deslocamentoX/Y) e é recortado de volta para a área.
 *
 * ESPELHO LITERAL do engine (`autopost-engine-completo/src/enquadramentoVideo.js`,
 * mesma função, mesmo predicado): é essa igualdade que garante prévia =
 * render — quando mudar um lado, mude o outro.
 */
export function areaJanelaDeComposicao(area, canvasLargura = CANVAS_LARGURA, canvasAltura = CANVAS_ALTURA) {
  const a = area && typeof area === 'object' ? area : null;
  if (!a) return false;
  if (!(Number(a.largura) >= 2 && Number(a.altura) >= 2)) return false;
  const cobreCanvas = Number(a.x) <= 0 && Number(a.y) <= 0
    && Number(a.largura) >= canvasLargura && Number(a.altura) >= canvasAltura;
  return !cobreCanvas || enquadramentoVideoEditado(a) || !!caixaConteudoExplicita(a);
}

/**
 * GEOMETRIA DA COMPOSIÇÃO DO VÍDEO DENTRO DA ÁREA (px do canvas).
 *
 * Só é usada quando `areaJanelaDeComposicao` é `true`; caso contrário devolve
 * `null` e o preview mantém o caminho legado intacto (compatibilidade).
 *
 * Devolve `caixa` (área × zoom), `larguraEscalada`/`alturaEscalada` (o vídeo em
 * COVER sobre a caixa — `force_original_aspect_ratio=increase`, dimensões
 * PARES) e `recorteX`/`recorteY` (quanto do quadro maior é recortado para
 * voltar à área). Espelho do engine: mesma conta, mesmos números.
 *
 * Sem `dimsVideo` as dimensões escaladas ficam 0 (o preview usa `object-fit`
 * e o navegador faz o cover — o render usa expressão do FFmpeg).
 */
export function geometriaEnquadramentoVideo({ area, dimsVideo, canvasLargura = CANVAS_LARGURA, canvasAltura = CANVAS_ALTURA } = {}) {
  if (!areaJanelaDeComposicao(area, canvasLargura, canvasAltura)) return null;
  const a = areaVideoNormalizada(area);
  const caixa = caixaEnquadramentoVideo(a);
  const larguraArea = Math.max(2, Math.round(Number(a.largura) || 0));
  const alturaArea = Math.max(2, Math.round(Number(a.altura) || 0));
  const base = {
    janela: true,
    x: Math.round(Number(a.x) || 0),
    y: Math.round(Number(a.y) || 0),
    larguraArea,
    alturaArea,
    caixa,
    recorteX: caixa.largura - larguraArea,
    recorteY: caixa.altura - alturaArea,
    zoom: a.zoom,
    deslocamentoX: a.deslocamentoX,
    deslocamentoY: a.deslocamentoY,
  };
  const sw = Number(dimsVideo?.largura) || 0;
  const sh = Number(dimsVideo?.altura) || 0;
  if (!(sw > 0 && sh > 0)) {
    // SEM ffprobe/`onLoadedMetadata`: não existe "excesso" para distribuir, logo
    // `deslocamentoX/Y` NÃO se aplica (é a MESMA regra do engine — `compor.js`
    // só emite o `crop` de deslocamento quando `larguraEscalada > caixa.largura`,
    // o que é impossível sem as dimensões). O conteúdo ocupa a CAIXA inteira e
    // quem faz o cover é o `object-fit` do navegador, espelhando o
    // `scale=W:H:force_original_aspect_ratio=increase` do FFmpeg.
    //
    // `conteudoX/Y` = `caixa.x/caixa.y` ⇒ o `left/top` do consumidor
    // (`-conteudo + caixa.x`) dá ZERO, e nunca `NaN`: o contrato desta função é
    // TOTAL — devolve sempre uma geometria completa e numérica. Sem estes dois
    // campos o preview quebrava antes de `onLoadedMetadata`.
    return {
      ...base,
      larguraEscalada: 0,
      alturaEscalada: 0,
      conteudoX: caixa.x,
      conteudoY: caixa.y,
    };
  }
  // COVER da caixa = `force_original_aspect_ratio=increase`: a escala é a MAIOR
  // das duas, então o vídeo nunca fica menor que a caixa em nenhum dos eixos.
  const escala = Math.max(caixa.largura / sw, caixa.altura / sh);
  const larguraEscalada = parParaCima(sw * escala);
  const alturaEscalada = parParaCima(sh * escala);
  // `object-position` DA PRÉVIA: quando o cover transborda a caixa (a fonte é mais
  // alta/larga que a caixa), o EXCESSO é distribuído por `deslocamentoX/Y`
  // (0% = esquerda/topo · 100% = direita/base · 50% = centro). É exatamente o
  // `conteudoX/Y` que o render usa no `overlay`.
  return {
    ...base,
    escala,
    larguraEscalada,
    alturaEscalada,
    conteudoX: caixa.x + ((caixa.largura - larguraEscalada) * a.deslocamentoX) / 100,
    conteudoY: caixa.y + ((caixa.altura - alturaEscalada) * a.deslocamentoY) / 100,
  };
}

/** O usuário mexeu no enquadramento? (zoom/mover diferentes do original). */
export function enquadramentoVideoEditado(area) {
  const a = areaVideoNormalizada(area);
  return a.zoom !== ENQUADRAMENTO_VIDEO_PADRAO.zoom
    || a.deslocamentoX !== ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX
    || a.deslocamentoY !== ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY;
}

/** Volta o enquadramento ao original (tamanho e posição do vídeo). */
export function enquadramentoVideoOriginal() {
  return { ...ENQUADRAMENTO_VIDEO_PADRAO };
}

/**
 * CAIXA DO QUADRO ESCALADO (px do canvas) + posição dela dentro da área de
 * composição. É a MESMA geometria usada pela prévia (CSS) e pelo FFmpeg
 * (scale/crop/pad) — por isso prévia e render coincidem.
 *
 * O quadro tem o tamanho da área multiplicado pelo zoom (mesma proporção da
 * área) e é posicionado na "folga" por `deslocamentoX/Y`:
 *   z > 1 → quadro MAIOR que a área (o excedente é recortado pela área);
 *   z < 1 → quadro MENOR que a área (o fundo aparece ao redor do vídeo).
 */
export function caixaEnquadramentoVideo(area) {
  const a = areaVideoNormalizada(area);
  const larguraArea = Math.max(2, Math.round(Number(a.largura) || 0));
  const alturaArea = Math.max(2, Math.round(Number(a.altura) || 0));
  // CAIXA EXPLÍCITA (POLÍTICA A): fonte de verdade = coords absolutas do
  // canvas. Relativo à área: x/y = caixaAbs - origem da moldura. A caixa NÃO
  // é descartada por não cobrir a moldura — moldura menor/maior/deslocada é
  // a JANELA sobre o mesmo conteúdo (sem re-enquadramento em cover). Configs
  // antigas (sem os 4 campos) caem no cálculo legado abaixo — prévia e render
  // continuam idênticos nos dois casos (espelho do engine).
  const explicita = caixaConteudoExplicita(a);
  if (explicita) {
    const ox = Number(a.x) || 0;
    const oy = Number(a.y) || 0;
    const largura = Math.max(2, Math.round(explicita.largura));
    const altura = Math.max(2, Math.round(explicita.altura));
    return {
      largura,
      altura,
      x: explicita.x - ox,
      y: explicita.y - oy,
      zoom: a.zoom,
      deslocamentoX: a.deslocamentoX,
      deslocamentoY: a.deslocamentoY,
    };
  }
  // Dimensões PARES: mesma paridade exigida pelo yuv420p do encoder final.
  const largura = Math.max(2, Math.round((larguraArea * a.zoom) / 2) * 2);
  const altura = Math.max(2, Math.round((alturaArea * a.zoom) / 2) * 2);
  return {
    largura,
    altura,
    x: ((larguraArea - largura) * a.deslocamentoX) / 100,
    y: ((alturaArea - altura) * a.deslocamentoY) / 100,
  };
}

/**
 * Dimensões do QUADRO DE CONTEÚDO (fonte escalada, em px do canvas) já com o
 * zoom. O vídeo SEMPRE preenche 100% da área (cover) — a área é exatamente o
 * espaço do vídeo no template. O parâmetro `fit` é ignorado (mantido na
 * assinatura por compatibilidade): prévia e FFmpeg usam a mesma geometria de
 * preenchimento. Usado pelos cálculos de mouse (1:1 e zoom sob o cursor) — a
 * prévia não precisa disso (o navegador faz o cover).
 */
export function dimensoesQuadroDeConteudo({ area, dimsVideo } = {}) {
  const a = areaVideoNormalizada(area);
  const W = Math.max(2, Number(a.largura) || 0);
  const H = Math.max(2, Number(a.altura) || 0);
  const sw = Math.max(1, Number(dimsVideo?.largura) || 0) || CANVAS_LARGURA;
  const sh = Math.max(1, Number(dimsVideo?.altura) || 0) || CANVAS_ALTURA;
  // SEMPRE cover: o vídeo preenche 100% da área (a área é o espaço real do vídeo).
  const escala = Math.max(W / sw, H / sh);
  return { largura: sw * escala * a.zoom, altura: sh * escala * a.zoom };
}

/**
 * ZOOM SOB O CURSOR (roda do mouse): mantém sob o ponteiro o MESMO ponto do
 * vídeo após a mudança de zoom — sem salto e sem deslocamento invertido.
 * `mx`/`my` = posição do cursor em px do canvas, relativa à área de composição.
 */
export function deslocamentoSobZoom({ area, dimsVideo, fit, novoZoom, mx = 0, my = 0 } = {}) {
  const a = areaVideoNormalizada(area);
  const W = Math.max(2, Number(a.largura) || 0);
  const H = Math.max(2, Number(a.altura) || 0);
  const atual = dimensoesQuadroDeConteudo({ area: a, dimsVideo, fit });
  const alvo = normalizarZoomVideo(novoZoom);
  const novo = dimensoesQuadroDeConteudo({ area: { ...a, zoom: alvo }, dimsVideo, fit });
  // Posição atual da borda esquerda/topo do conteúdo dentro da área.
  const esquerda = (W - atual.largura) * (a.deslocamentoX / 100);
  const topo = (H - atual.altura) * (a.deslocamentoY / 100);
  // Após o zoom, o conteúdo é reescalado a partir do ponto sob o cursor.
  const fatorX = atual.largura > 0 ? novo.largura / atual.largura : 1;
  const fatorY = atual.altura > 0 ? novo.altura / atual.altura : 1;
  const esquerdaNova = mx - (mx - esquerda) * fatorX;
  const topoNovo = my - (my - topo) * fatorY;
  const folgaX = W - novo.largura;
  const folgaY = H - novo.altura;
  return {
    zoom: alvo,
    deslocamentoX: normalizarDeslocamentoVideo(folgaX === 0 ? 50 : (esquerdaNova / folgaX) * 100),
    deslocamentoY: normalizarDeslocamentoVideo(folgaY === 0 ? 50 : (topoNovo / folgaY) * 100),
  };
}

/**
 * ARRASTE DO VÍDEO (mouse) — o vídeo acompanha o ponteiro 1:1, em px do
 * canvas, sem salto e sem inversão: `deltaX/deltaY` são os px do canvas que o
 * ponteiro andou desde o início do arraste. A posição é convertida na MESMA
 * representação relativa usada pelo render (`deslocamentoX/Y` em %).
 */
export function deslocamentoPorArraste({ area, dimsVideo, fit, deltaX = 0, deltaY = 0 } = {}) {
  const a = areaVideoNormalizada(area);
  const W = Math.max(2, Number(a.largura) || 0);
  const H = Math.max(2, Number(a.altura) || 0);
  const quadro = dimensoesQuadroDeConteudo({ area: a, dimsVideo, fit });
  const folgaX = W - quadro.largura;
  const folgaY = H - quadro.altura;
  return {
    zoom: a.zoom,
    deslocamentoX: normalizarDeslocamentoVideo(folgaX === 0 ? a.deslocamentoX : a.deslocamentoX + (deltaX * 100) / folgaX),
    deslocamentoY: normalizarDeslocamentoVideo(folgaY === 0 ? a.deslocamentoY : a.deslocamentoY + (deltaY * 100) / folgaY),
  };
}

/** Fontes do texto do lote (famílias web-safe — a prévia usa 1:1). */
export const FONTES_TEXTO = [
  { id: 'Arial', rotulo: 'Arial', familia: 'Arial, Helvetica, sans-serif' },
  { id: 'Verdana', rotulo: 'Verdana', familia: 'Verdana, sans-serif' },
  { id: 'Georgia', rotulo: 'Georgia', familia: 'Georgia, serif' },
  { id: 'Times New Roman', rotulo: 'Times New Roman', familia: '"Times New Roman", Times, serif' },
  { id: 'Courier New', rotulo: 'Courier New', familia: '"Courier New", monospace' },
  { id: 'Trebuchet MS', rotulo: 'Trebuchet MS', familia: '"Trebuchet MS", sans-serif' },
  { id: 'Tahoma', rotulo: 'Tahoma', familia: 'Tahoma, sans-serif' },
  { id: 'Impact', rotulo: 'Impact', familia: 'Impact, "Arial Black", sans-serif' },
];

export function familiaDeFonte(id) {
  const encontrada = FONTES_TEXTO.find((f) => f.id === id);
  return encontrada ? encontrada.familia : FONTES_TEXTO[0].familia;
}

/** Pesos do texto do lote. */
export const PESOS_TEXTO = [
  { id: 'normal', rotulo: 'Normal', peso: 400 },
  { id: 'negrita', rotulo: 'Negrita', peso: 700 },
  { id: 'extranegrita', rotulo: 'Extra negrita', peso: 900 },
];

export function pesoDeTexto(id) {
  const encontrado = PESOS_TEXTO.find((p) => p.id === id);
  return encontrado ? encontrado.peso : PESOS_TEXTO[1].peso;
}

/** Alineaciones horizontais do texto do lote. */
export const ALINEACIONES_TEXTO = [
  { id: 'esquerda', rotulo: 'Izquierda' },
  { id: 'centro', rotulo: 'Centrado' },
  { id: 'direita', rotulo: 'Derecha' },
];

/** Límites suaves do corte de bordas (%). Cada borde é INDEPENDENTE. */
export const CORTE_MAXIMO = 90;
/** MARGEM MÍNIMA VISÍVEL (% da altura): superior + inferior ≤ CORTE_MAXIMO
 * (90) → SEMPRE restam ≥ 10% do vídeo original visível. Regra ÚNICA valendo
 * no preview (corteEfetivoDoVideo), no painel/arraste (atualizarCorteNoConfig)
 * e no render (mapearEditorLote) — nunca área inválida, nunca vídeo sumido. */
export const CORTE_MARGEM_MINIMA = 100 - CORTE_MAXIMO;

/** REGRA ÚNICA de limites do corte (preview = painel = render). Limita cada
 * eixo a 0..CORTE_MAXIMO e a SOMA a CORTE_MAXIMO (margem mínima visível).
 * `prioridade` decide qual eixo MANTÉM o valor quando a soma estoura — o
 * outro cede parando exatamente no limite (a linha arrastada nunca cruza a
 * outra). Leitura (preview/render) usa 'superior' (determinístico); escrita
 * dá prioridade ao eixo ESTÁTICO (quem se move é quem para antes). */
export function limitarCorte(superior, inferior, prioridade = 'superior') {
  let sup = Math.min(CORTE_MAXIMO, Math.max(0, Number(superior) || 0));
  let inf = Math.min(CORTE_MAXIMO, Math.max(0, Number(inferior) || 0));
  if (sup + inf > CORTE_MAXIMO) {
    if (prioridade === 'inferior') sup = Math.max(0, CORTE_MAXIMO - inf);
    else inf = Math.max(0, CORTE_MAXIMO - sup);
  }
  return { superior: sup, inferior: inf };
}

/**
 * MARGEM DE SEGURANÇA DO CORTE AUTOMÁTICO (px do VÍDEO ORIGINAL).
 *
 * A detecção encontra a última linha da faixa, mas a compressão deixa 1–2 px de
 * resíduo (halo claro) justamente na transição faixa→conteúdo. Somar esta
 * margem ao corte automático consome esse resíduo: o que foi cortado SOME de
 * verdade e não sobra nenhuma borda branca.
 *
 * Constante isolada de propósito — ajuste aqui e vale para o preview e para o
 * render (é a MESMA conta). `0` desliga a margem.
 */
export const MARGEM_SEGURANCA_CORTE_PX = 2;

/**
 * Aplica a margem de segurança a um corte expresso em px do vídeo original,
 * devolvendo o MESMO corte em % (pronto para `corteBordas`).
 *
 * @param {{superior:number, inferior:number}} cortePx - corte em px do original
 * @param {number} alturaVideo - altura NATURAL do vídeo (o backend usa ffprobe,
 *        o preview usa `videoHeight` do <video>) — a mesma base do crop.
 * @returns {{superior:number, inferior:number}} corte em % já limitado
 */
export function aplicarMargemSegurancaCorte(cortePx, alturaVideo) {
  const altura = Math.max(1, Number(alturaVideo) || 0);
  if (!(altura > 1)) return limitarCorte(cortePx?.superior, cortePx?.inferior, 'superior');
  const soma = (v) => Math.max(0, (Number(v) || 0) + MARGEM_SEGURANCA_CORTE_PX);
  const emPct = (v) => (soma(v) / altura) * 100;
  return limitarCorte(emPct(cortePx?.superior), emPct(cortePx?.inferior), 'superior');
}

/* ---------------------------------------------------------------------------
 * POSIÇÃO DO VÍDEO SOBRE O TEMPLATE (arrasto) — mesmo mecanismo de override do
 * corte: global ⊕ por vídeo, respeitando o escopo "Editar todos".
 *
 *   `config.posicaoVideo`      → { offsetX, offsetY } em px da base 1080×1920
 *   `config.posicaoPorVideo`  → { [videoId]: { offsetX, offsetY } }
 *
 * `null`/`undefined` = CENTRADO (estado inicial, nada gravado).
 * ------------------------------------------------------------------------- */

/** Posição padrão: centralizada (nada gravado). */
export function criarPosicaoVideoPadrao() {
  return { offsetX: null, offsetY: null };
}

/** Posição EFETIVA do vídeo (global ⊕ `posicaoPorVideo[id]`). Fail-open. */
export function posicaoEfetivaDoVideo(config, videoId) {
  const global = config?.posicaoVideo || {};
  const over = videoId ? config?.posicaoPorVideo?.[videoId] : null;
  const x = over?.offsetX ?? global.offsetX ?? null;
  const y = over?.offsetY ?? global.offsetY ?? null;
  // `null`/`undefined` = CENTRALIZADO e precisa CONTINUAR assim. `Number(null)`
  // é 0 (e `Number.isFinite(0)` é true), então converter antes de checar a
  // ausência transformava "sem posição" em "posição 0,0" — o vídeo ia para o
  // topo-esquerda em vez do centro. Por isso o `== null` vem ANTES da conta.
  const inteiroOuNulo = (v) => (v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  return {
    offsetX: inteiroOuNulo(x),
    offsetY: inteiroOuNulo(y),
  };
}

/**
 * FONTE ÚNICA DE ESCRITA da posição do vídeo, respeitando o ESCOPO:
 *   · `todos=true`  → escreve no GLOBAL; overrides já existentes ficam intactos
 *     (voltar para "todos" nunca apaga o que foi ajustado vídeo a vídeo);
 *   · `todos=false` → escreve SÓ no override deste vídeo.
 * `offsetX`/`offsetY` = `null` volta para "centrado".
 */
export function atualizarPosicaoVideoNoConfig(config, { todos = true, videoId = null, mudancas = {} } = {}) {
  if (!config || typeof mudancas !== 'object') return config;
  const individual = todos === false && !!videoId;
  const base = posicaoEfetivaDoVideo(config, individual ? videoId : null);
  const normalizar = (v, atual) => (v === null ? null : (Number.isFinite(Number(v)) ? Number(v) : atual));
  const proxima = {
    offsetX: Object.prototype.hasOwnProperty.call(mudancas, 'offsetX')
      ? normalizar(mudancas.offsetX, base.offsetX)
      : base.offsetX,
    offsetY: Object.prototype.hasOwnProperty.call(mudancas, 'offsetY')
      ? normalizar(mudancas.offsetY, base.offsetY)
      : base.offsetY,
  };
  if (individual) {
    return {
      ...config,
      posicaoPorVideo: { ...(config.posicaoPorVideo || {}), [videoId]: proxima },
    };
  }
  return { ...config, posicaoVideo: proxima };
}

/** Bloque de texto padrão (usado para superior E inferior — independientes).
 * Opt-in: nasce invisível (`visivel:false`); só aparece no preview depois que
 * o usuário digitar conteúdo e/ou ligar a visibilidade. `onde` = 'superior'
 * (y ~12%) ou 'inferior' (y ~82%) — corrige sobreposição inicial. */
export function textoPadrao(onde = 'superior') {
  return {
    // Cada un de los DOS textos tiene contenido/posición/tipografía propias:
    // mover o redimensionar uno NUNCA altera el otro.
    conteudo: '',
    fonte: 'Arial',
    peso: 'negrita',
    alinhamento: 'centro', // esquerda | centro | direita
    tamanho: 72, // px do canvas (tamanhoFonte no template)
    cor: '#0f172a',
    x: 50, // % do canvas (centro do bloco)
    y: onde === 'inferior' ? 82 : 12, // % do canvas (topo do bloco)
    largura: 80, // % da largura do canvas
    altura: 240, // px do canvas (área de texto do template)
    opacidade: 100,
    visivel: false,
  };
}

/** Elemento de TEXTO da identidade (nome do canal | @ do canal) — cada um é
 * 100% independente (conteúdo, posição, tamanho, cor, peso, fonte,
 * alinhamento, opacidade e visibilidade próprios). Opt-in: nasce invisível;
 * só aparece após o usuário digitar o nome/@ e/ou ligar a visibilidade. */
export function elementoIdentidadeTextoPadrao(padrao = {}) {
  return {
    conteudo: '',
    visivel: false,
    x: 50, // % do canvas (centro do bloco)
    y: 16, // % do canvas (topo do bloco)
    largura: 46, // % da largura do canvas
    tamanho: 40, // px do canvas
    altura: 120,
    cor: '#0f172a',
    fonte: 'Arial',
    peso: 'extranegrita',
    alinhamento: 'centro',
    opacidade: 100,
    ...padrao,
  };
}

/**
 * IDENTIDADE DO CANAL — logo + nome + @ + selo azul de verificado.
 * Cada elemento é INDEPENDENTE (movido/redimensionado com o mouse no popup
 * grande e no canvas) e faz parte da CONFIG COMPARTILHADA: editar um vale
 * pro lote inteiro, na hora, sem botão "Aplicar a todos".
 */
export function criarIdentidadePadrao() {
  return {
    nome: elementoIdentidadeTextoPadrao({ y: 15, tamanho: 40, peso: 'extranegrita' }),
    usuario: elementoIdentidadeTextoPadrao({ y: 19.5, tamanho: 26, peso: 'normal', cor: '#5b6472' }),
    // Selo azul: x/y marca o CENTRO, largura em % da largura do canvas.
    // PNG PRÓPRIO (urlImagem = dataURL importado pelo usuário): sem imagem,
    // o selo usa o ícone vetorial BadgeCheck como sempre. Opt-in: nasce
    // desligado e SEM imagem — nada aparece de sessões antigas (regra de
    // lote limpo). O dataURL sobrevive ao reload (persistido em
    // `identidade.selo` pelo configParaSalvar) — o mesmo dado segue no JSON
    // `identidadeSelo` do template (engine compõe o PNG; sem imagem → vetorial).
    selo: { visivel: false, x: 66, y: 15.6, largura: 3.4, opacidade: 100, urlImagem: null, alturaProporcao: 1 },
  };
}

/** Sessão/lote atual do Editor: dono lógico da config de edição.
 * Regra definitiva anti-herança: `overridesPorVideo`, logo, textos e
 * identidade pertencem ao lote identificado por `loteId`. Um lote NOVO
 * (lista vazia → primeiro import) começa LIMPO, sem herdar overlays da
 * sessão anterior. Dentro do mesmo lote, a config compartilhada continua
 * valendo para todos os vídeos já importados. */
export function criarConfigLimpaDeLote() {
  const base = criarConfigPadrao();
  return {
    ...base,
    loteId: `lote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    loteCriadoEm: Date.now(),
  };
}

/**
 * IMAGEM (Editor em Lote) — elemento de imagem independente da composição
 * ("Adicionar elementos → Imagem"). Mesma convenção da LOGO: x% marca o
 * CENTRO (prévia usa translate(-50%, 0)), y% marca o TOPO, largura em % da
 * largura do canvas e `alturaProporcao` (altura/largura natural da imagem)
 * preserva a proporção na prévia E no render (pipeline compõe com `contain`).
 * O arquivo viaja como dataURL (mesmo mecanismo do selo PNG) DENTRO do
 * template (`imagens`), então prévia e vídeo final ficam idênticos.
 */
export function criarImagemPadrao({ url, alturaProporcao = 1, nome = null }) {
  return {
    id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    url: typeof url === 'string' && url.startsWith('data:image/') ? url : null,
    nome: typeof nome === 'string' ? nome.slice(0, 60) : null,
    x: 50,
    y: 36,
    largura: 30,
    alturaProporcao: Number(alturaProporcao) > 0 ? Number(alturaProporcao) : 1,
    opacidade: 100,
    visivel: true,
  };
}

/** Template de fundo importado (PNG/imagem) - camada visual propria, funcao dedicada. */
export function criarTemplateFundoPadrao() {
  return { url: null, nome: '', larguraNatural: 0, alturaNatural: 0, visivel: true };
}


/* ---------------------------------------------------------------------------
 * RETÂNGULO VAZADO DO TEMPLATE — `areaTemplate` (CONCEITO SEPARADO).
 *
 * Antes, o retângulo que o template deixa vazado (o "buraco") e o retângulo
 * FÍSICO onde o vídeo é desenhado eram a MESMA variável (`areaVideo`). Isso
 * forçava a importação de template a REDUZIR o vídeo (918×1344) só para
 * sobrar moldura — o vídeo parava de ocupar o canvas 1080×1920.
 *
 * Agora são DOIS conceitos independentes:
 *   · `areaVideo`    → posição/enquadramento FÍSICO do vídeo (scale/crop/pad
 *                      do FFmpeg e o elemento do preview). Sempre o canvas
 *                      inteiro por padrão (0,0,1080×1920).
 *   · `areaTemplate` → o retângulo que o TEMPLATE deixa vazar. Só o
 *                      `clip-path` do preview e o `construirOverlay.js`
 *                      (backend) o consomem — NUNCA o posicionamento do vídeo.
 *   · `null`         → sem buraco: o template é arte cheia por cima do vídeo.
 *
 * O retângulo inicial é o MESMO retângulo central de 85%×70% que antes era
 * gravado em `areaVideo`, então a moldura visual do template continua igual —
 * apenas o vídeo deixa de ser encolhido.
 * ------------------------------------------------------------------------- */
export const AREA_TEMPLATE_LARGURA_PCT = 0.85;
export const AREA_TEMPLATE_ALTURA_PCT = 0.7;

/** Retângulo vazado padrão do template (85%×70% centralizado). */
export function criarAreaTemplatePadrao() {
  const largura = Math.max(2, Math.round(CANVAS_LARGURA * AREA_TEMPLATE_LARGURA_PCT));
  const altura = Math.max(2, Math.round(CANVAS_ALTURA * AREA_TEMPLATE_ALTURA_PCT));
  return {
    x: Math.round((CANVAS_LARGURA - largura) / 2),
    y: Math.round((CANVAS_ALTURA - altura) / 2),
    largura,
    altura,
  };
}

/** `areaTemplate` utilizável (largura/altura >= 2px) ou `null`. Fail-open. */
export function areaTemplateValida(area) {
  if (!area || typeof area !== 'object') return null;
  const x = Number(area.x);
  const y = Number(area.y);
  const largura = Number(area.largura);
  const altura = Number(area.altura);
  if (![x, y, largura, altura].every(Number.isFinite)) return null;
  if (!(largura >= 2 && altura >= 2)) return null;
  return { x: Math.round(x), y: Math.round(y), largura: Math.round(largura), altura: Math.round(altura) };
}

/* ---------------------------------------------------------------------------
 * ARQUITETURA — TEMPLATE É O FUNDO, VÍDEO É A CAPA (correção do corte).
 *
 * O `template.png` 1080×1920 é o FUNDO do quadro. O vídeo (já recortado) é
 * composto POR CIMA dele. Onde o vídeo não cobre, aparece o TEMPLATE — nunca
 * branco, nunca um retângulo pintado.
 *
 * · `corteBordas.superior/inferior` (fração 0..0.9 da ALTURA ORIGINAL do
 *   vídeo) é materializado como CROP REAL em PIXELS INTEIROS:
 *     crop=iw:<alturaPx>:0:<topPx>
 *   O que é cortado NÃO EXISTE no resultado (antes era `drawbox`, que só
 *   pintava por cima e deixava a faixa visível).
 * · Depois do crop o vídeo é escalado para `larguraAlvo` MANTENDO A
 *   PROPORÇÃO (`scale=W:-2`) — nunca há `pad` com cor nenhuma.
 * · A posição final é `offsetX`/`offsetY` em px da base 1080×1920; preview e
 *   render consomem EXATAMENTE estes números (fonte única: esta função).
 *
 * `areaTemplate` (o antigo "buraco" do template) deixa de ter efeito visual:
 * o template é fundo, então não há nada a vazar. O campo continua salvo para
 * compatibilidade e para designs antigos que ainda o informam.
 * ------------------------------------------------------------------------- */

/** Largura alvo do vídeo escalado (px do canvas). É o contrato do render e do
 * preview: `scale=<larguraAlvo>:-2`. 1080 = largura cheia do quadro. */
export const LARGURA_ALVO_VIDEO = CANVAS_LARGURA;

/** Região que TRAVA o arrasto do vídeo dentro do quadro. `null` = arrasto
 * livre (padrão). Quando existe, o vídeo é mantido 100% dentro dela. */
export function limiteDeMovimento(config) {
  const l = config?.limiteMovimento;
  if (!l || typeof l !== 'object') return null;
  const x = Number(l.x); const y = Number(l.y);
  const largura = Number(l.largura); const altura = Number(l.altura);
  if (![x, y, largura, altura].every(Number.isFinite)) return null;
  if (!(largura >= 2 && altura >= 2)) return null;
  return { x, y, largura, altura };
}

/**
 * TRAVA DO ARRASTO - O VIDEO INTEIRO, NUNCA A JANELA CORTADA.
 *
 * REGRA INVARIANTE (a tesoura e uma TESOURA, nao uma alavanca):
 *
 *     posicao_do_video(corte_A) === posicao_do_video(corte_B)
 *
 * para QUALQUER corte valido. A trava abaixo e um CLAMP sobre a posicao SALVA
 * do video, e ela le APENAS a geometria do video INTEIRO (largura/altura).
 * Ela NAO recebe, NAO le e NAO pode ser influenciada por `topPx`, `basePx`,
 * `superior`, `inferior` ou `corteBordas`. Consequencia: mudar o corte NUNCA
 * desloca o video - o que muda e so a janela de recorte (a "linha").
 *
 * POR QUE ISTO E O QUE SE DEVE FAZER (e nao a trava da janela visivel):
 * a versao anterior travava a JANELA [y+topPx, y+altura-basePx], o que fazia
 * `minY`/`maxY` dependerem do corte. Medido com FFmpeg real, o efeito foi o
 * conteudo do video PULANDO de y=300 -> 0 -> 192 -> 408 -> 840 so de arrastar
 * a linha de 0% a 30%. Pior: `y` e RECALCULADO a cada render a partir do
 * `offsetY` salvo, entao um clamp que varia com o corte altera a posicao
 * efetiva do video sem que ninguem tenha arrastado nada. Quebrando a
 * dependencia, `y` vira funcao pura de (posicao salva, video, regiao) - o
 * mesmo numero para o preview e para o `overlay` do FFmpeg.
 *
 * TRAVA VERTICAL (sobre o video inteiro, `altura` SEM corte):
 *     y >= reg.y                       (topo do video nunca sobe da regiao)
 *     y <= reg.y + reg.altura          (o TOPO do video alcanca a BASE)
 *
 * REGRA NOVA — o TOPO do video pode descer ate a BASE da regiao. Isso e o que
 * permite REVELAR texto/logo do template no topo mesmo com um video 9:16 que
 * preenche o quadro inteiro (altura = 1920 = a do canvas). A formula antiga
 * (`reg.y + reg.altura - altura`) dava `maxY = 0` nesse caso e prendia o video
 * em y=0: o usuario digitava Y=400/800/1200 e NADA acontecia, porque a folga
 * vertical e zero quando o video tem a altura do canvas. O video pode ficar
 * PARCIALMENTE fora da parte inferior do quadro — o `overlay` do FFmpeg recorta
 * sem erro e o TEMPLATE (fundo) aparece no lugar: nunca branco.
 *
 * O limite SUPERIOR (`minY = reg.y`) continua valendo: o video nao sobe acima da
 * regiao. `Math.max(minY, maxY)` segue como rede de seguranca (a formula nao
 * gera mais folga negativa, mas a protecao fica).
 *
 * O eixo X e o MESMO do video inteiro (a tesoura so corta na vertical), logo
 * nao e afetado por nada disto.
 *
 * @param {number} [p.limite] - regiao travada (ou `null` = canvas inteiro)
 */
export function limitarMovimentoVideo({ x, y, largura, altura, limite, canvasLargura = CANVAS_LARGURA, canvasAltura = CANVAS_ALTURA }) {
  const reg = limite || { x: 0, y: 0, largura: canvasLargura, altura: canvasAltura };
  const maxX = reg.x + Math.max(0, reg.largura - largura);
  const minY = reg.y;
  // REGRA NOVA (espelhada em `compor.js`): o TOPO do vídeo pode descer até a
  // BASE da região. Antes era `reg.y + reg.altura - altura`, que para um vídeo
  // 9:16 (altura = 1920 = a do canvas) dava `maxY = 0` e travava o arrasto em
  // y=0 — o usuário não conseguia revelar texto/logo do template no topo.
  const maxY = reg.y + reg.altura;
  return {
    x: Math.round(Math.min(Math.max(x, reg.x), maxX)),
    y: Math.round(Math.min(Math.max(y, minY), Math.max(minY, maxY))),
  };
}

/**
 * MENOR NÚMERO PAR MAIOR OU IGUAL a `valor`.
 *
 * É EXATAMENTE o arredondamento que o FFmpeg aplica em `scale=<largura>:-2`
 * (medido no FFmpeg 9: entrada de 538px → 807.0 → 808; 534px → 801 → 802;
 * 530px → 795 → 796). Usar a MESMA conta dos dois lados é o que garante que a
 * prévia e o vídeo final tenham a mesma altura, sem sobra de 1px.
 */
export function parParaCima(valor) {
  const inteiro = Math.ceil(Number(valor) || 0);
  return inteiro % 2 === 0 ? inteiro : inteiro + 1;
}

/** Fração 0..1 → texto legível em % ("60%", "33.9%") — só para mensagens de
 * aviso/erro meantas para o olho humano (nunca entra em conta de pixel). */
function pctLegivel(fracao) {
  return `${Math.round((Number(fracao) || 0) * 1000) / 10}%`;
}

/**
 * CROP DAS BORDAS EM PIXELS INTEIROS — FONTE ÚNICA da verdade.
 *
 * A linha de corte é uma TESOURA: ela só ESCONDE parte do vídeo. Por isso a
 * base da conta é a altura do vídeo **JÁ ESCALADO** (`H` do filtergraph), e
 * NUNCA a altura já cortada — cortar não pode encurtar o vídeo.
 * Converte as frações `superior`/`inferior` (0..1 da altura do vídeo) em pixels
 * INTEIROS sobre essa altura. Preview (`EditorCanvas.jsx`) e FFmpeg
 * (`compor.js`) consomem EXATAMENTE estes números — nenhum dos dois recalcula a
 * partir de `%`.
 *
 * REGRAS (verificadas em `validacao_bordas_2026-09-29`):
 *  · `topPx = ceil(superior * H)` arredondado PARA CIMA ao próximo PAR;
 *  · `bottomPx` idem — o arredondamento NUNCA é para baixo, porque SUBCORTAR
 *    deixa a faixa branca visível (era o bug: 33.9% de 1280 dava 432px em vez
 *    de 434px e o render final abria 2160 pixels brancos);
 *  · a altura restante (`H - topPx - bottomPx`) é sempre PAR e > 0 (exigência
 *    do `yuv420p` do encode final); se não for, `bottomPx` ganha +1 par;
 *  · se o corte não couber na altura do vídeo, ele é ignorado (fail-open:
 *    perder conteúdo é pior do que sobrar uma faixa) — mas NUNCA EM SILÊNCIO:
 *    o retorno carrega `corteInvalido`/`aviso` e a função emite `console.warn`,
 *    para que preview e render nunca "sem corte" sem ninguém saber por quê.
 *
 * A margem de segurança de 2px NÃO entra aqui: ela pertence só à detecção
 * automática (`detectorBordas.js`), que já a soma no valor detectado. No corte
 * MANUAL o slider tem de ser fiel ao valor escolhido.
 *
 * @param {Object} p
 * @param {number} p.superior - fração 0..1 do topo
 * @param {number} p.inferior - fração 0..1 da base
 * @param {number} p.alturaVideo - altura BASE do corte (px) = altura do vídeo
 *        JÁ ESCALADO. O preview passa a altura escalada do `<video>`; o engine
 *        passa a mesma altura calculada com `parParaCima` sobre o ffprobe.
 * @returns {{topPx:number, bottomPx:number, alturaPx:number, alturaVideo:number,
 *            ativo:boolean, corteInvalido:boolean, aviso:string|null}}
 */
export function pixelsDeCorte({ superior, inferior, alturaVideo } = {}) {
  const ih = Math.max(4, Math.round(Number(alturaVideo) || 0)) || CANVAS_ALTURA;
  const fracao = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  const topPx = parParaCima(fracao(superior) * ih);
  let bottomPx = parParaCima(fracao(inferior) * ih);
  // Sem resto utilizável: o vídeo passa INTEIRO (nunca `crop` negativo/zero).
  // O RESULTADO continua fail-open (perder conteúdo é pior), mas deixa de ser
  // silencioso: quem chama recebe `corteInvalido` + `aviso` e um aviso vai para
  // o console. Sem isto, um slider em 60%+45% (105%) renderizava o vídeo
  // inteiro e o usuário só descobria isso no vídeo final, sem nenhuma pista.
  if (topPx + bottomPx + 2 > ih) {
    const aviso = `[pixelsDeCorte] corte ignorado: ${pctLegivel(superior)} + ${pctLegivel(inferior)} `
      + `precisariam de ${topPx + bottomPx}px em um vídeo de ${ih}px `
      + `(restariam ${ih - topPx - bottomPx}px). O vídeo será renderizado INTEIRO, `
      + `sem o corte pedido. Reduza os percentuais.`;
    console.warn(aviso);
    return { topPx: 0, bottomPx: 0, alturaPx: ih, alturaVideo: ih, ativo: false, corteInvalido: true, aviso };
  }
  // Altura restante PAR e > 0.
  if ((ih - topPx - bottomPx) % 2 !== 0) bottomPx += 2;
  return {
    topPx,
    bottomPx,
    alturaPx: ih - topPx - bottomPx,
    alturaVideo: ih,
    ativo: topPx > 0 || bottomPx > 0,
    corteInvalido: false,
    aviso: null,
  };
}

/**
 * DIMENSÕES NATURAIS DO VÍDEO — fonte única da verdade do preview e do render.
 *
 * FONTE OFICIAL (prioridade máxima): o `ffprobe` roda no servidor no momento do
 * upload (`metadadosVideo.obterMetadados` → `stream=width,height`) e o valor é
 * gravado no registro da BIBLIOTECA (`largura`/`altura`), que `GET /api/biblioteca`
 * devolve. É EXATAMENTE o mesmo número que o `ffprobe` do `compor.js` usa no
 * render — logo, prévia = render por construção, para QUALQUER vídeo, esteja
 * ele selecionado ou não na grade.
 *
 * ⚠️ POR QUE A THUMBNAIL NÃO É USADA AQUI: `gerarThumbnail` redimensiona para
 * `scale=320:-1` (metadadosVideo.js:52). A `naturalWidth` da `<img>` é, portanto,
 * 320px e NÃO é a resolução do vídeo. Usá-la como fonte oficial seria errado.
 * (A proporção é preservada pelo FFmpeg, mas a largura não é — e a correção não
 * pode depender de uma imagem gerada.)
 *
 * FAIL-OPEN REAL (corrige o bug anterior): a guarda testa a AUSÊNCIA do valor
 * ANTES do `Math.max`. A versão anterior era
 *     `Math.max(1, Math.round(Number(v) || 0)) || CANVAS_*`
 * e como `Math.max(1, 0)` devolve `1` (truthy), o `||` NUNCA disparava: sem dims,
 * o vídeo era calculado como 1×1 → um QUADRADO 1080×1080 centralizado no preview,
 * em vez do 9:16 do render. Os cards da grade mostravam geometria diferente da do
 * vídeo final, e o card só "acertava" ao ser selecionado (é quando o `<video>`
 * passa a existir e a reportar as dimensões).
 *
 * @param {{largura?:number, altura?:number}} [d] dims candidatas
 * @param {{largura:number, altura:number}} [padrao] dims usadas quando faltarem
 * @returns {{largura:number, altura:number}} dims válidas, ou o padrão (1080×1920)
 */
export function dimensoesDoVideo(d, padrao = { largura: CANVAS_LARGURA, altura: CANVAS_ALTURA }) {
  const inteiro = (v) => {
    if (v === null || v === undefined || v === '') return 0;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const largura = inteiro(d?.largura);
  const altura = inteiro(d?.altura);
  if (largura > 0 && altura > 0) return { largura, altura };
  // Parcial/absente → cai no padrão declarado (fail-open silencioso, como
  // sempre foi prometido na documentação desta função).
  return { largura: largura > 0 ? largura : padrao.largura, altura: altura > 0 ? altura : padrao.altura };
}

/**
 * Dimensões naturais que o EDITOR já tem para um vídeo do lote.
 *
 * Lê do próprio item do Editor (que o `EditorLote` preenche com o `ffprobe` do
 * upload). É o que permite que um card NÃO SELECIONADO calcule a MESMA geometria
 * de um selecionado — a geometria deixa de depender de "o `<video>` está montado".
 *
 * @param {{largura?:number, altura?:number}} item
 * @returns {{largura:number, altura:number}|null} `null` quando o item não tem
 *          dims (aí o chamador decide: item da biblioteca ainda sem enriquecimento).
 */
export function dimensoesDoItem(item) {
  if (!item || typeof item !== 'object') return null;
  const l = Math.round(Number(item.largura));
  const a = Math.round(Number(item.altura));
  if (Number.isFinite(l) && Number.isFinite(a) && l > 0 && a > 0) return { largura: l, altura: a };
  return null;
}


/**
 * GEOMETRIA FINAL DO VÍDEO — fonte ÚNICA da verdade (preview = render).
 *
 * A LINHA DE CORTE É UMA TESOURA, NÃO UMA PALANCA. Ela só ESCONDE parte do
 * vídeo: nunca move, escala nem reposiciona. A ordem é, portanto:
 *
 *   1) ESCALA o vídeo INTEIRO (sem corte nenhum):
 *        `scale=<larguraAlvo>:<altura>` com
 *        `altura = parParaCima(ih * largura / iw)` — proporção preservada,
 *        altura sempre PAR (exigência do `yuv420p`), NUNCA há `pad` com cor.
 *   2) POSICIONA o vídeo INTEIRO em (offsetX, offsetY) na base 1080×1920.
 *      Ausência = CENTRO, e o centro é calculado **uma única vez** com a
 *      altura do vídeo INTEIRO. O corte NÃO entra neste cálculo — era
 *      exatamente aí que o pipeline antigo criava o acoplamento: ao mudar o
 *      corte, a altura mudava, o centro era recalculado e o vídeo "descia"
 *      (com faixa do template aparecendo embaixo).
 *   3) CORTA (TESEURA) sobre a altura JÁ ESCALADA, em pixels INTEIROS:
 *        `crop=<larguraAlvo>:<altura-topPx-basePx>:0:<topPx>`
 *      A faixa visível é `[y + topPx, y + altura - basePx]`; o que fica
 *      visível permanece EXATAMENTE no mesmo lugar da tela e a parte cortada
 *      revela o template por baixo. No FFmpeg isso vira
 *      `overlay=x:(y+topPx)` — o `+topPx` é o que mantém o conteúdo parado.
 *
 * Nenhuma cor de preenchimento existe aqui: o que foi cortado não é pintado,
 * simplesmente não é desenhado.
 *
 * @param {Object} p
 * @param {{largura:number, altura:number}} p.dimsVideo - dimensões NATURAIS
 *        do vídeo (fonte oficial: `ffprobe`, gravada no item pela Biblioteca —
 *        ver `dimensoesDoVideo`; o `<video>` do preview e o FFmpeg do render
 *        leem exatamente o mesmo número). Sem dims, cai em 1080×1920
 *        (fail-open REAL — ver `dimensoesDoVideo`).
 * @param {{ativo:boolean, superior:number, inferior:number}} p.corte - % (0..90)
 * @param {{offsetX:number, offsetY:number}} p.posicao - px da base 1080×1920
 *        (`null` = centralizado)
 * @param {number} [p.larguraAlvo]
 * @param {Object}  [p.limite] - região travada (ou `null` = livre)
 * @returns {{x:number,y:number,largura:number,altura:number,
 *            topPx:number,basePx:number,alturaVisivelPx:number,
 *            faixaVisivel:{topo:number,altura:number},
 *            corteAtivo:boolean}}
 */
export function geometriaVideoFinal({ dimsVideo, corte, posicao, larguraAlvo = LARGURA_ALVO_VIDEO, limite = null, canvasLargura = CANVAS_LARGURA, canvasAltura = CANVAS_ALTURA } = {}) {
  const { largura: natL, altura: natA } = dimensoesDoVideo(dimsVideo, { largura: CANVAS_LARGURA, altura: CANVAS_ALTURA });

  // 1) ESCALA DO VÍDEO INTEIRO — `scale=<larguraAlvo>:<altura>`. A altura vem
  //    da proporção NATURAL (nada de corte antes) e é arredondada para CIMA ao
  //    próximo par, que é exatamente o `-2` do FFmpeg (`parParaCima`). Sem
  //    `pad`, sem cor: o vídeo só muda de tamanho.
  const largura = Math.max(2, Math.round(larguraAlvo));
  const altura = Math.max(2, parParaCima((natA / natL) * largura));

  // 2) CORTE (TESOURA) — pixels INTEIROS sobre a altura JÁ ESCALADA. Arredonda
  //    SEMPRE para cima: arredondar para baixo SUBCORTA e deixa resíduo visível.
  //    Calculado ANTES da posição (passo 3) porque a TRAVA do arrasto depende do
  //    corte: é a JANELA VISÍVEL que não pode sair do canvas, não o vídeo inteiro.
  const sup = corte?.ativo ? Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.superior) || 0)) / 100 : 0;
  const inf = corte?.ativo ? Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.inferior) || 0)) / 100 : 0;
  const cortePx = pixelsDeCorte({ superior: sup, inferior: inf, alturaVideo: altura });
  const topPx = cortePx.topPx;              // px INTEIROS do topo, sobre H
  const basePx = cortePx.bottomPx;          // px INTEIROS da base, sobre H
  const alturaVisivelPx = cortePx.alturaPx;  // altura que sobra (par, > 0)

  // 3) POSIÇÃO DO VÍDEO INTEIRO na base 1080×1920 (arrasto) + trava de região.
  //    `null`/`undefined` = CENTRALIZADO: `Number(null)` é 0 (e é finito!), então
  //    a ausência tem de ser checada ANTES de converter — senão "sem posição"
  //    virava (0,0) e o vídeo ficaria no topo-esquerda em vez do centro.
  //    O CENTRO usa a altura INTEIRA (passo 1). O corte nunca entra aqui:
  //    nem na centralização, nem na trava. `y` é função pura de (posição
  //    salva, vídeo inteiro, região) — logo mover a linha de corte move SÓ a
  //    janela de recorte, nunca o vídeo.
  const offX = posicao?.offsetX;
  const offY = posicao?.offsetY;
  // A trava recebe APENAS a geometria do vídeo INTEIRO. `topPx`/`basePx` NÃO
  // entram aqui — é exatamente esse acoplamento que fazia o vídeo subir/descer
  // ao mexer na linha de corte (ver `limitarMovimentoVideo`).
  const movido = limitarMovimentoVideo({
    x: offX == null ? Math.round((canvasLargura - largura) / 2) : Number(offX),
    y: offY == null ? Math.round((canvasAltura - altura) / 2) : Number(offY),
    largura, altura, limite, canvasLargura, canvasAltura,
  });

  return {
    // Geometria do vídeo INTEIRO (o que o usuário arrasta). Não muda com o corte.
    x: movido.x,
    y: movido.y,
    largura,
    altura,
    // A TESOURA: a faixa escondida, medida sobre a altura já escalada.
    topPx,
    basePx,
    alturaVisivelPx,
    // Faixa realmente VISÍVEL na tela — é o que o preview desenha e o que o
    // `overlay` do FFmpeg posiciona (em `y + topPx`).
    faixaVisivel: { topo: movido.y + topPx, altura: alturaVisivelPx },
    corteAtivo: topPx > 0 || basePx > 0,
    // Aviso de corte recusado (`pixelsDeCorte` é fail-open: devolve o vídeo
    // inteiro). Sem estas chaves a UI e o render "não cortariam" em silêncio.
    corteInvalido: cortePx.corteInvalido === true,
    avisoCorte: cortePx.corteInvalido ? cortePx.aviso : null,
  };
}

/** Existe uma arte de template visível na config? */
function configTemTemplate(config) {
  const tf = config?.templateFundo;
  return !!(tf && typeof tf.url === 'string' && tf.url.startsWith('data:image/') && tf.visivel !== false);
}

/** `areaVideo` cobre o canvas INTEIRO (1080×1920)? */
function areaCobreCanvasInteiro(area) {
  const a = area && typeof area === 'object' ? area : {};
  return Number(a.x) <= 0 && Number(a.y) <= 0
    && Number(a.largura) >= CANVAS_LARGURA && Number(a.altura) >= CANVAS_ALTURA;
}

/**
 * RETÂNGULO VAZADO EFETIVO DO TEMPLATE — única fonte para o preview
 * (`EditorCanvas.jsx`) e para o payload (`mapearEditorLote.js`), então o
 * `clip-path` da prévia e o `dest-out` do render usam a MESMA geometria.
 *
 *   · `config.areaTemplate` válido → é o buraco (fluxo atual);
 *   · ausente + template presente + `areaVideo` MENOR que o canvas
 *     → COMPATIBILIDADE LEGADA: antes desta separação o buraco morava dentro
 *     de `areaVideo`, então uma config salva com o vídeo reduzido continua
 *     abrindo o buraco em `areaVideo` e renderizando EXATAMENTE como antes
 *     (nada é sobrescrito, nenhuma migração destrutiva);
 *   · ausente + sem template (ou `areaVideo` = canvas inteiro)
 *     → `null`: SEM buraco, o template é arte cheia por cima do vídeo.
 */
export function areaTemplateEfetiva(config) {
  const explicita = areaTemplateValida(config?.areaTemplate);
  if (explicita) return explicita;
  // Compatibilidade com configs antigas (pré-sepuração).
  if (configTemTemplate(config)) {
    const legada = areaTemplateValida(config?.areaVideo);
    if (legada && !areaCobreCanvasInteiro(legada)) return legada;
  }
  return null;
}

/** Rótulo curto do vídeo no lote (vídeo 01, vídeo 02, ...). */
export function rotuloDeVideo(indice) {
  return `vídeo ${String(indice + 1).padStart(2, '0')}`;
}

/** Versão da config persistida (migração v1 → v2 opt-in). */
export const VERSAO_CONFIG_EDITOR = 2;

/**
 * MIGAÇÃO DOS OVERRIDES POR VÍDEO (FASE 0/FASE 1) — configs antigas continuam
 * carregáveis, no formato de TRÊS CONCEITOS.
 *
 * Regras aplicadas por vídeo:
 *   · `origem:'manual'` OU bloco `manual` presente
 *       → preservado como `manual.corte` (a EDIÇÃO DO USUÁRIO nunca se perde);
 *   · `origem:'auto'`
 *       → NÃO preservado como corte efetivo; convertido em `deteccao`
 *         (informação da máquina). O corte automático antigo deixa de valer
 *         aqui — é intencional;
 *   · `automatico` → `deteccao`;
 *   · `manual` plano (formato antigo) → `manual.corte`.
 *
 * Entradas que não são objeto são descartadas (fail-open). Entradas que só
 * tinham `superior`/`inferior` soltos e NENHUM `manual` viram `deteccao` — é o
 * caso do override automático antigo, que nunca foi edição manual.
 */
function normalizarOverridesPorVideo(salvos) {
  const entrada = (salvos && typeof salvos === 'object') ? salvos : {};
  const saida = {};
  for (const [videoId, bruto] of Object.entries(entrada)) {
    if (!videoId || !bruto || typeof bruto !== 'object') continue;
    // A MESMA regra tolerante usada pela leitura do corte efetivo
    // (`corteManualDaEntrada`): manual novo/legado, `origem:'manual'` e o
    // legado sem marcador. NUNCA uma entrada marcada como detecção.
    const corteManual = corteManualDaEntrada(bruto);
    // `deteccao` novo, `automatico` antigo, ou `origem:'auto'` com % soltos.
    const deteccao = bruto.deteccao
      || bruto.automatico
      || (bruto.origem === 'auto'
        ? { superior: Number(bruto.superior) || 0, inferior: Number(bruto.inferior) || 0, em: bruto.em ?? null }
        : null);
    saida[videoId] = montarOverrideVideo({ anterior: bruto, corteManual, deteccao });
  }
  return saida;
}

/**
 * FASE 1 — migra configs antigas (localStorage v1) para o comportamento fiel:
 * - logo sem url → visivel:false (nunca aparece sozinha);
 * - textos/identidade com conteúdo vazio → visivel:false;
 * - textos herdados com visivel:true mas sem conteúdo → visivel:false;
 * - texto inferior com y<=50 (sobreposto ao superior) → y=82;
 * - fundo branco padrão antigo → mantém (respeita escolha do usuário); só
 *   configs virgens usam preto.
 */
export function normalizarConfigEditor(salva) {
  const base = criarConfigPadrao();
  const cfg = {
    ...base,
    ...(salva || {}),
    loteId: salva?.loteId || base.loteId || null,
    loteCriadoEm: salva?.loteCriadoEm || null,
    canvas: { ...base.canvas, ...(salva?.canvas || {}) },
    areaVideo: areaVideoNormalizada({ ...base.areaVideo, ...(salva?.areaVideo || {}) }),
    // `areaTemplate` normalizado INDEPENDENTE — nunca vira `areaVideo` e
    // nunca altera a área do vídeo. Configs antigas (sem o campo) continuam
    // válidas: `null` aqui significa "sem buraco explícito", e o
    // `areaTemplateEfetiva` decide se há compatibilidade legada.
    areaTemplate: areaTemplateValida(salva?.areaTemplate),
    corteBordas: { ...base.corteBordas, ...(salva?.corteBordas || {}) },
    // MIGAÇÃO DOS OVERRIDES POR VÍDEO (FASE 0/FASE 1) — cada entrada antiga é
    // reescrita no formato de TRÊS CONCEITOS (`manual` / `deteccao` / `origem`):
    //   · `origem:'manual'` OU `manual` presente → preservado como `manual.corte`
    //     (edição do usuário NUNCA é perdida);
    //   · `origem:'auto'`  → NÃO vira corte efetivo; vira `deteccao` (informação);
    //   · `automatico`     → `deteccao`;
    //   · `manual` (plano) → `manual.corte`.
    // O corte automático antigo NÃO continua ativo depois daqui: isso é
    // intencional. Ver `montarOverrideVideo`.
    overridesPorVideo: normalizarOverridesPorVideo(salva?.overridesPorVideo),
    // ESCOPO DE EDIÇÃO (toggle "Editar todos / Apenas este vídeo") e overrides
    // individuais de ÁREA. Normalizados aqui para que uma config salva NUNCA
    // volte com um override malformado (que viraria uma área inválida no
    // preview/render): só entram áreas com largura/altura utilizáveis.
    editarTodos: salva?.editarTodos !== false,
    areaPorVideo: Object.fromEntries(
      Object.entries(salva?.areaPorVideo || {})
        .filter(([, a]) => a && typeof a === 'object' && Number(a.largura) >= 2 && Number(a.altura) >= 2),
    ),
    // Arraste do vídeo: preserva o que já foi salvo (global e por vídeo) e
    // valida a região de trava. Campos ausentes em configs antigas = centralizado
    // / arrasto livre — exatamente o comportamento anterior.
    posicaoVideo: (() => {
      const p = salva?.posicaoVideo;
      if (!p || typeof p !== 'object') return criarPosicaoVideoPadrao();
      // `null`/`undefined` = CENTRALIZADO. `Number(null)` é 0 (finito!), então a
      // ausência precisa ser checada ANTES de converter — senão uma config salva
      // sem arrasto voltava com offset (0,0) e o vídeo ia para o canto.
      const n = (v) => (v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
      return {
        offsetX: n(p.offsetX),
        offsetY: n(p.offsetY),
      };
    })(),
    posicaoPorVideo: Object.fromEntries(
      Object.entries(salva?.posicaoPorVideo || {})
        .filter(([, p]) => p && typeof p === 'object'),
    ),
    limiteMovimento: (() => {
      const l = salva?.limiteMovimento;
      if (!l || typeof l !== 'object') return null;
      const vals = [Number(l.x), Number(l.y), Number(l.largura), Number(l.altura)];
      if (!vals.every(Number.isFinite)) return null;
      if (!(vals[2] >= 2 && vals[3] >= 2)) return null;
      return { x: vals[0], y: vals[1], largura: vals[2], altura: vals[3] };
    })(),
    logo: { ...base.logo, ...(salva?.logo || {}) },
    textos: {
      superior: { ...base.textos.superior, ...(salva?.textos?.superior || salva?.texto || {}) },
      inferior: { ...base.textos.inferior, ...(salva?.textos?.inferior || {}) },
    },
    identidade: {
      nome: { ...base.identidade.nome, ...(salva?.identidade?.nome || {}) },
      usuario: { ...base.identidade.usuario, ...(salva?.identidade?.usuario || {}) },
      selo: { ...base.identidade.selo, ...(salva?.identidade?.selo || {}) },
    },
    // IMAGENS (Editor em Lote): array de elementos de imagem independentes.
    // Sanitizado: só entram objetos com dataURL de imagem — nada herda de
    // configs antigas sem o campo (regra do lote limpo).
    imagens: (Array.isArray(salva?.imagens) ? salva.imagens : [])
      .filter((im) => im && typeof im.url === 'string' && im.url.startsWith('data:image/'))
      .map((im) => ({ ...criarImagemPadrao({ url: im.url, alturaProporcao: im.alturaProporcao, nome: im.nome }), ...im, url: im.url })),
    templateFundo: (() => {
      const t = salva?.templateFundo;
      const base0 = criarTemplateFundoPadrao();
      if (!t || typeof t.url !== 'string' || !t.url.startsWith('data:image/')) return base0;
      return {
        url: t.url,
        nome: typeof t.nome === 'string' ? t.nome.slice(0, 80) : '',
        larguraNatural: Number(t.larguraNatural) > 0 ? Number(t.larguraNatural) : 0,
        alturaNatural: Number(t.alturaNatural) > 0 ? Number(t.alturaNatural) : 0,
        visivel: t.visivel !== false,
      };
    })(),
  };
  // Logo: sem URL não há o que mostrar — opt-in estrito.
  if (!cfg.logo?.url) cfg.logo.visivel = false;
  // Textos: sem conteúdo não aparecem, mesmo com flag antiga visivel:true.
  for (const chave of ['superior', 'inferior']) {
    const t = cfg.textos[chave];
    if (String(t?.conteudo || '').trim() === '') t.visivel = false;
  }
  // Corrige sobreposição legada do inferior (nascia em y=12 igual ao superior).
  if (Number(cfg.textos.inferior?.y) <= 50) cfg.textos.inferior.y = 82;
  // Identidade: sem conteúdo não aparece.
  for (const chave of ['nome', 'usuario']) {
    const t = cfg.identidade[chave];
    if (String(t?.conteudo || '').trim() === '') t.visivel = false;
  }
  cfg.versaoConfig = VERSAO_CONFIG_EDITOR;
  return cfg;
}

/** Gate único do preview: texto da arte só aparece com opt-in + conteúdo. */
export function textoVisivelNoPreview(t) {
  return !!(t && t.visivel && String(t.conteudo || '').trim() !== '');
}

/** Gate único do preview: logo só aparece com opt-in + url. */
export function logoVisivelNoPreview(logo) {
  return !!(logo && logo.visivel && logo.url);
}

/** Gate único do preview: identidade só aparece com opt-in + conteúdo/selo. */
export function identidadeTextoVisivelNoPreview(t) {
  return textoVisivelNoPreview(t);
}
/** REGRA DEFINITIVA — detecta QUALQUER edição minha ativa na config (logo,
 * textos, identidade, cortes global e por vídeo). Usada ao encerrar um lote:
 * lote sem vídeos + config com edições → config é zerada para o próximo
 * import começar limpo (nada herda). Config virgem → false. */
export function loteTemEdicoesAtivas(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.logo?.url) return true;
  if (['superior', 'inferior'].some((k) => textoVisivelNoPreview(cfg.textos?.[k]))) return true;
  if (['nome', 'usuario'].some((k) => identidadeTextoVisivelNoPreview(cfg.identidade?.[k]))) return true;
  if (cfg.identidade?.selo?.visivel) return true;
  // IMAGENS: qualquer imagem visível é uma edição ativa (nada herda de lote).
  if ((cfg.imagens || []).some((im) => im && im.visivel)) return true;
  const corte = cfg.corteBordas || {};
  if (corte.ativo || Number(corte.superior) > 0 || Number(corte.inferior) > 0) return true;
  // ESCOPO INDIVIDUAL: só a EDIÇÃO MANUAL do usuário conta como edição ativa.
  // A `deteccao` (diagnóstico da máquina) NÃO conta — vídeo recém-importado com
  // detecção registrada não é "edição do usuário" e não precisa ser zerado.
  if (Object.values(cfg.overridesPorVideo || {}).some((o) => corteManualDaEntrada(o))) return true;
  // ESCOPO INDIVIDUAL: área override de algum vídeo = edição minha.
  if (Object.keys(cfg.areaPorVideo || {}).length > 0) return true;
  // Arraste do vídeo (posição global ou override de algum vídeo).
  const pos = cfg.posicaoVideo || {};
  if (Number.isFinite(Number(pos.offsetX)) || Number.isFinite(Number(pos.offsetY))) return true;
  if (Object.keys(cfg.posicaoPorVideo || {}).length > 0) return true;
  // Enquadramento do vídeo (zoom/mover no preview) também é edição minha.
  if (enquadramentoVideoEditado(cfg.areaVideo)) return true;
  return false;
}


/** FASE 2 — corte efetivo de UM vídeo: override individual vence o global.
 * `overridesPorVideo` = { [videoId]: { superior, inferior } }. Fail-open:
 * valores ausentes/inválidos → 0% (vídeo sem corte). Os limites (cada eixo
 * 0..CORTE_MAXIMO e soma ≤ CORTE_MAXIMO — margem mínima visível) são os
 * MESMOS que o render aplica no payload (mapearEditorLote → limitarCorte):
 * PRÉVIA = RENDER. */
/** FASE 2 — corte efetivo de UM vídeo: override individual vence o global.
 * `overridesPorVideo` = { [videoId]: { superior, inferior } }. Fail-open:
 * valores ausentes/inválidos → 0% (vídeo sem corte). Os limites (cada eixo
 * 0..CORTE_MAXIMO e soma ≤ CORTE_MAXIMO — margem mínima visível) são os
 * MESMOS que o render aplica no payload (mapearEditorLote → limitarCorte):
 * PRÉVIA = RENDER. */
/* ---------------------------------------------------------------------------
 * ESCOPO DE EDIÇÃO DO VÍDEO — "EDITAR TODOS" x "EDITAR APENAS ESTE VÍDEO".
 *
 * A chave `areaPorVideo` é o MESMO mecanismo de override que já existe para o
 * corte (`overridesPorVideo`) — NÃO é uma segunda arquitetura paralela. A
 * prioridade do valor efetivo é sempre a mesma, em toda a cadeia:
 *
 *   CONFIGURAÇÃO GLOBAL (`config.areaVideo` / `config.corteBordas`)
 *        ↓
 *   OVERRIDE ESPECÍFICO (`config.areaPorVideo[videoId]` / `overridesPorVideo[videoId]`)
 *        ↓
 *   VALOR EFETIVO (`areaVideoEfetivaDoVideo` / `corteEfetivoDoVideo`)
 *        ↓
 *   MESMO valor no preview (EditorCanvas) e no payload (mapearEditorLote)
 *
 * Um override só existe para o vídeo que foi editado INDIVIDUALMENTE; todo o
 * resto continua lendo o global. O que decide o valor efetivo é o ESCOPO
 * escolhido, e ele é materializado no estado (FASE 2):
 *   · "Apenas este vídeo" → o ajuste fica em `overridesPorVideo[id]`;
 *   · "Todos os vídeos"  → o ajuste vira o padrão do lote (`corteBordas`) e os
 *     ajustes individuais de CORTE dos vídeos são removidos, para que o global
 *     valha literalmente para todos. Área e posição têm os SEUS overrides e não
 *     são afetadas por essa remoção.
 * ------------------------------------------------------------------------- */

/** O usuário está no modo "Editar todos os vídeos"? (default = SIM: é o
 * comportamento histórico da config compartilhada — nada muda para quem já
 * usa o Editor sem tocar na chave). */
export function editarTodosOsVideos(config) {
  return config?.editarTodos !== false;
}

export function corteEfetivoDoVideo(config, videoId) {
  const global = config?.corteBordas || {};
  // ÚNICA fonte do corte efetivo por vídeo: a EDIÇÃO MANUAL. A `deteccao`
  // NUNCA entra aqui (um vídeo recém-importado fica sem corte efetivo mesmo
  // com detecção registrada) — ela só vira corte via "Usar detecção", que a
  // grava em `manual.corte`.
  const manual = videoId ? corteManualDoVideo(config, videoId) : null;
  const supRaw = manual ? manual.superior : (global.superior ?? 0);
  const infRaw = manual ? manual.inferior : (global.inferior ?? 0);
  const { superior, inferior } = limitarCorte(supRaw, infRaw, 'superior');
  const ativo = !!global.ativo || !!manual;
  return { ativo, superior, inferior };
}

/* ---------------------------------------------------------------------------
 * CORTE DE BORDAS — TRÊS CONCEITOS SEPARADOS, UM SÓ EFETIVO (funciona em LOTE).
 *
 * REGRA FUNDAMENTAL (FASE 0/FASE 1): um vídeo recém-importado NÃO pode nascer
 * com uma edição efetiva. A detecção automática CONTINUA existindo — como
 * DIAGNÓSTICO — mas NUNCA entra no render sozinha: só vira corte quando o
 * usuário pede explicitamente ("Usar detecção").
 *
 * Cada vídeo guarda as TRÊS coisas separadas dentro do SEU override
 * (`config.overridesPorVideo[videoId]`):
 *
 *   {
 *     manual: {                                    // (1) EDIÇÃO DO USUÁRIO
 *       corte:   { superior, inferior, em } | null,
 *       area:    null,   // reservado — a área tem o mecanismo próprio
 *       posicao: null,   // reservado — a posição tem o mecanismo próprio
 *     } | null,
 *
 *     deteccao: {                                  // (2) INFORMAÇÃO DA MÁQUINA
 *       superior, inferior, aplicavel, confiavel, em, detalhes,
 *     } | null,
 *
 *     origem: 'manual' | 'global' | 'nenhum',      // de onde vem o EFETIVO
 *
 *     // ESPELHOS LEGADOS (DERIVADOS — NUNCA são lidos como corte efetivo,
 *     // existem só para que leitores antigos continuem funcionando):
 *     superior, inferior, em,     // = manual.corte
 *     automatico,                 // = deteccao
 *   }
 *
 * · MANUAL (linhas/sliders/"Usar detecção") escreve/consulta `manual.corte`
 *   + o efetivo, com `origem:'manual'`;
 * · DETECÇÃO (`detectorBordas.js`) escreve/consulta SÓ `deteccao` — nunca o
 *   efetivo, nunca `manual`;
 * · `corteBordas` (global) é o default do template BASE e NÃO é tocado por
 *   nenhum ajuste por vídeo.
 *
 * DIFERENÇA DOCUMENTADA vs. a estrutura anterior: os campos `superior`,
 * `inferior`, `em` e `automatico` são mantidos no nível do override como
 * ESPELHOS DERIVADOS (só de `manual.corte` / `deteccao`), porque leitores já
 * existentes (testes, e2e) leem esses caminhos. Nenhum deles é lido pelo corte
 * efetivo: quem decide é `manual.corte`.
 * ------------------------------------------------------------------------- */

/** Extrai `{ superior, inferior, em }` de um bloco `manual` nos DOIS formatos:
 * o novo (`manual.corte`) e o legado (`manual` plano). `null` = SEM edição.
 *
 * `manual: { corte: null }` é o estado "sem corte manual" do formato NOVO e
 * devolve `null` — nunca um corte 0/0 (que seria uma edição fictícia e, pior,
 * ligaria o corte efetivo de um vídeo recém-importado). */
function corteDoBlocoManual(manual) {
  if (!manual || typeof manual !== 'object') return null;
  if ('corte' in manual) {
    const corte = manual.corte;
    if (!corte || typeof corte !== 'object') return null;
    return { superior: Number(corte.superior) || 0, inferior: Number(corte.inferior) || 0, em: corte.em ?? null };
  }
  // Legado: o próprio bloco `manual` é o corte.
  return { superior: Number(manual.superior) || 0, inferior: Number(manual.inferior) || 0, em: manual.em ?? null };
}

/** A entrada de override tem alguma MARCA de proveniência da máquina? (detecção
 * automática). Serve para distinguir "corte efetivo antigo" de "detecção". */
function temMarcadorDeDeteccao(over) {
  return over?.deteccao != null || over?.automatico != null || over?.origem === 'auto';
}

/**
 * CORTE EFETIVO DE EDIÇÃO MANUAL dentro de uma entrada de `overridesPorVideo`,
 * em qualquer um dos formatos já gravados. É a ÚNICA leitora tolerante ao
 * legado, usada pela normalização, pelo `montarOverrideVideo` e pelo
 * `corteManualDoVideo` — uma única regra para todos os três.
 *
 * NUNCA devolve um valor que venha de `deteccao`/`automatico`/`origem:'auto'`:
 * a detecção é informação e não pode virar corte efetivo.
 */
function corteManualDaEntrada(over) {
  if (!over || typeof over !== 'object') return null;
  // Formato novo (`manual.corte`) e legado (`manual` plano).
  const doBloco = corteDoBlocoManual(over.manual);
  if (doBloco) return doBloco;
  // `origem:'manual'` com % no topo: o valor efetivo É do usuário.
  if (over.origem === 'manual') {
    return { superior: Number(over.superior) || 0, inferior: Number(over.inferior) || 0, em: over.em ?? null };
  }
  // LEGADO SEM MARCADOR: % soltos e NENHUMA pista de detector. O formato
  // histórico sempre gravou `origem`, então isto é um override efetivo antigo,
  // sem proveniência de máquina → fail-open preservando a edição do usuário.
  if (!temMarcadorDeDeteccao(over) && over.origem == null && (over.superior != null || over.inferior != null)) {
    return { superior: Number(over.superior) || 0, inferior: Number(over.inferior) || 0, em: over.em ?? null };
  }
  return null;
}

/** Normaliza a INFORMAÇÃO da detecção. `null` quando nunca houve detecção. */
function blocoDeteccaoNormalizado(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    superior: Number(d.superior) || 0,
    inferior: Number(d.inferior) || 0,
    aplicavel: (d.aplicavel && typeof d.aplicavel === 'object') ? { ...d.aplicavel } : null,
    confiavel: d.confiavel == null ? null : !!d.confiavel,
    em: d.em ?? null,
    detalhes: d.detalhes ?? null,
  };
}

/** Monta a entrada de `overridesPorVideo` a partir dos TRÊS conceitos, gerando
 * também os espelhos legados derivados. É a ÚNICA forma de gravar o override:
 * nenhuma delas pode introduzir corte efetivo a partir da detecção.
 *
 * `descartarCorteManual` (FASE 2) é o caminho EXCLUSIVO do "Todos os vídeos":
 * apaga o `manual.corte` guardado em `anterior` em vez de reusá-lo, para que o
 * corte global passe a valer também para quem tinha ajuste próprio. TODO o resto
 * da entrada (área, posição, detecção) é PRESERVADO — some só o corte. */
function montarOverrideVideo({ anterior = null, corteManual = null, deteccao = null, descartarCorteManual = false } = {}) {
  const corte = corteManual ? { superior: corteManual.superior, inferior: corteManual.inferior, em: corteManual.em ?? Date.now() } : null;
  const det = blocoDeteccaoNormalizado(deteccao);
  const manualAnterior = descartarCorteManual ? null : corteManualDaEntrada(anterior);
  const deteccaoAnterior = blocoDeteccaoNormalizado(anterior?.deteccao ?? anterior?.automatico);
  const corteFinal = corte || manualAnterior;
  const detFinal = det || deteccaoAnterior;
  return {
    // (1) EDIÇÃO DO USUÁRIO
    manual: {
      corte: corteFinal ? { superior: corteFinal.superior, inferior: corteFinal.inferior, em: corteFinal.em } : null,
      // ÁREA e POSIÇÃO seguem os mecanismos PRÓPRIOS (`areaPorVideo` /
      // `posicaoPorVideo`); estes campos são apenas reserva dentro do override.
      // Mesmo reservados, são PRESERVADOS a cada regravação: nada aqui pode
      // apagar um dado que pertence a outro mecanismo.
      area: anterior?.manual?.area ?? null,
      posicao: anterior?.manual?.posicao ?? null,
    },
    // (2) INFORMAÇÃO DA MÁQUINA (nunca vira corte sozinha)
    deteccao: detFinal,
    // (3) ORIGEM DO CORTE EFETIVO
    origem: corteFinal ? 'manual' : (anterior || detFinal ? 'global' : 'nenhum'),
    // ESPELHOS LEGADOS DERIVADOS (leitura antiga; nunca fonte do efetivo)
    ...(corteFinal ? { superior: corteFinal.superior, inferior: corteFinal.inferior, em: corteFinal.em } : {}),
    automatico: detFinal,
  };
}

/** Leitura do ÚLTIMO resultado do detector para UM vídeo (null = nunca
 * detectou / não aplicável). É INFORMAÇÃO: nunca é lida como corte efetivo e
 * nunca é afetada por ajuste manual. */
export function corteAutomaticoDoVideo(config, videoId) {
  if (!config || !videoId) return null;
  const over = config?.overridesPorVideo?.[videoId];
  const det = blocoDeteccaoNormalizado(over?.deteccao ?? over?.automatico);
  if (!det) return null;
  return { superior: det.superior, inferior: det.inferior, em: det.em };
}

/** Leitura do ÚLTIMO AJUSTE MANUAL do usuário (null = nunca mexeu). É a ÚNICA
 * fonte do corte efetivo por vídeo. Aceita o formato novo (`manual.corte`) e
 * o legado (`manual` plano), para as configs já gravadas continuarem válidas. */
export function corteManualDoVideo(config, videoId) {
  if (!config || !videoId) return null;
  return corteManualDaEntrada(config?.overridesPorVideo?.[videoId]);
}

/** Verdadeiro quando o corte EFETIVO do vídeo veio da edição do usuário (linha
 * / slider / "Usar detecção") e não da detecção automática. */
export function corteEhManual(config, videoId) {
  return !!corteManualDoVideo(config, videoId);
}

/** O objeto de override SOLTO (uma entrada crua de `overridesPorVideo`) carrega
 * um corte EFETIVO EDITADO pelo usuário? Usado pelo `configParaTemplatePayload`
 * para decidir se um override cru pode virar corte no render.
 *
 * REGRA FUNDAMENTAL: uma entrada marcada como DETECÇÃO (`deteccao`,
 * `automatico` ou `origem:'auto'`) sem bloco `manual` NUNCA traz corte — a
 * detecção é diagnóstico. */
export function overrideTrazCorteManual(override) {
  if (!override || typeof override !== 'object') return false;
  if (temMarcadorDeDeteccao(override) && !override.manual) return false;
  return !!corteManualDaEntrada(override);
}

/** ESCRITA DA DETECÇÃO — chamada EXCLUSIVAMENTE pelo `detectorBordas.js`.
 *
 * REGRA FUNDAMENTAL: aqui a máquina grava SÓ INFORMAÇÃO (`deteccao`). Ela
 * NUNCA cria corte manual, NUNCA promove a efetivo e NUNCA sobrescreve a edição
 * do usuário. Um vídeo recém-importado, portanto, fica SEM corte efetivo
 * mesmo quando a detecção encontra uma barra. */
export function definirCorteAutomaticoDoVideo(config, videoId, deteccao) {
  if (!config || !videoId) return config;
  return {
    ...config,
    overridesPorVideo: {
      ...(config.overridesPorVideo || {}),
      [videoId]: montarOverrideVideo({
        anterior: config?.overridesPorVideo?.[videoId] || null,
        // NUNCA um `corteManual` aqui: a detecção não edita o corte efetivo.
        corteManual: null,
        deteccao,
      }),
    },
  };
}

/** ESCRITA MANUAL — chamada pelas LINHAS do canvas e pelos sliders do painel.
 * Toca SÓ no override DESTE vídeo (nunca no `corteBordas` global: os demais
 * vídeos do lote não podem herdar o corte de quem o usuário mexeu). Preserva a
 * `deteccao` intacta para a interface mostrar as DUAS origens. */
export function ajustarCorteManualDoVideo(config, videoId, cambios) {
  if (!config || !videoId || !cambios) return config;
  const efetivo = corteEfetivoDoVideo(config, videoId);
  const mudaSuperior = Object.prototype.hasOwnProperty.call(cambios, 'superior');
  const mudaInferior = Object.prototype.hasOwnProperty.call(cambios, 'inferior');
  if (!mudaSuperior && !mudaInferior) return config;
  const par = {
    superior: mudaSuperior ? Number(cambios.superior) || 0 : efetivo.superior,
    inferior: mudaInferior ? Number(cambios.inferior) || 0 : efetivo.inferior,
  };
  // A linha que se move PARA no limite: o eixo ESTÁTICO mantém o valor, o
  // eixo mexido cede (margem mínima visível garantida nos DOIS destinos).
  const prioridade = mudaSuperior && !mudaInferior ? 'inferior' : 'superior';
  const limitado = limitarCorte(par.superior, par.inferior, prioridade);
  return {
    ...config,
    overridesPorVideo: {
      ...(config.overridesPorVideo || {}),
      [videoId]: montarOverrideVideo({
        anterior: config?.overridesPorVideo?.[videoId] || null,
        corteManual: { ...limitado, em: Date.now() },
        deteccao: null,
      }),
    },
  };
}

/** "USAR DETECÇÃO" — ação EXPLICITA do usuário (botão do painel).
 *
 * Copia a INFORMAÇÃO da detecção para `manual.corte` e a detém pelos MESMOS
 * limites do corte manual (`limitarCorte`): a partir daqui o corte passa a ser
 * uma edição do usuário (mesma travessa do arraste/manual, mesma margem
 * mínima visível). Sem detecção gravada, o corte do vídeo é removido. */
export function usarCorteAutomaticoDoVideo(config, videoId) {
  if (!config || !videoId) return config;
  const anterior = config?.overridesPorVideo?.[videoId] || null;
  const deteccao = corteAutomaticoDoVideo(config, videoId);
  const overrides = { ...(config.overridesPorVideo || {}) };
  if (!deteccao) {
    delete overrides[videoId];
    return { ...config, overridesPorVideo: overrides };
  }
  // MESMOS limites usados pelo corte manual — prévia = render.
  const limitado = limitarCorte(deteccao.superior, deteccao.inferior, 'superior');
  overrides[videoId] = montarOverrideVideo({
    anterior,
    corteManual: { ...limitado, em: Date.now() },
    deteccao,
  });
  return { ...config, overridesPorVideo: overrides };
}

/** DESLIGA o corte DESTE vídeo (prévia e render juntos). O corte global
 * (template BASE dos vídeos sem override) não é tocado. */
export function limparCorteDoVideo(config, videoId) {
  if (!config || !videoId) return config;
  const overrides = { ...(config.overridesPorVideo || {}) };
  delete overrides[videoId];
  return { ...config, overridesPorVideo: overrides };
}

/** RESUMO das TRÊS camadas de um vídeo — alimenta a interface sem repetir a
 * lógica de leitura nos componentes. `automatico` é o NOME LEGADO do bloco
 * `deteccao` (mantido para o JSX já existir); `deteccao` é o nome novo. */
export function resumoDoCorteDoVideo(config, videoId) {
  const automatico = corteAutomaticoDoVideo(config, videoId);
  const manual = corteManualDoVideo(config, videoId);
  const over = config?.overridesPorVideo?.[videoId] || null;
  const efetivo = corteEfetivoDoVideo(config, manual ? videoId : null);
  return {
    temCorte: !!manual,
    origem: over?.origem || null,
    // Nome legado (mesma informação) + nome novo.
    automatico,
    deteccao: automatico,
    manual,
    efetivo: { superior: efetivo.superior, inferior: efetivo.inferior },
  };
}

/** FONTE ÚNICA DE ESCRITA do corte de bordas (painel ⇄ preview ⇄ render).
 * Slider do painel, arraste das linhas no Preview e o olho da camada usam
 * ESTA função — nunca estados separados:
 *
 * · { superior | inferior } (slider OU linha arrastada): escreve o eixo no
 *   GLOBAL (config compartilhada do lote) E no override do vídeo atual
 *   (origem 'manual') — os MESMOS valores que o preview recorta (clip-path
 *   via corteEfetivoDoVideo) e que o render materializa (payload com override
 *   → ativo:true). A margem mínima é imposta por `limitarCorte` com
 *   prioridade ao eixo ESTÁTICO: a linha que se move para antes de cruzar a
 *   outra (nunca área inválida, nunca o vídeo desaparecendo).
 * · { ativo: true } (toggle/olho): liga a chave REAL do render (global).
 * · { ativo: false }: desliga a chave do render E remove o override do vídeo
 *   atual — o corte deste vídeo desliga DE VERDADE (preview e render juntos;
 *   as linhas permanecem só como referência visual). */
export function atualizarCorteNoConfig(cfg, videoId, cambios) {
  const base = cfg && typeof cfg === 'object' ? cfg : {};
  const efetivo = corteEfetivoDoVideo(base, videoId || null);
  const globalAntes = base.corteBordas || {};
  const overAntes = (videoId && base.overridesPorVideo?.[videoId]) || null;

  if (!('superior' in cambios) && !('inferior' in cambios)) {
    // TOGGLE (chave real do render): ativo/desativo + override do vídeo fora.
    const global = { ...globalAntes, ativo: !!cambios.ativo };
    if (!cambios.ativo && videoId && base.overridesPorVideo?.[videoId]) {
      const overrides = { ...(base.overridesPorVideo || {}) };
      delete overrides[videoId];
      return { ...base, corteBordas: global, overridesPorVideo: overrides };
    }
    return { ...base, corteBordas: global };
  }

  // MUDANÇA DE VALOR (slider do painel OU arraste da linha no preview).
  const mudaSuperior = 'superior' in cambios;
  const par = {
    superior: mudaSuperior ? Number(cambios.superior) || 0 : efetivo.superior,
    inferior: 'inferior' in cambios ? Number(cambios.inferior) || 0 : efetivo.inferior,
  };
  // A linha que se move PARA no limite: o eixo ESTÁTICO mantém o valor, o
  // eixo mexido cede (margem mínima visível garantida nos DOIS destinos).
  const prioridade = mudaSuperior && !('inferior' in cambios) ? 'inferior' : 'superior';
  const limitado = limitarCorte(par.superior, par.inferior, prioridade);

  // O corte do lote grava o par INTEIRO (`limitado`), não só o eixo mexido.
  // Motivo (FASE 2): com "Todos os vídeos" o global passa a valer para TODOS, e
  // ele tem de ser exatamente o par que o usuário está VENDO no vídeo editado.
  // Se só o eixo mexido fosse gravado, o outro eixo ficaria com o valor global
  // ANTIGO (ex.: global 50/50, vídeo em 30/10, arrastando o topo para 40 daria
  // global 40/50) — o resto do lote sairia cortado com um valor que ninguém viu
  // e que o usuário não pediu. `limitado` já carrega o eixo estático correto
  // (o `efetivo` do vídeo), respeitando a prioridade dos eixos do `limitarCorte`.
  const global = {
    ...globalAntes,
    // O caminho GLOBAL precisa LIGAR a chave real do render: `pipelineCompleto`
    // só materializa o `drawbox` quando `corteBordas.ativo === true`. Sem isto,
    // mexer no corte com "Editar todos" gravaria o valor mas o vídeo final sairia
    // SEM corte (divergência preview x render). Quem grava valor está, por
    // definição, ligando um corte — então `ativo` vai para true junto.
    ativo: true,
    superior: limitado.superior,
    inferior: limitado.inferior,
  };
  // ESCOPO — o toggle "Editar todos / Apenas este vídeo" decide ONDE o corte é
  // gravado. Reusa o MESMO mecanismo `overridesPorVideo` (nada novo):
  //   · "Apenas este VÍDEO"     → escreve SÓ no override deste id (comportamento
  //     histórico, preservado).
  //   · "Todos os VÍDEOS"      → escreve no GLOBAL e remove o ajuste manual
  //     individual dos vídeos que tinham um, para que o global valha LITERALMENTE
  //     para todos (FASE 2). Sem essa remoção, o `manual.corte` continuaria
  //     vencendo o global em `corteEfetivoDoVideo` e o escopo não seria literal.
  if (videoId && editarTodosOsVideos(base) === false) {
    // REGRA DO LOTE: com vídeo selecionado e o escopo individual, o ajuste é
    // INDIVIDUAL — escreve SÓ no override deste vídeo. O `corteBordas` global
    // (default do template BASE, dos vídeos SEM override) é preservado intacto:
    // mexer no vídeo A NUNCA pode empurrar o mesmo corte para B, C, D…
    //
    // A escrita passa por `montarOverrideVideo` (fonte ÚNICA da estrutura
    // `manual`/`deteccao`/`origem`): aqui NUNCA há corte efetivo vindo da
    // detecção — só do gesto do usuário. `limitado` já é o valor final (calculado
    // sobre o efetivo, que por sua vez já considera o manual existente).
    const em = Date.now();
    const overridesPorVideo = { ...(base.overridesPorVideo || {}) };
    overridesPorVideo[videoId] = montarOverrideVideo({
      anterior: overAntes,
      corteManual: { superior: limitado.superior, inferior: limitado.inferior, em },
      deteccao: null,
    });
    return { ...base, overridesPorVideo };
  }
  // GLOBAL: o corte é o PADRÃO DO LOTE e precisa valer para TODOS. Por isso o
  // ajuste manual individual dos vídeos é REMOVIDO (só ele — área, posição e a
  // informação de detecção permanecem intactos). Não existe precedência
  // escondida: quem decide é o escopo escolhido, materializado no estado.
  return { ...removerCortesIndividuais(base), corteBordas: global };
}

/* ---------------------------------------------------------------------------
 * ESCOPO DE EDIÇÃO DO VÍDEO ( continuação) — helpers de ÁREA do enquadramento.
 * (A peça do `editarTodosOsVideos` e da precedência está acima de
 * `corteEfetivoDoVideo`, porque `atualizarCorteNoConfig` também depende dela.)
 * ------------------------------------------------------------------------- */

/** Campos de área que um override individual carrega (o resto do objeto
 * `areaVideo` — canvas, templateFundo — permanece na config compartilhada). */
const CAMPOS_AREA = ['x', 'y', 'largura', 'altura', 'fit', 'zoom', 'deslocamentoX', 'deslocamentoY', 'conteudoX', 'conteudoY', 'conteudoLargura', 'conteudoAltura', 'mostrarMarcacao'];

/** ÁREA EFETIVA de UM vídeo (global ⊕ override individual). É esta função — e
 * só ela — que o preview e o payload consomem: prévia e render NUNCA podem
 * divergir porque ambos partem daqui. Fail-open: override inválido/incompleto
 * é ignorado e o vídeo volta ao global (nunca quebra o preview). */
export function areaVideoEfetivaDoVideo(config, videoId) {
  const global = config?.areaVideo || {};
  const over = videoId ? config?.areaPorVideo?.[videoId] : null;
  if (!over || typeof over !== 'object') return global;
  // Só aceita o override quando ele descreve uma área USÁVEL (moldura válida).
  // Um override parcial/corrompido NUNCA pode sumir com a área do vídeo.
  if (!(Number(over.largura) >= 2 && Number(over.altura) >= 2)) return global;
  return { ...global, ...over };
}

/** Há override de área individual para este vídeo? (só o agrupamento/payload
 * precisam saber — a UI nunca apaga nada por causa disso). */
export function areaIndividualDoVideo(config, videoId) {
  const over = videoId ? config?.areaPorVideo?.[videoId] : null;
  if (!over || typeof over !== 'object') return null;
  if (!(Number(over.largura) >= 2 && Number(over.altura) >= 2)) return null;
  return over;
}

/**
 * FONTE ÚNICA DE ESCRITA da área do vídeo, respeitando o ESCOPO escolhido.
 *
 * · `todos=true`  → escreve no GLOBAL (`areaVideo`). Override individual já
 *   existente NÃO é tocado: quem foi editado sozinho continua com o seu valor
 *   (é exatamente a exigência de não perder estado ao voltar para "todos").
 * · `todos=false` → escreve SÓ no override deste vídeo, pelo seu `id`.
 *   Os demais vídeos (com e sem override próprio) seguem intactos.
 *
 * `mudancas` é aplicado sobre a área EFETIVA de partida, para que arrastar a
 * moldura a partir de uma área já override não apague o resto dos campos.
 */
export function atualizarAreaVideoNoConfig(config, { todos = true, videoId = null, mudancas = {} } = {}) {
  if (!config || !mudancas || typeof mudancas !== 'object') return config;
  // Sem vídeo selecionado não existe escopo individual: cai no global (comportamento
  // histórico e único lugar onde ainda dá para mexer na área compartilhada).
  const individual = todos === false && !!videoId;
  const base = areaVideoEfetivaDoVideo(config, individual ? videoId : null);
  const proxima = { ...base, ...mudancas };
  if (individual) {
    const salvo = {};
    for (const campo of CAMPOS_AREA) {
      if (proxima[campo] !== undefined) salvo[campo] = proxima[campo];
    }
    return {
      ...config,
      areaPorVideo: { ...(config.areaPorVideo || {}), [videoId]: salvo },
    };
  }
  return { ...config, areaVideo: proxima };
}

/* ===========================================================================
 * ESCOPO "EDITAR TODOS" — VISIBILIDADE DOS AJUSTES INDIVIDUAIS
 *
 * O QUE "TODOS OS VÍDEOS" SIGNIFICA HOJE (comportamento PRESERVADO):
 *   aplica a alteração no valor GLOBAL e PRESERVA todo override individual já
 *   existente. É uma escolha deliberada (nunca perder o ajuste que o usuário
 *   fez vídeo a vídeo) — e é a razão de, num lote com histórico, alguns vídeos
 *   ficarem visualmente diferentes mesmo com "Todos os vídeos" ligado.
 *
 * NADA aqui muda essa regra. Estas funções existem para que o resultado fique
 * PREVISÍVEL: a interface passa a dizer QUAIS vídeos mantêm valor próprio e
 * por quê, e oferece a uniformização como uma AÇÃO EXPLÍCITA (nunca silenciosa).
 * =========================================================================== */

/** Um vídeo TEM ajuste individual (EDITADO PELO USUÁRIO) de CORTE?
 * CONCEITO: "ajuste próprio" = SOMENTE edição manual. A detecção automática é
 * diagnóstico (`deteccao`) e NÃO conta como ajuste próprio do usuário. */
export function temAjusteIndividualDeCorte(config, videoId) {
  return !!corteManualDoVideo(config, videoId);
}

/** Um vídeo TEM ajuste individual de ÁREA / enquadramento? */
export function temAjusteIndividualDeArea(config, videoId) {
  return !!areaIndividualDoVideo(config, videoId);
}

/** Um vídeo TEM ajuste individual de POSIÇÃO (X/Y)? */
export function temAjusteIndividualDePosicao(config, videoId) {
  const p = config?.posicaoPorVideo?.[videoId];
  if (!p || typeof p !== 'object') return false;
  return p.offsetX != null || p.offsetY != null;
}

/**
 * QUAIS VÍDEOS DO LOTE CONTINUAM DIFERENTES despite "Todos os vídeos".
 *
 * Só os vídeos que realmente estão no lote são contados (ids obsoletos de
 * sessões/lotes anteriores não poluem o aviso).
 *
 * @param {Object} config
 * @param {{id:string, nome?:string}[]} [itens] vídeos presentes no Editor
 * @returns {{total:number, videos:Array<{id:string,nome:string,tipos:string[]}>,
 *            porTipo:{corte:number, area:number, posicao:number}}}
 */
export function resumoDosAjustesIndividuais(config, itens = []) {
  const lista = Array.isArray(itens) ? itens.filter((it) => it && it.id) : [];
  const videos = [];
  const porTipo = { corte: 0, area: 0, posicao: 0 };
  for (const it of lista) {
    // `chave` = canônico (usado no contador); `rotulo` = o que o usuário lê.
    const encontrados = [
      { chave: 'corte', rotulo: 'corte', tem: temAjusteIndividualDeCorte(config, it.id) },
      { chave: 'area', rotulo: 'área', tem: temAjusteIndividualDeArea(config, it.id) },
      { chave: 'posicao', rotulo: 'posição', tem: temAjusteIndividualDePosicao(config, it.id) },
    ].filter((t) => t.tem);
    if (encontrados.length === 0) continue;
    encontrados.forEach((t) => { porTipo[t.chave] += 1; });
    videos.push({ id: it.id, nome: it.nome || null, tipos: encontrados.map((t) => t.rotulo) });
  }
  return { total: videos.length, videos, porTipo };
}

/**
 * UNIFORMIZA O LOTE — ação EXPLICITA, nunca automática.
 *
 * Remove os overrides individuais dos vídeos informados, para que TODOS passem
 * a ler o valor global. É a única forma de "Todos os vídeos" valer literalmente
 * para quem foi ajustado antes, e por isso é sempre disparada por um botão com
 * confirmação na interface (nunca junto com a edição em lote).
 *
 * O que é removido, por vídeo:
 *   · `overridesPorVideo[id]`  — corte individual (automático OU manual)
 *   · `areaPorVideo[id]`       — área/enquadramento individual
 *   · `posicaoPorVideo[id]`    — posição X/Y individual
 *
 * ⚠️ RISCO (assumido conscientemente pelo botão): cortes AUTOMÁTICOS
 * detectados pixel a pixel também vivem em `overridesPorVideo` e serão
 * perdidos — o vídeo volta ao corte global do lote. Por isso a confirmação na
 * interface diz explicitamente quantos cortes automáticos serão afetados.
 *
 * @param {Object} config
 * @param {string[]} videoIds ids a uniformizar (ids fora da lista são ignorados)
 */
export function uniformizarAjustesIndividuais(config, videoIds = []) {
  if (!config) return config;
  const ids = new Set((Array.isArray(videoIds) ? videoIds : []).filter(Boolean));
  if (ids.size === 0) return config;
  const overridesPorVideo = { ...(config.overridesPorVideo || {}) };
  const areaPorVideo = { ...(config.areaPorVideo || {}) };
  const posicaoPorVideo = { ...(config.posicaoPorVideo || {}) };
  for (const id of ids) {
    delete overridesPorVideo[id];
    delete areaPorVideo[id];
    delete posicaoPorVideo[id];
  }
  return { ...config, overridesPorVideo, areaPorVideo, posicaoPorVideo };
}

/** Quantas DETECÇÕES AUTOMÁTICAS serão perdidas se os `videoIds` forem
 * uniformizados. A detecção é diagnóstico (informação), não corte efetivo —
 * o que se perde é o registro informativo de `deteccao`. */
export function cortesAutomaticosAfetados(config, videoIds = []) {
  return (Array.isArray(videoIds) ? videoIds : []).filter((id) => !!corteAutomaticoDoVideo(config, id)).length;
}

/* ===========================================================================
 * FASE 2 — "TODOS OS VÍDEOS" É LITERAL.
 *
 * O bug: com `editarTodos === true`, `atualizarCorteNoConfig` escrevia SÓ em
 * `corteBordas` e deixava cada `manual.corte` no lugar. Como o manual vence o
 * global em `corteEfetivoDoVideo`, o usuário via "Todos os vídeos" e o corte
 * NÃO valia para todos. Não existe precedência escondida: o que faz o global
 * valer para todos é REMOVER o ajuste individual que o escondia.
 *
 * A remoção é cirúrgica — some SOMENTE `manual.corte` (e os espelhos legados
 * derivados dele). NUNCA são tocados: `deteccao` (informação da máquina, ainda
 * disponível para "Usar detecção"), `manual.area`, `manual.posicao`,
 * `areaPorVideo` e `posicaoPorVideo` (mecanismos próprios e independentes).
 * =========================================================================== */

/**
 * QUAIS VÍDEOS TÊM AJUSTE INDIVIDUAL DE CORTE — os que serão afetados quando o
 * usuário editar o corte com "Todos os vídeos" ligado (é a base da auditoria e
 * do aviso de substituição na interface). Só `manual.corte` conta: a `deteccao`
 * é diagnóstico e jamais é removida por aqui.
 *
 * @param {Object} config
 * @param {string[]} [videoIds] limita a busca a estes ids (ids fora do lote são
 *   simplesmente ignorados). Sem o argumento, varre todo o `overridesPorVideo`.
 * @returns {string[]}
 */
export function cortesIndividuaisAfetados(config, videoIds = null) {
  const todos = config?.overridesPorVideo || {};
  const chaves = Array.isArray(videoIds) ? videoIds.filter(Boolean) : Object.keys(todos);
  return chaves.filter((id) => temAjusteIndividualDeCorte(config, id));
}

/**
 * REMOVE o ajuste individual de CORTE dos vídeos informados (FASE 2).
 *
 * Usada quando "Todos os vídeos" grava o corte global: sem isso o global
 * perderia para quem tivesse ajuste próprio e o escopo não seria literal.
 *
 * O que cada vídeo perde: EXCLUSIVAMENTE `manual.corte` e os espelhos legados
 * derivados dele (`superior`/`inferior`/`em`). Tudo o resto é preservado:
 *   · `deteccao`  — a detecção automática continua disponível para
 *                   "Usar detecção" (é INFORMAÇÃO, não corte efetivo);
 *   · `manual.area` / `manual.posicao` — reservas de outros mecanismos;
 *   · `areaPorVideo` / `posicaoPorVideo` — nem são tocados (chaves inteiras);
 *   · `automatico` — espelho derivado da detecção, também preservado.
 *
 * Se o vídeo não tiver mais NADA (nem corte, nem detecção, nem área/posição),
 * a entrada é removida do mapa: um override vazio não tem significado e
 * poluiria a auditoria. Vídeos fora do lote (ids obsoletos) são ignorados.
 *
 * @param {Object} config
 * @param {string[]} [videoIds] ids a limpar; sem o argumento, todos.
 * @returns {Object} nova config (imutável). Devolve a mesma referência quando
 *   não há nada a remover.
 */
export function removerCortesIndividuais(config, videoIds = null) {
  if (!config) return config;
  const ids = cortesIndividuaisAfetados(config, videoIds);
  if (ids.length === 0) return config;
  const alvo = new Set(ids);
  const anteriores = config.overridesPorVideo || {};
  const overridesPorVideo = {};
  for (const [id, entrada] of Object.entries(anteriores)) {
    // Só os vídeos COM corte manual entram na limpeza — um vídeo que só tem
    // `deteccao` (ou nada) atravessa a operação intacto.
    if (!alvo.has(id)) { overridesPorVideo[id] = entrada; continue; }
    const limpo = montarOverrideVideo({
      anterior: entrada,
      // NUNCA um `corteManual` aqui: o corte efetivo passa a ser o GLOBAL.
      corteManual: null,
      deteccao: null,
      // O ponto da operação: o corte manual anterior é DESCARTADO, não reusado.
      descartarCorteManual: true,
    });
    // Sobrou alguma informação (detecção, área ou posição)? Então a entrada
    // continua existindo, sem o corte. Não sobrou nada? Ela sai do mapa.
    const sobrouAlgo = !!limpo.deteccao || !!limpo.manual.area || !!limpo.manual.posicao;
    if (sobrouAlgo) overridesPorVideo[id] = limpo;
  }
  return { ...config, overridesPorVideo };
}


/** Devolve uma cópia da área com `conteudoX/Y/Largura/Altura` removidos —
 * volta o enquadramento ao cover sobre a área. Usado pelo botão "Redefinir" e
 * pela re-marcação da área (a área marcada é o container real do vídeo, então
 * uma caixa de conteúdo antiga não pode sobreviver a ela). */
export function areaSemCaixaDeConteudo(area) {
  const { conteudoX, conteudoY, conteudoLargura, conteudoAltura, ...resto } = area || {};
  return resto;
}

export function criarConfigPadrao() {
  return {
    // FASE 1 — PREVIEW FIEL: estado inicial = vídeo original sem edição minha.
    // Logo/textos/identidade nascem desligados (opt-in). Fundo BRANCO padrão:
    // a área revelada pelo corte (manual ou automático) mostra o fundo puro —
    // o MESMO `corFundo` que o render final usa, prévia e render idênticos.
    // O usuário pode escolher outra cor (CORES_FUNDO) e ela vence.
    canvas: {
      largura: CANVAS_LARGURA,
      altura: CANVAS_ALTURA,
      corFundo: '#ffffff',
    },
    // Área do vídeo: onde o vídeo encaixa (px do canvas — formato do template
    // do servidor). fit: 'cobrir' | 'ajustar' (o mesmo do pipeline FFmpeg).
    // ESCOPO DE EDIÇÃO — true = "Editar todos os vídeos" (config compartilhada,
    // comportamento histórico). false = "Apenas este vídeo": cada ajuste vai
    // para `areaPorVideo[videoId]`/`overridesPorVideo[videoId]` e só o vídeo
    // selecionado muda. Ver `editarTodosOsVideos`.
    editarTodos: true,
    // ÁREA do vídeo (container real onde o vídeo é enquadrado), em px do canvas.
    areaVideo: {
      x: 0,
      y: 0,
      largura: CANVAS_LARGURA,
      altura: CANVAS_ALTURA,
      fit: 'cobrir',
      // ENQUADRAMENTO DO VÍDEO (mouse): zoom + posição dentro da área, em %
      // (50 = centro). Mesma estrutura compartilhada do lote → prévia e render
      // usam exatamente estes valores (nada de coordenadas de tela).
      ...ENQUADRAMENTO_VIDEO_PADRAO,
      // DESLIGADO por padrão: o vídeo importado aparece NORMAL, sem véu
      // azul/roxo. A ferramenta continua existindo (arrastar/redimensionar
      // funciona); só o guia visual nasce oculto. Não vai ao backend.
      mostrarMarcacao: false,
    },
    // RETÂNGULO VAZADO DO TEMPLATE (CONCEITO SEPARADO de `areaVideo`):
    // é o retângulo que a arte do template deixa vazar para o vídeo aparecer.
    // `null` = SEM buraco (o template é arte cheia por cima do vídeo).
    // NUNCA reduz o vídeo: `areaVideo` acima é a posição FÍSICA dele e
    // permanece o canvas inteiro (0,0,1080×1920) mesmo com template.
    areaTemplate: null,
    // CORTE DE BORDAS: corte ESPACIAL superior/inferior do vídeo ORIGINAL
    // (percentuais da altura). Compartilhado por todo o lote; entra no mesmo
    // filtergraph do FFmpeg (single-pass — nada de MP4 intermediário).
    // Superior e inferior son TOTALMENTE INDEPENDENTES (solo superior, solo
    // inferior o ambos con valores distintos — cambiar uno no altera el otro).
    // Padrón: desactivado, 0% + 0%. Nome UNIFICADO `corteBordas` (front/back).
    corteBordas: {
      ativo: false,
      superior: 0,
      inferior: 0,
    },
    // FASE 2 — overrides INDIVIDUAIS do auto-crop: { [videoId]: { superior,
    // inferior, origem:'auto'|'manual', em: timestamp } }. O global continua
    // valendo para ajuste fino; o override vence por vídeo no preview e no
    // render. Não vai inteiro ao template — o lote envia por vídeo (Fase 3).
    overridesPorVideo: {},
    // ESCOPO INDIVIDUAL DA ÁREA (único mecanismo de override do enquadramento,
    // espelhando `overridesPorVideo` do corte): { [videoId]: areaVideo }.
    // SÓ é criado quando o usuário edita com "Apenas este vídeo" LIGADO. Com
    // "Editar todos" a chave fica vazia e todos os vídeos leem o global — então
    // alternar o toggle JAMAIS apaga o que já foi individual.
    areaPorVideo: {},
    // POSIÇÃO DO VÍDEO SOBRE O TEMPLATE (arrasto, px da base 1080×1920).
    // `null` = centralizado (nada gravado). Mesmo esquema global ⊕ por vídeo
    // do corte e da área, então o escopo "Editar todos" vale igual.
    posicaoVideo: criarPosicaoVideoPadrao(),
    posicaoPorVideo: {},
    // REGIÃO QUE TRAVA O ARRASTO do vídeo (px do canvas). `null` = arrasto
    // livre (padrão). Só é honrado se existir uma região válida — nunca é
    // inventada automaticamente.
    limiteMovimento: null,
    // Logo: pertence à config compartilhada; nunca extraída automaticamente.
    // x em % marca o CENTRO da logo (a prévia usa translate(-50%, 0)); a
    // conversão p/ px desloca metade da largura. alturaProporcao = altura /
    // largura da imagem (capturada ao carregar) — define a altura em px do
    // template (o overlay do servidor usa largura × altura).
    logo: {
      url: null,
      arquivo: null,
      // dataURL persistido da logo (sobrevive ao reload). Nasce null — sem
      // ressurreição de logo de sessão anterior (regra definitiva).
      logoDataUrl: null,
      alturaProporcao: null,
      x: 50,
      y: 8,
      largura: 22,
      opacidade: 100,
      visivel: false,
    },
    // Texto: DOS textos INDEPENDENTES (superior e inferior), cada uno con su
    // contenido, posición, tamaño, largura/altura, fonte, peso, cor,
    // alineación, opacidad y visibilidade propias. Fijos para todo el lote
    // (config compartida; viajan DENTRO del template como `texto.contenido`
    // e `textoInferior.contenido` — NÃO se usa tituloIA neste fluxo). El
    // procesamiento quiebra líneas, alinea horizontalmente e usa la fonte/
    // peso elegidos — la prévia lo refleja tudo em tempo real.
    textos: {
      superior: textoPadrao('superior'),
      inferior: textoPadrao('inferior'),
    },
    // Identidade do canal (logo + nome + @ + selo azul) — compartilhada por
    // todo o lote; elementos editáveis no painel e direto no canvas.
    identidade: criarIdentidadePadrao(),
    // TEMPLATE DE FUNDO IMPORTADO (PNG/imagem) - camada visual propria.
    templateFundo: criarTemplateFundoPadrao(),
    // IMAGENS (Editor em Lote): elementos de imagem independentes — nasce
    // vazio (regra de lote limpo; nada herda de sessões anteriores).
    imagens: [],
  };
}
