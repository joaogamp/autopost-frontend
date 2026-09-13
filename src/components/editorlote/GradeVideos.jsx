import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { Film } from 'lucide-react';
import PreviaLoteCard from './PreviaLoteCard';

/**
 * EDITOR EM LOTE — GRADE dos vídeos (parte INFERIOR da coluna CENTRAL,
 * abaixo do Canvas — é a GRADE, não a lista principal de seleção).
 *
 * Layout das 3 colunas:
 *   ESQUERDA = lista dos vídeos importados (ListaVideos — forma PRINCIPAL de
 *              selecionar o vídeo que aparece no Canvas/editor);
 *   CENTRO   = Canvas/preview de edição em cima (SEPARADO, tamanho médio) +
 *              ESTA grade embaixo;
 *   DIREITA  = editor/ferramentas (PainelEditor, config compartilhada).
 *
 * Modos 1X / 2X / 3X = SOMENTE a quantidade de COLUNAS da grade central:
 *   1X = 1 vídeo DIFERENTE por linha (maior, centralizado, largura limitada);
 *   2X = 2 vídeos DIFERENTES lado a lado por linha ([V1][V2]/[V3][V4]...);
 *   3X = 3 vídeos DIFERENTES lado a lado por linha ([V1][V2][V3]/...).
 * NUNCA repete o mesmo vídeo e NÃO é comparação do mesmo vídeo: cada célula
 * é um vídeo importado distinto, na ordem da lista da esquerda. Scroll
 * VERTICAL mostra os demais.
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
  // GRADE 1X/2X/3X — SOMENTE nº de COLUNAS com vídeos DIFERENTES por linha
  // (1 = 1 vídeo maior por linha; 2 = [V1][V2]/[V3][V4]...; 3 = [V1][V2][V3]/...).
  const [colunas, setColunas] = useState(1);

  // Janela progressiva: só os primeiros `limite` vídeos são montados
  // (cada item na ordem da lista da esquerda — NUNCA repete o mesmo vídeo).
  const visiveis = useMemo(() => itens.slice(0, limite), [itens, limite]);
  const temMais = itens.length > visiveis.length;

  // Volta pra janela inicial quando o CONJUNTO de vídeos muda (novo
  // download/remoção). Mudanças só de status (polling da fila) mantêm a
  // janela — a assinatura usa só os ids.
  const assinaturaIds = useMemo(() => itens.map((v) => v.id).join(','), [itens]);
  useEffect(() => {
    setLimite(JANELA);
    containerRef.current?.scrollTo?.({ top: 0 });
  }, [assinaturaIds]);

  // Recarrega progressivamente quando a sentinela aparece (lazy loading).
  useEffect(() => {
    const sentinela = sentinelaRef.current;
    if (!sentinela) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setLimite((l) => l + PASSO);
        }
      },
      { root: containerRef.current, rootMargin: '400px' }
    );
    obs.observe(sentinela);
    return () => obs.disconnect();
  }, [temMais]);

  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-[color:var(--edl-painel)]">
      {/* Barra da grade — modos 1X / 2X / 3X = SOMENTE nº de colunas */}
      <div className="shrink-0 px-3 py-1.5 border-t border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <Film className="w-3.5 h-3.5 edl-icone-b shrink-0" />
        <h2 className="font-display text-xs font-extrabold text-white">Grade de vídeos</h2>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}
        >
          {itens.length}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 edl-superficie rounded-lg p-0.5 shrink-0" role="group" aria-label="Colunas da grade">
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
              <h3 className="font-display text-xs font-extrabold text-white mt-1.5">Nenhum vídeo importado</h3>
              <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-dim)' }}>
                Importe vídeos acima pra aparecerem aqui.
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-2.5 ${colunas === 1 ? 'w-full max-w-[420px] mx-auto' : 'w-full'}`}
            style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
          >
            {visiveis.map((item) => (
              <PreviaLoteCard
                key={item.id}
                item={item}
                indice={itens.findIndex((v) => v.id === item.id)}
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