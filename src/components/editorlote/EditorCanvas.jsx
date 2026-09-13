import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageOff } from 'lucide-react';
import {
  CORTE_MAXIMO,
  CANVAS_LARGURA,
  CANVAS_ALTURA,
  familiaDeFonte,
  pesoDeTexto,
} from '../../lib/configEditorLote';
import {
  gerarArrasteDeRuta,
  gerarArrastreArea,
  gerarRedimensionarArea,
  gerarRedimensionarLogo,
  gerarRedimensionarTextoLargura,
  gerarArrastarCorteSuperior,
  gerarArrastarCorteInferior,
} from './arraste';
import ControlesVideo from './ControlesVideo';

/**
 * EDITOR EM LOTE — canvas de edición (EditorCanvas).
 *
 * CANVAS 9:16 GRANDE, elemento PRINCIPAL do CENTRO da página, com:
 * - fundo da config compartilhada (vai para o template do servidor);
 * - ÁREA DO VÍDEO marcada (arrastável com el ratón + manijas de redimensión)
 *   y con el reproductor REAL (play/pausa/áudio/volume/progresso);
 * - CORTE DE BORDAS: duas linhas pontilhadas arrastables INDEPENDENTES
 *   (superior e inferior, cada una con el suyo valor y su propia manija);
 * - logo arrastável e redimensionable (% do canvas);
 * - DOS textos independientes (superior/inferior), cada uno con contenido,
 *   posição, tamanho, largura/altura, fonte, peso, cor, alinheamento,
 *   opacidade e visibilidade propias.
 *
 * TODAS as leituras vêm da CONFIG COMPARTILHADA: mover um elemento aqui
 * atualiza automaticamente todos os previews do lote (senza config por vídeo).
 */

