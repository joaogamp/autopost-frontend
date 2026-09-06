import { useEffect, useRef, useState } from 'react';
import { buscarBiblioteca, enviarVideos, processarLote, urlArquivo } from '../lib/api';
import StatusDot from '../components/StatusDot';

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-3xl font-bold">Biblioteca</h2>
        <div className="flex items-center gap-2">
          {selecionados.size > 0 && (
            <button
              onClick={processarSelecionados}
              disabled={processandoLote}
              className="text-sm bg-marquee text-base px-4 py-2 rounded-md font-medium hover:brightness-110 disabled:opacity-50"
            >
              {processandoLote ? 'Enviando lote...' : `Processar ${selecionados.size} vídeo(s)`}
            </button>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="text-sm border border-line px-4 py-2 rounded-md hover:bg-surface disabled:opacity-50"
          >
            {enviando ? 'Enviando...' : '+ Adicionar vídeos'}
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

      {videos.length === 0 ? (
        <div className="border border-dashed border-line rounded-lg py-16 text-center text-text-dim text-sm">
          Nenhum vídeo na biblioteca ainda. Clique em "Adicionar vídeos" pra começar.
        </div>
      ) : (
        <div className="grid grid-cols-6 gap-3">
          {videos.map((video) => {
            const selecionado = selecionados.has(video.id);
            return (
              <button
                key={video.id}
                onClick={() => alternarSelecao(video.id)}
                className={`text-left group rounded-md overflow-hidden border transition-colors ${
                  selecionado ? 'border-marquee' : 'border-line hover:border-text-dim'
                }`}
              >
                <div className="aspect-[9/16] bg-surface relative overflow-hidden">
                  {video.thumbnailUrl ? (
                    <img
                      src={urlArquivo(video.thumbnailUrl)}
                      alt={video.nomeOriginal}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-dim text-xs">
                      sem preview
                    </div>
                  )}
                  {selecionado && (
                    <div className="absolute inset-0 bg-marquee/20 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full bg-marquee flex items-center justify-center text-base text-xs font-bold">
                        ✓
                      </div>
                    </div>
                  )}
                  {video.duracaoSegundos != null && (
                    <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 px-1 rounded">
                      {video.duracaoSegundos}s
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between px-1.5 py-1">
                  <span className="text-[11px] truncate text-text-dim">{video.nomeOriginal}</span>
                  <StatusDot status={video.status} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
