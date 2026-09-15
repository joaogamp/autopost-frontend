import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  listarAgendamentos,
  criarAgendamento,
  cancelarAgendamento,
  remarcarAgendamento,
  listarFinais,
  buscarContas,
  urlArquivo,
} from '../lib/api';
import { statusUi } from '../lib/status';
import { ROTULO_FUSO, formatarData } from '../lib/fuso';
import StatusDot from '../components/StatusDot';
import CalendarioAgendamentos from '../components/CalendarioAgendamentos';
import RegraPublicacao from '../components/RegraPublicacao';
import { InstagramIcon } from '../components/RedeIcon';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Film,
  Info,
  Loader2,
  Pencil,
  PlusCircle,
  Trash2,
  Zap,
} from 'lucide-react';

const MAX_LEGENDA = 2200; // limite de caracteres da legenda do Instagram

/**
 * AGENDAMENTO — tela central do fluxo EDITOR → AGENDAMENTO → BIBLIOTECA.
 * "Instagram" NÃO é uma etapa da navegação: é o destino fixo da publicação.
 *
 * Os valores internos de status vêm do backend e NÃO mudam aqui
 * ('agendado' | 'publicando' | 'publicado' | 'erro'); a tradução para os
 * rótulos da UI (PROGRAMADO/PUBLICANDO/…) vive em src/lib/status.js.
 */
