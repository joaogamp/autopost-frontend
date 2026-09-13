/**
 * EDITOR EM LOTE — helper de arraste (drag) por % do canvas.
 *
 * Gera um `onPointerDown` que acompanha o movimento do ponteiro (mouse e
 * touch) e atualiza `x`/`y` (em % do canvas) do alvo (`logo` | `texto`) na
 * CONFIG COMPARTILHADA via atualizador funcional.
 */

import { CORTE_MAXIMO } from '../../lib/configEditorLote';

export function gerarArraste(alvo, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
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
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        [alvo]: {
          ...cfg[alvo],
          x: Math.min(100, Math.max(0, (inicial.x || 0) + dx)),
          y: Math.min(100, Math.max(0, (inicial.y || 0) + dy)),
        },
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
 * ÁREA DO VÍDEO — mover/redimensionar a região onde o vídeo fica (px do canvas).
 * ------------------------------------------------------------------------- */

/** Mueve la ÁREA DEL VÍDEO arrastrando el rectángulo punteado. */
export function gerarArrastreArea(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
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
    const startX = e.clientX;
    const startY = e.clientY;

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / escala;
      const dy = (ev.clientY - startY) / escala;
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        areaVideo: {
          ...cfg.areaVideo,
          x: Math.min(cW - inicial.largura, Math.max(0, inicial.x + dx)),
          y: Math.min(cH - inicial.altura, Math.max(0, inicial.y + dy)),
        },
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
/** Redimensiona la ÁREA DEL VÍDEO desde las manijas ('direita'|'abaixo'|'canto'). */
export function gerarRedimensionarArea(eixo, aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
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
    const startX = e.clientX;
    const startY = e.clientY;

    function aoMover(ev) {
      const dx = (ev.clientX - startX) / escala;
      const dy = (ev.clientY - startY) / escala;
      aoAtualizarConfig((cfg) => {
        const area = { ...cfg.areaVideo };
        if (eixo === 'direita' || eixo === 'canto') {
          area.largura = Math.min(cW - area.x, Math.max(100, inicial.largura + dx));
        }
        if (eixo === 'abaixo' || eixo === 'canto') {
          area.altura = Math.min(cH - area.y, Math.max(100, inicial.altura + dy));
        }
        return { ...cfg, areaVideo: area };
      });
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
 * CORTE DE BORDAS — arrastar linhas superior/inferior (em px do canvas).
 * ------------------------------------------------------------------------- */

/** Handler de arraste da linha de corte superior. Ele lê a posiçÃ£o inicial
 * da linha direto do prÃ³prio elemento (data-y) e a atualiza em % do canvas. */
export function gerarArrastarCorteSuperior(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicialY = parseFloat(el.dataset.y) || 0;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / escala;
      const pct = clampPct(inicialY + percentFromDelta(cH, dy));
      aoAtualizarConfig((cfg) => {
        const corte = cfg.corteBordas || {};
        const inf = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.inferior) || 0));
        return {
          ...cfg,
          corteBordas: { ...corte, superior: Math.min(CORTE_MAXIMO - inf, Math.max(0, pct)) },
        };
      });
    }
    function aoSoltar() {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
    }
    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
  };
}

/** Handler de arraste da linha de corte inferior. Idem, porém a posiÃ§Ã£o inicial Ã©
 * lida do elemento da linha em si. */
export function gerarArrastarCorteInferior(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicialY = parseFloat(el.dataset.y) || 0;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / escala;
      const pct = clampPct(inicialY + percentFromDelta(cH, dy));
      aoAtualizarConfig((cfg) => {
        const corte = cfg.corteBordas || {};
        const sup = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.superior) || 0));
        return {
          ...cfg,
          corteBordas: { ...corte, inferior: Math.min(CORTE_MAXIMO - sup, Math.max(0, pct)) },
        };
      });
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
