/**
 * CORTE AUTOMÁTICO DE BORDAS — detector ESTRUTURAL (frontend puro, somente leitura).
 *
 * REGRA DEFINITIVA (auditoria): este detector roda UMA ÚNICA vez, quando o
 * usuário clica em "Corte automático de bordas" (PainelEditor → EditorLote.
 * aoDetectarBordas). O resultado é SALVO na config (overridesPorVideo) e o
 * botão "Processar vídeos" apenas materializa — NENHUMA outra etapa volta a
 * detectar (o pipeline de render não executa detecção nenhuma).
 *
 * MÉTODO (melhoria estrutural): em vez de "linha uniforme em CADA frame"
 * (frágil: texto temporário interfere, texto persistente vira limite, cartela
 * de abertura confunde, poucos frames geram falso positivo/fail-open),
 * detecta-se a REGIÃO ESTRUTURAL CONSISTENTE ao longo do vídeo:
 *
 *  1. Amostra FRAMES_ESTRUTURAIS (20) frames uniformemente distribuídos.
 *  2. Para CADA LINHA do quadro calcula, entre os frames:
 *     · em quantos frames ela é uniforme (`fracaoUniforme`);
 *     · variação temporal da média de luminância (`desvioTemporal`) e da cor
 *       (`estabilidadeCor`) — barra/fundo estático não muda entre frames;
 *     · textura média (`desvioEspacial`) — conteúdo real é texturizado.
 *  3. Uma FAIXA EXTERNA só é considerada quando, de fora para dentro:
 *     · suas linhas são uniformes na GRANDE MAIORIA dos frames (>= 90%);
 *     · têm BAIXA variação temporal (luminância e cor);
 *     · existe uma TRANSIÇÃO CONSISTENTE para uma região de VÍDEO REAL
 *       (janela de linhas texturizadas na maioria dos frames).
 *  4. O limite é CONFIRMADO pela persistência estrutural: uma faixa que não
 *     chega a um limite claro (teto de 40%, transição suave ou faixa
 *     inconsistente) é dúvida → NÃO corta.
 *  5. Texto TEMPORÁRIO não determina o limite: linhas em que ele aparece
 *     perdem a uniformidade em poucos frames e são tratadas como ILHA
 *     (outlier) — a faixa continua por baixo/por cima dela.
 *  6. Texto presente em poucos frames é OUTLIER explícito (ilha fina com
 *     textura alta cercada por faixa uniforme); ilhas são puladas e o limite
 *     real (a transição para o vídeo) é que fecha a faixa.
 *  7. "Mudança de pixels" NÃO é conteúdo: não se usa diferença entre frames
 *     como prova de conteúdo; exige-se textura ESPACIAL persistente na
 *     maioria dos frames para confirmar a região real.
 *  8. FAIL-OPEN: qualquer falha, frame ilegível, dúvida ou excesso de ilhas
 *     → 0/0 (vídeo inteiro). Cortar errado é pior que não cortar.
 *  9. Teto de segurança de 40% por lado e mínimo de 1% (abaixo disso não se
 *     aplica corte).
 *
 * As funções por-frame (`analisarExtremidade` / `agregarCortes`) continuam
 * existindo como CONTRATO de compatibilidade e são usadas como CONFIRMAÇÃO
 * independente do limite estrutural (se os frames confiáveis discordarem da
 * estrutura, é dúvida → não corta).
 */

export const FRAMES_ESTRUTURAIS = 20;
/** Compatibilidade com o nome antigo (o número de frames amostrados subiu de 8 → 20). */
export const FRAMES_AMOSTRA = FRAMES_ESTRUTURAIS;

const LARGURA_ANALISE = 96;
const LIMIAR_VARIACAO = 3;         // desvio médio da linha abaixo disso = linha uniforme (barra)
const LIMIAR_SALTO_DESVIO = 8;     // no limite, o conteúdo precisa ter textura clara
const LIMIAR_SALTO_MEDIA = 12;     // ...e média de luminância bem diferente da faixa
const TOLERANCIA_CONCORDANCIA = 3; // % — frames concordam com a mediana
const FRAMES_DISCORDANTES_MAX = 1; // no máximo 1 frame pode discordar (dúvida → não corta)

