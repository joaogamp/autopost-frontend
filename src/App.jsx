import { useState } from 'react';
import BarraNavegacao from './components/BarraNavegacao';
import Dashboard from './pages/Dashboard';
import Biblioteca from './pages/Biblioteca';
import Agendamento from './pages/Agendamento';
import Contas from './pages/Contas';
import EditorLote from './pages/EditorLote';
import BoasVindas from './pages/BoasVindas';

export default function App() {
  const [pagina, setPagina] = useState('dashboard');
  // A tela de boas-vindas aparece ANTES de entrar no Editor existente.
  // Nada do Editor foi alterado: ela apenas controla o acesso visual a ele.
  const [boasVindasVista, setBoasVindasVista] = useState(false);

  function mudarPagina(destino) {
    setPagina(destino);
    // Sair do Editor volta a exigir a boas-vindas no proximo acesso.
    if (destino !== 'editorlote') setBoasVindasVista(false);
  }

  // Fluxo do produto: EDITOR → AGENDAMENTO → BIBLIOTECA (Instagram é o destino
  // da publicação, não uma etapa da navegação). A Biblioteca pode pedir o
  // Agendamento já com um vídeo final pré-selecionado.
  const [agendarFinalId, setAgendarFinalId] = useState(null);

  function agendarVideo(finalId) {
    setAgendarFinalId(finalId);
    mudarPagina('agendamento');
  }

  // Todas as páginas usam rolagem de documento; o zoom é tratado localmente
  // pelo vídeo do Editor, nunca pelo shell da aplicação.
  const ehEditor = pagina === 'editorlote';
  // Antes do Editor: mostra a boas-vindas (sem barra de navegacao do app).
  const mostrarBoasVindas = ehEditor && !boasVindasVista;
  if (mostrarBoasVindas) {
    return (
      <div className="flex flex-col bg-base text-text font-body min-h-screen">
        <BoasVindas aoEntrar={() => setBoasVindasVista(true)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col bg-base text-text font-body min-h-screen">
      <BarraNavegacao paginaAtiva={pagina} aoMudarPagina={mudarPagina} />

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
              aoAbrirContas={() => mudarPagina('contas')}
            />
          )}
          {pagina === 'biblioteca' && <Biblioteca aoAgendar={agendarVideo} />}
          {pagina === 'contas' && <Contas />}
        </main>
      )}
    </div>
  );
}

