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
    return <p className="text-xs text-slate-500 font-medium">Nenhuma publicação nesse dia.</p>;
  }

  return (
    <div className="glass-panel rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs bg-white">
      {itens.map((ag) => (
        <div key={ag.id} className="flex items-center gap-4 p-4 hover:bg-slate-50/80 transition-colors group">
          <div className="w-11 h-16 bg-slate-900 rounded-lg overflow-hidden shrink-0 border border-slate-200 relative">
            {ag.thumbnailUrl ? (
              <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-medium">
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
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[11px] font-bold text-slate-700 shadow-2xs"
                >
                  <RedeIcon rede={r} className="w-3.5 h-3.5" colored={true} />
                  <span className="capitalize">{r}</span>
                </span>
              ))}
            </div>

            <p className="text-sm font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
              {ag.nomeVideo}
            </p>

            <p className="text-xs text-slate-500 flex items-center gap-2 mt-1 font-mono">
              <span className="text-indigo-600 font-bold">{ag.horario}</span>
              {ag.contaTarget && <span className="text-slate-400 font-sans">@{ag.contaTarget}</span>}
            </p>
          </div>

          <StatusDot status={mapaStatus[ag.status] || ag.status} comRotulo />
          <button
            onClick={() => onCancelar(ag.id)}
            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline px-2.5 py-1 rounded-lg hover:bg-rose-50 transition-colors"
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
    setErro('');
    if (!finalId) return setErro('Escolha um vídeo final pra agendar.');
    if (redesSelecionadas.size === 0) return setErro('Escolha pelo menos uma rede social.');
    if (!data || !horario) return setErro('Escolha data e horário.');

    setEnviando(true);
    const resultado = await criarAgendamento({
      finalId,
      redes: Array.from(redesSelecionadas),
      data,
      horario,
    });
    setEnviando(false);

    if (resultado.erro) return setErro(resultado.erro);

    setFinalId('');
    setData('');
    setHorario('');
    carregar();
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
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Agendamento</h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">Defina regras de postagem automática e agende publicações nas redes</p>
      </div>

      <RegraPublicacao />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8 items-start">
        {/* Formulário de novo agendamento */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
            <PlusCircle className="w-4 h-4 text-indigo-600" />
            <h3 className="font-display text-base font-bold text-slate-900">Novo agendamento</h3>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Vídeo final (template aplicado)</label>
            <select
              value={finalId}
              onChange={(e) => setFinalId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-600 transition-colors font-medium"
            >
              <option value="">Selecione um final...</option>
              {finaisProntos.map((f) => (
                <option key={f.id} value={f.id}>
                  {(f.nomeFinal || 'Vídeo') + (f.templateNome ? ` (${f.templateNome})` : '')}
                </option>
              ))}
            </select>
            {finaisProntos.length === 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-xl mt-2 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>Nenhum final concluído ainda. Processe vídeos na Biblioteca primeiro.</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Redes sociais</label>
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
                        ? 'border-indigo-200 text-indigo-700 bg-indigo-50 shadow-xs'
                        : 'border-slate-200 text-slate-400 bg-slate-50 hover:text-slate-600'
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
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-indigo-600 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Horário</label>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-indigo-600 transition-colors"
              />
            </div>
          </div>

          {erro && <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">{erro}</p>}

          <button
            onClick={agendar}
            disabled={enviando}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {enviando ? 'Agendando...' : 'Agendar'}
          </button>

          <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-200/80 leading-relaxed font-medium flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              A publicação automática só roda depois que as Contas (<RedeLabel rede="instagram" /> / <RedeLabel rede="youtube" />) estiverem conectadas.
            </span>
          </div>
        </div>

        {/* Lista/Calendário de agendamentos */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-slate-900">Próximas publicações</h3>
            <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
              <button
                onClick={() => setVisualizacao('calendario')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  visualizacao === 'calendario'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Calendário
              </button>
              <button
                onClick={() => setVisualizacao('lista')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  visualizacao === 'lista'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
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
                <p className="text-xs font-bold text-slate-500">
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
              <div className="glass-panel border-2 border-dashed border-slate-300 rounded-2xl py-16 text-center text-slate-500 text-xs font-medium bg-white">
                Nenhuma publicação agendada ainda.
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(agendamentosPorData).map(([dataAg, itens]) => (
                  <div key={dataAg} className="space-y-2">
                    <p className="text-xs font-mono font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
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
