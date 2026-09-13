import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageOff } from 'lucide-react';
import { CORTE_MAXIMO, CANVAS_LARGURA, CANVAS_ALTURA } from '../../lib/configEditorLote';
import { gerarArraste, gerarArrastarCorteSuperior, gerarArrastarCorteInferior } from './arraste';

/**
 * EDITOR EM LOTE — canvas de edição (EditorCanvas).
 *
 * CANVAS 9:16 GRANDE, elemento PRINCIPAL do CENTRO da página, com:
 * - fundo da config compartilhada (vai para o template do servidor);
 * - ÁREA DO VÍDEO marcada, com o <video> REAL encaixado no fit escolhido
 *   (cobrir/ajustar — o mesmo do pipeline FFmpeg; apenas vídeos do pool, máx. 3);
 * - logo arrastável (% do canvas) — o overlay do servidor posiciona a logo
 *   exatamente nesses valores (convertidos para px por mapearEditorLote);
 * - texto do lote arrastável — o processamento quebra em linhas, CENTRALIZA
 *   horizontalmente e usa a fonte bold do sistema; a prévia também é
 *   centralizada e bold pra ficar idêntica ao render.
 *
 * TODAS as leituras vêm da CONFIG COMPARTILHADA: mover a logo/texto aqui
 * atualiza automaticamente todos os previews do lote (sem config por vídeo).
 */