export default function EditorCanvas({ config, aoAtualizarConfig, itemSelecionado, urlVideoAtiva }) {
  const canvasRef = useRef(null);
  const contenedorRef = useRef(null);
  const [escala, setEscala] = useState(1);

  // Handlers — arrastre genérico por ruta: cada elemento es independente.
  const arrastarLogo = gerarArrasteDeRuta(['logo'], aoAtualizarConfig);
  const arrastarTextoSuperior = gerarArrasteDeRuta(['textos', 'superior'], aoAtualizarConfig);
  const arrastarTextoInferior = gerarArrasteDeRuta(['textos', 'inferior'], aoAtualizarConfig);
  const redimensionarLogo = gerarRedimensionarLogo(aoAtualizarConfig);
  const redimensionarTextoSup = gerarRedimensionarTextoLargura(['textos', 'superior'], aoAtualizarConfig);
  const redimensionarTextoInf = gerarRedimensionarTextoLargura(['textos', 'inferior'], aoAtualizarConfig);
  const arrastarArea = gerarArrastreArea(aoAtualizarConfig);
  const redimensionarAreaDireita = gerarRedimensionarArea('direita', aoAtualizarConfig);
  const redimensionarAreaAbaixo = gerarRedimensionarArea('abaixo', aoAtualizarConfig);
  const redimensionarAreaCanto = gerarRedimensionarArea('canto', aoAtualizarConfig);
  const corredorSuperior = gerarArrastarCorteSuperior(aoAtualizarConfig);
  const corredorInferior = gerarArrastarCorteInferior(aoAtualizarConfig);

  // Compatibilidade com configs legadas (antes de `textos` superior/inferior).
  const textos = config.textos && (config.textos.superior || config.textos.inferior)
    ? config.textos
    : { superior: config.texto || {}, inferior: {} };
  const textoSup = textos.superior || {};
  const textoInf = textos.inferior || {};

  const corFundo = config.canvas.corFundo;
  const area = config.areaVideo;
  const logo = config.logo || {};
  const corte = config.corteBordas || {};
  const corteAtivo = !!corte.ativo;
  const corteSup = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.superior) || 0));
  const corteInf = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.inferior) || 0));
  // Linha inferior vive em 100%−inf. Evita que cruce la superior si el usuario
  // força valores extremos (superior + inferior ≥ 100) — los valores siguen
  // sendo independentes en la config.
  const posLinhaInferior = Math.max(corteSup + 1, 100 - corteInf);
  const item = itemSelecionado;
  // Mesmo encaixe do pipeline: 'cobrir' (cover) | 'ajustar' (contain).
  const encaixe = area.fit === 'ajustar' ? 'contain' : 'cover';

  // Escalada do canvas 9:16: observa o CONTENEDOR da área central (contenedorRef)
  // e calcula a maior escala que mantiene a proporção 1080×1920 cabendo inteira
  // (ancho e alto). As linhas/faixas de corte usam top/height em % — posicionamento
  // independente da escala.
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
              data-posY={String(corteSup)}
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
              aria-valuemax={100}
              aria-valuenow={Math.round(posLinhaInferior)}
              aria-valuetext={`${Math.round(posLinhaInferior)}% da altura`}
              data-posY={String(posLinhaInferior)}
              onPointerDown={corredorInferior}
              className="edl-corredor-corte absolute left-0 right-0 z-20 cursor-row-resize touch-none"
              style={{
                top: `${posLinhaInferior}%`,
                borderBottom: '2px dashed var(--edl-roxo)',
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

        {/* ÁREA DO VÍDEO — arrastável com o mouse + manijas de redimensionar.
            O reprodutor REAL (play/pausa/áudio/volume/progresso) vive dentro;
            interagir com ele NÃO arrasta a área (guard `data-edl-jugador`). */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Mover a área do vídeo"
          data-x={String(area.x)}
          data-y={String(area.y)}
          data-largura={String(area.largura)}
          data-altura={String(area.altura)}
          onPointerDown={arrastarArea}
          className="edl-area-video absolute overflow-hidden flex items-center justify-center touch-none select-none"
          style={{
            left: area.x * escala,
            top: area.y * escala,
            width: area.largura * escala,
            height: area.altura * escala,
            borderRadius: 8 * escala,
            cursor: 'move',
            // Marcação desativada = só some a GUIA (borda/menijas) — o vídeo
            // continua visível e rodando dentro da área.
            border: area.mostrarMarcacao ? undefined : '2px dashed transparent',
            backgroundColor: area.mostrarMarcacao ? undefined : 'transparent',
          }}
        >
          {/* <video> REAL do servidor dentro da região (só nos slots do pool) */}
          {urlVideoAtiva ? (
            <ControlesVideo key={urlVideoAtiva} src={urlVideoAtiva} encaixe={encaixe} />
          ) : (
            item && (
              <div className="flex flex-col items-center gap-1 pointer-events-none">
                <ImageOff className="w-5 h-5" style={{ color: 'rgba(236,72,153,0.6)' }} />
                <span className="text-[8px] font-black tracking-widest" style={{ color: 'rgba(139,92,246,0.75)' }}>
                  ÁREA DO VÍDEO
                </span>
              </div>
            )
          )}

          {/* Manijas de redimensionar (borda direita, baixo e canto) */}
          {area.mostrarMarcacao && (
            <>
              <span
                role="slider"
                aria-label="Redimensionar largura da área"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaDireita}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ right: -5, top: '50%', transform: 'translateY(-50%)', width: 12, height: 26, background: 'var(--edl-rosa)', cursor: 'ew-resize', touchAction: 'none' }}
              />
              <span
                role="slider"
                aria-label="Redimensionar altura da área"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaAbaixo}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 26, height: 12, background: 'var(--edl-roxo)', cursor: 'ns-resize', touchAction: 'none' }}
              />
              <span
                role="slider"
                aria-label="Redimensionar área (canto)"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaCanto}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ right: -5, bottom: -5, width: 14, height: 14, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
              />
            </>
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
            {/* Manija de redimensionar a logo (largura em % do canvas) */}
            <span
              role="slider"
              aria-label="Redimensionar logo"
              data-largura={String(logo.largura)}
              onPointerDown={redimensionarLogo}
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow"
              style={{ right: -8, bottom: -8, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
            />
          </div>
        )}

        {/* DOIS TEXTOS INDEPENDENTES (superior e inferior) — cada um tem
            conteúdo, posição, tamanho, largura, fonte, peso, cor, alinhamento,
            opacidade e visibilidade PRÓPRIOS. Mover/redimensionar um NUNCA
            altera o outro (ruta própria: textos.superior | textos.inferior). */}
        {[
          { chave: 'superior', rotulo: 'Texto superior', t: textoSup },
          { chave: 'inferior', rotulo: 'Texto inferior', t: textoInf },
        ].map(({ chave, rotulo, t }) => {
          if (!t.visivel || String(t.conteudo || '').trim() === '') return null;
          const arrastar = chave === 'superior' ? arrastarTextoSuperior : arrastarTextoInferior;
          const redimensionar = chave === 'superior' ? redimensionarTextoSup : redimensionarTextoInf;
          return (
            <div
              key={chave}
              role="button"
              tabIndex={0}
              aria-label={`Arrastar ${rotulo.toLowerCase()}`}
              data-x={String(t.x)}
              data-y={String(t.y)}
              onPointerDown={arrastar}
              className="edl-texto-canvas absolute"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.largura}%`,
                transform: 'translate(-50%, 0)',
                textAlign: t.alinhamento || 'centro',
                fontFamily: familiaDeFonte(t.fonte),
                fontSize: (t.tamanho || 40) * escala,
                fontWeight: pesoDeTexto(t.peso),
                color: t.cor,
                opacity: (t.opacidade ?? 100) / 100,
              }}
            >
              {t.conteudo}
              {/* Manija de largura (independente por texto) */}
              <span
                role="slider"
                aria-label={`Redimensionar largura do ${rotulo.toLowerCase()}`}
                data-largura={String(t.largura)}
                onPointerDown={redimensionar}
                className="absolute w-2.5 h-9 rounded-sm border-2 border-white shadow"
                style={{ right: -9, top: '50%', transform: 'translateY(-50%)', background: 'var(--edl-rosa)', cursor: 'ew-resize', touchAction: 'none' }}
              />
            </div>
          );
        })}
      </div>

      {/* Rodapé do canvas */}
      <p className="text-[9px] font-semibold mt-3" style={{ color: 'var(--edl-texto-mut)' }}>
        {item ? `Editando: ${item.nome}` : 'Selecione um vídeo na grade'} • {CANVAS_LARGURA}×{CANVAS_ALTURA} (9:16) • encaixe: {area.fit}
      </p>
    </div>
  );
}