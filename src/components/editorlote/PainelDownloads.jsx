import { useEffect, useRef, useState } from 'react';
import { Download, Link2, Loader2, Check, AlertCircle, Trash2, Film } from 'lucide-react';
import { importarUrl, statusImportacao, urlArquivo } from '../../lib/api';

/**
 * EDITOR EM LOTE — coluna ESQUERDA: central de downloads (IMPORTAÇÃO REAL).
 *
 * Cole URLs de vídeos: cada URL vira uma tarefa no SERVIDOR
 * (POST /api/importar-url) que baixa o arquivo de verdade (stream, com
 * progresso real em bytes consultado via GET /api/importar-url/:id), valida
 * com ffprobe, gera a thumbnail e registra o vídeo na BIBLIOTECA — exatamente
 * pelo mesmo caminho do upload manual. Nada é simulado.
 *
 * Ao concluir, o vídeo entra na grade do lote com thumbnail + MP4 reais
 * (urlOriginal) — os previews do pool (máx. 3) tocam o arquivo do servidor.
 *
 * NÃO existe limite de quantidade: quantas URLs o usuário quiser (o servidor
 * enfileira os downloads, 2 por vez).
 */

function DownloadItem({ item, aoRemover }) {
  const ativo = item.status === 'iniciando' || item.status === 'baixando';
  const concluido = item.status === 'concluido';
  const erro = item.status === 'erro';
  const thumb = concluido && item.video?.thumbnailUrl ? urlArquivo(item.video.thumbnailUrl) : null;

  return (
    <div className="edl-superficie rounded-lg p-2.5 flex gap-2.5 items-start">
      <div className="w-10 h-[71px] rounded-md overflow-hidden shrink-0 bg-[#1c1c26] flex items-center justify-center">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : ativo ? (
          <Loader2 className="w-4 h-4 animate-spin edl-icone-b" />
        ) : concluido ? (
          <Check className="w-4 h-4 edl-icone-a" />
        ) : erro ? (
          <AlertCircle className="w-4 h-4" style={{ color: '#f87171' }} />
        ) : (
          <Film className="w-4 h-4 edl-icone-b opacity-60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-white truncate">{item.nome}</p>
        {ativo && (
          <div className="mt-1.5">
            <div className="h-1.5 rounded-full bg-[#0d0d13] overflow-hidden">
              <div className="edl-progresso h-full" style={{ width: `${Math.max(4, item.percentual)}%` }} />
            </div>
            <p className="text-[10px] font-semibold mt-1" style={{ color: 'var(--edl-texto-dim)' }}>
              {item.status === 'iniciando' ? 'Enviando pro servidor...' : `Baixando no servidor... ${item.percentual}%`}
            </p>
          </div>
        )}
        {concluido && <p className="text-[10px] font-bold mt-1 edl-icone-a">✓ Baixado e na biblioteca</p>}
        {erro && <p className="text-[10px] font-bold mt-1 line-clamp-2" style={{ color: '#f87171' }}>{item.erro || 'Erro no download'}</p>}
        {concluido && aoRemover && (
          <button
            onClick={aoRemover}
            className="mt-1 text-[10px] font-semibold flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity edl-icone-b"
          >
            <Trash2 className="w-3 h-3" /> Remover da lista
          </button>
        )}
      </div>
    </div>
  );
}

export default function PainelDownloads({ aoAdicionarVideo }) {
  const [urls, setUrls] = useState('');
  // { id(importId), nome, url, status: 'iniciando'|'baixando'|'concluido'|'erro', percentual, erro, video }
  const [downloads, setDownloads] = useState([]);
  const idLocalRef = useRef(0);

  function extrairNomes(texto) {
    // Uma URL por linha (ou separadas por vírgula) — quantidade arbitrária.
    return texto
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function nomeDaUrl(url) {
    try {
      const u = new URL(url);
      const ultimo = u.pathname.split('/').filter(Boolean).pop();
      return (ultimo || url).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 40) || url.slice(0, 40);
    } catch {
      return url.slice(0, 40);
    }
  }

  async function iniciar() {
    const lista = extrairNomes(urls);
    if (lista.length === 0) return;
    setUrls('');

    for (const url of lista) {
      const idLocal = `local-${++idLocalRef.current}-${Date.now().toString(36)}`;
      setDownloads((at) => [{ id: idLocal, nome: nomeDaUrl(url), url, status: 'iniciando', percentual: 0, erro: null, video: null }, ...at]);
      try {
        const { importId } = await importarUrl(url);
        setDownloads((at) => at.map((d) => (d.id === idLocal ? { ...d, id: importId, status: 'baixando' } : d)));
      } catch (e) {
        setDownloads((at) => at.map((d) => (d.id === idLocal ? { ...d, status: 'erro', erro: e.message } : d)));
      }
    }
  }

  // Polling do progresso REAL das importações ativas (bytes no servidor).
  useEffect(() => {
    const ativos = downloads.filter((d) => d.status === 'iniciando' || d.status === 'baixando');
    if (ativos.length === 0) return undefined;

    const timer = setInterval(async () => {
      const alvos = downloads.filter((d) => d.status === 'iniciando' || d.status === 'baixando');
      await Promise.all(
        alvos.map(async (d) => {
          try {
            const r = await statusImportacao(d.id);
            if (r.status === 'concluido' && r.video) {
              // Vídeo REAL registrado na biblioteca do servidor.
              setDownloads((at) => at.map((x) => (x.id === d.id ? { ...x, status: 'concluido', percentual: 100, video: r.video } : x)));
              aoAdicionarVideo({
                id: r.video.id,
                bibliotecaId: r.video.id,
                nome: r.video.nomeOriginal,
                thumbnail: r.video.thumbnailUrl ? urlArquivo(r.video.thumbnailUrl) : null,
                urlFonte: r.video.urlOriginal ? urlArquivo(r.video.urlOriginal) : null,
                duracao: r.video.duracaoSegundos ? `${r.video.duracaoSegundos}s` : null,
                status: 'pronto',
              });
            } else if (r.status === 'erro') {
              setDownloads((at) => at.map((x) => (x.id === d.id ? { ...x, status: 'erro', erro: r.erro || 'Erro no download' } : x)));
            } else {
              setDownloads((at) => at.map((x) => (x.id === d.id ? { ...x, status: 'baixando', percentual: r.percentual || 0 } : x)));
            }
          } catch {
            //rede instável — tenta de novo no próximo tick
          }
        })
      );
    }, 900);
    return () => clearInterval(timer);
  }, [downloads, aoAdicionarVideo]);

  const emAndamento = downloads.filter((d) => d.status === 'iniciando' || d.status === 'baixando').length;

  return (
    <div className="h-full flex flex-col edl-painel rounded-none border-r border-[color:var(--edl-borda)]">
      {/* Cabeçalho */}
      <div className="px-4 py-3.5 border-b border-[color:var(--edl-borda)]">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 edl-icone-a" />
          <h2 className="font-display text-sm font-extrabold text-white">Adicionar vídeos</h2>
        </div>
        <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-mut)' }}>
          Cole uma ou mais URLs (uma por linha)
        </p>
      </div>

      {/* Entrada de URLs */}
      <div className="px-4 py-3 border-b border-[color:var(--edl-borda)] space-y-2">
        <div className="relative">
          <Link2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 edl-icone-b" />
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) iniciar();
            }}
            rows={3}
            placeholder="https://exemplo.com/video-01.mp4"
            className="edl-input w-full text-[11px] font-medium px-2.5 py-2 pl-8 resize-none leading-relaxed"
          />
        </div>
        <button
          onClick={iniciar}
          className="edl-botao-grad w-full flex items-center justify-center gap-2 text-xs font-extrabold py-2.5 rounded-lg"
        >
          <Download className="w-3.5 h-3.5" />
          Baixar {extrairNomes(urls).length > 0 ? `(${extrairNomes(urls).length})` : ''}
        </button>
        <p className="text-[9px] font-semibold flex justify-between" style={{ color: 'var(--edl-texto-mut)' }}>
          <span>Ctrl+Enter baixa</span>
          <span>download real no servidor</span>
        </p>
      </div>

      {/* Fila de downloads */}
      <div className="px-4 py-2.5 border-b border-[color:var(--edl-borda)] flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
          Central de downloads
        </span>
        {emAndamento > 0 && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold edl-icone-a">
            <Loader2 className="w-3 h-3 animate-spin" /> {emAndamento} em andamento
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {downloads.length === 0 && (
          <div className="edl-superficie rounded-lg p-4 text-center">
            <Download className="w-5 h-5 mx-auto edl-icone-b opacity-70" />
            <p className="text-[10px] font-semibold mt-2" style={{ color: 'var(--edl-texto-mut)' }}>
              Nenhum download ainda.
              <br />
              Cole URLs acima pra começar.
            </p>
          </div>
        )}
        {downloads.map((d) => (
          <DownloadItem
            key={d.id}
            item={d}
            aoRemover={d.status === 'concluido' ? () => setDownloads((at) => at.filter((x) => x.id !== d.id)) : null}
          />
        ))}
      </div>
    </div>
  );
}