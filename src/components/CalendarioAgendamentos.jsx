import RedeIcon from './RedeIcon';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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
    <div className="glass-panel rounded-2xl p-5 border border-slate-200 shadow-sm bg-white">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => onMudarMes(-1)}
          className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors shadow-xs"
          title="Mês anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <p className="font-display text-base font-bold text-slate-900 tracking-wide">
          {NOMES_MES[mes]} <span className="text-indigo-600 font-mono text-sm ml-1 font-extrabold">{ano}</span>
        </p>

        <button
          onClick={() => onMudarMes(1)}
          className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-slate-300 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors shadow-xs"
          title="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-[10px] uppercase font-mono font-bold text-slate-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`vazio-${i}`} className="aspect-square" />;

          const chave = paraChaveData(new Date(ano, mes, dia));
          const itensDoDia = agendamentosPorDia[chave] || [];
          const ehHoje = chave === hojeChave;
          const ehSelecionado = chave === diaSelecionado;

          // Unique platforms scheduled for this day
          const redesDoDia = Array.from(new Set(itensDoDia.flatMap((ag) => ag.redes || [])));

          return (
            <button
              key={chave}
              onClick={() => onSelecionarDia(ehSelecionado ? null : chave)}
              className={`aspect-square rounded-xl p-1 flex flex-col items-center justify-between border transition-all duration-200 relative group ${
                ehSelecionado
                  ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-600/30'
                  : ehHoje
                  ? 'border-indigo-300 bg-slate-50'
                  : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span
                className={`text-xs font-bold ${
                  ehSelecionado
                    ? 'text-indigo-700'
                    : ehHoje
                    ? 'text-indigo-600 font-extrabold'
                    : 'text-slate-600 group-hover:text-slate-900'
                }`}
              >
                {dia}
              </span>

              {redesDoDia.length > 0 && (
                <div className="flex gap-0.5 items-center justify-center flex-wrap mb-0.5">
                  {redesDoDia.map((r) => (
                    <RedeIcon key={r} rede={r} className="w-2.5 h-2.5" colored={true} />
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
