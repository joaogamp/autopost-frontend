import { useRef, useState } from 'react';
import { Download, Upload, Loader2, Check, AlertCircle, Film } from 'lucide-react';
import { enviarVideos, urlArquivo } from '../../lib/api';

/**
 * EDITOR EM LOTE — coluna ESQUERDA: importação de vídeos LOCAIS.
 *
 * Aceita SOMENTE arquivos do computador (input file múltiplo): o upload é
 * REAL via POST /api/upload — o servidor valida com ffprobe, gera a
 * thumbnail e registra o vídeo na BIBLIOTECA (mesmo caminho da Biblioteca).
 * NÃO existe importação por URL aqui.
 *
 * Ao concluir, cada vídeo entra na grade do lote com thumbnail + MP4 reais
 * (urlOriginal) — os previews do pool (máx. 3) tocam o arquivo do servidor.
 *
 * NÃO existe limite de quantidade: quantos arquivos o usuário quiser.
 */

/** Deriva a URL pública do vídeo enviado (mesma regra do servidor: /uploads/{id}{ext}). */
function urlOriginalDoEnviado(v) {
  const ext = /(\.[A-Za-z0-9]{1,8})$/.exec(String(v.nomeOriginal || ''))?.[1] || '.mp4';
  return urlArquivo(`/arquivos/uploads/${v.id}${ext}`);
}

export default function PainelDownloads({ aoAdicionarVideo }) {
  const fileInputRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  // { id, nome, thumb } — os vídeos recém-enviados (feedback visual).
  const [recents, setRecents] = useState([]);

  async function aoEscolherArquivos(e) {
    const arquivos = Array.from(e.target.files || []);
    if (arquivos.length === 0) return;
    e.target.value = '';

    setEnviando(true);
    setErro('');
    try {
      // Upload REAL no servidor (ffprobe + thumbnail + biblioteca).
      const resp = await enviarVideos(arquivos);
      const videosEnviados = resp && Array.isArray(resp.videos) ? resp.videos : [];
      if (videosEnviados.length === 0) {
        setErro('Upload concluído, mas o servidor não retornou nenhum vídeo.');
        return;
      }
      setRecents((at) => [
        ...videosEnviados.map((v) => ({
          id: v.id,
          nome: v.nomeOriginal || v.id,
          thumb: v.thumbnailUrl ? urlArquivo(v.thumbnailUrl) : null,
        })),
        ...at,
      ]);
      videosEnviados.forEach((v) =>
        aoAdicionarVideo({
          id: v.id,
          bibliotecaId: v.id,
          nome: v.nomeOriginal || null,
          thumbnail: v.thumbnailUrl ? urlArquivo(v.thumbnailUrl) : null,
          urlFonte: urlOriginalDoEnviado(v),
          duracao: v.duracaoSegundos ? `${v.duracaoSegundos}s` : null,
          status: 'pronto',
        })
      );
    } catch (e2) {
      setErro(e2.message || 'Falha no upload.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="h-full flex flex-col edl-painel rounded-none border-r border-[color:var(--edl-borda)]">
      {/* Cabeçalho */}
      <div className="px-4 py-3.5 border-b border-[color:var(--edl-borda)]">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 edl-icone-a" />
          <h2 className="font-display text-sm font-extrabold text-white">Adicionar vídeos</h2>
        </div>
        <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-mut)' }}>
          Selecione vídeos do seu computador
        </p>
      </div>

      {/* Upload de arquivos locais (sem importação por URL) */}
      <div className="px-4 py-3 border-b border-[color:var(--edl-borda)] space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.mkv,.avi"
          multiple
          onChange={aoEscolherArquivos}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={enviando}
          className="edl-botao-grad w-full flex items-center justify-center gap-2 text-xs font-extrabold py-2.5 rounded-lg disabled:opacity-60 disabled:cursor-default"
        >
          {enviando ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          {enviando ? 'Enviando...' : 'Escolher vídeos locais'}
        </button>
        <p className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
          Upload real no servidor (ffprobe + thumbnail + biblioteca).
        </p>
        {erro && (
          <p className="text-[10px] font-bold leading-snug flex items-start gap-1.5" style={{ color: '#f87171' }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
          </p>
        )}
      </div>

      {/* Adicionados ao lote */}
      <div className="px-4 py-2.5 border-b border-[color:var(--edl-borda)]">
        <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
          Adicionados ao lote
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {recents.length === 0 && (
          <div className="edl-superficie rounded-lg p-4 text-center">
            <Film className="w-5 h-5 mx-auto edl-icone-b opacity-70" />
            <p className="text-[10px] font-semibold mt-2" style={{ color: 'var(--edl-texto-mut)' }}>
              Nenhum vídeo ainda.
              <br />
              Escolha arquivos acima pra começar.
            </p>
          </div>
        )}
        {recents.map((r) => (
          <div key={r.id} className="edl-superficie rounded-lg p-2.5 flex gap-2.5 items-start">
            <div className="w-10 h-[71px] rounded-md overflow-hidden shrink-0 bg-[#1c1c26] flex items-center justify-center">
              {r.thumb ? (
                <img src={r.thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <Film className="w-4 h-4 edl-icone-b opacity-60" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-white truncate">{r.nome}</p>
              <p className="text-[10px] font-bold mt-1 edl-icone-a flex items-center gap-1">
                <Check className="w-3 h-3" /> Na biblioteca e na grade
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}