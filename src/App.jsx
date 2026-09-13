import { useState } from 'react';
import BarraNavegacao from './components/BarraNavegacao';
import Dashboard from './pages/Dashboard';
import Biblioteca from './pages/Biblioteca';
import Agendamento from './pages/Agendamento';
import Contas from './pages/Contas';
import EditorLote from './pages/EditorLote';

export default function App() {
  const [pagina, setPagina] = useState('dashboard');

  // Navegação principal: barra superior compacta (BarraNavegacao), no topo e
  // centralizada. O conteúdo ocupa o restante da altura. O Editor em Lote é
  // uma tela full-bleed de 3 colunas (tema escuro escopado `edl-`): renderiza
  // SEM o padding rolável das outras páginas, que ficam intactas.
  return (
    <div className="flex flex-col h-screen bg-base text-text font-body overflow-hidden">
      <BarraNavegacao paginaAtiva={pagina} aoMudarPagina={setPagina} />

      {pagina === 'editorlote' ? (
        <main className="flex-1 min-w-0 overflow-hidden">
          <EditorLote />
        </main>
      ) : (
        <main className="flex-1 min-w-0 overflow-y-auto px-6 sm:px-10 py-10 transition-all">
          {pagina === 'dashboard' && <Dashboard />}
          {pagina === 'biblioteca' && <Biblioteca />}
          {pagina === 'agendamento' && <Agendamento />}
          {pagina === 'contas' && <Contas />}
        </main>
      )}
    </div>
  );
}

