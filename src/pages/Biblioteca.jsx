import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarFinais, listarAgendamentos, urlArquivo } from '../lib/api';
import { statusUi, CICLO } from '../lib/status';
import { formatarData } from '../lib/fuso';
import StatusDot from '../components/StatusDot';
import RedeIcon from '../components/RedeIcon';
import { Archive, CalendarClock, ChevronDown, Loader2, Play, RefreshCw, X } from 'lucide-react';

const INTERVALO_MS = 30 * 1000; // polling existente mantido (1 único timer)

const FILTROS = [
  ['todos', 'Todos'],
  ['pronto', 'Pronto'],
  ['programado', 'Programado'],
  ['publicando', 'Publicando'],
  ['erro', 'Erro'],
];

const PRIORIDADE = { publicando: 4, erro: 3, agendado: 2, publicado: 1, cancelado: 0 };

/**
 * BIBLIOTECA — ciclo de vida dos vídeos (NÃO é uma segunda tela de gestão de
 * agendamentos). Fontes: FINAIS concluídos + AGENDAMENTOS.
 * Estados derivados na UI: PRONTO → PROGRAMADO → PUBLICANDO → PUBLICADO
 * (ERRO e CANCELADO como estados alternativos).
 *
 * LISTAGEM OPERACIONAL: quando o vídeo chega a PUBLICADO ele SAI da grade
 * operacional (ver `listarFinais(..., { operacionais: true })`, filtrado no
 * BACKEND) e passa a aparecer apenas no histórico de publicados abaixo —
 * nada é apagado do servidor.
 *
 * A gestão (criar/editar/cancelar) fica na tela AGENDAMENTO; daqui o usuário
 * só envia um vídeo PRONTO para o Agendamento ("Agendar" já pré-seleciona).
 */
function estadoDoFinal(f, ags) {
  const relacionadas = ags.filter(
    (ag) =>
      (ag.finalId && ag.finalId === f.id) ||
      (!ag.finalId && ag.bibliotecaId && ag.bibliotecaId === f.originalId)
  );
  if (relacionadas.length === 0) return { estado: 'pronto', ag: null, total: 0 };
  const ordenados = [...relacionadas].sort((a, b) => {
    const p = (PRIORIDADE[b.status] ?? 0) - (PRIORIDADE[a.status] ?? 0);
    if (p !== 0) return p;
    return String(b.criadoEm || '').localeCompare(String(a.criadoEm || ''));
  });
  const escolhido = ordenados[0];
  return { estado: statusUi(escolhido), ag: escolhido, total: relacionadas.length };
}

