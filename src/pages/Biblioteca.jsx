import { useEffect, useRef, useState } from 'react';
import { buscarBiblioteca, enviarVideos, processarLote, urlArquivo } from '../lib/api';
import StatusDot from '../components/StatusDot';
import RedeIcon from '../components/RedeIcon';
import { Zap, Plus, Upload, Check } from 'lucide-react';

export default function Biblioteca() {
  const [videos, setVideos] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [enviando, setEnviando] = useState(false);
  const [processandoLote, setProcessandoLote] = useState(false);
  const inputRef = useRef(null);

  async function carregar() {
    setVideos(await buscarBiblioteca());
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 3000);
    return () => clearInterval(intervalo);
  }, []);

  async function aoSelecionarArquivos(e) {
    const arquivos = Array.from(e.target.files || []);
    if (arquivos.length === 0) return;
    setEnviando(true);
    await enviarVideos(arquivos);
    await carregar();
    setEnviando(false);
    e.target.value = '';
  }

  function alternarSelecao(id) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  async function processarSelecionados() {
    const lista = videos
      .filter((v) => selecionados.has(v.id))
      .map((v) => ({ bibliotecaId: v.id, tituloIA: v.nomeOriginal.replace(/\.[^.]+$/, '') }));

    if (lista.length === 0) return;
    setProcessandoLote(true);
    await processarLote('cineplay-review', lista);
    setSelecionados(new Set());
    setProcessandoLote(false);
    carregar();
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Biblioteca</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">Gerencie seu repositório de vídeos brutos e processe em lote</p>
        </div>

        <div className="flex items-center gap-3">
          {selecionados.size > 0 && (
            <button
              onClick={processarSelecionados}
              disabled={processandoLote}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>{processandoLote ? 'Enviando lote...' : `Processar ${selecionados.size} vídeo(s)`}</span>
            </button>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="text-xs bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-indigo-600" />
            <span>{enviando ? 'Enviando...' : 'Adicionar vídeos'}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={aoSelecionarArquivos}
          />
        </div>
      </div>

      {/* Grid Content */}
      {videos.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="glass-panel border-2 border-dashed border-slate-300 hover:border-indigo-500/60 rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 group shadow-xs"
        >
          <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="font-display text-base font-bold text-slate-900 mb-1">Nenhum vídeo na biblioteca</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
            Clique aqui ou no botão acima para importar seus arquivos de vídeo e começar o processamento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {videos.map((video) => {
            const selecionado = selecionados.has(video.id);
            const redesVideo = video.redes || ['instagram', 'youtube'];
            return (
              <div
                key={video.id}
                onClick={() => alternarSelecao(video.id)}
                className={`group text-left rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer relative shadow-xs ${
                  selecionado
                    ? 'border-indigo-600 ring-2 ring-indigo-600/30 bg-indigo-50/20'
                    : 'border-slate-200 hover:border-slate-300 glass-card hover:-translate-y-1'
                }`}
              >
                <div className="aspect-[9/16] bg-slate-900 relative overflow-hidden">
                  {video.thumbnailUrl ? (
                    <img
                      src={urlArquivo(video.thumbnailUrl)}
                      alt={video.nomeOriginal}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                      <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[10px]">Sem preview</span>
                    </div>
                  )}

                  {/* Platforms Icon Tag at Top-Left */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-1.5 py-1 rounded-lg border border-white/20">
                    {redesVideo.map((r) => (
                      <RedeIcon key={r} rede={r} className="w-3.5 h-3.5" colored={true} />
                    ))}
                  </div>

                  {/* Selection Overlay */}
                  {selecionado && (
                    <div className="absolute inset-0 bg-indigo-600/30 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-lg">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    </div>
                  )}

                  {/* Duration Tag */}
                  {video.duracaoSegundos != null && (
                    <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold bg-slate-900/80 text-white backdrop-blur-md px-1.5 py-0.5 rounded border border-white/20">
                      {video.duracaoSegundos}s
                    </span>
                  )}
                </div>

                <div className="p-2.5 flex items-center justify-between gap-2 border-t border-slate-100 bg-white">
                  <span className="text-[11px] font-semibold truncate text-slate-700 group-hover:text-indigo-600 transition-colors">
                    {video.nomeOriginal}
                  </span>
                  <StatusDot status={video.status} comRotulo={false} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