export const MIN_CORTE_PARA_APLICAR = 1;  // % — menos que isso não vale cortar
export const MAX_CORTE_AUTO = 40;         // % por lado — teto de segurança contra corte agressivo

/* ---- Limiares do detector ESTRUTURAL (multi-frame) ------------------------- */
const FRACAO_UNIFORME_MIN = 0.9;      // linha é "faixa" se uniforme em >= 90% dos frames
const FRACAO_UNIFORME_ESTRITA = 0.95; // persistência exigida quando não há confirmação por-frame
const LIMIAR_TEMPORAL_MEDIA = 6;      // desvio-padrão temporal da luminância da linha (0..255)
const LIMIAR_TEMPORAL_COR = 8;        // desvio-padrão temporal de cada canal de cor
const LIMIAR_CONTEUDO = 8;            // desvio espacial que caracteriza VÍDEO REAL (textura)
const FRACAO_CONTEUDO_MIN = 0.6;      // linha é conteúdo se texturizada em >= 60% dos frames
const FRACAO_JANELA_CONTEUDO = 0.8;   // a janela pós-limite precisa ser 80% conteúdo (transição real)
const MIN_RUN_CONTEUDO_PCT = 0.05;    // corredor mínimo de conteúdo consolidado (5% da altura)
const FRACAO_BANDA_MIN = 0.6;         // a faixa precisa ter >= 60% de linhas uniformes-estáveis
const LIMIAR_OUTLIER_PCT = 0.08;      // no máximo 8% da altura em ilhas (texto/watermark) fora da faixa
const TOLERANCIA_CONFIRMACAO_PCT = 3; // % — tolerância entre limite estrutural e limite por-frame
const FRAMES_CONFIRMACAO_MIN = 3;     // abaixo disso não há confirmação por-frame confiável
const JANELA_CONFIRMACAO_PCT = 0.10;  // janela de transição = 10% da altura

/** Estatísticas de UMA linha (luminância + canais de cor) em um frame RGBA. */
export function linhaEstatisticas(dados, largura, y) {
  const ini = y * largura * 4;
  let somaLum = 0, somaR = 0, somaG = 0, somaB = 0;
  for (let x = 0; x < largura; x++) {
    const i = ini + x * 4;
    const r = dados[i], g = dados[i + 1], b = dados[i + 2];
    somaR += r; somaG += g; somaB += b;
    somaLum += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  const n = Math.max(1, largura);
  const media = somaLum / n;
  let desvio = 0;
  for (let x = 0; x < largura; x++) {
    const i = ini + x * 4;
    const lum = 0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2];
    desvio += Math.abs(lum - media);
  }
  return { media, desvio: desvio / n, cor: { r: somaR / n, g: somaG / n, b: somaB / n } };
}

/** Compatibilidade: só o desvio médio da linha. */
export function variacaoMediaLinha(dados, largura, y) {
  return linhaEstatisticas(dados, largura, y).desvio;
}

