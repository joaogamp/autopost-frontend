import { BASE_URL } from './api.js';
import { areaVideoNormalizada } from './configEditorLote.js';

/**
 * EDITOR EM LOTE — conversão da config COMPARTILHADA (%) para o payload do
 * template do servidor (px do canvas). É EXATAMENTE o formato que o
 * POST /api/templates e o pipeline (Oracle + worker local) consomem, então a
 * prévia do canvas e o render final ficam idênticos.
 */

export const NOME_TEMPLATE_LOTE = 'Editor em Lote · config compartilhada';

export function configParaTemplatePayload(config, overrideVideo = null) {
  const { canvas, areaVideo, logo } = config;
  // Enquadramento do vídeo normalizado (zoom 1 = original; 50 = centro) — o
  // MESMO valor que a prévia usa, dentro da estrutura `areaVideo` existente.
  const enq = areaVideoNormalizada(areaVideo);
  const corteBordas = overrideVideo
    ? { ativo: true, superior: overrideVideo.superior ?? config.corteBordas?.superior ?? 0, inferior: overrideVideo.inferior ?? config.corteBordas?.inferior ?? 0 }
    : config.corteBordas;
  // Compatibilidade: `textos` (novo, dois blocos) com fallback a `texto`
  // (legado de configs salvas antes da división superior/inferior).
  const textos = config.textos && (config.textos.superior || config.textos.inferior)
    ? config.textos
    : { superior: config.texto || {}, inferior: {} };

  // Corte de bordas: superior e inferior são INDEPENDENTES (0..90 cada um).
  // O render COBRE a área cortada com a cor de fundo (drawbox no FFmpeg) —
  // as faixas podem se sobrepor no extremo (união cobre tudo), igual à prévia.
  const sup = Math.min(90, Math.max(0, Number(corteBordas?.superior) || 0));
  const inf = Math.min(90, Math.max(0, Number(corteBordas?.inferior) || 0));

  let logoPosicao = null;
  if (logo.visivel && logo.url) {
    const larguraPx = Math.max(1, Math.round((logo.largura / 100) * canvas.largura));
    const proporcao = Number(logo.alturaProporcao) > 0 ? Number(logo.alturaProporcao) : 0.4;
    const alturaPx = Math.max(1, Math.round(larguraPx * proporcao));
    logoPosicao = {
      // A prévia usa x% como CENTRO (translate(-50%, 0)); o template espera a
      // borda ESQUERDA em px — desloca metade da largura.
      x: Math.round((logo.x / 100) * canvas.largura - larguraPx / 2),
      y: Math.round((logo.y / 100) * canvas.altura),
      largura: larguraPx,
      altura: alturaPx,
      // Opacidade só vai pro template quando < 100 (backend aplica só o alfa).
      ...(Number(logo.opacidade) > 0 && Number(logo.opacidade) < 100
        ? { opacidade: Math.round(logo.opacidade) }
        : {}),
    };
  }

  // Mapea UN bloque de texto (superior o inferior) al shape `texto` do
  // template: contenido, tipo, posición/tamaño, fuente, peso, alineación,
  // cor y opacidad — todo en px del canvas (idéntico a la prévia).
  const mapearTexto = (t) => {
    if (!t || !t.visivel || String(t.conteudo || '').trim() === '') return null;
    const larguraPx = Math.max(1, Math.round((t.largura / 100) * canvas.largura));
    return {
      contenido: t.conteudo,
      fonte: t.fonte,
      peso: t.peso,
      alinhamento: t.alinhamento,
      // Área centrada no x% e com o TOPO em y% (alinhamentoVertical 'topo' —
      // igual à prévia). A altura comporta varias linhas antes de que el
      // pipeline reduzca la fonte automáticamente.
      x: Math.round((t.x / 100) * canvas.largura - larguraPx / 2),
      y: Math.round((t.y / 100) * canvas.altura),
      largura: larguraPx,
      altura: Math.max(40, Math.round(t.altura || 240)),
      tamanhoFonte: Math.round(t.tamanho),
      cor: t.cor,
      alinhamentoVertical: 'topo',
      ...(Number(t.opacidade) > 0 && Number(t.opacidade) < 100
        ? { opacidade: Math.round(t.opacidade) }
        : {}),
    };
  };

  const texto = mapearTexto(textos.superior);
  const textoInferior = mapearTexto(textos.inferior);

  // IDENTIDADE DO CANAL (Editor em Lote): nome do canal, @ do canal e selo
  // azul de verificado — MESMA matemática da prévia (px do canvas), então o
  // render final fica idêntico ao canvas. null = elemento desligado: o
  // servidor limpa o campo e o pipeline pula (compatível com templates
  // antigos que não têm esses campos).
  const mapearTextoIdentidade = (t) => {
    if (!t || !t.visivel || String(t.conteudo || '').trim() === '') return null;
    const larguraPx = Math.max(1, Math.round((t.largura / 100) * canvas.largura));
    return {
      contenido: t.conteudo,
      fonte: t.fonte,
      peso: t.peso,
      alinhamento: t.alinhamento,
      // Bloco centrado no x% e com o TOPO em y% (igual à prévia, que cresce
      // pra baixo e quebra linha quando não cabe na largura do bloco).
      x: Math.round((t.x / 100) * canvas.largura - larguraPx / 2),
      y: Math.round((t.y / 100) * canvas.altura),
      largura: larguraPx,
      // Espaço pra DUAS linhas: a prévia cresce sem limite; o pipeline só
      // reduz a fonte se estourar esse teto (nome de canal muito longo).
      altura: Math.max(40, Math.round((t.tamanho || 40) * 1.25 * 2)),
      tamanhoFonte: Math.round(t.tamanho || 40),
      cor: t.cor,
      alinhamentoVertical: 'topo',
      ...(Number(t.opacidade) > 0 && Number(t.opacidade) < 100
        ? { opacidade: Math.round(t.opacidade) }
        : {}),
    };
  };

  // Selo azul: x/y marca o CENTRO (translate(-50%, -50%) na prévia) e o selo
  // é QUADRADO (ícone 24×24), então a altura em px é igual à largura. PNG do
  // usuário (`urlImagem` = dataURL importado): viaja DENTRO do JSON
  // `identidadeSelo` com a proporção natural — o engine compõe a IMAGEM;
  // sem `urlImagem` o engine desenha o ícone vetorial (fallback intacto).
  const mapearSeloIdentidade = (s) => {
    if (!s || !s.visivel) return null;
    const larguraPx = Math.max(4, Math.round((s.largura / 100) * canvas.largura));
    return {
      visivel: true,
      x: Math.round((s.x / 100) * canvas.largura),
      y: Math.round((s.y / 100) * canvas.altura),
      largura: larguraPx,
      ...(s.urlImagem
        ? { urlImagem: s.urlImagem, alturaProporcao: Number(s.alturaProporcao) > 0 ? Number(s.alturaProporcao) : 1 }
        : {}),
      ...(Number(s.opacidade) > 0 && Number(s.opacidade) < 100
        ? { opacidade: Math.round(s.opacidade) }
        : {}),
    };
  };

  // IMAGENS (Editor em Lote) — elementos de imagem independentes. Cada uma
  // viaja como dataURL DENTRO do template (`imagens`), na MESMA convenção da
  // prévia: x% = CENTRO (deslocado metade da largura pra virar borda esquerda
  // em px) e y% = TOPO; altura pela proporção natural (`contain` no pipeline).
  // Additive: sem imagens, o campo vai null e o render segue igual.
  const imagensPayload = (config.imagens || [])
    .filter((im) => im && im.visivel && typeof im.url === 'string' && im.url.startsWith('data:image/'))
    .map((im) => {
      const larguraPx = Math.max(1, Math.round((Math.min(100, Math.max(2, Number(im.largura) || 30)) / 100) * canvas.largura));
      const proporcao = Number(im.alturaProporcao) > 0 ? Number(im.alturaProporcao) : 1;
      const alturaPx = Math.max(1, Math.round(larguraPx * proporcao));
      const opacidade = Number(im.opacidade);
      return {
        urlImagem: im.url,
        x: Math.round((Number(im.x) / 100) * canvas.largura - larguraPx / 2),
        y: Math.round((Number(im.y) / 100) * canvas.altura),
        largura: larguraPx,
        altura: alturaPx,
        ...(Number.isFinite(opacidade) && opacidade >= 0 && opacidade < 100 ? { opacidade: Math.round(opacidade) } : {}),
      };
    });

  return {
    corFundo: canvas.corFundo,
    canvasLargura: canvas.largura,
    canvasAltura: canvas.altura,
    areaVideo: {
      x: areaVideo.x,
      y: areaVideo.y,
      largura: areaVideo.largura,
      altura: areaVideo.altura,
      fit: areaVideo.fit === 'ajustar' ? 'ajustar' : 'cobrir',
      // ENQUADRAMENTO DO VÍDEO (mouse: zoom + mover) — valores RELATIVOS (%),
      // os mesmos da prévia. Viajam no MESMO `areaVideo` do template (não há
      // segundo sistema de composição) e o pipeline/FFmpeg materializa:
      //   zoom          → escala do vídeo dentro da área (1 = original);
      //   deslocamentoX → posição horizontal dentro da área (0..100, 50 = centro);
      //   deslocamentoY → idem, vertical.
      zoom: enq.zoom,
      deslocamentoX: enq.deslocamentoX,
      deslocamentoY: enq.deslocamentoY,
      // CORREÇÃO 1/2 (REGRA DEFINITIVA do corte automático — auditoria): a
      // detecção da região útil acontece UMA ÚNICA vez, no botão "Corte
      // automático de bordas" do Editor (detectorBordas.js). O resultado é
      // salvo na config (overridesPorVideo) e chega AQUI já decidido, dentro
      // do corteBordas POR VÍDEO do template — o FFmpeg apenas materializa
      // (drawbox single-pass). Este campo fica SEMPRE false: "Processar
      // vídeos" NUNCA re-detecta nem recalcula enquadramento. O corte MANUAL
      // (toggle + sliders) preserva o comportamento anterior intacto.
      detectarContenido: false,
    },
    // Corte de bordas compartilhado (single-pass no FFmpeg). Padrão guardado
    // também quando inactivo pra que o template no servidor nunca fique
    // obsoleto. Nome unificado `corteBordas` (front + back).
    corteBordas: {
      ativo: !!corteBordas?.ativo,
      superior: sup,
      inferior: inf,
    },
    // null → o campo NÃO é enviado e o servidor limpa a logo do template.
    logoPosicao: logoPosicao ? JSON.stringify(logoPosicao) : null,
    // Texto superior (`texto`) + texto inferior (`textoInferior`) — el
    // servidor (POST /api/templates) já aceita ambos; null limpiá el campo.
    texto,
    textoInferior,
    // IDENTIDADE DO CANAL compartilhada do lote (nome, @ e selo azul) —
    // mesmo princípio do logo/texto: config → template → pipeline → vídeo
    // final. null limpa o campo no servidor (pipeline pula quando ausente).
    identidadeNome: mapearTextoIdentidade(config.identidade?.nome),
    identidadeUsuario: mapearTextoIdentidade(config.identidade?.usuario),
    identidadeSelo: mapearSeloIdentidade(config.identidade?.selo),
    // IMAGENS independentes (dataURL + geometria em px) — null quando não há
    // imagem visível: o pipeline pula e nada muda nos fluxos existentes.
    imagens: imagensPayload.length ? imagensPayload : null,
  };
}

