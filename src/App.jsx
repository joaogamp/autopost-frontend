import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Biblioteca from './pages/Biblioteca';
import Templates from './pages/Templates';
import Agendamento from './pages/Agendamento';
import Contas from './pages/Contas';

export default function App() {
  const [pagina, setPagina] = useState('dashboard');

  return (
    <div className="flex h-screen bg-base text-text font-body">
      <Sidebar paginaAtiva={pagina} aoMudarPagina={setPagina} />
      <main className="flex-1 overflow-y-auto px-8 py-8">
        {pagina === 'dashboard' && <Dashboard />}
        {pagina === 'biblioteca' && <Biblioteca />}
        {pagina === 'templates' && <Templates />}
        {pagina === 'agendamento' && <Agendamento />}
        {pagina === 'contas' && <Contas />}
      </main>
    </div>
  );
}
