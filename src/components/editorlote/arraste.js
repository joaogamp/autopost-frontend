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

import { CORTE_MAXIMO, CANVAS_LARGURA } from '../../lib/configEditorLote';

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

/** Mueve la ÁREA DEL VÍDEO arrastrando el rectángulo punteado. */
export function gerarArrastreArea(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    // No arrastra la zona cuando el usuario interactúa con el player REAL
    // (vídeo / controles de play-volumen-progreso llevan `data-edl-jugador`).
    const objetivo = e.target;
    if (typeof objetivo.closest === 'function' && objetivo.closest('[data-edl-jugador]')) return;
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
 * ------------------------------------------------------------------------- */

/** Handler de arrastre da linha de corte SUPERIOR (`data-posY` = % desde o
 * topo). Mueve solo `corteBordas.superior` (0..CORTE_MAXIMO). */
export function gerarArrastarCorteSuperior(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicialPos = parseFloat(el.dataset.posY) || 0;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / escala;
      const pct = clampPct(inicialPos + percentFromDelta(cH, dy));
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        // Independiente: solo toca `superior` — el valor de `inferior` queda
        // EXACTAMENTE como estaba.
        corteBordas: { ...cfg.corteBordas, superior: Math.min(CORTE_MAXIMO, Math.max(0, pct)) },
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

/** Handler de arrastre da linha de corte INFERIOR. A linha vive em
 * `top: (100 − inferior)%`; `data-posY` = essa posição. Arrastrar para CIMA
 * aumenta `corteBordas.inferior` (independiente de `superior`). */
export function gerarArrastarCorteInferior(aoAtualizarConfig) {
  return function aoPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const canvasEl = e.currentTarget.parentElement;
    if (!canvasEl) return;
    const escala = parseFloat(canvasEl.dataset.escala || '1');
    const cH = parseFloat(canvasEl.dataset.canvasAltura || '1920');

    const el = e.currentTarget;
    const inicialPos = parseFloat(el.dataset.posY) || 100;

    const startY = e.clientY;

    function aoMover(ev) {
      const dy = (ev.clientY - startY) / escala;
      const pos = clampPct(inicialPos + percentFromDelta(cH, dy));
      const inf = Math.min(CORTE_MAXIMO, Math.max(0, 100 - pos));
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        // Independiente: solo toca `inferior` — `superior` não é alterado.
        corteBordas: { ...cfg.corteBordas, inferior: inf },
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
