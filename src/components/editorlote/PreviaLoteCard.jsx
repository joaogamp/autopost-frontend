import { memo } from 'react';
import { ImageOff, Film, AlertCircle } from 'lucide-react';
import { rotuloDeVideo } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — card da grade (PreviaLoteCard).
 *
 * Leve por design: usa a THUMBNAIL REAL do servidor (ffprobe/ffmpeg no
 * import e no processamento) com `loading="lazy"` + `decoding="async"` —
 * NUNCA baixa o MP4 completo pra montar o card. O <video> real só existe nos
 * slots do pool (máx. 3, usePoolDeVideos). Status/percentual vêm da FILA REAL
 * (GET /api/fila) depois de "Processar vídeos".
 *
 * Estados do item:
 *   pronto       — importado, aguardando ação do usuário
 *   aguardando   — na fila_processamento (Oracle/worker local vai pegar)
 *   processando  — FFmpeg rodando (percentual REAL da fila)
 *   concluido    — final pronto (thumbnail do FINAL + MP4 final no pool)
 *   erro         — processamento falhou (mensagem real da fila)
 *
 * Componente MEMOIZADO: props estáveis não re-renderizam (fluido com
 * centenas de cards durante drags/sliders da config compartilhada).
 */

const ROTULOS_STATUS = {
  pronto: 'Importado',
  aguardando: 'Na fila',
  processando: 'Processando',
  concluido: '✓ Pronto',
  erro: 'Erro',
};

function PreviaLoteCard({ item, indice, urlPreviewAtiva, selecionado, aoSelecionar, aoFocar }) {
  const nome = item.nome || rotuloDeVideo(indice);
  const percentual = Math.max(0, Math.min(100, item.percentual || 0));

  return (
    <button
      onClick={() => aoSelecionar(item)}
      onMouseEnter={() => aoFocar?.(item)}
      className={`group w-full relative rounded-xl overflow-hidden text-left edl-card-hover transition-all duration-150 border ${
        selecionado ? 'border-transparent ring-2 ring-offset-2 ring-offset-[color:var(--edl-fundo)]' : 'border-[color:var(--edl-borda)]'
      }`}
      style={selecionado ? { '--tw-ring-color': 'var(--edl-rosa)' } : null}
    >
      {/* Thumbnail REAL 9:16 — leve, lazy (servidor gera com ffmpeg) */}
      <div className="aspect-[9/16] bg-[#121218] relative overflow-hidden">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={nome} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff className="w-5 h-5 edl-icone-b opacity-60" />
          </div>
        )}

        {/* Percentual REAL enquanto o FFmpeg processa na fila */}
        {item.status === 'processando' && (
          <div className="absolute inset-x-1.5 bottom-1.5">
            <div className="h-1.5 rounded-full bg-black/70 overflow-hidden">
              <div className="edl-progresso h-full" style={{ width: `${percentual}%` }} />
            </div>
            <p className="text-[8px] font-black text-white mt-0.5 tracking-wide">{percentual}%</p>
          </div>
        )}

        {/* Indicador do vídeo aberto no editor */}
        {selecionado && (
          <div
            className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black text-white flex items-center gap-1"
            style={{ background: 'var(--edl-grad)' }}
          >
            <Film className="w-2.5 h-2.5" /> NO EDITOR
          </div>
        )}

        {/* Duração real (ffprobe no import) */}
        {item.duracao && (
          <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded text-[8px] font-bold text-white bg-black/70">
            {item.duracao}
          </span>
        )}

        {/* Preview do MP4 REAL (só nos slots do pool — máx. 3; o SELECIONADO
            não repete aqui: ele roda no canvas do editor) */}
        {urlPreviewAtiva && (
          <video
            src={urlPreviewAtiva}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
      </div>

      {/* Nome + estado real (da fila / do lote) */}
      <div className="px-2 py-1.5 bg-[color:var(--edl-card)] border-t border-[color:var(--edl-borda)]">
        <p className="text-[10px] font-bold text-white truncate">{nome}</p>
        <p
          className="text-[8px] font-semibold flex items-center gap-1 mt-0.5 truncate"
          style={{
            color:
              item.status === 'concluido'
                ? '#4ade80'
                : item.status === 'erro'
                  ? '#f87171'
                  : item.status === 'processando'
                    ? 'var(--edl-rosa)'
                    : 'var(--edl-texto-mut)',
          }}
        >
          {item.status === 'erro' ? <AlertCircle className="w-2.5 h-2.5 shrink-0" /> : <Film className="w-2.5 h-2.5 edl-icone-a shrink-0" />}
          {ROTULOS_STATUS[item.status] || 'Importado'}
          {item.status === 'erro' && item.erroMensagem ? ` — ${String(item.erroMensagem).slice(0, 60)}` : ''}
        </p>
      </div>

      {/* Borda mista rosa+roxo quando selecionado */}
      {selecionado && (
        <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: 'inset 0 0 0 2px', color: 'var(--edl-roxo)' }} />
      )}
    </button>
  );
}

/* memo: durante arrastes/sliders da config compartilhada, cards com props
   estáveis não re-renderizam (mantém a grade fluida com qualquer quantidade). */
export default memo(PreviaLoteCard);