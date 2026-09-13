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

export const CORES_FUNDO = ['#ffffff', '#f8fafc', '#fdf2f8', '#f5f3ff', '#fff1f2', '#fafafa'];

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

/** Bloque de texto padrão (usado para superior E inferior — independientes). */
export function textoPadrao() {
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
    y: 12, // % do canvas (topo do bloco)
    largura: 80, // % da largura do canvas
    altura: 240, // px do canvas (área de texto do template)
    opacidade: 100,
    visivel: true,
  };
}

export function criarConfigPadrao() {
  return {
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
      mostrarMarcacao: true, // guia visual da prévia (não afeta o render)
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
    // Logo: pertence à config compartilhada; nunca extraída automaticamente.
    // x em % marca o CENTRO da logo (a prévia usa translate(-50%, 0)); a
    // conversão p/ px desloca metade da largura. alturaProporcao = altura /
    // largura da imagem (capturada ao carregar) — define a altura em px do
    // template (o overlay do servidor usa largura × altura).
    logo: {
      url: null,
      arquivo: null,
      alturaProporcao: null,
      x: 50,
      y: 8,
      largura: 22,
      opacidade: 100,
      visivel: true,
    },
    // Texto: DOS textos INDEPENDENTES (superior e inferior), cada uno con su
    // contenido, posición, tamaño, largura/altura, fonte, peso, cor,
    // alineación, opacidad y visibilidade propias. Fijos para todo el lote
    // (config compartida; viajan DENTRO del template como `texto.contenido`
    // e `textoInferior.contenido` — NÃO se usa tituloIA neste fluxo). El
    // procesamiento quiebra líneas, alinea horizontalmente e usa la fonte/
    // peso elegidos — la prévia lo refleja tudo em tempo real.
    textos: {
      superior: textoPadrao(),
      inferior: textoPadrao(),
    },
  };
}

/** Rótulo curto do vídeo no lote (vídeo 01, vídeo 02, ...). */
export function rotuloDeVideo(indice) {
  return `vídeo ${String(indice + 1).padStart(2, '0')}`;
}