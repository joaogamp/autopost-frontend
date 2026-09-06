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
        <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
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
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Painel</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">Visão geral do pipeline de produção e agendamentos</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[11px] font-bold text-slate-700">Sistema Ativo</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <CartaoEstatistica rotulo="Vídeos" valor={biblioteca.length} corDestaque="#4f46e5" icon={Film} />
        <CartaoEstatistica rotulo="Aguardando" valor={contar('aguardando')} corDestaque="#64748b" icon={Clock} />
        <CartaoEstatistica rotulo="Processando" valor={contar('processando')} corDestaque="#2563eb" icon={Loader2} />
        <CartaoEstatistica rotulo="Concluídos" valor={contar('concluido')} corDestaque="#059669" icon={CheckCircle2} />
        <CartaoEstatistica rotulo="Erros" valor={contar('erro')} corDestaque="#e11d48" icon={AlertCircle} />
      </div>

      {/* Recent Activity Card */}
      <div className="glass-panel rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-white">
        <div className="px-6 py-4.5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-indigo-600" />
            <h3 className="font-display text-base font-bold text-slate-900">Atividade recente</h3>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 shadow-xs">
            {fila.length} item(ns)
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {fila.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-slate-500 text-xs font-medium">
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
                  className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/80 transition-colors duration-150 group"
                >
                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-semibold text-slate-900 truncate max-w-lg group-hover:text-indigo-600 transition-colors">
                      {item.tituloIA || '(sem título)'}
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
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