export default function Agendamento({ finalIdInicial = '', aoAbrirContas }) {
  const [finaisProntos, setFinaisProntos] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [contaIg, setContaIg] = useState(null);

  const [finalId, setFinalId] = useState('');
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('');
  const [legenda, setLegenda] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [seletorAberto, setSeletorAberto] = useState(false);
  const [visualizacao, setVisualizacao] = useState('lista'); // 'lista' | 'calendario'
  const [mesAtual, setMesAtual] = useState(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  const [cancelando, setCancelando] = useState(null); // agendamento aguardando confirmação
  const [cancelandoAgora, setCancelandoAgora] = useState(false);
  const [editando, setEditando] = useState(null); // agendamento em remarcação
  const [nd, setNd] = useState('');
  const [nh, setNh] = useState('');
  const [erroEd, setErroEd] = useState('');
  const [salvandoEd, setSalvandoEd] = useState(false);

  const [regraAberta, setRegraAberta] = useState(false);

  const seletorRef = useRef(null);
  async function carregar() {
    const [ags, fins, contas] = await Promise.all([
      listarAgendamentos(),
      listarFinais(),
      buscarContas(),
    ]);
    setAgendamentos(Array.isArray(ags) ? ags : []);
    setFinaisProntos(Array.isArray(fins) ? fins.filter((f) => f.status === 'concluido') : []);
    setContaIg(contas?.instagram || null);
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 5000); // polling existente mantido
    return () => clearInterval(intervalo);
  }, []);

  // Biblioteca → "Agendar" chega aqui com o vídeo final pré-selecionado.
  useEffect(() => {
    if (finalIdInicial) setFinalId(finalIdInicial);
  }, [finalIdInicial]);

  // Fecha o seletor de vídeo ao clicar fora.
  useEffect(() => {
    if (!seletorAberto) return;
    const fechar = (e) => {
      if (seletorRef.current && !seletorRef.current.contains(e.target)) setSeletorAberto(false);
    };
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [seletorAberto]);

  const videoSelecionado = useMemo(
    () => finaisProntos.find((f) => f.id === finalId) || null,
    [finaisProntos, finalId]
  );

  const agsOrdenados = useMemo(
    () =>
      [...agendamentos].sort((a, b) =>
        `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`)
      ),
    [agendamentos]
  );

  const igConectado = Boolean(contaIg?.igUserId);
  async function agendar() {
    if (enviando) return; // trava duplo clique / submit concorrente
    setErro('');
    setSucesso('');
    if (!finalId) return setErro('Escolha um vídeo final para agendar.');
    if (!data || !horario) return setErro('Escolha data e horário.');

    setEnviando(true);
    try {
      const resultado = await criarAgendamento({
        finalId,
        redes: ['instagram'], // destino único na Fase 1 (YouTube não existe no backend)
        data,
        horario,
        legenda: legenda.trim() || undefined, // persistência real chega na Fase 2
      });
      if (resultado?.erro) {
        setErro(resultado.erro);
        return;
      }
      setFinalId('');
      setData('');
      setHorario('');
      setLegenda('');
      setSucesso('Publicação programada! Acompanhe o status em "Próximas publicações".');
      await carregar();
    } catch (e) {
      setErro(e?.message || 'Falha ao criar o agendamento. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarCancelar() {
    if (!cancelando || cancelandoAgora) return;
    setCancelandoAgora(true);
    try {
      await cancelarAgendamento(cancelando.id);
      setSucesso(
        `Agendamento de "${cancelando.nomeVideo || 'vídeo'}" cancelado. O vídeo volta a ficar PRONTO na Biblioteca.`
      );
      setCancelando(null);
      await carregar();
    } catch (e) {
      setErro(e?.message || 'Não foi possível cancelar o agendamento.');
      setCancelando(null);
    } finally {
      setCancelandoAgora(false);
    }
  }

  function abrirEdicao(ag) {
    setEditando(ag);
    setNd(ag.data || '');
    setNh(ag.horario || '');
    setErroEd('');
  }

  async function confirmarEdicao() {
    if (!editando || salvandoEd) return;
    setErroEd('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) return setErroEd('Escolha uma data válida.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nh)) return setErroEd('Escolha um horário válido (HH:MM).');
    setSalvandoEd(true);
    try {
      // Fase 1: cria novo + cancela antigo (mecânica centralizada em
      // api.remarcarAgendamento). Fase 2: vira PATCH sem mudar esta UI.
      await remarcarAgendamento(editando, { data: nd, horario: nh });
      setEditando(null);
      setSucesso('Publicação remarcada.');
      await carregar();
    } catch (e) {
      setErroEd(e?.message || 'Não foi possível remarcar.');
    } finally {
      setSalvandoEd(false);
    }
  }

  const podeEditar = (ag) => ag.status === 'agendado' || ag.status === 'erro';
  const podeCancelar = (ag) => ag.status === 'agendado';
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-text">Agendamento</h2>
        <p className="text-xs text-text-muted mt-1 font-medium">
          Programe a publicação do vídeo final no Instagram — o destino da publicação
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
        {/* Formulário — foco único: agendar */}
        <div className="glass-panel rounded-2xl p-6 border border-line shadow-sm space-y-5 bg-surface">
          <div className="flex items-center gap-2 border-b border-line pb-4">
            <PlusCircle className="w-4 h-4 text-rosa" />
            <h3 className="font-display text-base font-bold text-text">Novo agendamento</h3>
          </div>

          {/* Vídeo final — seletor com miniatura, nome e selo FINAL/concluído */}
          <div ref={seletorRef} className="relative">
            <label className="text-xs font-bold text-text-dim block mb-1.5">
              Vídeo final (processado no Editor)
            </label>
            <button
              type="button"
              onClick={() => finaisProntos.length > 0 && setSeletorAberto((v) => !v)}
              disabled={finaisProntos.length === 0}
              className="w-full flex items-center gap-3 bg-surface border border-line rounded-xl px-3 py-2.5 text-left outline-none focus:border-rosa transition-colors hover:border-line-light disabled:opacity-60"
            >
              {videoSelecionado ? (
                <>
                  <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                    {videoSelecionado.thumbnailFinal ? (
                      <img src={urlArquivo(videoSelecionado.thumbnailFinal)} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-3.5 h-3.5 text-text-muted" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-text truncate">
                      {videoSelecionado.nomeFinal || 'Vídeo final'}
                    </span>
                    <span className="block text-[10px] text-text-muted font-medium truncate">
                      {videoSelecionado.templateNome
                        ? `Template: ${videoSelecionado.templateNome}`
                        : 'Final processado'}
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex-1 text-xs text-text-muted">Escolher vídeo final…</span>
              )}
              <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${seletorAberto ? 'rotate-180' : ''}`} />
            </button>

            {seletorAberto && (
              <div className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto glass-panel rounded-2xl border border-line bg-surface shadow-lg divide-y divide-line">
                {finaisProntos.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFinalId(f.id);
                      setSeletorAberto(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover text-left transition-colors"
                  >
                    <span className="w-10 h-14 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                      {f.thumbnailFinal ? (
                        <img src={urlArquivo(f.thumbnailFinal)} className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-4 h-4 text-text-muted" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-text truncate">
                        {f.nomeFinal || 'Vídeo final'}
                      </span>
                      <span className="block text-[10px] text-text-muted font-medium truncate">
                        {f.templateNome ? `Template: ${f.templateNome}` : 'Final processado'}
                      </span>
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase">
                      Final
                    </span>
                  </button>
                ))}
              </div>
            )}

            {finaisProntos.length === 0 && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl mt-2 font-medium flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
                <span>Nenhum vídeo final concluído. Processe vídeos no Editor primeiro.</span>
              </p>
            )}
          </div>
          {/* Data + Horário (Brasília) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-dim block mb-1.5">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-text-dim">Horário</label>
                <span className="text-[10px] text-text-muted font-medium">{ROTULO_FUSO}</span>
              </div>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
              />
            </div>
          </div>

          {/* Legenda */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-text-dim">Legenda</label>
              <span className="text-[10px] font-mono text-text-muted">
                {legenda.length}/{MAX_LEGENDA}
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={MAX_LEGENDA}
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="Texto que acompanha o post no Instagram…"
              className="w-full resize-none bg-surface border border-line rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-rosa transition-colors"
            />
            <p className="text-[10px] text-text-muted mt-1">
              A legenda passará a ser salva e enviada com a publicação na Fase 2 (backend).
            </p>
          </div>

          {/* Destino — somente Instagram */}
          <div>
            <label className="text-xs font-bold text-text-dim block mb-1.5">Destino</label>
            <div
              className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${
                igConectado ? 'border-rosa-borda bg-rosa-dim/50' : 'border-amber-500/30 bg-amber-500/10'
              }`}
            >
              <InstagramIcon className="w-4 h-4" />
              <span className="text-xs font-bold text-text">Instagram</span>
              {igConectado ? (
                <span className="text-[11px] text-text-muted font-medium ml-auto">
                  @{contaIg.username || 'conectado'}
                </span>
              ) : (
                <span className="text-[11px] text-amber-300 font-semibold ml-auto flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Não conectado
                  {aoAbrirContas && (
                    <button
                      type="button"
                      onClick={aoAbrirContas}
                      className="underline underline-offset-2 hover:text-amber-200"
                    >
                      Conectar
                    </button>
                  )}
                </span>
              )}
            </div>
            {!igConectado && (
              <p className="text-[11px] text-amber-300/90 mt-2 leading-relaxed">
                Você pode programar agora, mas a publicação só sai depois de conectar o
                Instagram em <b>Contas</b>.
              </p>
            )}
          </div>

          {/* Feedback */}
          {erro && (
            <p className="text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl">
              {erro}
            </p>
          )}
          {sucesso && (
            <p className="text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl">
              {sucesso}
            </p>
          )}

          <button
            onClick={agendar}
            disabled={enviando || finaisProntos.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 bg-rosa hover:bg-rosa-hover text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rosa/20 transition-all disabled:opacity-50"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            {enviando ? 'Agendando...' : 'Agendar publicação'}
          </button>

          <div className="text-[11px] text-text-muted pt-3 border-t border-line leading-relaxed font-medium flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-rosa shrink-0 mt-0.5" />
            <span>
              A publicação é feita automaticamente pelo servidor no horário marcado
              {' '}({ROTULO_FUSO}) — o navegador não precisa estar aberto.
            </span>
          </div>
        </div>

        {/* Próximas publicações */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-text">Próximas publicações</h3>
            <div className="flex gap-1 bg-surface-hover border border-line rounded-xl p-1">
              <button
                onClick={() => setVisualizacao('lista')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  visualizacao === 'lista'
                    ? 'bg-surface text-text shadow-xs border border-line'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setVisualizacao('calendario')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  visualizacao === 'calendario'
                    ? 'bg-surface text-text shadow-xs border border-line'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Calendário
              </button>
            </div>
          </div>

          {visualizacao === 'lista' && (
            <div className="glass-panel rounded-2xl border border-line overflow-hidden bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase font-mono font-bold text-text-muted bg-surface-hover/60">
                      <th className="text-left px-4 py-2.5">Vídeo</th>
                      <th className="text-left px-3 py-2.5">Data</th>
                      <th className="text-left px-3 py-2.5">Hora</th>
                      <th className="text-left px-3 py-2.5">Destino</th>
                      <th className="text-left px-3 py-2.5">Status</th>
                      <th className="text-right px-4 py-2.5">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {agsOrdenados.map((ag) => (
                      <Fragment key={ag.id}>
                        <tr className="hover:bg-surface-hover/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                                {ag.thumbnailUrl ? (
                                  <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />
                                ) : (
                                  <Film className="w-3.5 h-3.5 text-text-muted" />
                                )}
                              </span>
                              <span className="font-bold text-text truncate max-w-[200px]" title={ag.nomeVideo}>
                                {ag.nomeVideo || 'Vídeo'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-text-dim whitespace-nowrap">
                            {formatarData(ag.data)}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-rosa whitespace-nowrap">
                            {ag.horario}
                          </td>
                          <td className="px-3 py-2.5">
                            {(ag.redes || []).includes('instagram') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover border border-line text-[11px] font-bold text-text-dim">
                                <InstagramIcon className="w-3 h-3" />
                                Instagram
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusDot status={statusUi(ag)} comRotulo />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              {podeEditar(ag) && (
                                <button
                                  onClick={() => abrirEdicao(ag)}
                                  title="Remarcar data/horário"
                                  className="p-1.5 rounded-lg text-text-muted hover:text-rosa hover:bg-rosa-dim transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {podeCancelar(ag) && (
                                <button
                                  onClick={() => setCancelando(ag)}
                                  title="Cancelar publicação"
                                  className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!podeEditar(ag) && !podeCancelar(ag) && (
                                <span className="text-text-muted pr-1">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {ag.erroMensagem && (
                          <tr>
                            <td colSpan={6} className="px-4 pb-3">
                              <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                {ag.erroMensagem}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {agsOrdenados.length === 0 && (
                <p className="py-12 text-center text-xs text-text-muted font-medium">
                  Nenhum agendamento ainda. Escolha um vídeo final e programe a publicação.
                </p>
              )}
            </div>
          )}

          {visualizacao === 'calendario' && (
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
              <CalendarioAgendamentos
                mesAtual={mesAtual}
                agendamentos={agendamentos}
                diaSelecionado={diaSelecionado}
                onMudarMes={(delta) => setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1))}
                onSelecionarDia={setDiaSelecionado}
              />

              <div className="space-y-3">
                <p className="text-xs font-bold text-text-muted">
                  {diaSelecionado
                    ? `Publicações em ${formatarData(diaSelecionado)}`
                    : 'Clique num dia do calendário para ver as publicações.'}
                </p>
                {diaSelecionado && (
                  <ItensDoDia
                    itens={agsOrdenados.filter((a) => a.data === diaSelecionado)}
                    onEditar={abrirEdicao}
                    onCancelar={setCancelando}
                    podeEditar={podeEditar}
                    podeCancelar={podeCancelar}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publicação automática — seção secundária/colapsada (funcionalidade do
          backend mantida intacta; só deixa de competir com o agendamento manual) */}
      <section>
        <button
          type="button"
          onClick={() => setRegraAberta((v) => !v)}
          className="w-full flex items-center justify-between glass-panel rounded-2xl border border-line px-5 py-3 bg-surface hover:border-line-light transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-text-dim">
            <Zap className="w-3.5 h-3.5 text-rosa" />
            Publicação automática
            <span className="hidden sm:inline text-[10px] font-medium text-text-muted">
              — avançado: todo vídeo pronto entra sozinho no próximo horário livre
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${regraAberta ? 'rotate-180' : ''}`} />
        </button>
        {regraAberta && (
          <div className="mt-3">
            <RegraPublicacao />
          </div>
        )}
      </section>

      {/* Modal — cancelar com confirmação */}
      {cancelando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => !cancelandoAgora && setCancelando(null)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-bold text-text">Cancelar publicação?</h3>
            <p className="text-xs text-text-muted mt-1 truncate">
              "{cancelando.nomeVideo || 'Vídeo'}" • {formatarData(cancelando.data)} às{' '}
              {cancelando.horario} ({ROTULO_FUSO})
            </p>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
              O vídeo volta a ficar <b className="text-text">PRONTO</b> na Biblioteca e não será
              publicado. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setCancelando(null)}
                className="text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarCancelar}
                disabled={cancelandoAgora}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-400 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {cancelandoAgora && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Cancelar publicação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — remarcar (Fase 1: criar+cancelar; Fase 2 vira PATCH) */}
      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => !salvandoEd && setEditando(null)}
        >
          <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-bold text-text">Remarcar publicação</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5 truncate">
              {editando.nomeVideo || 'Vídeo'}
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
            {erroEd && (
              <div className="mt-3 flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-semibold px-3 py-2 rounded-xl">
                <span>{erroEd}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarEdicao}
                disabled={salvandoEd}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rosa hover:bg-rosa-hover px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {salvandoEd && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Linhas compactas de um dia selecionado no calendário. */
function ItensDoDia({ itens, onEditar, onCancelar, podeEditar, podeCancelar }) {
  if (itens.length === 0) {
    return <p className="text-xs text-text-muted font-medium">Nenhuma publicação nesse dia.</p>;
  }
  return (
    <div className="glass-panel rounded-2xl border border-line divide-y divide-line overflow-hidden bg-surface">
      {itens.map((ag) => (
        <div key={ag.id} className="flex items-center gap-3 p-3">
          <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
            {ag.thumbnailUrl ? (
              <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />
            ) : (
              <Film className="w-3.5 h-3.5 text-text-muted" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-text truncate">{ag.nomeVideo || 'Vídeo'}</p>
            <p className="text-[11px] font-mono text-text-muted">{ag.horario}</p>
            {ag.erroMensagem && (
              <p className="text-[10px] text-rose-300/90 truncate" title={ag.erroMensagem}>
                {ag.erroMensagem}
              </p>
            )}
          </div>
          <StatusDot status={statusUi(ag)} comRotulo />
          <div className="flex items-center gap-1">
            {podeEditar(ag) && (
              <button
                onClick={() => onEditar(ag)}
                title="Remarcar"
                className="p-1.5 rounded-lg text-text-muted hover:text-rosa hover:bg-rosa-dim transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {podeCancelar(ag) && (
              <button
                onClick={() => onCancelar(ag)}
                title="Cancelar publicação"
                className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}