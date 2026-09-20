import { useEffect, useState } from 'react';
import { LayoutTemplate, Loader2, X } from 'lucide-react';
import { listarTemplates, urlPreviewTemplate } from '../../lib/api';

export default function ModalSelecionarTemplate({ aoFechar, aoEscolher, templateAtualId = null }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [templates, setTemplates] = useState([]);
  const [selecionadoId, setSelecionadoId] = useState(templateAtualId || null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const lista = await listarTemplates();
        if (!ativo) return;
        const arr = Array.isArray(lista) ? lista : [];
        arr.sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0));
        setTemplates(arr);
      } catch (e) {
        if (ativo) setErro(e?.message || 'Nao foi possivel carregar os templates.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, []);

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? templates.filter((t) => String(t?.nome || '').toLowerCase().includes(termo))
    : templates;
  const escolhido = templates.find((t) => t?.id === selecionadoId) || null;
  function confirmar() { if (escolhido) aoEscolher(escolhido); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Adicionar template">
      <div className="absolute inset-0 bg-black/60" onClick={aoFechar} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden border" style={{ background: 'var(--edl-painel)', borderColor: 'var(--edl-borda)' }}>
        <div className="shrink-0 px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--edl-borda)' }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--edl-grad)' }}>
            <LayoutTemplate className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-extrabold text-white leading-none">Adicionar template</h2>
            <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--edl-texto-dim)' }}>Escolha um template existente — ele vira o template BASE do lote.</p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="edl-ring-foco p-1.5 rounded-lg edl-superficie">
            <X className="w-4 h-4" style={{ color: 'var(--edl-texto-dim)' }} />
          </button>
        </div>
        <div className="shrink-0 px-5 py-3 border-b" style={{ borderColor: 'var(--edl-borda)' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar template pelo nome…" className="w-full edl-superficie rounded-lg px-3 py-2 text-xs font-medium text-white outline-none" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <Loader2 className="w-4 h-4 animate-spin edl-icone-a" />
              <span className="text-xs font-bold" style={{ color: 'var(--edl-texto-dim)' }}>Carregando templates…</span>
            </div>
          ) : erro ? (
            <p className="text-xs font-bold text-rose-400 py-6 text-center">{erro}</p>
          ) : visiveis.length === 0 ? (
            <p className="text-xs font-medium py-6 text-center" style={{ color: 'var(--edl-texto-mut)' }}>Nenhum template encontrado. Crie um na pagina Templates primeiro.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visiveis.map((t) => {
                const sel = t.id === selecionadoId;
                const area = t.areaVideo;
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => setSelecionadoId(t.id)} aria-pressed={sel} title={t.nome || t.id} className="edl-ring-foco w-full text-left rounded-xl overflow-hidden border-2 transition-colors" style={sel ? { borderColor: 'var(--edl-rosa)', background: 'rgba(236,72,153,0.10)' } : { borderColor: 'var(--edl-borda)' }}>
                      <span className="block aspect-[9/16] bg-[#121218] overflow-hidden">
                        <img src={urlPreviewTemplate(t.id)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      </span>
                      <span className="block px-2.5 py-2">
                        <span className="block text-[11px] font-bold text-white truncate">{t.nome || '(sem nome)'}</span>
                        <span className="block text-[9px] font-semibold mt-0.5 truncate" style={{ color: 'var(--edl-texto-mut)' }}>
                          {area && Number(area.largura) > 0 && Number(area.altura) > 0 ? `Area: ${Math.round(area.largura)}x${Math.round(area.altura)}` : 'Sem area de video'}
                          {t.id === templateAtualId ? ' · atual' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="shrink-0 px-5 py-3.5 border-t flex items-center gap-2 justify-end" style={{ borderColor: 'var(--edl-borda)' }}>
          <button type="button" onClick={aoFechar} className="edl-botao-fantasma edl-ring-foco text-xs font-bold px-4 py-2 rounded-lg">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={!escolhido} className="edl-botao-grad edl-ring-foco text-xs font-extrabold px-4 py-2 rounded-lg disabled:opacity-50">
            {escolhido ? 'Usar template escolhido' : 'Escolha um template'}
          </button>
        </div>
      </div>
    </div>
  );
}

