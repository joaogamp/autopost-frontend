import { useState } from 'react';
import BarraNavegacao from './components/BarraNavegacao';
import Dashboard from './pages/Dashboard';
import Biblioteca from './pages/Biblioteca';
import Agendamento from './pages/Agendamento';
import Contas from './pages/Contas';
import EditorLote from './pages/EditorLote';

export default function App() {
  const [pagina, setPagina] = useState('dashboard');
  // Fluxo do produto: EDITOR → AGENDAMENTO → BIBLIOTECA (Instagram é o destino
  // da publicação, não uma etapa da navegação). A Biblioteca pode pedir o
  // Agendamento já com um vídeo final pré-selecionado.
  const [agendarFinalId, setAgendarFinalId] = useState(null);

  function agendarVideo(finalId) {
    setAgendarFinalId(finalId);
    setPagina('agendamento');
  }

  // Todas as páginas usam rolagem de documento; o zoom é tratado localmente
  // pelo vídeo do Editor, nunca pelo shell da aplicação.
  const ehEditor = pagina === 'editorlote';
  return (
    <div className="flex flex-col bg-base text-text font-body min-h-screen">
      <BarraNavegacao paginaAtiva={pagina} aoMudarPagina={setPagina} />

      {ehEditor ? (
        <main className="flex-1 min-w-0">
          <EditorLote />
        </main>
      ) : (
        <main className="flex-1 min-w-0 px-6 sm:px-10 py-10 transition-all">
          {pagina === 'dashboard' && <Dashboard />}
          {pagina === 'agendamento' && (
            <Agendamento
              finalIdInicial={agendarFinalId}
              aoAbrirContas={() => setPagina('contas')}
            />
          )}
          {pagina === 'biblioteca' && <Biblioteca aoAgendar={agendarVideo} />}
          {pagina === 'contas' && <Contas />}
        </main>
      )}
    </div>
  );
}