/** Mediana de uma lista de números (0 para lista vazia). */
export function mediana(valores) {
  const lista = (valores || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (lista.length === 0) return 0;
  const m = Math.floor(lista.length / 2);
  return lista.length % 2 ? lista[m] : (lista[m - 1] + lista[m]) / 2;
}
/**
 * Analisa UMA extremidade ('topo' | 'base') de um frame RGBA.
 * Devolve { banda, confiavel }:
 *  - banda: nº de linhas uniformes consecutivas a partir da extremidade
 *    (0 = nada a cortar naquele lado);
 *  - confiavel: false quando a faixa termina em limite DUVIDOSO (salto fraco
 *    — provável conteúdo liso e não barra estrutural). Dúvida → sem corte.
 * A varredura nunca passa de 45% (topo) / 55% (base) da altura: faixa que
 * engolir quase metade do quadro sem limite claro é dúvida, não borda.
 * Continua sendo o CONTRATO por-frame do detector (usado como confirmação
 * independente do limite estrutural).
 */
export function analisarExtremidade(dados, largura, altura, lado) {
  const doTopo = lado === 'topo';
  if (!dados || !(largura > 0) || !(altura > 0)) return { banda: 0, confiavel: true };
  const inicio = doTopo ? 0 : altura - 1;
  const limite = doTopo ? Math.floor(altura * 0.45) : Math.ceil(altura * 0.55);
  const passo = doTopo ? 1 : -1;
  let banda = 0;
  let mediaAnterior = null;
  for (let y = inicio; doTopo ? y < limite : y >= limite; y += passo) {
    const { media, desvio } = linhaEstatisticas(dados, largura, y);
    if (desvio >= LIMIAR_VARIACAO) {
      if (banda === 0) return { banda: 0, confiavel: true }; // conteúdo logo na extremidade
      // Limite da faixa: exige SALTO FORTE (barra → conteúdo), nunca um
      // gradiente suave (que indica conteúdo liso confundido com barra).
      const saltoMedia = Math.abs(media - mediaAnterior);
      const confiavel = desvio >= LIMIAR_SALTO_DESVIO && saltoMedia >= LIMIAR_SALTO_MEDIA;
      return { banda, confiavel };
    }
    banda += 1;
    mediaAnterior = media;
  }
  // Faixa uniforme até o teto da varredura, sem limite claro: dúvida → sem corte.
  return { banda: 0, confiavel: true };
}

/**
 * Agrega as medidas dos frames (mediana + concordância quase unânime).
 * `medidas` = [{ banda, confiavel }] por lado; um frame com limite duvidoso
 * entra como 0 (discordância) e MAIS DE 1 discordante derruba o lado inteiro
 * (fail-open). `altura` = altura do frame de análise (converte linha → %).
 * Devolve { superior, inferior, confiavel } em % da altura do vídeo.
 */
export function agregarCortes(medidasSup, medidasInf, altura) {
  const resolverLado = (medidas) => {
    const valores = (medidas || [])
      .filter((m) => m && Number.isFinite(m.banda))
      .map((m) => (m.confiavel ? m.banda : 0));
    if (valores.length === 0) return { pct: 0, confiavel: false };
    const ordenado = [...valores].sort((a, b) => a - b);
    const m = Math.floor(ordenado.length / 2);
    const med = ordenado.length % 2 ? ordenado[m] : (ordenado[m - 1] + ordenado[m]) / 2;
    const concordam = valores.filter((v) => Math.abs(v - med) <= TOLERANCIA_CONCORDANCIA).length;
    if (valores.length - concordam > FRAMES_DISCORDANTES_MAX) return { pct: 0, confiavel: false };
    const pct = (med / Math.max(1, altura)) * 100;
    if (pct < MIN_CORTE_PARA_APLICAR) return { pct: 0, confiavel: true };
    return { pct: Math.min(MAX_CORTE_AUTO, pct), confiavel: true };
  };
  const sup = resolverLado(medidasSup);
  const inf = resolverLado(medidasInf);
  return {
    superior: Math.round(sup.pct * 10) / 10,
    inferior: Math.round(inf.pct * 10) / 10,
    confiavel: sup.confiavel && inf.confiavel,
  };
}
/**
 * PERFIL ESTRUTURAL — agrega N frames do MESMO vídeo, linha a linha.
 * `frames` = array de Uint8ClampedArray RGBA (largura × altura).
 * Devolve:
 *   n                  → nº de frames válidos usados;
 *   fracaoUniforme[y]  → em quantos frames a linha y é uniforme (0..1);
 *   fracaoTextura[y]   → em quantos frames a linha y é TEXTURIZADA (conteúdo real, 0..1);
 *   mediaTemporal[y]   → média de luminância da linha entre frames;
 *   desvioTemporal[y]  → variação temporal (desvio-padrão) da luminância da linha;
 *   estabilidadeCor[y] → variação temporal máxima entre os canais R/G/B;
 *   desvioEspacial[y]  → textura espacial média da linha (desvio absoluto médio).
 */
export function perfilEstrutural(frames, largura, altura) {
  const zeros = () => new Float64Array(Math.max(1, altura | 0));
  const perfil = {
    n: 0,
    largura,
    altura,
    fracaoUniforme: zeros(),
    fracaoTextura: zeros(),
    mediaTemporal: zeros(),
    desvioTemporal: zeros(),
    estabilidadeCor: zeros(),
    desvioEspacial: zeros(),
    quadros: { medias: [], desvios: [] },
  };
  if (!Array.isArray(frames) || !(largura > 0) || !(altura > 0)) return perfil;
  const lista = frames.filter((f) => f && f.length >= largura * altura * 4);
  const n = lista.length;
  perfil.n = n;
  if (n === 0) return perfil;

  const uniformeEm = new Int32Array(altura);
  const texturaEm = new Int32Array(altura);
  const somaLum = zeros(), somaLum2 = zeros(), somaDesv = zeros();
  const somaR = zeros(), somaR2 = zeros();
  const somaG = zeros(), somaG2 = zeros();
  const somaB = zeros(), somaB2 = zeros();

  for (const dados of lista) {
    const medias = new Float64Array(altura);
    const desvios = new Float64Array(altura);
    for (let y = 0; y < altura; y++) {
      const { media, desvio, cor } = linhaEstatisticas(dados, largura, y);
      medias[y] = media;
      desvios[y] = desvio;
      somaLum[y] += media;
      somaLum2[y] += media * media;
      somaDesv[y] += desvio;
      somaR[y] += cor.r; somaR2[y] += cor.r * cor.r;
      somaG[y] += cor.g; somaG2[y] += cor.g * cor.g;
      somaB[y] += cor.b; somaB2[y] += cor.b * cor.b;
      if (desvio < LIMIAR_VARIACAO) uniformeEm[y] += 1;
      if (desvio >= LIMIAR_CONTEUDO) texturaEm[y] += 1;
    }
    perfil.quadros.medias.push(medias);
    perfil.quadros.desvios.push(desvios);
  }

  const desvioPadrao = (soma, soma2) => {
    const m = soma / n;
    return Math.sqrt(Math.max(0, soma2 / n - m * m));
  };
  for (let y = 0; y < altura; y++) {
    perfil.fracaoUniforme[y] = uniformeEm[y] / n;
    perfil.fracaoTextura[y] = texturaEm[y] / n;
    perfil.mediaTemporal[y] = somaLum[y] / n;
    perfil.desvioEspacial[y] = somaDesv[y] / n;
    perfil.desvioTemporal[y] = desvioPadrao(somaLum[y], somaLum2[y]);
    perfil.estabilidadeCor[y] = Math.max(
      desvioPadrao(somaR[y], somaR2[y]),
      desvioPadrao(somaG[y], somaG2[y]),
      desvioPadrao(somaB[y], somaB2[y])
    );
  }
  return perfil;
}
/**
 * FAIXA EXTERNA ESTRUTURAL de um lado ('topo' | 'base').
 * Caminha da extremidade para dentro (nunca além do teto de 40%) e classifica
 * cada linha:
 *   · FAIXA   → uniforme na grande maioria dos frames E temporalmente estável
 *               (luminância e cor) → continua a faixa;
 *   · CONTEÚDO→ textura espacial persistente na maioria dos frames → é a
 *               TRANSIÇÃO para o vídeo real: fecha a faixa neste ponto;
 *   · ILHA    → não uniforme, mas com textura alta e NÃO sustentada (texto
 *               temporário/persistente em poucas linhas, watermark) → outlier:
 *               é PULADA e a faixa continua;
 *   · LISA    → não uniforme e sem textura (céu/parede/gradiente) → dúvida.
 *
 * Devolve { linhas, confiavel, banda, fracaoMin, ilhas, motivo }:
 *   linhas     → nº de linhas a cortar a partir da extremidade (0 = nada);
 *   confiavel  → false = dúvida (fail-open: não corta);
 *   banda      → nº de linhas realmente uniformes-estáveis dentro da faixa;
 *   fracaoMin  → menor persistência (fracaoUniforme) entre as linhas da faixa;
 *   ilhas      → posições (linhas a partir da extremidade) das ilhas puladas.
 */
export function faixaExternaEstrutural(perfil, lado, altura) {
  const doTopo = lado !== 'base';
  const vazio = { linhas: 0, confiavel: false, banda: 0, fracaoMin: 0, ilhas: [], motivo: 'sem-perfil' };
  if (!perfil || !(perfil.n > 0) || !(altura > 0) || (perfil.altura && perfil.altura !== altura)) return vazio;

  const teto = Math.max(1, Math.floor((altura * MAX_CORTE_AUTO) / 100));
  const janela = Math.max(6, Math.round(altura * JANELA_CONFIRMACAO_PCT));
  const minRun = Math.max(3, Math.round(altura * MIN_RUN_CONTEUDO_PCT));
  const maxIlhas = Math.max(2, Math.round(altura * LIMIAR_OUTLIER_PCT));
  const indice = (k) => (doTopo ? k : altura - 1 - k);

  // Linha de FAIXA: uniforme na vasta maioria dos frames e estável no tempo.
  const ehFaixa = (y) =>
    perfil.fracaoUniforme[y] >= FRACAO_UNIFORME_MIN &&
    perfil.desvioTemporal[y] <= LIMIAR_TEMPORAL_MEDIA &&
    perfil.estabilidadeCor[y] <= LIMIAR_TEMPORAL_COR;

  const ehTextura = (yy) => perfil.fracaoTextura[yy] >= FRACAO_CONTEUDO_MIN;

  // Classifica a linha de fronteira y (que NÃO é faixa):
  //  · 'conteudo' → TRANSIÇÃO para o vídeo real: corredor de conteúdo
  //    consolidado (run >= janela, ou run >= minRun com >= 80% da janela
  //    texturizada). Usa TEXTURA ESPACIAL persistente, não "mudança de pixels";
  //  · 'ilha'     → texto/marca (textura alta, ou instabilidade temporal com
  //    alguma textura) cercado por faixa → OUTLIER, a faixa continua;
  //  · 'liso'     → sem textura e estável (céu/parede/gradiente) → DÚVIDA.
  const classificarLinha = (y) => {
    let run = 0, conteudo = 0, total = 0, cortado = false;
    for (let k = 0; k < janela; k++) {
      const yy = doTopo ? y + k : y - k;
      if (yy < 0 || yy >= altura) continue;
      total += 1;
      const textura = ehTextura(yy);
      if (textura) conteudo += 1;
      if (!cortado) {
        if (textura && !ehFaixa(yy)) run += 1;
        else cortado = true;
      }
    }
    const fracaoConteudo = total > 0 ? conteudo / total : 0;
    if (run >= Math.min(janela, total) || (run >= minRun && fracaoConteudo >= FRACAO_JANELA_CONTEUDO)) {
      return 'conteudo';
    }
    if (
      perfil.desvioEspacial[y] >= LIMIAR_CONTEUDO ||
      (perfil.desvioTemporal[y] > LIMIAR_TEMPORAL_MEDIA && perfil.desvioEspacial[y] > LIMIAR_VARIACAO)
    ) {
      return 'ilha';
    }
    return 'liso';
  };

  let banda = 0;
  let ilhas = 0;
  const posIlhas = [];
  let fracaoMin = 1;
  for (let k = 0; k < teto; k++) {
    const y = indice(k);
    if (ehFaixa(y)) {
      banda += 1;
      if (perfil.fracaoUniforme[y] < fracaoMin) fracaoMin = perfil.fracaoUniforme[y];
      continue;
    }
    const classe = classificarLinha(y);
    if (classe === 'conteudo') {
      if (k < 1) return { linhas: 0, confiavel: true, banda: 0, fracaoMin: 1, ilhas: posIlhas, motivo: 'conteudo-na-extremidade' };
      if (banda / k < FRACAO_BANDA_MIN) {
        return { linhas: 0, confiavel: false, banda, fracaoMin, ilhas: posIlhas, motivo: 'faixa-inconsistente' };
      }
      return { linhas: k, confiavel: true, banda, fracaoMin, ilhas: posIlhas, motivo: 'transicao-confirmada' };
    }
    // Ilha de texto/marca d'água (outlier): é PULADA e a faixa continua —
    // texto temporário ou persistente em poucas linhas NUNCA vira o limite.
    if (classe === 'ilha') {
      ilhas += 1;
      if (posIlhas.length === 0 || k - posIlhas[posIlhas.length - 1] > 1) posIlhas.push(k);
      if (ilhas > maxIlhas) {
        return { linhas: 0, confiavel: false, banda, fracaoMin, ilhas: posIlhas, motivo: 'excesso-ilhas' };
      }
      continue;
    }
    // Linha não uniforme e sem textura clara = provável conteúdo liso (céu,
    // parede, gradiente) confundido com barra: DÚVIDA → não corta.
    return { linhas: 0, confiavel: false, banda, fracaoMin, ilhas: posIlhas, motivo: 'transicao-suave' };
  }
  // Chegou ao teto de segurança sem limite claro: dúvida → não corta.
  return { linhas: 0, confiavel: false, banda, fracaoMin, ilhas: posIlhas, motivo: 'teto-atingido' };
}

/**
 * Resolve UM lado: parte do limite ESTRUTURAL e o CONFIRMA pelos frames.
 * Confirmação (persistência estrutural + contrato por-frame):
 *  · com >= 3 frames confiáveis, a mediana dos limites por-frame precisa casar
 *    com o limite estrutural (ou com o início de uma ilha de texto pulada);
 *  · sem frames confiáveis suficientes, exige-se persistência ESTRITA da faixa
 *    (cada linha uniforme em >= 95% dos frames).
 * Dúvida em qualquer ponto → { pct: 0, confiavel: false } (fail-open).
 */
export function resolverLadoEstrutural(perfil, medidas, lado, altura) {
  const faixa = faixaExternaEstrutural(perfil, lado, altura);
  const base = { pct: 0, confiavel: false, linhas: faixa.linhas, motivo: faixa.motivo, faixa };
  if (!faixa.confiavel) return base;
  if (faixa.linhas <= 0) return { ...base, confiavel: true };

  const tolerancia = Math.max(2, Math.round((altura * TOLERANCIA_CONFIRMACAO_PCT) / 100));
  const confiaveis = (medidas || [])
    .filter((m) => m && m.confiavel && Number.isFinite(m.banda) && m.banda > 0)
    .map((m) => m.banda);
  if (confiaveis.length >= FRAMES_CONFIRMACAO_MIN) {
    const med = mediana(confiaveis);
    const casaEstrutura = Math.abs(med - faixa.linhas) <= tolerancia;
    const casaIlha = (faixa.ilhas || []).some((k) => Math.abs(med - k) <= tolerancia);
    if (!casaEstrutura && !casaIlha) {
      return { ...base, motivo: 'sem-confirmacao-quadros' };
    }
  } else if (!((faixa.fracaoMin || 0) >= FRACAO_UNIFORME_ESTRITA)) {
    return { ...base, motivo: 'sem-confirmacao-persistencia' };
  }

  const pct = (faixa.linhas / Math.max(1, altura)) * 100;
  if (pct < MIN_CORTE_PARA_APLICAR) return { ...base, confiavel: true, motivo: 'abaixo-do-minimo' };
  return { pct: Math.min(MAX_CORTE_AUTO, pct), confiavel: true, linhas: faixa.linhas, motivo: faixa.motivo, faixa };
}

/**
 * Detecção ESTRUTURAL completa a partir de frames JÁ decodificados (função
 * PURA, testável fora do browser): perfil multi-frame → faixa estrutural por
 * lado → confirmação por-frame → limites de segurança (mín 1%, teto 40%).
 * NUNCA lança: qualquer falha → { 0/0, confiavel: false } (FAIL-OPEN).
 */
export function detectarBordasDeFrames(frames, largura, altura) {
  const vazio = { superior: 0, inferior: 0, confiavel: false, detalhes: null };
  if (!Array.isArray(frames) || frames.length === 0 || !(largura > 0) || !(altura > 0)) return vazio;
  try {
    const perfil = perfilEstrutural(frames, largura, altura);
    if (perfil.n === 0) return vazio;
    const medidasSup = [];
    const medidasInf = [];
    for (const dados of frames) {
      if (!dados || dados.length < largura * altura * 4) continue;
      medidasSup.push(analisarExtremidade(dados, largura, altura, 'topo'));
      medidasInf.push(analisarExtremidade(dados, largura, altura, 'base'));
    }
    const sup = resolverLadoEstrutural(perfil, medidasSup, 'topo', altura);
    const inf = resolverLadoEstrutural(perfil, medidasInf, 'base', altura);
    const arredondar = (v) => Math.round(v * 10) / 10;
    return {
      superior: arredondar(sup.pct),
      inferior: arredondar(inf.pct),
      confiavel: !!sup.confiavel && !!inf.confiavel,
      detalhes: {
        frames: perfil.n,
        largura,
        altura,
        topo: { linhas: sup.linhas, confiavel: sup.confiavel, motivo: sup.motivo, faixa: sup.faixa },
        base: { linhas: inf.linhas, confiavel: inf.confiavel, motivo: inf.motivo, faixa: inf.faixa },
        porQuadro: agregarCortes(medidasSup, medidasInf, altura),
      },
    };
  } catch {
    return vazio; // FAIL-OPEN: nunca derruba o Editor
  }
}

function aguardarSeek(video, tempo) {
  return new Promise((resolve) => {
    let pronto = false;
    const concluir = () => { if (!pronto) { pronto = true; resolve(); } };
    const aoSeek = () => { video.removeEventListener('seeked', aoSeek); concluir(); };
    video.addEventListener('seeked', aoSeek);
    try { video.currentTime = tempo; } catch { concluir(); }
    setTimeout(concluir, 2500);
  });
}

/**
 * Detecta as bordas de UM video (somente leitura do arquivo original).
 * ÚNICO momento de detecção do corte automático: chamado exclusivamente pela
 * ação "Corte automático de bordas" (EditorLote.aoDetectarBordas). Não gera
 * MP4, não modifica nada: seek + drawImage em canvas offscreen.
 *
 * Amostra FRAMES_ESTRUTURAIS (20) frames uniformemente distribuídos entre 5% e
 * 95% da duração e entrega ao detector ESTRUTURAL (`detectarBordasDeFrames`).
 * Fail-open em qualquer falha (vídeo ilegível, poucos frames, sem confiança).
 */
export async function detectarBordasDoVideo(src, aoProgresso) {
  const Anda = (p) => { try { if (typeof aoProgresso === 'function') aoProgresso(p); } catch { /* noop */ } };
  if (!src || typeof document === 'undefined') return { superior: 0, inferior: 0, confiavel: false };
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  const tela = document.createElement('canvas');
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { superior: 0, inferior: 0, confiavel: false };
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      video.src = src;
    });
    const dur = Number(video.duration);
    if (!Number.isFinite(dur) || dur <= 0) return { superior: 0, inferior: 0, confiavel: false };
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw <= 0 || vh <= 0) return { superior: 0, inferior: 0, confiavel: false };
    const alturaAnalise = Math.max(48, Math.round((LARGURA_ANALISE * vh) / vw));
    tela.width = LARGURA_ANALISE;
    tela.height = alturaAnalise;
    // 16–24 frames uniformemente distribuídos (evita fade-in/fade-out extremos).
    const tempos = [];
    for (let i = 0; i < FRAMES_ESTRUTURAIS; i++) {
      const fracao = 0.05 + (0.9 * i) / Math.max(1, FRAMES_ESTRUTURAIS - 1);
      tempos.push(dur * fracao);
    }
    const buffers = [];
    for (let f = 0; f < tempos.length; f++) {
      try {
        await aguardarSeek(video, Math.min(Math.max(0, tempos[f]), Math.max(0, dur - 0.1)));
        ctx.drawImage(video, 0, 0, LARGURA_ANALISE, alturaAnalise);
        const img = ctx.getImageData(0, 0, LARGURA_ANALISE, alturaAnalise);
        buffers.push(img.data);
      } catch { /* frame falhou: ignora (tratado como ausente) */ }
      Anda((f + 1) / tempos.length);
    }
    if (buffers.length < FRAMES_CONFIRMACAO_MIN) return { superior: 0, inferior: 0, confiavel: false };
    return detectarBordasDeFrames(buffers, LARGURA_ANALISE, alturaAnalise);
  } catch {
    return { superior: 0, inferior: 0, confiavel: false };
  } finally {
    Anda(1);
    try { video.pause(); } catch { /* noop */ }
    try { video.removeAttribute('src'); video.load(); } catch { /* noop */ }
  }
}
