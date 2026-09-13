import { useEffect, useState } from 'react';
import { listarAgendamentos, criarAgendamento, cancelarAgendamento, urlArquivo, listarFinais } from '../lib/api';
import StatusDot from '../components/StatusDot';
import CalendarioAgendamentos from '../components/CalendarioAgendamentos';
import RegraPublicacao from '../components/RegraPublicacao';
import RedeLabel from '../components/RedeLabel';
import RedeIcon from '../components/RedeIcon';
import { Calendar, PlusCircle, AlertTriangle, Info } from 'lucide-react';

const REDES_DISPONIVEIS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
];

function formatarDataLabel(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function ItensDoDia({ itens, onCancelar }) {
  const mapaStatus = { agendado: 'aguardando', publicando: 'processando', publicado: 'concluido', erro: 'erro' };

  if (itens.length === 0) {
    return <p className="text-xs text-text-muted font-medium">Nenhuma publicação nesse dia.</p>;
  }

  return (
    <div className="glass-panel rounded-2xl border border-line divide-y divide-line overflow-hidden shadow-xs bg-surface">
      {itens.map((ag) => (
        <div key={ag.id} className="flex items-center gap-4 p-4 hover:bg-surface-hover/80 transition-colors group">
          <div className="w-11 h-16 bg-slate-900 rounded-lg overflow-hidden shrink-0 border border-line relative">
            {ag.thumbnailUrl ? (
              <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-text-muted font-medium">
                sem thumb
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Platforms Badges */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {ag.redes.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover border border-line text-[11px] font-bold text-text-dim shadow-2xs"
                >
                  <RedeIcon rede={r} className="w-3.5 h-3.5" colored={true} />
                  <span className="capitalize">{r}</span>
                </span>
              ))}
            </div>

            <p className="text-sm font-bold text-text truncate group-hover:text-rosa transition-colors">
              {ag.nomeVideo}
            </p>

            <p className="text-xs text-text-muted flex items-center gap-2 mt-1 font-mono">
              <span className="text-rosa font-bold">{ag.horario}</span>
              {ag.contaTarget && <span className="text-text-muted font-sans">@{ag.contaTarget}</span>}
            </p>
          </div>

          <StatusDot status={mapaStatus[ag.status] || ag.status} comRotulo />
          <button
            onClick={() => onCancelar(ag.id)}
            className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:underline px-2.5 py-1 rounded-lg hover:bg-rose-500/10 transition-colors"
          >
            Cancelar
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Agendamento() {
  const [finaisProntos, setFinaisProntos] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);

  const [finalId, setFinalId] = useState('');
  const [redesSelecionadas, setRedesSelecionadas] = useState(new Set(['instagram']));
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [visualizacao, setVisualizacao] = useState('calendario'); // 'calendario' | 'lista'
  const [mesAtual, setMesAtual] = useState(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  async function carregar() {
    const [ag, fins] = await Promise.all([listarAgendamentos(), listarFinais()]);
    setFinaisProntos(fins.filter((f) => f.status === 'concluido'));
    setAgendamentos(ag);
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 5000);
    return () => clearInterval(intervalo);
  }, []);

  function alternarRede(id) {
    setRedesSelecionadas((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  async function agendar() {
    if (enviando) return; // trava duplo clique / submit concorrente
    setErro('');
    setSucesso('');
    if (!finalId) return setErro('Escolha um vídeo final pra agendar.');
    if (redesSelecionadas.size === 0) return setErro('Escolha pelo menos uma rede social.');
    if (!data || !horario) return setErro('Escolha data e horário.');

    setEnviando(true);
    try {
      const resultado = await criarAgendamento({
        finalId,
        redes: Array.from(redesSelecionadas),
        data,
        horario,
      });

      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }

      setFinalId('');
      setData('');
      setHorario('');
      setSucesso('Agendamento criado com sucesso!');
      await carregar();
    } catch (e) {
      setErro(e?.message || 'Falha ao criar o agendamento. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  // Agrupa agendamentos por data pra exibir como um mini-calendário em lista
  const agendamentosPorData = agendamentos.reduce((acc, ag) => {
    (acc[ag.data] ||= []).push(ag);
    return acc;
  }, {});

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-text">Agendamento</h2>
        <p className="text-xs text-text-muted mt-1 font-medium">Defina regras de postagem automática e agende publicações nas redes</p>
      </div>

      <RegraPublicacao />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8 items-start">
        {/* Formulário de novo agendamento */}
        <div className="glass-panel rounded-2xl p-6 border border-line shadow-sm space-y-5 bg-surface">
          <div className="flex items-center gap-2 border-b border-line pb-4">
            <PlusCircle className="w-4 h-4 text-rosa" />
            <h3 className="font-display text-base font-bold text-text">Novo agendamento</h3>
          </div>

          <div>
            <label className="text-xs font-bold text-text-dim block mb-1.5">Vídeo final (template aplicado)</label>
            <select
              value={finalId}
              onChange={(e) => setFinalId(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-xs text-text outline-none focus:border-rosa transition-colors font-medium"
            >
              <option value="">Selecione um final...</option>
              {finaisProntos.map((f) => (
                <option key={f.id} value={f.id}>
                  {(f.nomeFinal || 'Vídeo') + (f.templateNome ? ` (${f.templateNome})` : '')}
                </option>
              ))}
            </select>
            {finaisProntos.length === 0 && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl mt-2 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>Nenhum final concluído ainda. Processe vídeos na Biblioteca primeiro.</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-text-dim block mb-1.5">Redes sociais</label>
            <div className="flex gap-2">
              {REDES_DISPONIVEIS.map((rede) => {
                const ativo = redesSelecionadas.has(rede.id);
                return (
                  <button
                    key={rede.id}
                    type="button"
                    onClick={() => alternarRede(rede.id)}
                    className={`text-xs px-3.5 py-2 rounded-xl border font-bold transition-all flex items-center gap-1.5 ${
                      ativo
                        ? 'border-rosa-borda text-rosa-hover bg-rosa-dim shadow-xs'
                        : 'border-line text-text-muted bg-surface-hover hover:text-text-dim'
                    }`}
                  >
                    <RedeLabel rede={rede.id} comIcone={true} />
                  </button>
                );
              })}
            </div>
          </div>

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
              <label className="text-xs font-bold text-text-dim block mb-1.5">Horário</label>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
              />
            </div>
          </div>

          {erro && <p className="text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl">{erro}</p>}
          {sucesso && <p className="text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl">{sucesso}</p>}

          <button
            onClick={agendar}
            disabled={enviando}
            className="w-full bg-rosa hover:bg-rosa-hover text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rosa/20 transition-all disabled:opacity-50"
          >
            {enviando ? 'Agendando...' : 'Agendar'}
          </button>

          <div className="text-[11px] text-text-muted pt-3 border-t border-line leading-relaxed font-medium flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-rosa shrink-0 mt-0.5" />
            <span>
              A publicação automática só roda depois que as Contas (<RedeLabel rede="instagram" /> / <RedeLabel rede="youtube" />) estiverem conectadas.
            </span>
          </div>
        </div>

        {/* Lista/Calendário de agendamentos */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-text">Próximas publicações</h3>
            <div className="flex gap-1 bg-surface-hover border border-line rounded-xl p-1">
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
            </div>
          </div>

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
                    ? `Publicações em ${formatarDataLabel(diaSelecionado)}`
                    : 'Clique num dia do calendário pra ver as publicações agendadas.'}
                </p>
                {diaSelecionado && (
                  <ItensDoDia
                    itens={agendamentos.filter((a) => a.data === diaSelecionado)}
                    onCancelar={(id) => cancelarAgendamento(id).then(carregar)}
                  />
                )}
              </div>
            </div>
          )}

          {visualizacao === 'lista' &&
            (Object.keys(agendamentosPorData).length === 0 ? (
              <div className="glass-panel border-2 border-dashed border-line-light rounded-2xl py-16 text-center text-text-muted text-xs font-medium bg-surface">
                Nenhuma publicação agendada ainda.
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(agendamentosPorData).map(([dataAg, itens]) => (
                  <div key={dataAg} className="space-y-2">
                    <p className="text-xs font-mono font-bold text-rosa uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatarDataLabel(dataAg)}</span>
                    </p>
                    <ItensDoDia
                      itens={itens.sort((a, b) => a.horario.localeCompare(b.horario))}
                      onCancelar={(id) => cancelarAgendamento(id).then(carregar)}
                    />
                  </div>
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
