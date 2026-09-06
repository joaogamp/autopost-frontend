import { useEffect, useState } from 'react';
import { buscarBiblioteca, listarAgendamentos, criarAgendamento, cancelarAgendamento, urlArquivo } from '../lib/api';
import StatusDot from '../components/StatusDot';
import CalendarioAgendamentos from '../components/CalendarioAgendamentos';
import RegraPublicacao from '../components/RegraPublicacao';

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
    return <p className="text-xs text-text-dim">Nenhuma publicação nesse dia.</p>;
  }

  return (
    <div className="border border-line rounded-lg divide-y divide-line">
      {itens.map((ag) => (
        <div key={ag.id} className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-16 bg-surface rounded overflow-hidden shrink-0">
            {ag.thumbnailUrl && <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{ag.nomeVideo}</p>
            <p className="text-xs text-text-dim">
              {ag.horario} · {ag.redes.join(', ')}
            </p>
          </div>
          <StatusDot status={mapaStatus[ag.status] || ag.status} comRotulo />
          <button onClick={() => onCancelar(ag.id)} className="text-xs text-status-erro hover:underline">
            Cancelar
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Agendamento() {
  const [videosProntos, setVideosProntos] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);

  const [bibliotecaId, setBibliotecaId] = useState('');
  const [redesSelecionadas, setRedesSelecionadas] = useState(new Set(['instagram']));
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [visualizacao, setVisualizacao] = useState('calendario'); // 'calendario' | 'lista'
  const [mesAtual, setMesAtual] = useState(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  async function carregar() {
    const [bib, ag] = await Promise.all([buscarBiblioteca(), listarAgendamentos()]);
    setVideosProntos(bib.filter((v) => v.status === 'concluido'));
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
    if (!bibliotecaId) return setErro('Escolha um vídeo pra agendar.');
    if (redesSelecionadas.size === 0) return setErro('Escolha pelo menos uma rede social.');
    if (!data || !horario) return setErro('Escolha data e horário.');

    setEnviando(true);
    const resultado = await criarAgendamento({
      bibliotecaId,
      redes: Array.from(redesSelecionadas),
      data,
      horario,
    });
    setEnviando(false);

    if (resultado.erro) return setErro(resultado.erro);

    setBibliotecaId('');
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
    <div>
      <h2 className="font-display text-3xl font-bold mb-6">Agendamento</h2>

      <RegraPublicacao />

      <div className="grid grid-cols-[340px_1fr] gap-8">
        {/* Formulário de novo agendamento */}
        <div className="border border-line rounded-lg p-5 h-fit">
          <h3 className="font-display text-lg font-semibold mb-4">Novo agendamento</h3>

          <label className="text-xs text-text-dim block mb-1">Vídeo pronto</label>
          <select
            value={bibliotecaId}
            onChange={(e) => setBibliotecaId(e.target.value)}
            className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee mb-4"
          >
            <option value="">Selecione...</option>
            {videosProntos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nomeOriginal}
              </option>
            ))}
          </select>
          {videosProntos.length === 0 && (
            <p className="text-[11px] text-text-dim -mt-3 mb-4">
              Nenhum vídeo concluído ainda. Processe vídeos na Biblioteca primeiro.
            </p>
          )}

          <label className="text-xs text-text-dim block mb-1">Redes sociais</label>
          <div className="flex gap-2 mb-4">
            {REDES_DISPONIVEIS.map((rede) => {
              const ativo = redesSelecionadas.has(rede.id);
              return (
                <button
                  key={rede.id}
                  onClick={() => alternarRede(rede.id)}
                  className={`text-sm px-3 py-1.5 rounded-md border ${
                    ativo ? 'border-marquee text-marquee bg-marquee/10' : 'border-line text-text-dim'
                  }`}
                >
                  {rede.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs text-text-dim block mb-1">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-dim block mb-1">Horário</label>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee"
              />
            </div>
          </div>

          {erro && <p className="text-xs text-status-erro mb-3">{erro}</p>}

          <button
            onClick={agendar}
            disabled={enviando}
            className="w-full bg-marquee text-base py-2 rounded-md text-sm font-medium hover:brightness-110 disabled:opacity-50"
          >
            {enviando ? 'Agendando...' : 'Agendar'}
          </button>

          <p className="text-[11px] text-text-dim mt-3 border-t border-line pt-3">
            A publicação automática de verdade só roda depois que as Contas
            (Instagram/YouTube) estiverem conectadas — por enquanto isso só
            organiza o calendário.
          </p>
        </div>

        {/* Lista/Calendário de agendamentos */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">Próximas publicações</h3>
            <div className="flex gap-1 border border-line rounded-md p-0.5">
              <button
                onClick={() => setVisualizacao('calendario')}
                className={`text-xs px-3 py-1 rounded ${visualizacao === 'calendario' ? 'bg-marquee text-base font-medium' : 'text-text-dim'}`}
              >
                Calendário
              </button>
              <button
                onClick={() => setVisualizacao('lista')}
                className={`text-xs px-3 py-1 rounded ${visualizacao === 'lista' ? 'bg-marquee text-base font-medium' : 'text-text-dim'}`}
              >
                Lista
              </button>
            </div>
          </div>

          {visualizacao === 'calendario' && (
            <div className="grid grid-cols-[320px_1fr] gap-5">
              <CalendarioAgendamentos
                mesAtual={mesAtual}
                agendamentos={agendamentos}
                diaSelecionado={diaSelecionado}
                onMudarMes={(delta) => setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1))}
                onSelecionarDia={setDiaSelecionado}
              />

              <div>
                <p className="text-xs text-text-dim mb-2">
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
              <div className="border border-dashed border-line rounded-lg py-16 text-center text-text-dim text-sm">
                Nenhuma publicação agendada ainda.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(agendamentosPorData).map(([dataAg, itens]) => (
                  <div key={dataAg}>
                    <p className="text-sm font-semibold text-marquee mb-2">{formatarDataLabel(dataAg)}</p>
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