export default function EditorCanvas({ config, aoAtualizarConfig, itemSelecionado, urlVideoAtiva }) {
  const canvasRef = useRef(null);
  const arrastarLogo = gerarArraste('logo', aoAtualizarConfig);
  const arrastarTexto = gerarArraste('texto', aoAtualizarConfig);
  const corredorSuperior = gerarArrastarCorteSuperior(aoAtualizarConfig);
  const corredorInferior = gerarArrastarCorteInferior(aoAtualizarConfig);

  const corFundo = config.canvas.corFundo;
  const area = config.areaVideo;
  const logo = config.logo;
  const texto = config.texto;
  const corte = config.corteBordas;
  const corteAtivo = !!corte?.ativo;
  const corteSup = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte?.superior) || 0));
  const corteInf = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte?.inferior) || 0));
  const item = itemSelecionado;
  // Mesmo encaixe do pipeline: 'cobrir' (cover) | 'ajustar' (contain).
  const encaixe = area.fit === 'ajustar' ? 'contain' : 'cover';

  // Escalada do canvas 9:16: observa o CONTENEDOR da área central (contenedorRef)
  // e calcula a maior escala que mantiene a proporção 1080×1920 cabendo inteira
  // (ancho e alto). As linhas/faixas de corte usam top/height em % — posicionamento
  // independente da escala.
  const [escala, setEscala] = useState(1);
  const contenedorRef = useRef(null);

  // Mantém o dataset do canvas com os valores em px reais e a escala atual,
  // para que os handlers de arraste/corte leiam o valor correto (evita stale
  // closure). Observa o CONTENEDOR (não o canvas) para que a escala sempre
  // preserve a proporção 9:16 dentro do espaço central disponível.
  const aoAtualizarDataset = useCallback(() => {
    const el = canvasRef.current;
    const cont = contenedorRef.current;
    if (!el) return;
    const cw = cont ? cont.clientWidth : 0;
    const ch = cont ? cont.clientHeight : 0;
    const novaEscala = cw > 0 && ch > 0 ? Math.min(cw / CANVAS_LARGURA, ch / CANVAS_ALTURA) : 1;
    setEscala(novaEscala);
    el.dataset.canvasLargura = String(CANVAS_LARGURA);
    el.dataset.canvasAltura = String(CANVAS_ALTURA);
    el.dataset.escala = String(novaEscala);
  }, [canvasRef, contenedorRef]);

  useEffect(() => {
    aoAtualizarDataset();
    const cont = contenedorRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(aoAtualizarDataset);
    ro.observe(cont);
    return () => ro.disconnect();
  }, [aoAtualizarDataset]);

  return (
    <div ref={contenedorRef} className="flex-1 min-w-0 flex flex-col items-center justify-center relative overflow-hidden px-2 pt-2 pb-1">
      {/* Ajuste rápido da área de vídeo (posicionamento configurável) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 edl-superficie rounded-full px-3 py-1.5">
        <span className="text-[9px] font-bold" style={{ color: 'var(--edl-texto-dim)' }}>
          ÁREA DO VÍDEO
        </span>
        <input
          type="range"
          min={0}
          max={900}
          value={area.y}
          onChange={(e) =>
            aoAtualizarConfig((cfg) => ({
              ...cfg,
              areaVideo: { ...cfg.areaVideo, y: parseInt(e.target.value, 10) || 0 },
            }))
          }
          className="w-32 accent-pink-500"
        />
        <span className="text-[9px] font-mono" style={{ color: 'var(--edl-texto-mut)' }}>
          y {area.y}
        </span>
      </div>

      {/* Canvas 9:16 (fundo = corFundo que vai pro template) */}
      <div
        ref={canvasRef}
        className="edl-canvas-branco relative overflow-hidden"
        style={{
          width: Math.round(CANVAS_LARGURA * escala),
          height: Math.round(CANVAS_ALTURA * escala),
          borderRadius: 14,
          background: corFundo,
        }}
      >
        {/* Cortes de bordas — linhas pontilhadas arrastáveis (superior/inferior) */}
        {corteAtivo && (
          <>
            {/* Linha superior de corte (arrastável) */}
            <div
              role="slider"
              aria-label="Corte superior"
              aria-valuemin={0}
              aria-valuemax={CORTE_MAXIMO}
              aria-valuenow={Math.round(corteSup)}
              aria-valuetext={`${Math.round(corteSup)}% da altura`}
              data-y={String(corteSup)}
              onPointerDown={corredorSuperior}
              className="edl-corredor-corte absolute left-0 right-0 z-20 cursor-row-resize touch-none"
              style={{
                top: `${corteSup}%`,
                borderTop: '2px dashed var(--edl-roxo)',
              }}
            >
              {/* Alça visual central */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: 'var(--edl-roxo)' }} />
            </div>

            {/* Linha inferior de corte (arrastável) */}
            <div
              role="slider"
              aria-label="Corte inferior"
              aria-valuemin={0}
              aria-valuemax={CORTE_MAXIMO}
              aria-valuenow={Math.round(corteInf)}
              aria-valuetext={`${Math.round(corteInf)}% da altura`}
              data-y={String(corteInf)}
              onPointerDown={corredorInferior}
              className="edl-corredor-corte absolute left-0 right-0 z-20 cursor-row-resize touch-none"
              style={{
                top: `${corteInf}%`,
                borderTop: '2px dashed var(--edl-roxo)',
              }}
            >
              {/* Alça visual central */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: 'var(--edl-roxo)' }} />
            </div>

            {/* Faixas de cor indicando o que será cortado (prévia em tempo real) */}
            {corteSup > 0 && (
              <div
                className="absolute left-0 right-0 z-10 pointer-events-none"
                style={{
                  top: 0,
                  height: `${corteSup}%`,
                  background: 'rgba(236, 72, 153, 0.18)',
                }}
              />
            )}
            {corteInf > 0 && (
              <div
                className="absolute left-0 right-0 z-10 pointer-events-none"
                style={{
                  bottom: 0,
                  height: `${corteInf}%`,
                  background: 'rgba(236, 72, 153, 0.18)',
                }}
              />
            )}
          </>
        )}

        {/* ÁREA DO VÍDEO — claramente marcada ("é aqui que meu vídeo vai ficar") */}
        <div
          className="edl-area-video absolute overflow-hidden flex items-center justify-center"
          style={{
            left: area.x * escala,
            top: area.y * escala,
            width: area.largura * escala,
            height: area.altura * escala,
            borderRadius: 8 * escala,
            display: area.mostrarMarcacao ? 'flex' : 'none',
          }}
        >
          {/* <video> REAL do servidor dentro da região marcada (só no pool) */}
          {urlVideoAtiva ? (
            <video
              src={urlVideoAtiva}
              muted
              loop
              autoPlay
              playsInline
              preload="auto"
              style={{ objectFit: encaixe }}
              className="w-full h-full"
            />
          ) : (
            item && (
              <div className="flex flex-col items-center gap-1">
                <ImageOff className="w-5 h-5" style={{ color: 'rgba(236,72,153,0.6)' }} />
                <span className="text-[8px] font-black tracking-widest" style={{ color: 'rgba(139,92,246,0.75)' }}>
                  ÁREA DO VÍDEO
                </span>
              </div>
            )
          )}
        </div>

        {/* LOGO sobre o canvas — arrastável, % do canvas. O onLoad captura a
            proporção da imagem (altura/largura) que o template usa pra calcular
            a altura em px do overlay. */}
        {logo.visivel && logo.url && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Arrastar logo"
            data-x={logo.x}
            data-y={logo.y}
            onPointerDown={arrastarLogo}
            className="edl-logo absolute"
            style={{
              left: `${logo.x}%`,
              top: `${logo.y}%`,
              width: `${logo.largura}%`,
              transform: 'translate(-50%, 0)',
              opacity: (logo.opacidade ?? 100) / 100,
            }}
          >
            <img
              src={logo.url}
              alt="Logo"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0) {
                  const prop = img.naturalHeight / img.naturalWidth;
                  if (Math.abs((logo.alturaProporcao || 0) - prop) > 0.001) {
                    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, alturaProporcao: prop } }));
                  }
                }
              }}
              className="w-full h-auto pointer-events-none"
            />
          </div>
        )}

        {/* TEXTO do lote — centralizado e bold (igual ao render do backend) */}
        {texto.visivel && texto.conteudo.trim() !== '' && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Arrastar texto"
            data-x={texto.x}
            data-y={texto.y}
            onPointerDown={arrastarTexto}
            className="edl-texto-canvas absolute"
            style={{
              left: `${texto.x}%`,
              top: `${texto.y}%`,
              width: `${texto.largura}%`,
              transform: 'translate(-50%, 0)',
              textAlign: 'center',
              fontFamily: 'Arial, "Segoe UI", sans-serif',
              fontSize: texto.tamanho * escala,
              fontWeight: 700,
              color: texto.cor,
              opacity: (texto.opacidade ?? 100) / 100,
            }}
          >
            {texto.conteudo}
          </div>
        )}
      </div>

      {/* Rodapé do canvas */}
      <p className="text-[9px] font-semibold mt-3" style={{ color: 'var(--edl-texto-mut)' }}>
        {item ? `Editando: ${item.nome}` : 'Selecione um vídeo na grade'} • {CANVAS_LARGURA}×{CANVAS_ALTURA} (9:16) • encaixe: {area.fit}
      </p>
    </div>
  );
}