export default function Biblioteca({ aoAgendar }) {
  const [finais, setFinais] = useState([]); // LISTAGEM OPERACIONAL (sem publicados)
  const [finaisTodos, setFinaisTodos] = useState([]); // para o histórico
  const [ags, setAgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [preview, setPreview] = useState(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      // `operacionais: true` deixa o BACKEND fora os vídeos já PUBLICADOS —
      // eles continuam no servidor, só saem desta listagem.
      const [f, todos, a] = await Promise.all([
        listarFinais(null, { operacionais: true }),
        listarFinais(),
        listarAgendamentos(),
      ]);
      setFinais(Array.isArray(f) ? f : []);
      setFinaisTodos(Array.isArray(todos) ? todos : []);
      setAgs(Array.isArray(a) ? a : []);
      setErro('');
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar a Biblioteca.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const itens = useMemo(
    () =>
      finais
        .filter((f) => f.status === 'concluido')
        .map((f) => ({ final: f, ...estadoDoFinal(f, ags) }))
        // Rede de segurança (a filtragem real é do backend): PUBLICADO nunca
        // aparece na grade operacional.
        .filter((it) => it.estado !== 'publicado'),
    [finais, ags]
  );

  /** HISTÓRICO — vídeos que já saíram da listagem operacional (PUBLICADOS). */
  const publicados = useMemo(
    () =>
      finaisTodos
        .filter((f) => f.status === 'concluido')
        .map((f) => ({ final: f, ...estadoDoFinal(f, ags) }))
        .filter((it) => it.estado === 'publicado'),
    [finaisTodos, ags]
  );

  const contagem = useMemo(() => {
    const c = { todos: itens.length, pronto: 0, programado: 0, publicando: 0, publicado: 0, erro: 0, cancelado: 0 };
    for (const it of itens) c[it.estado] = (c[it.estado] || 0) + 1;
    return c;
  }, [itens]);

  const visiveis = useMemo(
    () => (filtro === 'todos' ? itens : itens.filter((it) => it.estado === filtro)),
    [itens, filtro]
  );
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-text tracking-tight">Biblioteca</h2>
          <p className="text-xs text-text-muted font-medium mt-0.5">
            Ciclo de vida dos vídeos: PRONTO → PROGRAMADO → PUBLICANDO → PUBLICADO
            <span className="text-text-dim"> · publicados saem desta lista</span>
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

      {/* Filtros por estado do ciclo */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {FILTROS.map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
              filtro === id
                ? 'border-rosa-borda text-rosa-hover bg-rosa-dim'
                : 'border-line text-text-muted hover:text-text-dim bg-surface-hover'
            }`}
          >
            {rotulo}
            {contagem[id] ? <span className="font-mono"> · {contagem[id]}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-xs font-medium text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando biblioteca...
        </div>
      ) : erro ? (
        <div className="glass-panel border border-rose-500/30 bg-rose-500/10 rounded-2xl py-12 text-center text-xs font-bold text-rose-300">
          {erro}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="glass-panel border-2 border-dashed border-line-light rounded-2xl py-16 text-center bg-surface">
          <p className="text-sm font-semibold text-text">
            {filtro === 'todos'
              ? 'Nenhum vídeo final concluído ainda.'
              : `Nenhum vídeo em estado "${rotuloFiltro(filtro)}".`}
          </p>
          <p className="text-xs text-text-muted font-medium mt-1">
            Processe vídeos no Editor para vê-los aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visiveis.map((item) => (
            <CartaoVideo key={item.final.id} item={item} aoAgendar={aoAgendar} aoPreview={setPreview} />
          ))}
        </div>
      )}
      {/* HISTÓRICO DE PUBLICADOS — vídeos que saíram da listagem operacional.
          Nada foi apagado: o arquivo e o registro continuam no servidor. */}
      {publicados.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className="w-full flex items-center justify-between glass-panel rounded-2xl border border-line px-5 py-3 bg-surface hover:border-line-light transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-text-dim">
              <Archive className="w-3.5 h-3.5 text-rosa" />
              Histórico de publicados
              <span className="text-[10px] font-mono text-text-muted">· {publicados.length}</span>
            </span>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${historicoAberto ? 'rotate-180' : ''}`} />
          </button>

          {historicoAberto && (
            <div className="mt-3 glass-panel rounded-2xl border border-line overflow-hidden bg-surface divide-y divide-line">
              {publicados.map((it) => (
                <div key={it.final.id} className="flex items-center gap-3 p-3">
                  <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                    {it.final.thumbnailFinal ? (
                      <img src={urlArquivo(it.final.thumbnailFinal)} className="w-full h-full object-cover" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-text-muted" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-text truncate" title={it.final.nomeFinal}>
                      {it.final.nomeFinal || 'Vídeo'}
                    </p>
                    <p className="text-[10px] text-text-muted font-medium truncate">
                      {it.ag
                        ? `Publicado em ${formatarData(it.ag.data)} • ${it.ag.horario}`
                        : 'Publicado'}
                    </p>
                  </div>
                  <StatusDot status="publicado" comRotulo />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prévia do vídeo final */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-line bg-surface overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <p className="text-xs font-bold text-text truncate">{preview.final.nomeFinal || 'Vídeo'}</p>
              <button
                onClick={() => setPreview(null)}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <video src={urlArquivo(preview.final.urlFinal)} controls className="w-full max-h-[70vh] bg-black" />
            <div className="px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted font-mono truncate">
                {preview.ag
                  ? `${formatarData(preview.ag.data)} • ${preview.ag.horario}`
                  : 'Sem publicação programada'}
              </p>
              <StatusDot status={preview.estado} comRotulo />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function rotuloFiltro(id) {
  const f = FILTROS.find(([fid]) => fid === id);
  return f ? f[1] : id;
}

/** Mini-stepper do ciclo: PRONTO → PROGRAMADO → PUBLICANDO → PUBLICADO. */
function CicloVida({ estado }) {
  const idx = CICLO.indexOf(estado); // -1 para erro/cancelado
  const cor = (s) =>
    s === 'publicado' ? 'bg-emerald-500' : s === 'publicando' ? 'bg-amber-500' : 'bg-rosa';
  return (
    <div
      className="flex items-center gap-1"
      title="Ciclo: PRONTO → PROGRAMADO → PUBLICANDO → PUBLICADO"
    >
      {CICLO.map((s, i) => (
        <span
          key={s}
          className={`h-1 flex-1 rounded-full transition-colors ${idx >= i ? cor(s) : 'bg-slate-700'}`}
        />
      ))}
    </div>
  );
}

/** Cartão de vídeo com o ciclo de vida e a ação "Agendar" (só para PRONTO). */
function CartaoVideo({ item, aoAgendar, aoPreview }) {
  const { final: f, estado, ag } = item;
  const thumb = f.thumbnailFinal ? urlArquivo(f.thumbnailFinal) : null;
  const video = f.urlFinal ? urlArquivo(f.urlFinal) : null;
  return (
    <div className="glass-panel rounded-2xl border border-line overflow-hidden bg-surface flex flex-col">
      <div className="relative h-44 bg-slate-900">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-[10px] font-medium">
            sem thumb
          </div>
        )}
        {video && (
          <button
            onClick={() => aoPreview(item)}
            title="Visualizar"
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors group/thumb"
          >
            <Play
              className="w-6 h-6 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              fill="currentColor"
            />
          </button>
        )}
        <div className="absolute top-2 left-2">
          <StatusDot status={estado} comRotulo />
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <p className="text-xs font-bold text-text truncate" title={f.nomeFinal}>
          {f.nomeFinal || 'Vídeo'}
        </p>
        <p className="text-[10px] text-text-muted font-medium truncate">
          {f.templateNome ? `Template: ${f.templateNome}` : 'Final processado'}
        </p>

        {ag && (
          <p className="text-[11px] font-mono text-text-dim flex items-center gap-1.5">
            {formatarData(ag.data)} • {ag.horario}
            <RedeIcon rede="instagram" className="w-3 h-3" />
          </p>
        )}

        {estado === 'erro' && ag?.erroMensagem && (
          <p className="text-[10px] text-rose-300/90 truncate" title={ag.erroMensagem}>
            {ag.erroMensagem}
          </p>
        )}

        <CicloVida estado={estado} />

        <div className="mt-auto pt-2">
          {estado === 'pronto' ? (
            <button
              onClick={() => aoAgendar?.(f.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-rosa hover:bg-rosa-hover text-white py-2 rounded-xl text-[11px] font-bold shadow-md shadow-rosa/20 transition-all"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Agendar
            </button>
          ) : (
            <p className="text-[10px] text-text-muted font-medium text-center py-1">
              Gerenciar na tela Agendamento
            </p>
          )}
        </div>
      </div>
    </div>
  );
}