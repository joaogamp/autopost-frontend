import { memo } from 'react';
import { Film } from 'lucide-react';
import { rotuloDeVideo } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — LISTA compacta dos vídeos importados (coluna ESQUERDA).
 *
 * É a forma PRINCIPAL de selecionar o vídeo que aparece no Canvas/editor:
 * clicar num item abre o vídeo no Canvas (via `aoSelecionar`). Uma linha
 * compacta por vídeo (thumbnail pequena + nome + duração), com scroll
 * vertical próprio — NÃO é grade, NÃO tem 1X/2X/3X (isso é só da grade
 * central). Componente MEMOIZADO.
 */
function ListaVideos({ itens, idSelecionado, aoSelecionar, aoFocar }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-[color:var(--edl-painel)]">
      {/* Cabeçalho da lista única */}
      <div className="shrink-0 px-3 py-1.5 border-t border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <Film className="w-3.5 h-3.5 edl-icone-b shrink-0" />
        <h2 className="font-display text-xs font-extrabold text-white">Vídeos importados</h2>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}
        >
          {itens.length}
        </span>
      </div>

      {/* Lista vertical compacta com scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2">
        {itens.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="edl-superficie rounded-lg px-4 py-3 text-center max-w-[220px]">
              <Film className="w-5 h-5 mx-auto edl-icone-a opacity-70" />
              <h3 className="font-display text-xs font-extrabold text-white mt-1.5">Nenhum vídeo importado</h3>
              <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-dim)' }}>
                Importe vídeos acima pra aparecerem aqui.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {itens.map((item, indice) => {
              const nome = item.nome || rotuloDeVideo(indice);
              const selecionado = item.id === idSelecionado;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => aoSelecionar(item)}
                    onMouseEnter={() => aoFocar?.(item)}
                    aria-current={selecionado}
                    title={nome}
                    className={`edl-ring-foco w-full flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors border ${
                      selecionado ? 'border-transparent' : 'border-transparent hover:bg-white/5'
                    }`}
                    style={selecionado ? { background: 'rgba(236,72,153,0.14)', boxShadow: 'inset 0 0 0 1.5px var(--edl-rosa)' } : null}
                  >
                    {/* Mini-thumbnail 9:16 */}
                    <span className="w-9 h-16 rounded-md overflow-hidden bg-[#121218] shrink-0 flex items-center justify-center">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-3.5 h-3.5 edl-icone-b opacity-60" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-bold text-white truncate">{nome}</span>
                      <span className="block text-[9px] font-semibold mt-0.5 truncate" style={{ color: 'var(--edl-texto-mut)' }}>
                        {item.duracao ? `${item.duracao} · ` : ''}
                        {item.status === 'concluido' ? '✓ Pronto' : item.status === 'processando' ? 'Processando' : item.status === 'aguardando' ? 'Na fila' : item.status === 'erro' ? 'Erro' : 'Importado'}
                      </span>
                    </span>
                    {selecionado && (
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ background: 'var(--edl-grad)' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default memo(ListaVideos);
