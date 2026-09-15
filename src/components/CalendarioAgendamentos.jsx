import RedeIcon from './RedeIcon';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hojeIso } from '../lib/fuso';

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
  // "Hoje" em America/Sao_Paulo — igual ao backend, independente do fuso do
  // navegador (antes usava new Date() local e podia divergir do servidor).
  const hojeChave = hojeIso();

  const agendamentosPorDia = agendamentos.reduce((acc, ag) => {
    (acc[ag.data] ||= []).push(ag);
    return acc;
  }, {});

  const celulas = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDias; dia++) celulas.push(dia);

  return (
    <div className="glass-panel rounded-2xl p-5 border border-line shadow-sm bg-surface">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => onMudarMes(-1)}
          className="w-8 h-8 rounded-lg bg-surface border border-line hover:border-line-light flex items-center justify-center text-text-dim hover:text-text transition-colors shadow-xs"
          title="Mês anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <p className="font-display text-base font-bold text-text tracking-wide">
          {NOMES_MES[mes]} <span className="text-rosa font-mono text-sm ml-1 font-extrabold">{ano}</span>
        </p>

        <button
          onClick={() => onMudarMes(1)}
          className="w-8 h-8 rounded-lg bg-surface border border-line hover:border-line-light flex items-center justify-center text-text-dim hover:text-text transition-colors shadow-xs"
          title="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-[10px] uppercase font-mono font-bold text-text-muted py-1">
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
                  ? 'border-rosa bg-rosa-dim/60 shadow-xs ring-1 ring-rosa/30'
                  : ehHoje
                  ? 'border-rosa-borda bg-surface-hover'
                  : 'border-line hover:border-line-light hover:bg-surface-hover'
              }`}
            >
              <span
                className={`text-xs font-bold ${
                  ehSelecionado
                    ? 'text-rosa-hover'
                    : ehHoje
                    ? 'text-rosa font-extrabold'
                    : 'text-text-dim group-hover:text-text'
                }`}
              >
                {dia}
              </span>

              {redesDoDia.length > 0 && (
                <div className="flex gap-0.5 items-center justify-center flex-wrap mb-0.5">
                  {redesDoDia.slice(0, 3).map((r) => (
                    <RedeIcon key={r} rede={r} className="w-2.5 h-2.5" colored={true} />
                  ))}
                </div>
              )}

              {/* Contador de agendamentos do dia */}
              {itensDoDia.length > 0 && (
                <span
                  className="absolute top-1 right-1 text-[9px] font-mono font-bold leading-none text-text-dim bg-surface-hover border border-line rounded-md px-1 py-0.5"
                  title={`${itensDoDia.length} agendamento(s) neste dia`}
                >
                  {itensDoDia.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
