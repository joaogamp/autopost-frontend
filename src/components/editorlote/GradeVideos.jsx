import { memo, useState, useRef, useEffect } from 'react';
import { Film } from 'lucide-react';
import PreviaLoteCard from './PreviaLoteCard';

/**
 * EDITOR EM LOTE — GRADE dos vídeos do lote (coluna ESQUERDA, sob os downloads).
 *
 * Modos 1X / 2X / 3X:
 *   1X = 1 vídeo em destaque por linha; 2X = 2 vídeos diferentes por linha;
 *   3X = 3 vídeos diferentes por linha. Scroll VERTICAL mostra os demais —
 *   NUNCA é o mesmo vídeo repetido: cada célula é um vídeo do lote.
 *
 * Desempenho com qualquer quantidade de vídeos (sem limite fixo):
 * - cada card é leve (thumbnail REAL + `loading="lazy"` + `decoding="async"`);
 * - IntersectionObserver com rootMargin carrega os cards de forma
 *   PROGRESSIVA (janela inicial de 60, +30 ao aproximar do fim da lista);
 * - NÃO monta um <video> por card — o <video> de preview no hover só existe
 *   nos slots do pool (máx. 3 vídeos completos, usePoolDeVideos);
 * - componente MEMOIZADO + cards memoizados: durante drags/sliders da config
 *   compartilhada a grade NÃO re-renderiza (props estáveis).
 *
 * Ao clicar num vídeo da grade ele abre no Canvas principal (e a config segue
 * compartilhada — mudar logo/texto/corte vale pro lote inteiro).
 */

const JANELA = 60; // vídeos montados na janela inicial
const PASSO = 30; // incrementa ao aproximar do fim (lazy loading)

const MODOS_GRADE = [
  { colunas: 1, rotulo: '1X', titulo: '1 vídeo por linha' },
  { colunas: 2, rotulo: '2X', titulo: '2 vídeos por linha' },
  { colunas: 3, rotulo: '3X', titulo: '3 vídeos por linha' },
];

function GradeVideos({ itens, idSelecionado, ativosNoPool, aoSelecionar, aoFocar }) {
  const containerRef = useRef(null);
  const sentinelaRef = useRef(null);
  const [limite, setLimite] = useState(JANELA);
  // GRADE 1X/2X/3X — nº de vídeos DIFERENTES por linha (1 = destaque grande).
  const [colunas, setColunas] = useState(1);

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
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-[color:var(--edl-painel)]">
      {/* Barra da grade — modos 1X / 2X / 3X */}
      <div className="shrink-0 px-3 py-1.5 border-t border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <Film className="w-3.5 h-3.5 edl-icone-b shrink-0" />
        <h2 className="font-display text-xs font-extrabold text-white">Vídeos do lote</h2>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}
        >
          {itens.length}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 edl-superficie rounded-lg p-0.5 shrink-0">
          {MODOS_GRADE.map(({ colunas: n, rotulo, titulo }) => (
            <button
              key={n}
              type="button"
              title={titulo}
              aria-pressed={colunas === n}
              onClick={() => setColunas(n)}
              className={`edl-ring-foco w-8 h-6 rounded-md text-[10px] font-black transition-colors ${
                colunas === n ? 'text-white' : ''
              }`}
              style={colunas === n ? { background: 'var(--edl-grad)' } : { color: 'var(--edl-texto-mut)' }}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* Grade VERTICAL com scroll — 1/2/3 vídeos DIFERENTES por linha */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-2">
        {itens.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="edl-superficie rounded-lg px-4 py-3 text-center max-w-[240px]">
              <Film className="w-5 h-5 mx-auto edl-icone-a opacity-70" />
              <h3 className="font-display text-xs font-extrabold text-white mt-1.5">Nenhum vídeo no lote</h3>
              <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-dim)' }}>
                Adicione vídeos acima pra preencher a grade.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
          >
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
          <div ref={sentinelaRef} className="h-8 flex items-center justify-center px-2">
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
   compartilhada (drags, sliders) não re-renderizam os cards. */
export default memo(GradeVideos);