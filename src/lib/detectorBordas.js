/**
 * FASE 2 — detector de bordas (frontend puro, somente leitura).
 * Amostra 6 frames de UM video e devolve superior/inferior em % da altura.
 * Fail-open: qualquer falha ou baixa concordancia entre frames -> 0/0.
 */
const FRAMES_AMOSTRA = 6;
const LARGURA_ANALISE = 48;
const LIMIAR_VARIACAO = 9;
const MIN_CORTE_PARA_APLICAR = 1;
const MAX_CORTE_AUTO = 40;

function variacaoMediaLinha(dados, largura, y) {
  const ini = y * largura * 4;
  let media = 0;
  for (let x = 0; x < largura; x++) {
    const i = ini + x * 4;
    media += 0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2];
  }
  media /= Math.max(1, largura);
  let desvio = 0;
  for (let x = 0; x < largura; x++) {
    const i = ini + x * 4;
    const lum = 0.299 * dados[i] + 0.587 * dados[i + 1] + 0.114 * dados[i + 2];
    desvio += Math.abs(lum - media);
  }
  return desvio / Math.max(1, largura);
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
 * Nao gera MP4, nao modifica nada: seek + drawImage em canvas offscreen.
 */
export async function detectarBordasDoVideo(src, aoProgresso) {
  const Anda = (p) => { try { aoProgresso && aoProgresso(p); } catch { /* noop */ } };
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
    const tempos = [];
    for (let i = 0; i < FRAMES_AMOSTRA; i++) {
      tempos.push(dur * (0.1 + (0.8 * i) / Math.max(1, FRAMES_AMOSTRA - 1)));
    }
    const cortesSup = [];
    const cortesInf = [];
    for (let f = 0; f < tempos.length; f++) {
      try {
        await aguardarSeek(video, Math.min(Math.max(0, tempos[f]), Math.max(0, dur - 0.1)));
        ctx.drawImage(video, 0, 0, LARGURA_ANALISE, alturaAnalise);
        const img = ctx.getImageData(0, 0, LARGURA_ANALISE, alturaAnalise);
        const H = alturaAnalise;
        let sup = 0;
        for (let y = 0; y < Math.floor(H * 0.45); y++) {
          if (variacaoMediaLinha(img.data, LARGURA_ANALISE, y) >= LIMIAR_VARIACAO) break;
          sup = y + 1;
        }
        let inf = 0;
        for (let y = H - 1; y >= Math.ceil(H * 0.55); y--) {
          if (variacaoMediaLinha(img.data, LARGURA_ANALISE, y) >= LIMIAR_VARIACAO) break;
          inf = H - y;
        }
        cortesSup.push((sup / H) * 100);
        cortesInf.push((inf / H) * 100);
      } catch { /* frame falhou: ignora */ }
      Anda((f + 1) / tempos.length);
    }
    if (cortesSup.length === 0) return { superior: 0, inferior: 0, confiavel: false };
    const mediana = (arr) => {
      const v = [...arr].sort((a, b) => a - b);
      const m = Math.floor(v.length / 2);
      return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    };
    const medSup = mediana(cortesSup);
    const medInf = mediana(cortesInf);
    const concordam = (arr, med) => arr.filter((v) => Math.abs(v - med) <= 4).length;
    const confiavel =
      concordam(cortesSup, medSup) >= Math.ceil(cortesSup.length / 2) &&
      concordam(cortesInf, medInf) >= Math.ceil(cortesInf.length / 2);
    if (!confiavel) return { superior: 0, inferior: 0, confiavel: false };
    let supPct = medSup < MIN_CORTE_PARA_APLICAR ? 0 : Math.min(MAX_CORTE_AUTO, medSup);
    let infPct = medInf < MIN_CORTE_PARA_APLICAR ? 0 : Math.min(MAX_CORTE_AUTO, medInf);
    return { superior: Math.round(supPct * 10) / 10, inferior: Math.round(infPct * 10) / 10, confiavel: true };
  } catch {
    return { superior: 0, inferior: 0, confiavel: false };
  } finally {
    Anda(1);
    try { video.pause(); } catch { /* noop */ }
    try { video.removeAttribute('src'); video.load(); } catch { /* noop */ }
  }
}