/** Assinatura estável da config (evita re-salvar o template sem mudança). */
export function assinarConfig(config, overrideVideo = null) {
  return JSON.stringify(configParaTemplatePayload(config, overrideVideo)) + (config.logo.arquivo ? '|logo-arquivo' : '');
}

/**
 * Firma de la COMPOSICIÓN visible (área + corte + logo + texto + fondo).
 * Serve às tarjetas de preview do centro: quando a firma não muda, os cards
 * memoizados NÃO re-renderizan (performance com muitos vídeos).
 */
export function firmaComposicion(config) {
  const { canvas, areaVideo, logo, corteBordas } = config;
  // Compatibilidade com configs legadas (antes de `textos` superior/inferior).
  const textos = config.textos && (config.textos.superior || config.textos.inferior)
    ? config.textos
    : { superior: config.texto || {}, inferior: {} };
  const assinarTexto = (t) =>
    t
      ? [
          t.visivel ? 1 : 0, t.conteudo, t.fonte, t.peso, t.alinhamento,
          Math.round(t.tamanho), Math.round(t.x), Math.round(t.y),
          Math.round(t.largura), Math.round(t.altura), Math.round(t.opacidade || 100), t.cor,
        ].join('|')
      : 'n';
  return [
    'c2',
    canvas.corFundo,
    areaVideo.x, areaVideo.y, areaVideo.largura, areaVideo.altura, areaVideo.fit, areaVideo.mostrarMarcacao,
    // Enquadramento do vídeo (mouse): re-renderiza a célula quando muda.
    'enq:' + Math.round(Number(areaVideo.zoom || 1) * 100) + '/' + Math.round(Number(areaVideo.deslocamentoX ?? 50)) + '/' + Math.round(Number(areaVideo.deslocamentoY ?? 50)),
    corteBordas?.ativo ? 1 : 0, Math.round(corteBordas?.superior || 0), Math.round(corteBordas?.inferior || 0),
    logo.visivel ? 1 : 0, Math.round(logo.x), Math.round(logo.y), Math.round(logo.largura),
    Math.round(logo.opacidade || 100), logo.url ? 't' : 'f',
    Math.round(Number(logo.alturaProporcao || 0) * 1000),
    'sup:' + assinarTexto(textos.superior),
    'inf:' + assinarTexto(textos.inferior),
    // IMAGENS: id/url/geometria/opacidade — re-renderiza a célula quando muda.
    'img:' + (config.imagens || [])
      .map((im) => (im && im.url ? [im.id, Math.round(im.x), Math.round(im.y), Math.round(im.largura), Math.round((im.opacidade ?? 100)), im.visivel ? 1 : 0].join(',') : 'n'))
      .join(';'),
  ].join('|');
}

/** URL pública estável da logo salva no servidor (a mesma que o worker baixa). */
export function urlLogoDoTemplate(template) {
  if (!template) return null;
  if (template.logo?.url && /^https?:\/\//.test(template.logo.url)) return template.logo.url;
  const caminho = template.logo?.caminhoArquivo;
  if (!caminho) return null;
  const nome = String(caminho).split(/[\\/]+/).pop();
  return `${BASE_URL}/arquivos/logos-templates/${encodeURIComponent(nome)}`;
}

/** Proporção (altura/largura) da imagem da logo, carregada sob demanda. */
export function proporcaoDaImagem(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}