import { memo } from 'react';
import { Film, Trash2 } from 'lucide-react';
import { rotuloDeVideo } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — LISTA compacta dos vídeos importados (coluna ESQUERDA).
 *
 * É uma das formas de selecionar o vídeo principal (a outra é clicar
 * diretamente numa célula do espaço CENTRAL): clicar num item selecciona o
 * vídeo que fica editável no espaço central (via `aoSelecionar`). Uma linha
 * compacta por vídeo (thumbnail pequena + nome + duração), con scroll
 * vertical próprio — NÃO é grade, NÃO tem 1X/2X/3X (isso é do espaço CENTRAL).
 *
 * LIXEIRA (por vídeo): cada linha tem uma lixeira pequena e discreta
 * (`aoRemover`, sem brilho/glow) que remove SÓ aquele vídeo da lista do
 * Editor — remoção LOCAL (estado + localStorage); o arquivo original NUNCA é
 * apagado (Biblioteca/Oracle/fila intactos) e os demais vídeos não são
 * afetados. Componente MEMOIZADO.
 *
 * BARRA DE PROGRESSO INDIVIDUAL (REAL — GET /api/fila):
 * cada linha mostra, ABAIXO do nome/status, a barra do PRÓPRIO item usando
 * `item.status` + `item.percentual` do polling do EditorLote (props, sem
 * polling próprio/duplicado). Sem animação falsa 0→100.
 */
function corDaBarra(status) {
  if (status === 'concluido') return 'linear-gradient(90deg,#22c55e,#4ade80)';
  if (status === 'erro') return 'linear-gradient(90deg,#ef4444,#f87171)';
  if (status === 'aguardando') return 'linear-gradient(90deg,#f59e0b,#fbbf24)';
  return 'linear-gradient(90deg,var(--edl-rosa),var(--edl-roxo))';
}

function textoProgresso(item, percentual) {
  if (item.status === 'concluido') return '✓ Concluído · 100%';
  if (item.status === 'erro') return 'Erro no processamento';
  if (item.status === 'processando') return `Processando · ${percentual}%`;
  if (item.status === 'aguardando') return 'Na fila · 0%';
  return null;
}

function ListaVideos({ itens, idSelecionado, aoSelecionar, aoFocar, aoRemover }) {
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
              const emFila = item.status === 'aguardando' || item.status === 'processando' || item.status === 'concluido' || item.status === 'erro';
              const percentual = Math.max(0, Math.min(100, Number(item.percentual) || 0));
              const legenda = textoProgresso(item, percentual);
              // A lixeira é IRMÃ do botão da linha (não aninhada — HTML válido):
              // clicar nela remove SÓ este vídeo do Editor.
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => aoSelecionar(item)}
                    onMouseEnter={() => aoFocar?.(item)}
                    aria-current={selecionado}
                    title={nome}
                    className={`edl-ring-foco w-full flex items-center gap-2 rounded-lg pl-1.5 pr-8 py-1.5 text-left transition-colors border ${
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
                      {emFila && (
                        <span className="block mt-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentual} aria-label={`Progresso de ${nome}: ${legenda}`}>
                          <span className="block h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${percentual}%`, background: corDaBarra(item.status) }} />
                          </span>
                          <span className="block text-[9px] font-bold mt-0.5 tabular-nums" style={{ color: 'var(--edl-texto-dim)' }}>
                            {legenda}
                          </span>
                        </span>
                      )}
                      {item.status === 'erro' && item.erroMensagem && (
                        <span className="block text-[9px] font-semibold mt-0.5 truncate" style={{ color: '#f87171' }}>
                          {item.erroMensagem}
                        </span>
                      )}
                    </span>
                    {selecionado && (
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ background: 'var(--edl-grad)' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                  {typeof aoRemover === 'function' && (
                    <button
                      type="button"
                      onClick={() => aoRemover(item)}
                      title="Remover do Editor (o arquivo original continua na Biblioteca)"
                      aria-label={`Remover ${nome} do Editor`}
                      className="edl-lixeira edl-ring-foco absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
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
