import { useRef } from 'react';
import { ImageOff } from 'lucide-react';
import { CANVAS_LARGURA, CANVAS_ALTURA } from '../../lib/configEditorLote';
import { gerarArraste } from './arraste';

/**
 * EDITOR EM LOTE — canvas de edição (EditorCanvas).
 *
 * CANVAS 9:16 (coluna direita) com:
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

  const { largura, altura, corFundo } = config.canvas;
  const area = config.areaVideo;
  const logo = config.logo;
  const texto = config.texto;
  const item = itemSelecionado;

  // Escala do canvas na tela (largura fixa de exibição).
  const LARGURA_TELA = 240;
  const escala = LARGURA_TELA / largura;
  // Mesmo encaixe do pipeline: 'cobrir' (cover) | 'ajustar' (contain).
  const encaixe = area.fit === 'ajustar' ? 'contain' : 'cover';

  return (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-center relative overflow-hidden py-4">
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
          width: LARGURA_TELA,
          height: altura * escala,
          borderRadius: 14,
          background: corFundo,
        }}
      >
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