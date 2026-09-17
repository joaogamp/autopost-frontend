import { useCallback, useEffect, useRef, useState } from 'react';
import { buscarBiblioteca, buscarFila, excluirItemFila } from '../lib/api';
import CartaoEstatistica from '../components/CartaoEstatistica';
import StatusDot from '../components/StatusDot';
import { Film, Clock, Loader2, CheckCircle2, AlertCircle, Activity, Trash2, X, RefreshCw } from 'lucide-react';

/** Itens da fila que podem ser removidos pelo Painel (processando nunca). */
const FILA_EXCLUIVEL = new Set(['aguardando', 'concluido', 'erro']);

/**
 * ÚNICO timer do Painel: o poll automático de /api/biblioteca + /api/fila.
 * O botão "Atualizar", o retorno de visibilidade da aba e o pós-exclusão
 * reutilizam a MESMA função de carga (carregar) — nunca há um segundo
 * setInterval nem fetch sobreposto (trava `buscaEmVoo` + reexecução pendente).
 */
const INTERVALO_POLL_MS = 3000;

/**
 * Contagem REAL por estado a partir da FILA do backend (GET /api/fila —
 * `fila_processamento`, atualizada atomicamente pelo worker). É a fonte da
 * verdade do pipeline; o espelho `biblioteca.status` NÃO é usado (na
 * arquitetura PC/GPU + Oracle ele não acompanha processando/erro em tempo real).
 */
export function contarPorStatus(itens, status) {
  return (itens || []).filter((item) => item && item.status === status).length;
}

