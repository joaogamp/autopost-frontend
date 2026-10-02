import { LayoutDashboard, Video, CalendarClock, Users, Zap, Wand2 } from 'lucide-react';

/**
 * BARRA DE NAVEGAÇÃO SUPERIOR — substitui a antiga sidebar lateral.
 * Menu compacto, discreto e centralizado horizontalmente no topo.
 * Tema escuro/quase preto com detalhes em verde (identidade AutoPost).
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
    <header className="autopost-nav shrink-0 sticky top-0 z-20 h-12 bg-[#080808] border-b border-[#242424] select-none">
      {/* Fixa no topo durante a rolagem da página (sticky no shell do documento;
         na shell h-screen do Editor o sticky é inofensivo — não há rolagem). */}
      {/* Grade de 3 colunas: marca à esquerda, menu centrado, versão à direita */}
      <div className="h-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-4">
        {/* Marca — compacta. Ícone: fundo verde fluorescente + traço PRETO
            (mesmo contraste da referência); wordmark AUTOPOST em branco. */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-[#4dff88] shadow-[0_0_10px_rgba(77,255,136,0.35)]">
            <Zap className="w-3.5 h-3.5 text-[#06120a] fill-[#06120a]" />
          </div>
          <h1 className="hidden sm:block font-display text-sm font-extrabold tracking-tight text-white leading-none">
            AUTO<span>POST</span>
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
                      ? 'text-[#4dff88] bg-[#4dff88]/10 ring-1 ring-[#4dff88]/45 shadow-[0_0_12px_rgba(77,255,136,0.18)]'
                      : 'text-[#aeb8b2] hover:text-[#4dff88] hover:bg-[#4dff88]/10'
                  }`}
                >
                  <span className={ativo ? 'text-[#7cff9b]' : ''}>{item.icon}</span>
                  <span>{item.label}</span>
                  {ativo && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4dff88] shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Direita — chip de versão discreto (some em telas pequenas) */}
        <div className="hidden md:flex items-center justify-end min-w-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-[#2c2c2c] text-[#aeb8b2] leading-none">
            v2.0
          </span>
        </div>
      </div>
    </header>
  );
}
