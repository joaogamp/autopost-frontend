import { LayoutDashboard, Video, Layers, CalendarClock, Users, Zap, Wand2 } from 'lucide-react';

const ITENS = [
  {
    id: 'dashboard',
    label: 'Painel',
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    icon: <Video className="w-4 h-4" />,
  },
  {
    id: 'editorlote',
    label: 'Editor em Lote',
    icon: <Wand2 className="w-4 h-4" />,
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    id: 'agendamento',
    label: 'Agendamento',
    icon: <CalendarClock className="w-4 h-4" />,
  },
  {
    id: 'contas',
    label: 'Contas',
    icon: <Users className="w-4 h-4" />,
  },
];

export default function Sidebar({ paginaAtiva, aoMudarPagina }) {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur-xl flex flex-col justify-between select-none relative z-20 shadow-sm">
      <div>
        {/* Brand Header */}
        <div className="px-6 py-6 flex items-center justify-between border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-extrabold text-xs shadow-md shadow-indigo-600/30">
                <Zap className="w-4 h-4 fill-white" />
              </div>
              <h1 className="font-display text-lg font-extrabold tracking-tight text-slate-900">
                AUTO<span className="text-indigo-600">POST</span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium tracking-wide">produção em lote</p>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/80 font-bold">
            v2.0
          </span>
        </div>

        {/* Navigation items */}
        <nav className="p-3 space-y-1">
          {ITENS.map((item) => {
            const ativo = paginaAtiva === item.id;
            return (
              <button
                key={item.id}
                onClick={() => aoMudarPagina(item.id)}
                className={`w-full relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 group ${
                  ativo
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                {ativo && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-600 rounded-r-full" />
                )}
                <span className={`transition-colors ${ativo ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile Badge */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-300 flex items-center justify-center text-xs font-bold text-white shrink-0 relative">
            U
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 truncate">Uso Pessoal</p>
            <p className="text-[10px] text-slate-500 truncate font-medium">Sessão local</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
