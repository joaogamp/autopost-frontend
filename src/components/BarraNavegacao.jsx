import { LayoutDashboard, Video, CalendarClock, Users, Zap, Wand2 } from 'lucide-react';

/**
 * BARRA DE NAVEGAÇÃO SUPERIOR — substitui a antiga sidebar lateral.
 * Menu compacto, discreto e centralizado horizontalmente no topo.
 * Tema escuro/quase preto com detalhes em rosa→roxo (identidade AutoPost).
 *
 * Ordem do fluxo do produto: Painel → Editor → AGENDAMENTO → Biblioteca → Contas.
 * "Editor" é o Editor em Lote existente. Templates NÃO faz parte da navegação.
 * Reutiliza o contrato da navegação antiga: paginaAtiva + aoMudarPagina.
 */
const ITENS = [
  { id: 'dashboard', label: 'Painel', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'editorlote', label: 'Editor', icon: <Wand2 className="w-3.5 h-3.5" /> },
  { id: 'agendamento', label: 'Agendamento', icon: <CalendarClock className="w-3.5 h-3.5" /> },
  { id: 'biblioteca', label: 'Biblioteca', icon: <Video className="w-3.5 h-3.5" /> },
  { id: 'contas', label: 'Contas', icon: <Users className="w-3.5 h-3.5" /> },
];

export default function BarraNavegacao({ paginaAtiva, aoMudarPagina }) {
  return (
    <header className="shrink-0 sticky top-0 z-20 h-12 bg-[#0a0a0f] border-b border-[#26262f] select-none">
      {/* Fixa no topo durante a rolagem da página (sticky no shell do documento;
         na shell h-screen do Editor o sticky é inofensivo — não há rolagem). */}
      {/* Grade de 3 colunas: marca à esquerda, menu centrado, versão à direita */}
      <div className="h-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-4">
        {/* Marca — compacta */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-gradient-to-br from-[#ec4899] to-[#8b5cf6] shadow-[0_0_10px_rgba(236,72,153,0.35)]">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <h1 className="hidden sm:block font-display text-sm font-extrabold tracking-tight text-white leading-none">
            AUTO<span className="bg-gradient-to-r from-[#ec4899] to-[#8b5cf6] bg-clip-text text-transparent">POST</span>
          </h1>
        </div>

        {/* Menu centralizado — rola horizontalmente em telas muito pequenas */}
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex w-max mx-auto items-center gap-1 py-1.5">
            {ITENS.map((item) => {
              const ativo = paginaAtiva === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => aoMudarPagina(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none whitespace-nowrap transition-all duration-150 ${
                    ativo
                      ? 'text-white bg-gradient-to-r from-[#ec4899]/20 to-[#8b5cf6]/25 ring-1 ring-[#ec4899]/40 shadow-[0_0_12px_rgba(236,72,153,0.18)]'
                      : 'text-[#a1a1b0] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={ativo ? 'text-[#f472b6]' : ''}>{item.icon}</span>
                  <span>{item.label}</span>
                  {ativo && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ec4899] to-[#8b5cf6] shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Direita — chip de versão discreto (some em telas pequenas) */}
        <div className="hidden md:flex items-center justify-end min-w-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-[#3a3a46] text-[#a1a1b0] leading-none">
            v2.0
          </span>
        </div>
      </div>
    </header>
  );
}
