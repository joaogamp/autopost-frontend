import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarFinais, listarAgendamentos, excluirFinal, excluirTodosOsVideos, buscarBiblioteca, urlArquivo } from '../lib/api';
import { statusUi, CICLO } from '../lib/status';
import { formatarData } from '../lib/fuso';
import StatusDot from '../components/StatusDot';
import RedeIcon from '../components/RedeIcon';
import { AlertTriangle, Archive, CalendarClock, ChevronDown, Loader2, Play, RefreshCw, Trash2, X } from 'lucide-react';

/** Estados da Biblioteca com botão de excluir (PROGRAMADO orienta cancelar). */
const EXCLUIVEL_BIBLIOTECA = new Set(['pronto', 'erro']);

const INTERVALO_MS = 30 * 1000; // polling existente mantido (1 único timer)

/** Nome do template p/ EXIBIÇÃO: 'undefined' (templates salvos com o bug antigo)
 * e vazio viram um rótulo neutro — os dados no servidor NÃO são alterados. */
function templateExibicao(nome) {
  const t = String(nome || '').trim();
  return !t || t.toLowerCase() === 'undefined' ? 'Editor em Lote' : t;
}

/** Id curto estável: a ÚNICA forma confiável de distinguir cópias homônimas
 * (o downloader em massa gera vários arquivos com o MESMO nome de legenda e,
 * às vezes, CONTEÚDO diferente — o nome sozinho não identifica o vídeo). */
function idCurto(id) {
  return id ? String(id).slice(0, 8) : '';
}

