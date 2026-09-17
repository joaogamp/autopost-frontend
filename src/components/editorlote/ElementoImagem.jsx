import { gerarArrasteImagem, gerarRedimensionarImagem } from './arraste';

/**
 * EDITOR EM LOTE — elemento de IMAGEM da composição (config.imagens[]).
 *
 * Um único elemento por imagem adicionada ("Adicionar elementos → Imagem"),
 * com a MESMA convenção da LOGO: x% = centro, y% = topo, largura em % da
 * largura do canvas e altura pela proporção natural (sem distorção).
 *
 * Interação 100% visual (sem X/Y): arrastar o corpo move; a alça de canto
 * redimensiona; clicar seleciona (Painel de Camadas + config da esquerda
 * sincronizam). Render final: o pipeline compõe o MESMO PNG na MESMA
 * posição/escala (prévia = render).
 */
export default function ElementoImagem({ imagem, aoAtualizarConfig, selecionado = false, aoSelecionar, somenteLeitura = false }) {
  if (!imagem || !imagem.visivel || !imagem.url) return null;

  const arrastar = somenteLeitura ? undefined : gerarArrasteImagem(imagem.id, aoAtualizarConfig);
  const redimensionar = somenteLeitura ? undefined : gerarRedimensionarImagem(imagem.id, aoAtualizarConfig);

  return (
    <div
      role={somenteLeitura ? undefined : 'button'}
      tabIndex={somenteLeitura ? undefined : 0}
      aria-label="Arrastar imagem"
      data-elemento={`imagem:${imagem.id}`}
      data-x={String(imagem.x)}
      data-y={String(imagem.y)}
      onPointerDown={(e) => {
        if (typeof aoSelecionar === 'function') aoSelecionar(`imagem:${imagem.id}`);
        if (typeof arrastar === 'function') arrastar(e);
      }}
      className={`edl-logo absolute select-none ${selecionado ? 'edl-elemento-selecionado' : ''} ${
        somenteLeitura ? 'pointer-events-none' : ''
      }`}
      style={{
        left: `${imagem.x}%`,
        top: `${imagem.y}%`,
        width: `${Math.min(100, Math.max(2, imagem.largura || 30))}%`,
        transform: 'translate(-50%, 0)',
        opacity: (imagem.opacidade ?? 100) / 100,
        // Mesma ordem do render: por cima de logo/textos/identidade (z-17).
        zIndex: 18,
      }}
    >
      <img
        src={imagem.url}
        alt={imagem.nome || 'Imagem da composição'}
        draggable={false}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
      {!somenteLeitura && (
        <span
          role="slider"
          aria-label="Redimensionar imagem"
          data-largura={String(imagem.largura)}
          onPointerDown={redimensionar}
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
          style={{ right: -7, bottom: -7, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
        />
      )}
    </div>
  );
}
