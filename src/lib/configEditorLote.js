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
    selo: { visivel: false, x: 66, y: 15.6, largura: 3.4, opacidade: 100 },
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
    areaVideo: { ...base.areaVideo, ...(salva?.areaVideo || {}) },
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
  const corte = cfg.corteBordas || {};
  if (corte.ativo || Number(corte.superior) > 0 || Number(corte.inferior) > 0) return true;
  if (Object.keys(cfg.overridesPorVideo || {}).length > 0) return true;
  return false;
}


/** FASE 2 — corte efetivo de UM vídeo: override individual vence o global.
 * `overridesPorVideo` = { [videoId]: { superior, inferior } }. Fail-open:
 * valores ausentes/inválidos → 0% (vídeo sem corte). */
export function corteEfetivoDoVideo(config, videoId) {
  const global = config?.corteBordas || {};
  const over = videoId ? config?.overridesPorVideo?.[videoId] : null;
  const supRaw = over?.superior ?? global.superior ?? 0;
  const infRaw = over?.inferior ?? global.inferior ?? 0;
  const superior = Math.min(CORTE_MAXIMO, Math.max(0, Number(supRaw) || 0));
  const inferior = Math.min(CORTE_MAXIMO, Math.max(0, Number(infRaw) || 0));
  const ativo = !!global.ativo || !!over;
  return { ativo, superior, inferior };
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
      x: 90,
      y: 860,
      largura: 900,
      altura: 1000,
      fit: 'cobrir',
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
    // todo o lote; elementos editáveis no popup grande e no canvas.
    identidade: criarIdentidadePadrao(),
  };
}