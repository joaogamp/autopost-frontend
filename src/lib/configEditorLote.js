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
 * para que prévia e render usem a mesma geometria. */
export function areaVideoNormalizada(area) {
  const a = area && typeof area === 'object' ? area : {};
  return {
    ...a,
    fit: 'cobrir',
    zoom: normalizarZoomVideo(a.zoom),
    deslocamentoX: normalizarDeslocamentoVideo(a.deslocamentoX ?? ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoX),
    deslocamentoY: normalizarDeslocamentoVideo(a.deslocamentoY ?? ENQUADRAMENTO_VIDEO_PADRAO.deslocamentoY),
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

/** Rótulo curto do vídeo no lote (vídeo 01, vídeo 02, ...). */
export function rotuloDeVideo(indice) {
  return `vídeo ${String(indice + 1).padStart(2, '0')}`;
}

/** Versão da config persistida (migração v1 → v2 opt-in). */
export const VERSAO_CONFIG_EDITOR = 2;

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
    corteBordas: { ...base.corteBordas, ...(salva?.corteBordas || {}) },
    overridesPorVideo: { ...(salva?.overridesPorVideo || {}) },
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
  if (Object.keys(cfg.overridesPorVideo || {}).length > 0) return true;
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
export function corteEfetivoDoVideo(config, videoId) {
  const global = config?.corteBordas || {};
  const over = videoId ? config?.overridesPorVideo?.[videoId] : null;
  const supRaw = over?.superior ?? global.superior ?? 0;
  const infRaw = over?.inferior ?? global.inferior ?? 0;
  const { superior, inferior } = limitarCorte(supRaw, infRaw, 'superior');
  const ativo = !!global.ativo || !!over;
  return { ativo, superior, inferior };
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

  const global = {
    ...globalAntes,
    ...(mudaSuperior ? { superior: limitado.superior } : {}),
    ...('inferior' in cambios ? { inferior: limitado.inferior } : {}),
  };
  const overridesPorVideo = { ...(base.overridesPorVideo || {}) };
  if (videoId) {
    // Override do vídeo atual = MESMOS valores do preview (a linha corta o
    // vídeo ORIGINAL naquela posição; o render recebe este override com
    // ativo:true — prévia e vídeo final idênticos).
    overridesPorVideo[videoId] = {
      ...(overAntes || {}),
      superior: limitado.superior,
      inferior: limitado.inferior,
      origem: 'manual',
      em: Date.now(),
    };
  }
  return { ...base, corteBordas: global, overridesPorVideo };
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