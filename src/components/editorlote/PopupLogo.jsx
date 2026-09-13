import { X, Upload, Trash2, Eye, EyeOff, Type, AtSign, Image as ImageIcon, MoveDiagonal2, BadgeCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gerarArrasteDeRuta, gerarRedimensionarLogo } from './arraste';
import { ElementoIdentidadeTexto, ElementoIdentidadeSelo, COR_SELO_AZUL } from './ElementoIdentidade';
import {
  CANVAS_LARGURA,
  criarIdentidadePadrao,
  FONTES_TEXTO,
  PESOS_TEXTO,
  ALINEACIONES_TEXTO,
} from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — popup GRANDE da IDENTIDADE DO CANAL (fundo branco).
 *
 * Ao clicar em "Logo" (PainelEditor) abre este editor grande onde cada
 * elemento é editado SEPARADAMENTE:
 * - imagem/logo;
 * - nome do canal;
 * - @ do canal;
 * - selo azul de verificado.
 *
 * TODOS os elementos podem ser: movidos com o mouse, redimensionados com
 * alças, aumentados/diminuídos e posicionados independentemente — no preview
 * branco do popup OU direto no canvas (mesma CONFIG COMPARTILHADA: o popup e
 * o canvas se espelham em tempo real e vale pro lote inteiro, sem botão
 * "aplicar").
 */

const PREV_LARGURA_PADRAO = 380; // largura padrão do preview (md:w-[380px])

/* ---------- mini-controles claros (estilo do popup branco) ---------- */

function RotuloClaro({ children, valor }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{children}</span>
      {valor !== undefined && <span className="text-[10px] font-mono font-bold text-slate-600">{valor}</span>}
    </div>
  );
}

function DeslizadorClaro({ rotulo, valor, min, max, passo = 1, sufixo = '', aoMudar }) {
  return (
    <div>
      <RotuloClaro valor={`${Math.round(valor * 10) / 10}${sufixo}`}>{rotulo}</RotuloClaro>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="w-full accent-pink-500 cursor-pointer"
      />
    </div>
  );
}

