import { X, Upload, Trash2, Eye, EyeOff, MoveDiagonal2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gerarArrasteDeRuta, gerarRedimensionarLogo } from './arraste';
import { CANVAS_LARGURA } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — popup GRANDE da logo (fundo branco).
 *
 * Ao clicar em "Logo" (PainelEditor) abre este editor grande com:
 * - fundo branco e preview GRANDE (proporção 9:16 como o canvas);
 * - adicionar logo (upload local);
 * - mover com o mouse (drag), aumentar/diminuir com a alça (resize);
 * - posicionar (X/Y), tamanho (largura), opacidade e visibilidade;
 * - visualização em TEMPO REAL sobre a config COMPARTILHADA (o canvas de
 *   trás e todo o lote atualizam na hora — sem botão "aplicar").
 */

const PREV_LARGURA_PADRAO = 400; // largura padrão do preview (md:w-[400px])

export default function PopupLogo({ config, aoAtualizarConfig, aoCerrar }) {
  const logo = config.logo || {};
  const previewRef = useRef(null);
  // Escala LIVE do preview px→px do canvas real (medida no próprio elemento):
  // as alças usam isso pra converter arraste do popup em % do canvas 9:16.
  const [escalaPreview, setEscalaPreview] = useState(PREV_LARGURA_PADRAO / CANVAS_LARGURA);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const medir = () => {
      if (el.clientWidth > 0) setEscalaPreview(el.clientWidth / CANVAS_LARGURA);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const arrastarLogo = gerarArrasteDeRuta(['logo'], aoAtualizarConfig);
  const redimensionarLogo = gerarRedimensionarLogo(aoAtualizarConfig);

  const aoMudarLogo = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, [campo]: valor } }));

  function aoEscolherLogo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (logo.url && logo.url.startsWith('blob:')) URL.revokeObjectURL(logo.url);
    const url = URL.createObjectURL(arquivo);
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, url, arquivo, visivel: true } }));
    e.target.value = '';
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        aoAtualizarConfig((cfg) => ({
          ...cfg,
          logo: { ...cfg.logo, alturaProporcao: img.naturalHeight / img.naturalWidth },
        }));
      }
    };
    img.src = url;
  }

  function aoRemoverLogo() {
    if (logo.url && logo.url.startsWith('blob:')) URL.revokeObjectURL(logo.url);
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, url: null, arquivo: null } }));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editor de logo"
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: 'rgba(10,10,16,0.7)' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) aoCerrar();
      }}
    >
      <div className="edl-popup-logo relative w-full max-w-[900px] h-auto rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh]">
        {/* Barra superior do popup (blanca) */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black" style={{ background: 'var(--edl-grad)' }}>
            L
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 leading-none">Editor de Logo</h2>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5 leading-none">
              Mova com o mouse · redimensione com as alças · mudanças em tempo real para todo o lote
            </p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={aoCerrar}
            aria-label="Fechar editor de logo"
            className="edl-ring-foco w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4 px-5 py-4">
          {/* Preview GRANDE — fundo branco, logo arrastável e redimensionável.
              data-escala/data-canvas-largura LIVE: o arraste do popup é
              convertido pra % do canvas 9:16 REAL (mesma matemática do editor). */}
          <div
            ref={previewRef}
            className="relative w-full md:w-[400px] shrink-0 aspect-[9/16] rounded-xl bg-white"
            data-escala={String(escalaPreview)}
            data-canvas-largura={String(CANVAS_LARGURA)}
            style={{ boxShadow: 'inset 0 0 0 2px rgba(15,23,42,0.15)' }}
          >
            {logo.visivel && logo.url ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="Arrastrar logo"
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
                  className="w-full h-auto pointer-events-none"
                  onLoad={(e) => {
                    const im = e.currentTarget;
                    if (im.naturalWidth > 0) {
                      const prop = im.naturalHeight / im.naturalWidth;
                      if (Math.abs((logo.alturaProporcao || 0) - prop) > 0.001) {
                        aoMudarLogo('alturaProporcao', prop);
                      }
                    }
                  }}
                />
                {/* Manija de resize (esquina inferior dereita) */}
                <span
                  role="slider"
                  aria-label="Redimensionar logo"
                  data-largura={String(Math.round(logo.largura))}
                  onPointerDown={redimensionarLogo}
                  className="edl-manija absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full border-2 border-white"
                  style={{ background: 'var(--edl-grad)', cursor: 'nwse-resize' }}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400">
                <MoveDiagonal2 className="w-6 h-6" />
                <p className="text-[11px] font-bold text-slate-500">Nenhuma logo ainda</p>
                <p className="text-[9px] font-medium text-slate-400">Adicione uma abaixo e ela aparecerá aqui</p>
              </div>
            )}
          </div>
{/* Controles */}
          <div className="flex-1 min-w-0 space-y-3">
            <label
              htmlFor="edl-popup-input-logo"
              className="edl-ring-foco w-full flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg cursor-pointer"
              style={{ background: 'var(--edl-grad)', color: '#fff' }}
            >
              <Upload className="w-3.5 h-3.5" />
              {logo.url ? 'Trocar logo' : 'Adicionar logo'}
            </label>
            <input
              id="edl-popup-input-logo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={aoEscolherLogo}
            />

            {/* Posição X */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Posição X</span>
                <span className="text-[10px] font-mono font-bold text-slate-600">{Math.round(logo.x)}%</span>
              </div>
              <input type="range" min={0} max={100} step={0.5} value={Math.round(logo.x)} onChange={(e) => aoMudarLogo('x', Number(e.target.value))} className="w-full accent-pink-500 cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Posição Y</span>
                <span className="text-[10px] font-mono font-bold text-slate-600">{Math.round(logo.y)}%</span>
              </div>
              <input type="range" min={0} max={100} step={0.5} value={Math.round(logo.y)} onChange={(e) => aoMudarLogo('y', Number(e.target.value))} className="w-full accent-pink-500 cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tamanho (largura)</span>
                <span className="text-[10px] font-mono font-bold text-slate-600">{Math.round(logo.largura)}%</span>
              </div>
              <input type="range" min={2} max={60} step={0.5} value={Math.round(logo.largura)} onChange={(e) => aoMudarLogo('largura', Number(e.target.value))} className="w-full accent-pink-500 cursor-pointer" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Opacidade</span>
                <span className="text-[10px] font-mono font-bold text-slate-600">{Math.round(logo.opacidade ?? 100)}%</span>
              </div>
              <input type="range" min={0} max={100} step={1} value={Math.round(logo.opacidade ?? 100)} onChange={(e) => aoMudarLogo('opacidade', Number(e.target.value))} className="w-full accent-pink-500 cursor-pointer" />
            </div>

            {/* Visibilidad */}
            <button
              type="button"
              onClick={() => aoMudarLogo('visivel', !logo.visivel)}
              className="edl-ring-foco w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-300"
            >
              <span className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                {logo.visivel ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-70" />}
                Logo visível no lote
              </span>
              <span className="relative w-8 h-[18px] rounded-full transition-colors" style={{ background: logo.visivel ? 'var(--edl-grad)' : '#cbd5e1' }}>
                <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all" style={{ left: logo.visivel ? 16 : 2 }} />
              </span>
            </button>

            <button
              type="button"
              onClick={aoRemoverLogo}
              className="edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover logo do lote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}