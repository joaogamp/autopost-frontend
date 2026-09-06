const ITENS = [
  { id: 'dashboard', label: 'Painel' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'templates', label: 'Templates' },
  { id: 'agendamento', label: 'Agendamento' },
  { id: 'contas', label: 'Contas' },
];

export default function Sidebar({ paginaAtiva, aoMudarPagina }) {
  return (
    <aside className="w-56 shrink-0 border-r border-line flex flex-col">
      <div className="px-5 py-6">
        <h1 className="font-display text-3xl font-bold tracking-tight leading-none">
          AUTO<span className="text-marquee">POST</span>
        </h1>
        <p className="text-xs text-text-dim mt-1">produção em lote</p>
      </div>

      <nav className="flex-1 px-2">
        {ITENS.map((item) => {
          const ativo = paginaAtiva === item.id;
          return (
            <button
              key={item.id}
              onClick={() => aoMudarPagina(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm mb-0.5 transition-colors ${
                ativo
                  ? 'bg-surface text-marquee font-medium'
                  : 'text-text-dim hover:text-text hover:bg-surface/50'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-line">
        <p className="text-xs text-text-dim">Uso pessoal</p>
      </div>
    </aside>
  );
}
