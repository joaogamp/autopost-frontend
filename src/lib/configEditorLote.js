/**
 * EDITOR EM LOTE — configuração COMPARTILHADA do lote.
 *
 * Um ÚNICO objeto de configuração para TODO o lote. NÃO existe configuração
 * por vídeo: qualquer alteração no painel ou no canvas atualiza automaticamente
 * todos os previews (sem botão "Aplicar a todos", sem detecção automática de
 * logo). O texto do lote vai para a fila como `tituloIA` (igual pra todos).
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
      x: 50,
      y: 620,
      largura: 980,
      altura: 1000,
      fit: 'cobrir',
      mostrarMarcacao: true, // guia visual da prévia (não afeta o render)
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
    // Texto: FIXO para todo o lote (vai para a fila como `tituloIA`). O
    // processamento quebra em linhas, centraliza horizontalmente e usa a
    // fonte bold do sistema — a prévia também é centralizada e bold.
    texto: {
      conteudo: '',
      tamanho: 72, // px do canvas (tamanhoFonte no template)
      cor: '#0f172a',
      x: 50, // % do canvas (centro do bloco)
      y: 88, // % do canvas (topo do bloco)
      largura: 80, // % da largura do canvas
      opacidade: 100,
      visivel: true,
    },
  };
}

/** Rótulo curto do vídeo no lote (vídeo 01, vídeo 02, ...). */
export function rotuloDeVideo(indice) {
  return `vídeo ${String(indice + 1).padStart(2, '0')}`;
}