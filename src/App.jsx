import { useState } from 'react';
import BarraNavegacao from './components/BarraNavegacao';
import Dashboard from './pages/Dashboard';
import Biblioteca from './pages/Biblioteca';
import Agendamento from './pages/Agendamento';
import Contas from './pages/Contas';
import EditorLote from './pages/EditorLote';
import BoasVindas from './pages/BoasVindas';

export default function App() {
  // BoasVindas e a PRIMEIRA TELA global: bloqueia Dashboard, BarraNavegacao
  // e qualquer outra pagina ate clicar em "ENTRAR NO MEU EDITOR DE VIDEO".
  const [entrouNoEditor, setEntrouNoEditor] = useState(false);
  const [pagina, setPagina] = useState('editorlote');

  function mudarPagina(destino) {
    setPagina(destino);
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
  // Gate global: enquanto nao entrou, mostra SOMENTE BoasVindas
  // (sem BarraNavegacao, sem Dashboard, sem nenhuma outra pagina).
  if (!entrouNoEditor) {
    return (
      <div className="flex flex-col bg-base text-text font-body min-h-screen">
        <BoasVindas aoEntrar={() => { setEntrouNoEditor(true); setPagina('editorlote'); }} />
      </div>
    );
  }
  return (
    <div className="flex flex-col bg-base text-text font-body min-h-screen">
      <BarraNavegacao paginaAtiva={pagina} aoMudarPagina={mudarPagina} />

      {ehEditor ? (
        <main className="flex-1 min-w-0">
          <EditorLote aoEncaminharParaAgendamento={() => mudarPagina('agendamento')} />
        </main>
      ) : (
        <main className="autopost-pages flex-1 min-w-0 px-6 sm:px-10 py-10 transition-all">
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

