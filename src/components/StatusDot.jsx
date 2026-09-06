const CORES = {
  aguardando: 'bg-status-aguardando',
  processando: 'bg-status-processando',
  concluido: 'bg-status-concluido',
  erro: 'bg-status-erro',
};

const ROTULOS = {
  aguardando: 'Aguardando',
  processando: 'Processando',
  concluido: 'Concluído',
  erro: 'Erro',
};

export default function StatusDot({ status, comRotulo = false }) {
  const cor = CORES[status] || CORES.aguardando;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${cor} ${status === 'processando' ? 'animate-pulse' : ''}`}
      />
      {comRotulo && <span className="text-xs text-text-dim">{ROTULOS[status] || status}</span>}
    </span>
  );
}
