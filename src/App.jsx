import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Biblioteca from './pages/Biblioteca';
import Templates from './pages/Templates';
import Agendamento from './pages/Agendamento';
import Contas from './pages/Contas';
import EditorLote from './pages/EditorLote';

export default function App() {
  const [pagina, setPagina] = useState('dashboard');

  // O Editor em Lote é uma tela full-bleed de 3 colunas (tema escuro escopado
  // `edl-`): renderiza SEM o padding rolável das outras páginas, que ficam
  // intactas.
  if (pagina === 'editorlote') {
    return (
      <div className="flex h-screen bg-base text-text font-body overflow-hidden">
        <Sidebar paginaAtiva={pagina} aoMudarPagina={setPagina} />
        <main className="flex-1 min-w-0 overflow-hidden">
          <EditorLote />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-base text-text font-body overflow-hidden">
      <Sidebar paginaAtiva={pagina} aoMudarPagina={setPagina} />
      <main className="flex-1 overflow-y-auto px-6 sm:px-10 py-10 transition-all">
        {pagina === 'dashboard' && <Dashboard />}
        {pagina === 'biblioteca' && <Biblioteca />}
        {pagina === 'templates' && <Templates aoMudarPagina={setPagina} />}
        {pagina === 'agendamento' && <Agendamento />}
        {pagina === 'contas' && <Contas />}
      </main>
    </div>
  );
}