export default function Dashboard() {
  const [biblioteca, setBiblioteca] = useState([]);
  const [fila, setFila] = useState([]);
  const [carregando, setCarregando] = useState(true); // 1ª carga
  const [atualizando, setAtualizando] = useState(false); // refresh manual em curso
  const [conexao, setConexao] = useState('ok'); // 'ok' | 'falha' — resultado REAL das buscas
  const [excluindo, setExcluindo] = useState(null); // item da fila em confirmação
  const [excluindoAgora, setExcluindoAgora] = useState(false);
  const [erroExcluir, setErroExcluir] = useState('');

  const buscaEmVoo = useRef(false); // trava: nunca dois fetches em paralelo
  const recarregarAoTerminar = useRef(false); // pedido de refresh durante um voo

  /**
   * FONTE ÚNICA de dados do Painel. Em falha de rede mantém os últimos dados
   * válidos na tela e marca a conexão como ruim — os números nunca são zerados
   * nem inventados: só existem o que o backend respondeu.
   */
  const carregar = useCallback(async ({ manual = false } = {}) => {
    if (buscaEmVoo.current) {
      // Chegou pedido durante um fetch em andamento: agenda exatamente MAIS UM
      // reprocesso (garante refresh pós-exclusão) sem duplicar chamadas.
      recarregarAoTerminar.current = manual || recarregarAoTerminar.current;
      return;
    }
    buscaEmVoo.current = true;
    if (manual) setAtualizando(true);
    try {
      const [bib, fl] = await Promise.all([buscarBiblioteca(), buscarFila()]);
      setBiblioteca(bib || []);
      setFila(fl || []);
      setConexao('ok');
    } catch {
      setConexao('falha');
    } finally {
      buscaEmVoo.current = false;
      if (manual) setAtualizando(false);
      setCarregando(false);
      if (recarregarAoTerminar.current) {
        recarregarAoTerminar.current = false;
        carregar({ manual });
      }
    }
  }, []);

  // ATUALIZAÇÃO AUTOMÁTICA — um único setInterval; em aba oculta o poll pausa
  // (economia) e ao voltar para a aba os dados são buscados de imediato.
  useEffect(() => {
    carregar();
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') carregar();
    }, INTERVALO_POLL_MS);
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') carregar();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [carregar]);

  async function confirmarExcluirFila() {
    if (!excluindo || excluindoAgora) return;
    setExcluindoAgora(true);
    setErroExcluir('');
    try {
      await excluirItemFila(excluindo.id);
      setExcluindo(null);
      await carregar({ manual: true }); // reflete a exclusão na hora (sem F5)
    } catch (e) {
      setErroExcluir(e?.message || 'Não foi possível excluir o item da fila.');
    } finally {
      setExcluindoAgora(false);
    }
  }

  // NÚMEROS REAIS: fila = estados do pipeline (worker); biblioteca = originais.
  const contarFila = (status) => contarPorStatus(fila, status);

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-3 text-text-muted text-sm font-medium">
          <Loader2 className="w-5 h-5 text-rosa animate-spin" />
          <span>Carregando painel...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header — indicador + botão ficam juntos, à direita */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-text">Painel</h2>
          <p className="text-xs text-text-muted mt-1 font-medium">Visão geral do pipeline de produção e agendamentos</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sistema Ativo — estado REAL: deriva do resultado da última leitura
             do backend (GET /api/biblioteca + GET /api/fila). Não é decorativo:
             falha de rede vira "Sem conexão" e mantém os últimos dados válidos. */}
          <div
            title={
              conexao === 'ok'
                ? 'Backend acessível (última leitura OK).'
                : 'Backend inacessível — exibindo os últimos dados válidos.'
            }
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border text-xs shadow-sm ${
              conexao === 'ok' ? 'border-line' : 'border-rose-500/40'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${conexao === 'ok' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="font-mono text-[11px] font-bold text-text-dim">
              {conexao === 'ok' ? 'Sistema Ativo' : 'Sem conexão'}
            </span>
          </div>
          {/* Atualizar — refresh MANUAL imediato (o automático continua valendo). */}
          <button
            type="button"
            onClick={() => carregar({ manual: true })}
            disabled={atualizando}
            title="Buscar dados agora"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-line text-xs font-bold text-text-dim shadow-sm hover:text-text hover:border-line-light transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin text-rosa' : ''}`} />
            <span>{atualizando ? 'Atualizando…' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid — todos os valores vêm do backend real */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <CartaoEstatistica rotulo="Vídeos" valor={biblioteca.length} corDestaque="#8b5cf6" icon={Film} />
        <CartaoEstatistica rotulo="Aguardando" valor={contarFila('aguardando')} corDestaque="#a1a1b0" icon={Clock} />
        <CartaoEstatistica rotulo="Processando" valor={contarFila('processando')} corDestaque="#ec4899" icon={Loader2} />
        <CartaoEstatistica rotulo="Concluídos" valor={contarFila('concluido')} corDestaque="#059669" icon={CheckCircle2} />
        <CartaoEstatistica rotulo="Erros" valor={contarFila('erro')} corDestaque="#e11d48" icon={AlertCircle} />
      </div>

      {/* Recent Activity Card */}
      <div className="glass-panel rounded-2xl border border-line overflow-hidden shadow-sm bg-surface">
        <div className="px-6 py-4.5 border-b border-line flex items-center justify-between bg-surface-hover/50">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-rosa" />
            <h3 className="font-display text-base font-bold text-text">Atividade recente</h3>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-surface border border-line text-text-dim shadow-xs">
            {fila.length} item(ns)
          </span>
        </div>

        <div className="divide-y divide-line">
          {fila.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-text-muted text-xs font-medium">
                Nenhum vídeo processado ainda. Envie vídeos na Biblioteca pra começar.
              </p>
            </div>
          ) : (
            fila
              .slice()
              .reverse()
              .slice(0, 8)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-surface-hover/80 transition-colors duration-150 group"
                >
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-semibold text-text truncate max-w-lg group-hover:text-rosa transition-colors">
                      {item.tituloIA || '(sem título)'}
                    </p>
                    <p className="text-xs text-text-muted font-mono mt-0.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                      Template: {item.templateId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusDot status={item.status} comRotulo />
                    {FILA_EXCLUIVEL.has(item.status) ? (
                      <button
                        onClick={() => { setExcluindo(item); setErroExcluir(''); }}
                        title={`Excluir "${item.tituloIA || 'vídeo'}" da fila`}
                        className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
      {excluindo ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { if (!excluindoAgora) setExcluindo(null); }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-text">Excluir item da fila?</h3>
              <button
                onClick={() => { if (!excluindoAgora) setExcluindo(null); }}
                className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-text-muted font-medium">
              {`"${excluindo.tituloIA || 'Vídeo sem título'}" será removido da fila (status ${excluindo.status}). Agendamentos vinculados bloqueiam a exclusão.`}
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
                onClick={confirmarExcluirFila}
                disabled={excluindoAgora}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
              >
                {excluindoAgora ? 'Excluindo…' : 'Excluir da fila'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
