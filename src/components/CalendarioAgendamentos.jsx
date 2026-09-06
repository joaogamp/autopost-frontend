const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CORES_STATUS = {
  agendado: '#6b6572',
  publicando: '#4c8dff',
  publicado: '#2dd4bf',
  erro: '#ff5470',
};

function paraChaveData(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarioAgendamentos({ mesAtual, agendamentos, diaSelecionado, onMudarMes, onSelecionarDia }) {
  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const hojeChave = paraChaveData(new Date());

  const agendamentosPorDia = agendamentos.reduce((acc, ag) => {
    (acc[ag.data] ||= []).push(ag);
    return acc;
  }, {});

  const celulas = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDias; dia++) celulas.push(dia);

  return (
    <div className="border border-line rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => onMudarMes(-1)}
          className="text-text-dim hover:text-text px-2 py-1 rounded hover:bg-surface"
        >
          ‹
        </button>
        <p className="font-display text-lg font-semibold">
          {NOMES_MES[mes]} {ano}
        </p>
        <button
          onClick={() => onMudarMes(1)}
          className="text-text-dim hover:text-text px-2 py-1 rounded hover:bg-surface"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-[11px] text-text-dim py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`vazio-${i}`} />;

          const chave = paraChaveData(new Date(ano, mes, dia));
          const itensDoDia = agendamentosPorDia[chave] || [];
          const ehHoje = chave === hojeChave;
          const ehSelecionado = chave === diaSelecionado;

          return (
            <button
              key={chave}
              onClick={() => onSelecionarDia(ehSelecionado ? null : chave)}
              className={`aspect-square rounded-md p-1 flex flex-col items-center justify-start border transition-colors ${
                ehSelecionado
                  ? 'border-marquee bg-marquee/10'
                  : ehHoje
                  ? 'border-text-dim'
                  : 'border-transparent hover:border-line'
              }`}
            >
              <span className={`text-xs ${ehHoje ? 'text-marquee font-semibold' : 'text-text-dim'}`}>{dia}</span>
              {itensDoDia.length > 0 && (
                <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                  {itensDoDia.slice(0, 4).map((ag) => (
                    <span
                      key={ag.id}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: CORES_STATUS[ag.status] || CORES_STATUS.agendado }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