/** Data compacta (dd/mm hh:mm) do FINAL — distingue re-processamentos do mesmo original. */
function dataCurta(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Resumo textual da EXCLUSÃO EM MASSA (DELETE /api/biblioteca, sem id). */
function resumoExclusaoTodos(r) {
  if (!r) return '';
  const partes = [];
  if (r.nadaAExcluir) {
    partes.push('A Biblioteca já estava vazia (ou só tem vídeos protegidos) — nada foi excluído.');
  } else {
    partes.push(`${r.originaisRemovidos || 0} vídeo(s) original(is) e ${r.finaisRemovidos || 0} vídeo(s) final(is) excluídos.`);
  }
  if (Array.isArray(r.agendamentosRemovidos) && r.agendamentosRemovidos.length > 0) {
    partes.push(`${r.agendamentosRemovidos.length} agendamento(s) de erro vinculados saíram junto.`);
  }
  if (Array.isArray(r.preservados) && r.preservados.length > 0) {
    partes.push(`${r.preservados.length} vídeo(s) preservados (veja os motivos abaixo).`);
  }
  return partes.join(' ');
}

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
  // ORIGINAIS (GET /api/biblioteca) — mapa id → vídeo original. Permite mostrar
  // em cada final QUAL original o gerou (nome real, duração, thumb) — o que
  // resolve a ambiguidade de cópias homônimas sem tocar em nada no servidor.
  const [originais, setOriginais] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [preview, setPreview] = useState(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [excluindo, setExcluindo] = useState(null); // item { final, estado } em confirmação
  const [excluindoAgora, setExcluindoAgora] = useState(false);
  const [erroExcluir, setErroExcluir] = useState('');
  // EXCLUSÃO EM MASSA da Biblioteca (botão "Excluir todos os vídeos").
  const [confirmarTodos, setConfirmarTodos] = useState(false);
  const [excluindoTodos, setExcluindoTodos] = useState(false);
  const [erroExcluirTodos, setErroExcluirTodos] = useState('');
  const [resultadoExcluirTodos, setResultadoExcluirTodos] = useState(null); // resumo pós-exclusão

  /**
   * EXCLUIR TODOS — a remoção REAL é do BACKEND (DELETE /api/biblioteca, sem
   * id): originais (uploads), finais (publicados), thumbnails, temporários e os
   * registros dos stores da Biblioteca. Templates, configurações do Editor e
   * vídeos com agendamento ativo/processamento em andamento NÃO são tocados.
   * Depois da resposta a listagem é recarregada — sem F5 (a ação reflete na UI
   * automaticamente, junto do polling que já existe).
   */
  async function confirmarExcluirTodos() {
    if (excluindoTodos) return;
    setExcluindoTodos(true);
    setErroExcluirTodos('');
    try {
      const resumo = await excluirTodosOsVideos();
      setConfirmarTodos(false);
      setFiltro('todos');
      setResultadoExcluirTodos(resumo);
      await carregar();
    } catch (e) {
      setErroExcluirTodos(e?.message || 'Não foi possível excluir os vídeos da Biblioteca.');
    } finally {
      setExcluindoTodos(false);
    }
  }

  async function confirmarExcluirFinal() {
    if (!excluindo || excluindoAgora) return;
    setExcluindoAgora(true);
    setErroExcluir('');
    try {
      await excluirFinal(excluindo.final.id);
      setExcluindo(null);
      await carregar();
    } catch (e) {
      setErroExcluir(e?.message || 'Não foi possível excluir o vídeo.');
    } finally {
      setExcluindoAgora(false);
    }
  }

  const carregar = useCallback(async () => {
    try {
      // `operacionais: true` deixa o BACKEND fora os vídeos já PUBLICADOS —
      // eles continuam no servidor, só saem desta listagem.
      const [f, todos, a, bib] = await Promise.all([
        listarFinais(null, { operacionais: true }),
        listarFinais(),
        listarAgendamentos(),
        buscarBiblioteca(),
      ]);
      setFinais(Array.isArray(f) ? f : []);
      setFinaisTodos(Array.isArray(todos) ? todos : []);
      setAgs(Array.isArray(a) ? a : []);
      const mapaOrig = {};
      for (const v of Array.isArray(bib) ? bib : []) mapaOrig[v.id] = v;
      setOriginais(mapaOrig);
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

  /** Total exibido na Biblioteca: operacionais (grade) + histórico de publicados. */
  const totalBiblioteca = itens.length + publicados.length;

  const visiveis = useMemo(
    () => (filtro === 'todos' ? itens : itens.filter((it) => it.estado === filtro)),
    [itens, filtro]
  );
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-text tracking-tight">Biblioteca</h2>
          <p className="text-xs text-text-muted font-medium mt-0.5">
            Ciclo de vida dos vídeos: PRONTO → PROGRAMADO → PUBLICANDO → PUBLICADO
            <span className="text-text-dim"> · publicados saem desta lista</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={carregar}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
          {/* EXCLUIR TODOS — ação destrutiva, sempre visível; confirma antes e a
              remoção real acontece no BACKEND (DELETE /api/biblioteca). */}
          <button
            onClick={() => { setErroExcluirTodos(''); setConfirmarTodos(true); }}
            disabled={loading || totalBiblioteca === 0}
            title={
              loading || totalBiblioteca === 0
                ? 'A Biblioteca está vazia — nada para excluir'
                : 'Exclui todos os vídeos da Biblioteca e os arquivos associados'
            }
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-300 hover:text-white px-3 py-2 rounded-xl border border-rose-500/40 hover:border-rose-500 bg-rose-500/10 hover:bg-rose-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-rose-500/10 disabled:hover:text-rose-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir todos os vídeos
          </button>
        </div>
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
            <CartaoVideo key={item.final.id} item={item} originais={originais} aoAgendar={aoAgendar} aoPreview={setPreview} aoExcluir={(it) => { setExcluindo(it); setErroExcluir(''); }} />
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

      {/* Confirmação de exclusão de FINAL (PRONTO/ERRO) */}
      {excluindo ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => { if (!excluindoAgora) setExcluindo(null); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-text">Excluir vídeo?</h3>
              <button
                onClick={() => { if (!excluindoAgora) setExcluindo(null); }}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-text-muted font-medium">
              {`"${excluindo.final.nomeFinal || 'Vídeo'}" será excluído da Biblioteca (estado ${excluindo.estado}). O arquivo final, a thumbnail e a pasta temporária serão removidos. Agendamentos de erro vinculados saem junto; programado/publicando/publicado bloqueiam.`}
            </p>
            {erroExcluir ? (
              <p className="mt-2 text-xs font-bold text-rose-300">{erroExcluir}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { if (!excluindoAgora) setExcluindo(null); }}
                disabled={excluindoAgora}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-line text-text-dim hover:text-text transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExcluirFinal}
                disabled={excluindoAgora}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
              >
                {excluindoAgora ? 'Excluindo…' : 'Excluir vídeo'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirmação da EXCLUSÃO EM MASSA (a remoção real é do backend) */}
      {confirmarTodos ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => { if (!excluindoTodos) setConfirmarTodos(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Excluir todos os vídeos
              </h3>
              <button
                onClick={() => { if (!excluindoTodos) setConfirmarTodos(false); }}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-xs font-bold text-text-muted">
              Tem certeza que deseja excluir todos os vídeos? Essa ação não pode ser desfeita.
            </p>
            <p className="mt-2 text-[11px] text-text-dim font-medium">
              {`Sai tudo desta Biblioteca (${itens.length} na lista + ${publicados.length} publicado(s) no histórico): arquivos originais, vídeos finais, thumbnails e os registros correspondentes. Templates e configurações do Editor NÃO são alterados. Vídeos com agendamento ativo ou em processamento são preservados.`}
            </p>
            {erroExcluirTodos ? (
              <p className="mt-2 text-xs font-bold text-rose-300">{erroExcluirTodos}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { if (!excluindoTodos) setConfirmarTodos(false); }}
                disabled={excluindoTodos}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-line text-text-dim hover:text-text transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExcluirTodos}
                disabled={excluindoTodos}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
              >
                {excluindoTodos ? 'Excluindo…' : 'Excluir todos'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Resultado da EXCLUSÃO EM MASSA (a listagem já foi recarregada) */}
      {resultadoExcluirTodos ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setResultadoExcluirTodos(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-text">Exclusão concluída</h3>
              <button
                onClick={() => setResultadoExcluirTodos(null)}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-text-muted font-medium">{resumoExclusaoTodos(resultadoExcluirTodos)}</p>
            {Array.isArray(resultadoExcluirTodos.preservados) && resultadoExcluirTodos.preservados.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-bold text-text-dim">Vídeos preservados:</p>
                <ul className="mt-1 max-h-40 overflow-auto rounded-xl border border-line divide-y divide-line">
                  {resultadoExcluirTodos.preservados.map((p) => (
                    <li key={`${p.tipo}-${p.id}`} className="px-3 py-2">
                      <p className="text-[11px] font-bold text-text truncate" title={p.nome}>
                        {p.nome}
                      </p>
                      <p className="text-[10px] text-text-muted font-medium">{p.motivo}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setResultadoExcluirTodos(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-line text-text-dim hover:text-text transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-text truncate">{preview.final.nomeFinal || 'Vídeo'}</p>
                {/* IDENTIDADE DO ORIGINAL — o que elimina a dúvida "esse final é do vídeo que eu editei?":
                    nome/duração do ORIGINAL que gerou este final + id curto da cópia + data do final. */}
                <p
                  className="text-[10px] text-text-muted font-medium truncate mt-0.5"
                  title={`Original: ${originais[preview.final.originalId]?.nomeOriginal || preview.final.originalId || 'desconhecido'}`}
                >
                  Original: {originais[preview.final.originalId]?.nomeOriginal || preview.final.originalId || 'desconhecido'}
                  {originais[preview.final.originalId]?.duracaoSegundos
                    ? ` (${originais[preview.final.originalId].duracaoSegundos}s)`
                    : ''}
                  {preview.final.originalId ? ` · cópia #${idCurto(preview.final.originalId)}` : ''}
                  {preview.final.criadoEm ? ` · final ${dataCurta(preview.final.criadoEm)}` : ''}
                </p>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors ml-2 shrink-0"
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

/** Cartão de vídeo com o ciclo de vida e as ações (Agendar/Excluir). */
function CartaoVideo({ item, originais, aoAgendar, aoPreview, aoExcluir }) {
  const { final: f, estado, ag } = item;
  const thumb = f.thumbnailFinal ? urlArquivo(f.thumbnailFinal) : null;
  const video = f.urlFinal ? urlArquivo(f.urlFinal) : null;
  const orig = originais ? originais[f.originalId] : null;
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
          {`Template: ${templateExibicao(f.templateNome)}`}
        </p>

        {/* ORIGINAL por trás deste final + data do final — distingue cópias
            homônimas (mesmo nome ≠ mesmo vídeo) e re-processamentos. */}
        <p
          className="text-[10px] text-text-dim font-medium truncate"
          title={`Original: ${orig?.nomeOriginal || f.originalId || '—'}${orig?.duracaoSegundos ? ` (${orig.duracaoSegundos}s)` : ''} · final criado em ${dataCurta(f.criadoEm) || '?'}`}
        >
          #{idCurto(f.originalId) || '—'}
          {orig?.duracaoSegundos ? ` · ${orig.duracaoSegundos}s` : ''}
          {f.criadoEm ? ` · ${dataCurta(f.criadoEm)}` : ''}
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

        <div className="mt-auto pt-2 flex flex-col gap-1.5">
          {estado === 'pronto' ? (
            <button
              onClick={() => aoAgendar?.(f.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-rosa hover:bg-rosa-hover text-white py-2 rounded-xl text-[11px] font-bold shadow-md shadow-rosa/20 transition-all"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Agendar
            </button>
          ) : estado === 'programado' ? (
            <p className="text-[10px] text-text-muted font-medium text-center py-1">
              Cancele na tela Agendamento antes de excluir
            </p>
          ) : estado === 'erro' ? (
            <p className="text-[10px] text-text-muted font-medium text-center py-1">
              Falhou — exclua ou reagende no Agendamento
            </p>
          ) : (
            <p className="text-[10px] text-text-muted font-medium text-center py-1">
              Gerenciar na tela Agendamento
            </p>
          )}
          {EXCLUIVEL_BIBLIOTECA.has(estado) ? (
            <button
              onClick={() => aoExcluir?.(item)}
              title={`Excluir "${f.nomeFinal || 'Vídeo'}" (remove o arquivo final)`}
              className="w-full inline-flex items-center justify-center gap-1.5 border border-line text-text-muted hover:text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10 py-2 rounded-xl text-[11px] font-bold transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}