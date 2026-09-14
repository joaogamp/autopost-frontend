import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listarAgendamentos, cancelarAgendamento, criarAgendamento, buscarContas, urlArquivo } from '../lib/api';
import StatusDot from '../components/StatusDot';
import { CalendarClock, Loader2, Play, RefreshCw, X } from 'lucide-react';

const INTERVALO_MS = 30 * 1000;
const VISIVEIS = new Set(['agendado', 'publicando', 'erro']);
const FUSO = 'America/Sao_Paulo';

function hojeAmanhaIso() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const m = {};
  for (const x of p) m[x.type] = x.value;
  const hoje = `${m.year}-${m.month}-${m.day}`;
  const d = new Date(Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day) + 1));
  const am = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { hoje, am };
}

function dataCurta(iso) {
  const v = String(iso || '').split('-');
  return v.length === 3 ? `${v[2]}/${v[1]}` : String(iso || '');
}

export default function Biblioteca() {
  const [ags, setAgs] = useState([]);
  const [igUser, setIgUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [preview, setPreview] = useState(null);
  const [cancelId, setCancelId] = useState(null);
  const [remarcar, setRemarcar] = useState(null);
  const [nd, setNd] = useState('');
  const [nh, setNh] = useState('');
  const [saving, setSaving] = useState(false);
  const [erroRem, setErroRem] = useState('');
  const [menuAberto, setMenuAberto] = useState(null);
  const timer = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const [lista, contas] = await Promise.all([listarAgendamentos(), buscarContas()]);
      setAgs(Array.isArray(lista) ? lista : []);
      setIgUser(contas?.instagram?.username || '');
      setErro('');
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar os agendamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    timer.current = setInterval(() => carregar(), INTERVALO_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [carregar]);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = () => setMenuAberto(null);
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [menuAberto]);

  const visiveis = useMemo(() => ags
    .filter((a) => VISIVEIS.has(a.status))
    .sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`)), [ags]);

  const grupos = useMemo(() => {
    const { hoje, am } = hojeAmanhaIso();
    const g = { HOJE: [], AMANHÃ: [], PRÓXIMOS: [] };
    for (const a of visiveis) {
      if (a.data === hoje) g.HOJE.push(a);
      else if (a.data === am) g.AMANHÃ.push(a);
      else g.PRÓXIMOS.push(a);
    }
    // Array estável na ordem HOJE → AMANHÃ → PRÓXIMOS, ocultando grupos vazios.
    // O render usa `grupos.map(...)` com `grupo.titulo` + `grupo.itens`.
    return [
      { titulo: 'HOJE', itens: g.HOJE },
      { titulo: 'AMANHÃ', itens: g.AMANHÃ },
      { titulo: 'PRÓXIMOS', itens: g.PRÓXIMOS },
    ].filter((gr) => gr.itens.length > 0);
  }, [visiveis]);

  const resumoGrupo = (lista) => {
    const erros = lista.filter((a) => a.status === 'erro').length;
    const pub = lista.filter((a) => a.status === 'publicando').length;
    const base = `${lista.length} ${lista.length === 1 ? 'vídeo programado' : 'vídeos programados'}`;
    const extra = [pub > 0 ? 'publicando' : null, erros > 0 ? `${erros} com erro` : null].filter(Boolean).join(' · ');
    return extra ? `${base} · ${extra}` : base;
  };

  async function aoCancelar(id) {
    if (!id || cancelId) return;
    setCancelId(id);
    try {
      await cancelarAgendamento(id);
      await carregar(true);
    } catch (e) {
      setErro(e?.message || 'Não foi possível cancelar o agendamento.');
    } finally {
      setCancelId(null);
    }
  }

  function abrirRemarcar(ag) {
    setRemarcar(ag);
    setNd(ag.data || '');
    setNh(ag.horario || '');
    setErroRem('');
  }

  async function confirmarRemarcar() {
    if (!remarcar || saving) return;
    setErroRem('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) return setErroRem('Escolha uma data válida.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nh)) return setErroRem('Escolha um horário válido (HH:MM).');
    setSaving(true);
    try {
      await criarAgendamento({ data: nd, horario: nh, redes: remarcar.redes, bibliotecaId: remarcar.bibliotecaId, finalId: remarcar.finalId });
      await cancelarAgendamento(remarcar.id);
      setRemarcar(null);
      await carregar(true);
    } catch (e) {
      setErroRem(e?.message || 'Não foi possível remarcar.');
    } finally {
      setSaving(false);
    }
  }
  function Linha({ ag }) {
    const thumb = ag.thumbnailUrl ? urlArquivo(ag.thumbnailUrl) : null;
    const video = ag.videoUrl ? urlArquivo(ag.videoUrl) : null;
    const cancelando = cancelId === ag.id;
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover/60 transition-colors">
        <button
          onClick={() => video && setPreview(ag)}
          disabled={!video}
          title={video ? 'Visualizar' : 'Vídeo indisponível'}
          className="w-11 h-16 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 relative group/thumb"
        >
          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : (
            <span className="w-full h-full flex items-center justify-center text-[9px] text-text-muted font-medium">sem thumb</span>
          )}
          {video && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/thumb:bg-black/40 transition-colors">
              <Play className="w-4 h-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" fill="currentColor" />
            </span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text truncate">{ag.nomeVideo || 'Vídeo'}</p>
          <p className="text-xs text-text-muted mt-0.5 font-medium">
            {dataCurta(ag.data)} • {ag.horario || '--:--'}{igUser ? <span> • @{igUser}</span> : null}
          </p>
          <div className="mt-1"><StatusDot status={ag.status === 'publicando' ? 'publicando' : ag.status === 'erro' ? 'erro' : 'agendado'} comRotulo /></div>
          {ag.status === 'erro' && ag.erroMensagem ? (
            <p className="text-[11px] text-rose-300/90 mt-1 truncate" title={ag.erroMensagem}>{ag.erroMensagem}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {video && (
            <button onClick={() => setPreview(ag)} title="Visualizar" className="p-1.5 rounded-lg text-text-muted hover:text-rosa hover:bg-rosa-dim transition-colors">
              <Play className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => abrirRemarcar(ag)} title="Remarcar" className="p-1.5 rounded-lg text-text-muted hover:text-rosa hover:bg-rosa-dim transition-colors">
            <CalendarClock className="w-4 h-4" />
          </button>
          <button onClick={() => aoCancelar(ag.id)} disabled={cancelando} title="Cancelar agendamento" className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors disabled:opacity-50">
            {cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  }
return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-xl font-extrabold text-text tracking-tight">Biblioteca</h2>
          <p className="text-xs text-text-muted font-medium mt-0.5">
            Somente vídeos programados para publicação
          </p>
        </div>
        <button
          onClick={carregar}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="glass-panel rounded-2xl border border-line bg-surface py-12 flex items-center justify-center gap-2 text-xs text-text-muted font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-rosa" />
          Carregando agendamentos...
        </div>
      ) : erro && visiveis.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-line bg-surface py-10 px-6 text-center">
          <p className="text-sm font-semibold text-text">Não foi possível carregar os agendamentos.</p>
          <p className="text-xs text-text-muted font-medium mt-1">{erro}</p>
          <button
            onClick={carregar}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-xl bg-gradient-to-r from-rosa to-roxo hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar novamente
          </button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-line bg-surface py-12 px-6 text-center">
          <CalendarClock className="w-8 h-8 text-text-dim mx-auto" />
          <p className="text-sm font-bold text-text mt-3">Nenhum vídeo programado</p>
          <p className="text-xs text-text-muted font-medium mt-1">
            Finalize um vídeo no Editor e programe a publicação no Agendamento.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.titulo}>
              <p className="text-[11px] font-mono font-bold text-rosa uppercase tracking-widest mb-2 px-1">
                {grupo.titulo}
              </p>
              <div className="glass-panel rounded-2xl border border-line divide-y divide-line overflow-hidden bg-surface">
                {grupo.itens.map((ag) => (
                  <Linha key={ag.id} ag={ag} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

{preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <p className="text-xs font-bold text-text truncate">{preview.nomeVideo || 'Vídeo'}</p>
              <button
                onClick={() => setPreview(null)}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <video src={urlArquivo(preview.videoUrl)} controls className="w-full max-h-[70vh] bg-black" />
            <p className="px-4 py-2.5 text-xs text-text-muted font-mono">
              {dataCurta(preview.data)} • {preview.horario}
              {igUser && <span> • @{igUser}</span>}
            </p>
          </div>
        </div>
      )}

      {remarcar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => !saving && setRemarcar(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-line bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-sm font-bold text-text">Remarcar publicação</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5 truncate">
              {remarcar.nomeVideo || 'Vídeo'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <label className="block">
                <span className="text-[11px] font-bold text-text-dim">Data</span>
                <input
                  type="date"
                  value={nd}
                  onChange={(e) => setNd(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold text-text bg-surface-hover border border-line rounded-xl px-2.5 py-2 outline-none focus:border-rosa"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-text-dim">Horário</span>
                <input
                  type="time"
                  value={nh}
                  onChange={(e) => setNh(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold text-text bg-surface-hover border border-line rounded-xl px-2.5 py-2 outline-none focus:border-rosa"
                />
              </label>
            </div>
            {erroRem && (
              <div className="mt-3 flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-semibold px-3 py-2 rounded-xl">
                <span>{erroRem}</span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setRemarcar(null)}
                disabled={saving}
                className="text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRemarcar}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-xl bg-gradient-to-r from-rosa to-roxo hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
