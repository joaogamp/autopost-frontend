import { useEffect, useState } from 'react';
import { buscarBiblioteca, buscarFila } from '../lib/api';
import CartaoEstatistica from '../components/CartaoEstatistica';
import StatusDot from '../components/StatusDot';

export default function Dashboard() {
  const [biblioteca, setBiblioteca] = useState([]);
  const [fila, setFila] = useState([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    const [bib, fl] = await Promise.all([buscarBiblioteca(), buscarFila()]);
    setBiblioteca(bib);
    setFila(fl);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 3000);
    return () => clearInterval(intervalo);
  }, []);

  const contar = (status) => biblioteca.filter((v) => v.status === status).length;

  if (carregando) {
    return <p className="text-text-dim text-sm">Carregando painel...</p>;
  }

  return (
    <div>
      <h2 className="font-display text-3xl font-bold mb-6">Painel</h2>

      <div className="grid grid-cols-5 gap-3 mb-8">
        <CartaoEstatistica rotulo="Vídeos" valor={biblioteca.length} />
        <CartaoEstatistica rotulo="Aguardando" valor={contar('aguardando')} />
        <CartaoEstatistica rotulo="Processando" valor={contar('processando')} corDestaque="#4c8dff" />
        <CartaoEstatistica rotulo="Concluídos" valor={contar('concluido')} corDestaque="#2dd4bf" />
        <CartaoEstatistica rotulo="Erros" valor={contar('erro')} corDestaque="#ff5470" />
      </div>

      <h3 className="font-display text-xl font-semibold mb-3">Atividade recente</h3>
      <div className="border border-line rounded-lg divide-y divide-line">
        {fila.length === 0 && (
          <p className="text-text-dim text-sm px-4 py-6">
            Nenhum vídeo processado ainda. Envie vídeos na Biblioteca pra começar.
          </p>
        )}
        {fila
          .slice()
          .reverse()
          .slice(0, 8)
          .map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm truncate max-w-md">{item.tituloIA || '(sem título)'}</p>
                <p className="text-xs text-text-dim">{item.templateId}</p>
              </div>
              <StatusDot status={item.status} comRotulo />
            </div>
          ))}
      </div>
    </div>
  );
}
