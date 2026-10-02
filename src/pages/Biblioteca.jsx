import { useCallback, useEffect, useMemo, useState } from 'react';
import { listarFinais, listarAgendamentos, excluirFinal, excluirTodosOsVideos, buscarBiblioteca, buscarContas, urlArquivo } from '../lib/api';
import { statusUi, CICLO } from '../lib/status';
import { formatarData } from '../lib/fuso';
import StatusDot from '../components/StatusDot';
import RedeIcon from '../components/RedeIcon';
import {
  templateExibicao,
  idCurto,
  dataCurta,
  descricaoDoAgendamento,
  hashtagsDaDescricao,
  duracaoTexto,
  tamanhoLegivel,
  orientacaoExclusao,
  contagemPorEstado,
} from '../lib/bibliotecaExibicao';
import {
  AlertTriangle, Archive, CalendarClock, ChevronDown, FileText,
  Loader2, Lock, Play, RefreshCw, Trash2, X,
} from 'lucide-react';

/** Estados da Biblioteca com botão de excluir (PROGRAMADO orienta cancelar). */
const EXCLUIVEL_BIBLIOTECA = new Set(['pronto', 'erro']);

const INTERVALO_MS = 30 * 1000; // polling existente mantido (1 único timer)

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
  // PAINEL DE DETALHES (substitui a antiga "prévia" solta): abre com o mesmo
  // mecanismo de vídeo já usado antes (urlArquivo + <video controls>) e
  // concentra TODA a ficha do vídeo. `preview` guarda o item aberto; o ÚNICO
  // gatilho é o botão "Ver detalhes" do card (a thumbnail é só imagem).
  const [preview, setPreview] = useState(null);
  // CONTA DE DESTINO (GET /api/contas) — só para EXIBIR o @usuário real da conta
  // conectada. Leitura pura, nenhuma escrita e nenhuma mudança de backend.
  const [contaIg, setContaIg] = useState(null);
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
      // Conta de destino: leitura APARTE e tolerante a falha — se /api/contas
      // não responder, a Biblioteca continua funcionando e apenas deixa de
      // mostrar o @usuário (nunca quebra a listagem por causa disso).
      buscarContas()
        .then((c) => setContaIg(c?.instagram || null))
        .catch(() => setContaIg(null));
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

  // ESC fecha a camada que estiver no topo (mesmo padrão de closure das telas
  // existentes do projeto). Só um listener, registrado só enquanto há painel.
  const algumAberto = Boolean(preview || excluindo || confirmarTodos || resultadoExcluirTodos);
  useEffect(() => {
    if (!algumAberto) return undefined;
    function aoTeclar(e) {
      if (e.key !== 'Escape') return;
      if (preview) setPreview(null);
      else if (excluindo) { if (!excluindoAgora) setExcluindo(null); }
      else if (confirmarTodos) { if (!excluindoTodos) setConfirmarTodos(false); }
      else if (resultadoExcluirTodos) setResultadoExcluirTodos(null);
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [algumAberto, preview, excluindo, excluindoAgora, confirmarTodos, excluindoTodos, resultadoExcluirTodos]);

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

  // CONTAGEM por estado — só os estados que FILTROS realmente oferece
  // (todos/pronto/programado/publicando/erro); ver `contagemPorEstado`.
  const contagem = useMemo(() => contagemPorEstado(itens), [itens]);

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

      {/* FILTROS por estado do ciclo — mesmos estados e mesma regra de sempre
          (a lista continua sendo `itens`, sem mudar nada no que é filtrado).
          A CONTAGEM ao lado de cada estado é sempre real e sempre visível
          (inclusive 0), para o usuário enxergar de imediato onde estão os
          vídeos. `contagem` sai dos próprios itens já carregados — nenhum
          número é inventado. */}
      <div
        className="flex flex-wrap gap-2 mb-6"
        role="group"
        aria-label="Filtrar vídeos por estado"
      >
        {FILTROS.map(([id, rotulo]) => {
          const ativo = filtro === id;
          const total = contagem[id] || 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              aria-pressed={ativo}
              title={`${total} vídeo(s) em "${rotulo}"`}
              className={`inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-colors ${
                ativo
                  ? 'border-verde-borda text-verde-hover bg-verde-dim'
                  : 'border-line text-text-muted hover:text-text-dim hover:border-line-light bg-surface'
              }`}
            >
              <span>{rotulo}</span>
              <span
                className={`font-mono text-[10px] min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-md ${
                  ativo ? 'bg-verde/15 text-verde-hover' : 'bg-surface-hover text-text-muted'
                }`}
              >
                {total}
              </span>
            </button>
          );
        })}
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
        /* GRADE RESPONSIVA — 1 coluna no celular (o card tem thumbnail + nome +
           meta, então 2 colunas espremiam o conteúdo), 2 no notebook pequeno,
           3 em telas médias e 4/5 em telas grandes. A largura máxima do
           contêiner (max-w-7xl) impede cards largos demais em monitores 4K. */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {visiveis.map((item) => (
            <CartaoVideo
              key={item.final.id}
              item={item}
              originais={originais}
              contaIg={contaIg}
              aoAgendar={aoAgendar}
              aoPreview={setPreview}
              aoExcluir={(it) => { setExcluindo(it); setErroExcluir(''); }}
            />
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
              <Archive className="w-3.5 h-3.5 text-verde" />
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

      {/* PAINEL DE DETALHES — tudo sobre a publicação num lugar só, para não
          obrigar o usuário a voltar ao Agendamento. O PLAYER é o MESMO
          mecanismo de preview que já existia (urlArquivo(urlFinal) +
          <video controls>): nada de segunda implementação de vídeo, upload ou
          URL. Fecha com ESC, no X, ou clicando fora. */}
      {preview && (
        <PainelDetalhes
          item={preview}
          originais={originais}
          contaIg={contaIg}
          aoFechar={() => setPreview(null)}
          aoAgendar={aoAgendar}
          aoExcluir={(it) => { setPreview(null); setExcluindo(it); setErroExcluir(''); }}
        />
      )}
    </div>
  );
}

function rotuloFiltro(id) {
  const f = FILTROS.find(([fid]) => fid === id);
  return f ? f[1] : id;
}

/**
 * CICLO DE VIDA — as 4 etapas reais do vídeo: PRONTO → PROGRAMADO →
 * PUBLICANDO → PUBLICADO. NÃO é barra de upload/processamento: os itens desta
 * tela já estão CONCLUÍDOS na fila; o que se acompanha aqui é a etapa de
 * PUBLICAÇÃO. Etapas passadas ficam em verde, a atual em destaque, as futuras
 * neutras. ERRO/CANCELADO ficam fora do ciclo.
 */
const ETAPAS_CICLO = [
  { estado: 'pronto', rotulo: 'Pronto' },
  { estado: 'programado', rotulo: 'Programado' },
  { estado: 'publicando', rotulo: 'Publicando' },
  { estado: 'publicado', rotulo: 'Publicado' },
];

function CicloVida({ estado, comRotulos = false }) {
  const idx = CICLO.indexOf(estado); // -1 para erro/cancelado (fora do ciclo)
  const etapaAtual = ETAPAS_CICLO.find((e) => e.estado === estado);

  if (comRotulos) {
    return (
      <ol className="flex items-center gap-1.5" aria-label="Etapa atual do ciclo de publicação">
        {ETAPAS_CICLO.map((etapa, i) => (
          <li key={etapa.estado} className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-[10px] font-bold whitespace-nowrap ${
                idx === i ? 'text-verde-hover' : idx > i ? 'text-text-dim' : 'text-text-muted'
              }`}
            >
              {etapa.rotulo}
            </span>
            {i < ETAPAS_CICLO.length - 1 && (
              <span aria-hidden="true" className={`h-px w-4 sm:w-6 ${idx > i ? 'bg-verde-borda' : 'bg-line'}`} />
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div
      className="flex items-center gap-1"
      title={`Etapa ${idx + 1} de ${CICLO.length}: ${etapaAtual ? etapaAtual.rotulo : 'fora do ciclo (erro/cancelado)'}`}
      aria-label={`Ciclo de publicação — etapa atual: ${etapaAtual ? etapaAtual.rotulo : 'fora do ciclo'}`}
    >
      {CICLO.map((s, i) => {
        const cor =
          s === 'publicado' ? 'bg-emerald-500' : s === 'publicando' ? 'bg-amber-500' : 'bg-verde';
        const classes =
          idx >= i ? (s === 'publicando' ? `${cor} animate-pulse` : cor) : 'bg-line-light';
        return <span key={s} className={`h-1 flex-1 rounded-full transition-colors ${classes}`} />;
      })}
    </div>
  );
}

/** Linha "rótulo: valor" da ficha de detalhes — some se não houver valor real. */
function LinhaDado({ rotulo, children, mono = false }) {
  if (children === null || children === undefined || children === '' || children === false) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-[11px] font-medium text-text-muted shrink-0">{rotulo}</dt>
      <dd className={`text-[11px] font-semibold text-text-dim text-right min-w-0 break-words ${mono ? 'font-mono' : ''}`}>
        {children}
      </dd>
    </div>
  );
}

/** Orientações de exclusão por estado — mesma regra de sempre, texto sob demanda. */

/**
 * DESCRIÇÃO COMPLETA — texto cru do agendamento, exibido como está.
 * `whitespace-pre-wrap` preserva quebras de linha, espaços, hashtags, emojis e
 * acentuação; nada é remontado nem cortado. Se for longo, o bloco ROLA.
 */
function DescricaoCompleta({ texto }) {
  return (
    <section aria-label="Descrição da publicação">
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-dim mb-2">
        <FileText className="w-3.5 h-3.5 text-verde" />
        Descrição
      </h4>
      <div className="rounded-xl border border-line bg-base px-3.5 py-3 max-h-64 overflow-y-auto">
        <p className="text-xs text-text whitespace-pre-wrap break-words leading-relaxed">{texto}</p>
      </div>
    </section>
  );
}

/**
 * PAINEL DE DETALHES — ficha completa da publicação, para não obrigar o usuário
 * a voltar à tela de Agendamento. O PLAYER usa o MESMO mecanismo de preview que
 * já existia na Biblioteca (`urlArquivo(urlFinal)` + `<video controls>`): não
 * há segunda implementação de carregamento de vídeo nem mudança no upload.
 *
 * Fecha por ESC (listener no componente pai), no X ou clicando fora.
 */
function PainelDetalhes({ item, originais, contaIg, aoFechar, aoAgendar, aoExcluir }) {
  const { final: f, estado, ag } = item;
  const orig = (originais && originais[f.originalId]) || null;
  const urlVideo = f.urlFinal ? urlArquivo(f.urlFinal) : null;
  const descricao = descricaoDoAgendamento(ag);
  const hashtags = hashtagsDaDescricao(descricao);
  const duracao = duracaoTexto(orig?.duracaoSegundos);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto"
      onClick={aoFechar}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes do vídeo ${f.nomeFinal || ''}`}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-line bg-surface overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABEÇALHO — nome do vídeo + status. */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-line">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-text truncate" title={f.nomeFinal}>
              {f.nomeFinal || 'Vídeo'}
            </h3>
            {/* IDENTIDADE DO ORIGINAL — elimina a dúvida "esse final é o vídeo que eu editei?". */}
            <p
              className="text-[10px] text-text-muted font-medium truncate mt-0.5"
              title={`Original: ${orig?.nomeOriginal || f.originalId || 'desconhecido'}`}
            >
              Original: {orig?.nomeOriginal || f.originalId || 'desconhecido'}
              {orig?.duracaoSegundos ? ` (${orig.duracaoSegundos}s)` : ''}
              {f.originalId ? ` · cópia #${idCurto(f.originalId)}` : ''}
              {f.criadoEm ? ` · final ${dataCurta(f.criadoEm)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusDot status={estado} comRotulo />
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar detalhes"
              className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* COLUNA PRINCIPAL — player, descrição completa e dados técnicos. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-4 sm:p-5 flex flex-col gap-5 min-w-0">
            {urlVideo ? (
              <video
                src={urlVideo}
                controls
                preload="metadata"
                className="w-full max-h-[45vh] rounded-xl bg-black border border-line"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-line-light bg-base py-10 text-center text-[11px] text-text-muted font-medium">
                Arquivo de vídeo indisponível para este registro.
              </div>
            )}

            {descricao ? (
              <>
                <DescricaoCompleta texto={descricao} />
                {hashtags.length > 0 && (
                  <section aria-label="Hashtags da descrição">
                    <h4 className="text-[11px] font-bold uppercase tracking-wide text-text-dim mb-2">
                      Hashtags ({hashtags.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {hashtags.map((h) => (
                        <span
                          key={h}
                          className="text-[11px] font-medium text-verde-hover bg-verde-dim border border-verde-borda/50 rounded-lg px-2 py-0.5"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              /* Vídeo sem descrição: informamos o motivo real, sem quebrar o layout. */
              <section aria-label="Descrição da publicação">
                <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-dim mb-2">
                  <FileText className="w-3.5 h-3.5 text-text-muted" />
                  Descrição
                </h4>
                <p className="rounded-xl border border-dashed border-line-light bg-base px-3.5 py-4 text-xs text-text-muted font-medium">
                  {ag
                    ? 'Este agendamento foi criado sem descrição — a publicação vai sem legenda.'
                    : 'Este vídeo ainda não foi agendado, então ainda não existe descrição definida.'}
                </p>
              </section>
            )}

            {/* DADOS TÉCNICOS — ficam AQUI, e não no card, exatamente para não
                poluir a visão rápida da grade. */}
            <section aria-label="Dados técnicos">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-text-dim mb-1.5">
                Dados técnicos
              </h4>
              <dl className="divide-y divide-line">
                <LinhaDado rotulo="ID do vídeo final" mono>{f.id}</LinhaDado>
                <LinhaDado rotulo="ID do original" mono>{f.originalId || '—'}</LinhaDado>
                <LinhaDado rotulo="ID do agendamento" mono>{ag?.id || '—'}</LinhaDado>
                <LinhaDado rotulo="ID do template" mono>{f.templateId || '—'}</LinhaDado>
                <LinhaDado rotulo="Arquivo final (servidor)" mono>
                  {f.caminhoArquivoFinal || f.urlFinal || '—'}
                </LinhaDado>
                <LinhaDado rotulo="Thumbnail (servidor)" mono>{f.thumbnailFinal || '—'}</LinhaDado>
              </dl>
            </section>
          </div>
          {/* COLUNA LATERAL — ficha de leitura rápida + ações do vídeo. */}
          <aside className="p-4 sm:p-5 border-t lg:border-t-0 lg:border-l border-line bg-surface-hover/40 flex flex-col gap-5 min-w-0">
            <section aria-label="Resumo da publicação">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-text-dim mb-1.5">
                Publicação
              </h4>
              <dl className="divide-y divide-line">
                <LinhaDado rotulo="Status">
                  <StatusDot status={estado} comRotulo />
                </LinhaDado>
                <LinhaDado rotulo="Data e horário">
                  {ag ? `${formatarData(ag.data)} às ${ag.horario}` : null}
                </LinhaDado>
                <LinhaDado rotulo="Conta">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    <RedeIcon rede="instagram" className="w-3 h-3 shrink-0" />
                    Instagram
                    {contaIg?.username ? <span className="text-text-muted">· @{contaIg.username}</span> : null}
                  </span>
                </LinhaDado>
                <LinhaDado rotulo="Template">{templateExibicao(f.templateNome)}</LinhaDado>
                <LinhaDado rotulo="Duração">{duracao}</LinhaDado>
                {/* PROCESSAMENTO — a Biblioteca só lista finais CONCLUÍDOS (ver `itens`),
                    então o percentual é sempre 100%: mostrar `f.percentual`
                    aqui sugeriria um processamento em curso que não existe. */}
                <LinhaDado rotulo="Progresso">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="w-20"><CicloVida estado={estado} /></span>
                    <span>100%</span>
                  </span>
                </LinhaDado>
                <LinhaDado rotulo="Etapa atual">
                  {ETAPAS_CICLO.find((e) => e.estado === estado)?.rotulo || 'Fora do ciclo'}
                </LinhaDado>
                <LinhaDado rotulo="Processamento">
                  {f.status === 'concluido' ? 'Processado e disponível' : `Processamento: ${f.status}`}
                </LinhaDado>
                <LinhaDado rotulo="Concluído em" mono>
                  {f.concluidoEm ? dataCurta(f.concluidoEm) : '—'}
                </LinhaDado>
                <LinhaDado rotulo="Criado em" mono>
                  {f.criadoEm ? dataCurta(f.criadoEm) : '—'}
                </LinhaDado>
                <LinhaDado rotulo="Resolução" mono>
                  {orig?.largura && orig?.altura ? `${orig.largura}×${orig.altura}` : null}
                </LinhaDado>
                <LinhaDado rotulo="Tamanho do original">{tamanhoLegivel(orig?.tamanhoBytes)}</LinhaDado>
              </dl>
            </section>

            {/* CICLO — as etapas reais do sistema, nomeadas. */}
            <section aria-label="Etapas do ciclo">
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-text-dim mb-2">
                Etapa da publicação
              </h4>
              <CicloVida estado={estado} comRotulos />
              {item.total > 1 && (
                <p className="text-[10px] text-text-muted font-medium mt-2">
                  Este vídeo tem {item.total} agendamento(s) vinculados — ver o mais recente.
                </p>
              )}
            </section>

            {estado === 'erro' && (ag?.erroMensagem || f.erroMensagem) && (
              <section aria-label="Erro registrado">
                <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-300 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Erro
                </h4>
                <p className="text-[11px] text-rose-300/90 break-words">
                  {ag?.erroMensagem || f.erroMensagem}
                </p>
              </section>
            )}

            {/* A REGRA de exclusão continua valendo: o texto pesado saiu do card
                e passou a ser explicado aqui, sob demanda. */}
            <section aria-label="Sobre a exclusão">
              <p className="flex items-start gap-1.5 text-[10px] text-text-muted leading-relaxed">
                <Lock className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{orientacaoExclusao(estado)}</span>
              </p>
            </section>

            {/* AÇÕES — as mesmas ações que já existiam no card. */}
            <div className="mt-auto flex flex-col gap-2 pt-1">
              {estado === 'pronto' && (
                <button
                  type="button"
                  onClick={() => aoAgendar?.(f.id)}
                  className="inline-flex items-center justify-center gap-1.5 bg-verde hover:bg-verde-hover text-[#06120a] py-2.5 rounded-xl text-[11px] font-bold transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Agendar
                </button>
              )}
              <button
                type="button"
                onClick={aoFechar}
                className="inline-flex items-center justify-center gap-1.5 border border-line text-text-dim hover:text-text hover:border-line-light py-2.5 rounded-xl text-[11px] font-bold transition-colors"
              >
                Fechar
              </button>
              {EXCLUIVEL_BIBLIOTECA.has(estado) ? (
                <button
                  type="button"
                  onClick={() => aoExcluir?.(item)}
                  className="inline-flex items-center justify-center gap-1.5 border border-rose-500/40 text-rose-300 hover:text-white hover:bg-rose-500/10 py-2.5 rounded-xl text-[11px] font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * CARTÃO DE VÍDEO — hierarquia visual pensada para leitura rápida:
 *   1. THUMBNAIL (elemento principal, proporção 16:9)
 *   2. STATUS (sobreposto no canto da thumbnail)
 *   3. NOME do vídeo (2 linhas, com tooltip quando truncado)
 *   4. DATA/HORÁRIO
 *   5. CONTA/DESTINO
 *   6. TEMPLATE
 *   7. AÇÃO "Ver detalhes"
 *
 * Tudo que é técnico (IDs, hash, caminhos do servidor, processamento) foi
 * movido para o PAINEL DE DETALHES. As AÇÕES que já existiam — Agendar e
 * Excluir — foram preservadas, junto da regra que só permite excluir em PRONTO
 * e ERRO. A mensagem "cancele no Agendamento antes de excluir" saiu do card
 * (ocupava espaço repetido em todo card) e virou um tooltip discreto + texto
 * completo dentro dos detalhes; a REGRA em si continua idêntica.
 */
function CartaoVideo({ item, originais, contaIg, aoAgendar, aoPreview, aoExcluir }) {
  const { final: f, estado, ag } = item;
  const orig = (originais && originais[f.originalId]) || null;
  const thumb = f.thumbnailFinal ? urlArquivo(f.thumbnailFinal) : null;
  const nome = f.nomeFinal || 'Vídeo';
  const descricao = descricaoDoAgendamento(ag);
  const temDescricao = Boolean(descricao.trim());
  // PRÉVIA da descrição (1ª linha não vazia) — texto puro, apenas para o
  // usuário ver que existe descrição. O texto COMPLETO fica no painel.
  const previaDescricao = temDescricao ? descricao.trim().split('\n').find((l) => l.trim()) : '';
  // Orientação de exclusão calculada UMA vez (reaproveitada no title e no
  // aria-label do ícone de cadeado).
  const avisoExclusao = orientacaoExclusao(estado);

  return (
    <article className="glass-panel rounded-2xl border border-line overflow-hidden bg-surface flex flex-col hover:border-line-light transition-colors">
      {/* 1 + 2 — THUMBNAIL com STATUS sobreposto. A imagem é o elemento visual
          principal. NÃO é botão: o único gatilho dos detalhes é "Ver detalhes". */}
      <div className="relative aspect-video w-full bg-black">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-[10px] font-medium">
            sem thumb
          </div>
        )}
        <div className="absolute top-2 left-2">
          <StatusDot status={estado} comRotulo />
        </div>
      </div>

      {/* 3 a 7 — nome, data/horário, conta/destino, template e ações. */}
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <h3 className="text-xs font-bold text-text leading-snug line-clamp-2" title={nome}>
          {nome}
        </h3>
        {/* 4 e 5 — DATA/HORÁRIO + CONTA/DESTINO. Sem agendamento, mostramos quando o
            vídeo foi concluído (informação real do registro). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-text-dim">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="w-3 h-3 shrink-0 text-text-muted" />
            {ag ? `${formatarData(ag.data)} • ${ag.horario}` : dataCurta(f.criadoEm) || '—'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <RedeIcon rede="instagram" className="w-3 h-3 shrink-0" />
            Instagram
            {contaIg?.username ? <span className="text-text-muted">· @{contaIg.username}</span> : null}
          </span>
        </div>

        {/* 6 — TEMPLATE (secundário, nunca o dado principal). */}
        <p className="text-[10px] text-text-muted font-medium truncate" title={templateExibicao(f.templateNome)}>
          {`Template: ${templateExibicao(f.templateNome)}`}
        </p>

        {/* IDENTIFICAÇÃO DO VÍDEO — impede confundir vídeos de NOMES IGUAIS.
            Mesma origem e mesma regra do card anterior (id curto do ORIGINAL,
            duração do ORIGINAL e data de criação do FINAL). Sem agendamento
            — estado PRONTO — é esta linha que identifica o vídeo na grade. */}
        <p
          className="text-[10px] text-text-dim font-medium truncate"
          title={`Original: ${orig?.nomeOriginal || f.originalId || '—'}${orig?.duracaoSegundos ? ` (${orig.duracaoSegundos}s)` : ''} · final criado em ${dataCurta(f.criadoEm) || '?'}`}
        >
          #{idCurto(f.originalId) || '—'}
          {orig?.duracaoSegundos ? ` · ${duracaoTexto(orig.duracaoSegundos)}` : ''}
          {f.criadoEm ? ` · ${dataCurta(f.criadoEm)}` : ''}
        </p>

        {/* DESCRIÇÃO — só uma PRÉVIA de uma linha no card; o texto completo
            (com hashtags, quebras de linha e emojis) fica no painel de detalhes.
            É TEXTO, não botão: o único gatilho dos detalhes é "Ver detalhes". */}
        {temDescricao ? (
          <p
            className="flex items-start gap-1.5 text-[10px] text-text-muted"
            title="A descrição completa aparece em Ver detalhes"
          >
            <FileText className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{previaDescricao}</span>
          </p>
        ) : null}

        {/* Erro: uma linha curta aqui; o texto completo fica nos detalhes. */}
        {estado === 'erro' && (ag?.erroMensagem || f.erroMensagem) ? (
          <p className="text-[10px] text-rose-300/90 line-clamp-2" title={ag?.erroMensagem || f.erroMensagem}>
            {ag?.erroMensagem || f.erroMensagem}
          </p>
        ) : null}

        {/* PROGRESSO — barra do ciclo de publicação (PRONTO → PROGRAMADO →
            PUBLICANDO → PUBLICADO). Mesma informação de antes, com o tooltip
            dizendo qual etapa está em curso. */}
        <div className="mt-0.5">
          <CicloVida estado={estado} />
        </div>

        {/* 7 — AÇÕES. "Ver detalhes" é a ação principal; Agendar e Excluir
            continuam disponíveis exatamente como antes. */}
        <div className="mt-auto pt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => aoPreview?.(item)}
            title={`Ver detalhes de ${nome}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 border border-line text-text-dim hover:text-text hover:border-line-light hover:bg-surface-hover py-2 rounded-xl text-[11px] font-bold transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Ver detalhes
          </button>
          {estado === 'pronto' ? (
            <button
              type="button"
              onClick={() => aoAgendar?.(f.id)}
              title="Enviar este vídeo para a tela de Agendamento"
              aria-label={`Agendar ${nome}`}
              className="inline-flex items-center justify-center gap-1.5 bg-verde hover:bg-verde-hover text-[#06120a] py-2 px-3 rounded-xl text-[11px] font-bold transition-colors"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Agendar
            </button>
          ) : null}
          {EXCLUIVEL_BIBLIOTECA.has(estado) ? (
            <button
              type="button"
              onClick={() => aoExcluir?.(item)}
              title={`Excluir "${nome}" (remove o arquivo final)`}
              aria-label={`Excluir ${nome}`}
              className="inline-flex items-center justify-center border border-line text-text-muted hover:text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10 py-2 px-2.5 rounded-xl transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            /* A REGRA de exclusão continua intacta: em PROGRAMADO/PUBLICANDO/
               PUBLICADO o botão some. Em vez do texto pesado que ocupava todos
               os cards, fica um ícone discreto com a explicação no tooltip e o
               texto completo no painel de detalhes. */
            <span title={avisoExclusao} aria-label={avisoExclusao} className="shrink-0">
              <Lock className="w-3.5 h-3.5 text-text-muted" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
