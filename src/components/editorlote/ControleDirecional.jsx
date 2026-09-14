import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * EDITOR EM LOTE — controle direcional compacto (substitui sliders X/Y).
 *
 * Escreve nos MESMOS `x`/`y` (% do canvas 0..100) usados pelo drag do mouse
 * (`gerarArrasteDeRuta`) — drag e botões compartilham a config interna via
 * atualização funcional `aoAtualizarConfig(cfg => ...)`.
 *
 * - clique = passo padrão (1%);
 * - Shift+clique = passo fino (0.2%).
 */
export const PASSO_DIRECIONAL = 1;
export const PASSO_DIRECIONAL_FINO = 0.2;

function prender(v) {
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
}

export default function ControleDirecional({ x = 50, y = 50, aoMudar, rotulo = 'Posição' }) {
  const muda = (dx, dy) => (e) => {
    const fino = e?.shiftKey === true;
    const passo = fino ? PASSO_DIRECIONAL_FINO : PASSO_DIRECIONAL;
    aoMudar(prender(Number(x) + dx * passo), prender(Number(y) + dy * passo));
  };

  const Botao = ({ dx, dy, titulo, children }) => (
    <button
      type="button"
      title={titulo}
      aria-label={`${rotulo}: ${titulo}`}
      onClick={muda(dx, dy)}
      className="edl-ring-foco w-8 h-8 rounded-lg flex items-center justify-center transition-colors edl-superficie hover:brightness-150"
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
          {rotulo}
        </span>
        <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
          {Math.round(Number(x) * 10) / 10}%, {Math.round(Number(y) * 10) / 10}%
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 w-[104px]" role="group" aria-label={`${rotulo} direcional`}>
        <span />
        <Botao dx={0} dy={-1} titulo="Mover para cima (Shift = fino)">
          <ChevronUp className="w-4 h-4 edl-icone-a" />
        </Botao>
        <span />
        <Botao dx={-1} dy={0} titulo="Mover para a esquerda (Shift = fino)">
          <ChevronLeft className="w-4 h-4 edl-icone-a" />
        </Botao>
        <span
          className="w-8 h-8 rounded-full mx-auto"
          title="Posição atual"
          style={{ background: 'var(--edl-grad)', boxShadow: '0 0 8px rgba(236,72,153,0.5)' }}
        />
        <Botao dx={1} dy={0} titulo="Mover para a direita (Shift = fino)">
          <ChevronRight className="w-4 h-4 edl-icone-a" />
        </Botao>
        <span />
        <Botao dx={0} dy={1} titulo="Mover para baixo (Shift = fino)">
          <ChevronDown className="w-4 h-4 edl-icone-a" />
        </Botao>
        <span />
      </div>
    </div>
  );
}
