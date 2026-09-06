import { useRef } from 'react';

/**
 * Caixa posicionada em coordenadas REAIS do canvas do template (ex: até
 * 1080x1920), exibida na tela reduzida por `escala`. Arrastar move x/y,
 * a alça no canto inferior direito redimensiona largura/altura.
 */
export default function CaixaArrastavel({ area, escala, cor, rotulo, onChange, filho }) {
  const arrastando = useRef(null);

  function iniciarArraste(e) {
    e.stopPropagation();
    arrastando.current = { tipo: 'mover', xInicial: e.clientX, yInicial: e.clientY, areaInicial: { ...area } };
    window.addEventListener('mousemove', moverMouse);
    window.addEventListener('mouseup', pararArraste);
  }

  function iniciarRedimensionar(e) {
    e.stopPropagation();
    arrastando.current = { tipo: 'redimensionar', xInicial: e.clientX, yInicial: e.clientY, areaInicial: { ...area } };
    window.addEventListener('mousemove', moverMouse);
    window.addEventListener('mouseup', pararArraste);
  }

  function moverMouse(e) {
    if (!arrastando.current) return;
    const dx = (e.clientX - arrastando.current.xInicial) / escala;
    const dy = (e.clientY - arrastando.current.yInicial) / escala;
    const inicial = arrastando.current.areaInicial;

    if (arrastando.current.tipo === 'mover') {
      onChange({ ...area, x: Math.round(inicial.x + dx), y: Math.round(inicial.y + dy) });
    } else {
      onChange({
        ...area,
        largura: Math.max(20, Math.round(inicial.largura + dx)),
        altura: Math.max(20, Math.round(inicial.altura + dy)),
      });
    }
  }

  function pararArraste() {
    arrastando.current = null;
    window.removeEventListener('mousemove', moverMouse);
    window.removeEventListener('mouseup', pararArraste);
  }

  return (
    <div
      onMouseDown={iniciarArraste}
      className="absolute cursor-move select-none"
      style={{
        left: area.x * escala,
        top: area.y * escala,
        width: area.largura * escala,
        height: area.altura * escala,
        border: `2px dashed ${cor}`,
        backgroundColor: `${cor}22`,
      }}
    >
      <span
        className="absolute -top-5 left-0 text-[10px] px-1 rounded"
        style={{ backgroundColor: cor, color: '#15131A' }}
      >
        {rotulo}
      </span>
      {filho}
      <div
        onMouseDown={iniciarRedimensionar}
        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-full cursor-se-resize"
        style={{ backgroundColor: cor }}
      />
    </div>
  );
}
