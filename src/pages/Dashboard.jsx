import { useEffect, useState } from 'react';
import { buscarBiblioteca, buscarFila } from '../lib/api';
import CartaoEstatistica from '../components/CartaoEstatistica';
import StatusDot from '../components/StatusDot';
import { Film, Clock, Loader2, CheckCircle2, AlertCircle, Activity } from 'lucide-react';

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
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-3 text-text-muted text-sm font-medium">
          <Loader2 className="w-5 h-5 text-rosa animate-spin" />
          <span>Carregando painel...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-text">Painel</h2>
          <p className="text-xs text-text-muted mt-1 font-medium">Visão geral do pipeline de produção e agendamentos</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-line text-xs shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[11px] font-bold text-text-dim">Sistema Ativo</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <CartaoEstatistica rotulo="Vídeos" valor={biblioteca.length} corDestaque="#8b5cf6" icon={Film} />
        <CartaoEstatistica rotulo="Aguardando" valor={contar('aguardando')} corDestaque="#a1a1b0" icon={Clock} />
        <CartaoEstatistica rotulo="Processando" valor={contar('processando')} corDestaque="#ec4899" icon={Loader2} />
        <CartaoEstatistica rotulo="Concluídos" valor={contar('concluido')} corDestaque="#059669" icon={CheckCircle2} />
        <CartaoEstatistica rotulo="Erros" valor={contar('erro')} corDestaque="#e11d48" icon={AlertCircle} />
      </div>

      {/* Recent Activity Card */}
      <div className="glass-panel rounded-2xl border border-line overflow-hidden shadow-sm bg-surface">
        <div className="px-6 py-4.5 border-b border-line flex items-center justify-between bg-surface-hover/50">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-rosa" />
            <h3 className="font-display text-base font-bold text-text">Atividade recente</h3>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-surface border border-line text-text-dim shadow-xs">
            {fila.length} item(ns)
          </span>
        </div>

        <div className="divide-y divide-line">
          {fila.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-text-muted text-xs font-medium">
                Nenhum vídeo processado ainda. Envie vídeos na Biblioteca pra começar.
              </p>
            </div>
          ) : (
            fila
              .slice()
              .reverse()
              .slice(0, 8)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-surface-hover/80 transition-colors duration-150 group"
                >
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-semibold text-text truncate max-w-lg group-hover:text-rosa transition-colors">
                      {item.tituloIA || '(sem título)'}
                    </p>
                    <p className="text-xs text-text-muted font-mono mt-0.5 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-slate-400" />
                      Template: {item.templateId}
                    </p>
                  </div>
                  <StatusDot status={item.status} comRotulo />
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