function AlternarClaro({ rotulo, ativo, aoMudar }) {
  return (
    <button
      type="button"
      onClick={() => aoMudar(!ativo)}
      className="edl-ring-foco w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200"
    >
      <span className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
        {ativo ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-60" />}
        {rotulo}
      </span>
      <span
        className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
        style={{ background: ativo ? 'var(--edl-grad)' : '#cbd5e1' }}
      >
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all shadow" style={{ left: ativo ? 16 : 2 }} />
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------- */
/* Controles de UM texto da identidade (nome | @ do canal) — escreve      */
/* SOMENTE na rota `identidade.<chave>`; os outros elementos nunca mudam. */
/* --------------------------------------------------------------------- */
function SecaoTextoIdentidade({ chave, rotulo, Icone, t, aoMudar }) {
  const pesoAtivo = t.peso || 'extranegrita';
  const alinhamentoAtivo = t.alinhamento || 'centro';
  return (
    <section className="rounded-xl border border-slate-200 p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <Icone className="w-3.5 h-3.5 text-slate-500" />
        <h3 className="text-xs font-extrabold text-slate-800">{rotulo}</h3>
      </div>

      <div>
        <RotuloClaro>Conteúdo</RotuloClaro>
        <input
          type="text"
          value={t.conteudo || ''}
          onChange={(e) => aoMudar('conteudo', e.target.value)}
          placeholder={chave === 'nome' ? 'Ex.: Canal Oficial' : 'Ex.: @canaloficial'}
          className="w-full text-[12px] font-bold px-3 py-2 rounded-lg border border-slate-300 text-slate-900 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
        />
      </div>

      <div>
        <RotuloClaro>Fonte</RotuloClaro>
        <select
          value={t.fonte || 'Arial'}
          onChange={(e) => aoMudar('fonte', e.target.value)}
          className="w-full text-[11px] font-bold px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900 bg-white"
        >
          {FONTES_TEXTO.map((f) => (
            <option key={f.id} value={f.id}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div>
        <RotuloClaro>Peso</RotuloClaro>
        <div className="grid grid-cols-3 gap-1.5">
          {PESOS_TEXTO.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => aoMudar('peso', p.id)}
              className={`h-7 rounded-lg text-[10px] font-extrabold transition-colors border ${
                pesoAtivo === p.id ? 'text-white border-transparent' : 'text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              style={pesoAtivo === p.id ? { background: 'var(--edl-grad)' } : undefined}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div>
        <RotuloClaro>Alinhamento</RotuloClaro>
        <div className="grid grid-cols-3 gap-1.5">
          {ALINEACIONES_TEXTO.map((a) => {
            const rotuloAl = a.id === 'esquerda' ? 'Esquerda' : a.id === 'direita' ? 'Direita' : 'Centro';
            const ativo = alinhamentoAtivo === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => aoMudar('alinhamento', a.id)}
                className={`h-7 rounded-lg text-[10px] font-extrabold transition-colors border ${
                  ativo ? 'text-white border-transparent' : 'text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
                style={ativo ? { background: 'var(--edl-grad)' } : undefined}
              >
                {rotuloAl}
              </button>
            );
          })}
        </div>
      </div>

      <DeslizadorClaro rotulo="Tamanho da fonte" sufixo="px" valor={t.tamanho ?? 40} min={10} max={160} aoMudar={(v) => aoMudar('tamanho', v)} />

      <div>
        <RotuloClaro>Cor</RotuloClaro>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={t.cor || '#0f172a'}
            onChange={(e) => aoMudar('cor', e.target.value)}
            className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white"
          />
          <input
            type="text"
            value={t.cor || '#0f172a'}
            spellCheck={false}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) aoMudar('cor', e.target.value);
            }}
            className="flex-1 text-[11px] font-mono px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900 uppercase outline-none focus:border-pink-500"
          />
        </div>
      </div>

      <DeslizadorClaro rotulo="Posição X" sufixo="%" valor={Math.round(t.x ?? 50)} min={0} max={100} aoMudar={(v) => aoMudar('x', v)} />
      <DeslizadorClaro rotulo="Posição Y" sufixo="%" valor={Math.round(t.y ?? 16)} min={0} max={100} aoMudar={(v) => aoMudar('y', v)} />
      <DeslizadorClaro rotulo="Largura do bloco" sufixo="%" valor={Math.round(t.largura ?? 46)} min={10} max={100} aoMudar={(v) => aoMudar('largura', v)} />
      <DeslizadorClaro rotulo="Opacidade" sufixo="%" valor={Math.round(t.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
      <AlternarClaro rotulo={`${rotulo} visível`} ativo={!!t.visivel} aoMudar={(v) => aoMudar('visivel', v)} />

      <p className="text-[10px] font-semibold text-slate-500 leading-relaxed">
        Elemento independente: arraste-o no preview, redimensione com as alças
        (lateral = largura · canto = tamanho da fonte) — nada disso altera os
        demais elementos.
      </p>
    </section>
  );
}

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

  // IDENTIDADE — mescla a config atual sobre os padrões (configs antigas, sem
  // `identidade`, ganham os valores padrão; cada elemento fica independente).
  const padrao = criarIdentidadePadrao();
  const identidade = {
    nome: { ...padrao.nome, ...config.identidade?.nome },
    usuario: { ...padrao.usuario, ...config.identidade?.usuario },
    selo: { ...padrao.selo, ...config.identidade?.selo },
  };

  // Logo: handlers IGUAIS aos do canvas — mesma config compartilhada.
  const arrastarLogo = gerarArrasteDeRuta(['logo'], aoAtualizarConfig);
  const redimensionarLogo = gerarRedimensionarLogo(aoAtualizarConfig);

  const aoMudarLogo = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, [campo]: valor } }));

  // Identidade: cada elemento escreve SOMENTE na sua rota (identidade.<chave>)
  // — os demais elementos nunca são alterados.
  const aoMudarIdentidade = (chave, campo, valor) =>
    aoAtualizarConfig((cfg) => {
      const pad = criarIdentidadePadrao();
      const atual = { ...pad, ...cfg.identidade };
      atual[chave] = { ...pad[chave], ...atual[chave], [campo]: valor };
      return { ...cfg, identidade: atual };
    });

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

  const temIdentidade =
    String(identidade.nome.conteudo || '').trim() !== '' ||
    String(identidade.usuario.conteudo || '').trim() !== '' ||
    identidade.selo.visivel;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editor da identidade do canal"
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: 'rgba(10,10,16,0.7)' }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) aoCerrar();
      }}
    >
      <div className="edl-popup-logo relative w-full max-w-[1000px] h-auto rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Barra superior do popup (branca) */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-200 shrink-0">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black" style={{ background: 'var(--edl-grad)' }}>
            <BadgeCheck className="w-4 h-4" strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 leading-none">Identidade do canal</h2>
            <p className="text-[10px] font-medium text-slate-500 mt-1 leading-none">
              Logo · nome · @ · selo azul — cada elemento é independente · mudanças em tempo real no lote inteiro
            </p>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={aoCerrar}
            aria-label="Fechar editor da identidade"
            className="edl-ring-foco w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4 px-5 py-4 overflow-y-auto">
          {/* PREVIEW BRANCO 9:16 — arraste/redimensione os elementos aqui.
              data-escala/data-canvas-largura LIVE: o arraste do popup é
              convertido pra % do canvas 9:16 REAL (mesma matemática). */}
          <div className="shrink-0 flex flex-col items-center gap-2">
            <div
              ref={previewRef}
              className="relative w-full md:w-[380px] shrink-0 aspect-[9/16] rounded-xl bg-white overflow-hidden"
              data-escala={String(escalaPreview)}
              data-canvas-largura={String(CANVAS_LARGURA)}
              style={{ boxShadow: 'inset 0 0 0 2px rgba(15,23,42,0.15)' }}
            >
              {logo.visivel && logo.url ? (
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
                  {/* Manija de resize (canto inferior direito) */}
                  <span
                    role="slider"
                    aria-label="Redimensionar logo"
                    data-largura={String(logo.largura)}
                    onPointerDown={redimensionarLogo}
                    className="edl-manija absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full border-2 border-white"
                    style={{ background: 'var(--edl-grad)', cursor: 'nwse-resize' }}
                  />
                </div>
              ) : (
                <div className="absolute inset-x-6 top-6 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center">
                  <ImageIcon className="w-5 h-5 mx-auto text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-500 mt-1">Sem logo ainda</p>
                  <p className="text-[9px] font-medium text-slate-400">Envie uma imagem na seção ao lado</p>
                </div>
              )}

              {/* Elementos da identidade — MESMOS componentes do canvas:
                  mover/redimensionar aqui espelha no canvas e no lote. */}
              <ElementoIdentidadeTexto chave="nome" t={identidade.nome} escala={escalaPreview} aoAtualizarConfig={aoAtualizarConfig} />
              <ElementoIdentidadeTexto chave="usuario" t={identidade.usuario} escala={escalaPreview} aoAtualizarConfig={aoAtualizarConfig} />
              <ElementoIdentidadeSelo selo={identidade.selo} aoAtualizarConfig={aoAtualizarConfig} />

              {!logo.url && !temIdentidade && (
                <div className="absolute inset-x-8 bottom-8 text-center pointer-events-none">
                  <MoveDiagonal2 className="w-5 h-5 mx-auto text-slate-300" />
                  <p className="text-[10px] font-bold text-slate-400 mt-1">
                    Preencha o nome/@ ao lado — depois arraste cada elemento para posicionar
                  </p>
                </div>
              )}
            </div>
            <p className="text-[10px] font-bold text-slate-500 text-center leading-snug">
              Arraste com o mouse · alças laterais/cantos redimensionam · tudo reflete no canvas e no lote
            </p>
          </div>

          {/* CONTROLES — um bloco SEPARADO por elemento */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* SEÇÃO: imagem / logo */}
            <section className="rounded-xl border border-slate-200 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <h3 className="text-xs font-extrabold text-slate-800">Imagem / Logo</h3>
              </div>
              <label
                htmlFor="edl-popup-input-logo"
                className="edl-ring-foco w-full flex items-center justify-center gap-2 text-xs font-bold py-2.5 rounded-lg cursor-pointer"
                style={{ background: 'var(--edl-grad)', color: '#fff' }}
              >
                <Upload className="w-3.5 h-3.5" />
                {logo.url ? 'Trocar logo' : 'Adicionar logo'}
              </label>
              <input id="edl-popup-input-logo" type="file" accept="image/*" className="hidden" onChange={aoEscolherLogo} />
              <DeslizadorClaro rotulo="Posição X" sufixo="%" valor={Math.round(logo.x ?? 50)} min={0} max={100} aoMudar={(v) => aoMudarLogo('x', v)} />
              <DeslizadorClaro rotulo="Posição Y" sufixo="%" valor={Math.round(logo.y ?? 8)} min={0} max={100} aoMudar={(v) => aoMudarLogo('y', v)} />
              <DeslizadorClaro rotulo="Tamanho (largura)" sufixo="%" valor={Math.round(logo.largura ?? 22)} min={2} max={60} passo={0.5} aoMudar={(v) => aoMudarLogo('largura', v)} />
              <DeslizadorClaro rotulo="Opacidade" sufixo="%" valor={Math.round(logo.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudarLogo('opacidade', v)} />
              <AlternarClaro rotulo="Logo visível no lote" ativo={logo.visivel !== false} aoMudar={(v) => aoMudarLogo('visivel', v)} />
              {logo.url && (
                <button
                  type="button"
                  onClick={aoRemoverLogo}
                  className="edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2 rounded-lg text-red-600 hover:bg-red-50 border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover logo do lote
                </button>
              )}
            </section>

            {/* SEÇÃO: nome do canal (texto independente) */}
            <SecaoTextoIdentidade
              chave="nome"
              rotulo="Nome do canal"
              Icone={Type}
              t={identidade.nome}
              aoMudar={(campo, valor) => aoMudarIdentidade('nome', campo, valor)}
            />

            {/* SEÇÃO: @ do canal (texto independente) */}
            <SecaoTextoIdentidade
              chave="usuario"
              rotulo="@ do canal"
              Icone={AtSign}
              t={identidade.usuario}
              aoMudar={(campo, valor) => aoMudarIdentidade('usuario', campo, valor)}
            />

            {/* SEÇÃO: selo azul de verificado */}
            <section className="rounded-xl border border-slate-200 p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-3.5 h-3.5" style={{ color: COR_SELO_AZUL }} />
                <h3 className="text-xs font-extrabold text-slate-800">Selo azul de verificado</h3>
              </div>
              <DeslizadorClaro rotulo="Posição X" sufixo="%" valor={Math.round(identidade.selo.x ?? 66)} min={0} max={100} aoMudar={(v) => aoMudarIdentidade('selo', 'x', v)} />
              <DeslizadorClaro rotulo="Posição Y" sufixo="%" valor={Math.round(identidade.selo.y ?? 15.6)} min={0} max={100} passo={0.2} aoMudar={(v) => aoMudarIdentidade('selo', 'y', v)} />
              <DeslizadorClaro rotulo="Tamanho" sufixo="%" valor={Math.round((identidade.selo.largura ?? 3.4) * 10) / 10} min={1} max={12} passo={0.1} aoMudar={(v) => aoMudarIdentidade('selo', 'largura', v)} />
              <DeslizadorClaro rotulo="Opacidade" sufixo="%" valor={Math.round(identidade.selo.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudarIdentidade('selo', 'opacidade', v)} />
              <AlternarClaro rotulo="Selo visível no lote" ativo={!!identidade.selo.visivel} aoMudar={(v) => aoMudarIdentidade('selo', 'visivel', v)} />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}




