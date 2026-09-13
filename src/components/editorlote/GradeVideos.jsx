import { memo, useState, useRef, useEffect } from 'react';
import { Film } from 'lucide-react';
import PreviaLoteCard from './PreviaLoteCard';

/**
 * EDITOR EM LOTE — região CENTRAL: grade com todos os vídeos do lote.
 *
 * Desempenho com qualquer quantidade de vídeos (sem limite fixo):
 * - cada card é leve (thumbnail + lazy loading via `loading="lazy"` /
 *   `decoding="async"` no <img>);
 * - IntersectionObserver com rootMargin carrega os cards de forma
 *   PROGRESSIVA (janela inicial de 60, +30 ao aproximar do fim), mantendo
 *   a tela rápida;
 * - NÃO monta 100 <video> — o <video> de preview no hover só existe se o
 *   item estiver ativo no pool (máx. 3 vídeos completos, usePoolDeVideos);
 * - componente MEMOIZADO + cards memoizados: durante drags/sliders da config
 *   compartilhada a grade NÃO re-renderiza (props estáveis) — mudar logo/
 *   texto não custa re-pintar os ~100 cards.
 */

const JANELA = 60; // vídeos montados na janela inicial
const PASSO = 30; // incrementa ao aproximar do fim

function GradeVideos({ itens, idSelecionado, ativosNoPool, aoSelecionar, aoFocar }) {
  const containerRef = useRef(null);
  const sentinelaRef = useRef(null);
  const [limite, setLimite] = useState(JANELA);

  // Recarrega progressivamente quando a sentinela aparece (lazy loading).
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setLimite((l) => l + PASSO);
        }
      },
      { root: containerRef.current, rootMargin: '400px' }
    );
    if (sentinelaRef.current) obs.observe(sentinelaRef.current);
    return () => obs.disconnect();
  }, []);

  // Volta pra janela inicial quando o lote muda (novo download etc.).
  useEffect(() => {
    setLimite(JANELA);
  }, [itens.length]);

  const visiveis = itens.slice(0, limite);
  const temMais = itens.length > visiveis.length;

  return (
    <div className="h-full flex flex-col min-w-0">
      {/* Barra superior da grade */}
      <div className="shrink-0 px-5 py-3 border-b border-[color:var(--edl-borda)] flex items-center gap-3">
        <Film className="w-4 h-4 edl-icone-b" />
        <h2 className="font-display text-sm font-extrabold text-white">Todos os vídeos</h2>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}
        >
          {itens.length} vídeo{itens.length === 1 ? '' : 's'}
        </span>
        <div className="flex-1" />
        <span className="text-[9px] font-semibold hidden sm:block" style={{ color: 'var(--edl-texto-mut)' }}>
          Clique num vídeo pra editar • a configuração vale pro lote inteiro
        </span>
      </div>

      {/* Grade com scroll próprio */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4">
        {itens.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="edl-superficie rounded-xl px-8 py-10 text-center max-w-sm">
              <Film className="w-8 h-8 mx-auto edl-icone-a opacity-70" />
              <h3 className="font-display text-sm font-extrabold text-white mt-3">Nenhum vídeo no lote</h3>
              <p className="text-[11px] font-medium mt-1.5" style={{ color: 'var(--edl-texto-dim)' }}>
                Use a central de downloads à esquerda pra adicionar vídeos.
                <br />
                Os cards aparecem aqui rapidamente (thumbnails leves).
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))' }}>
            {visiveis.map((item, indice) => (
              <PreviaLoteCard
                key={item.id}
                item={item}
                indice={indice}
                urlPreviewAtiva={item.id === idSelecionado ? null : ativosNoPool?.[item.id] || null}
                selecionado={item.id === idSelecionado}
                aoSelecionar={aoSelecionar}
                aoFocar={aoFocar}
              />
            ))}
          </div>
        )}

        {/* Sentinela do carregamento progressivo (só com lote grande) */}
        {temMais && (
          <div ref={sentinelaRef} className="h-10 flex items-center justify-center">
            <span className="text-[9px] font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
              carregando mais vídeos... ({visiveis.length}/{itens.length})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* memo: a grade depende só de itens/seleção/pool — mudanças na config
   compartilhada (drags, sliders) não re-renderizam os ~100 cards. */
export default memo(GradeVideos);