import { BadgeCheck } from 'lucide-react';
import { familiaDeFonte, pesoDeTexto } from '../../lib/configEditorLote';
import {
  gerarArrasteDeRuta,
  gerarRedimensionarLarguraRuta,
  gerarRedimensionarTextoTamanho,
} from './arraste';

/**
 * EDITOR EM LOTE — elementos da IDENTIDADE DO CANAL (nome, @ e selo azul).
 *
 * Componentes COMPARTILHADOS: o MESMO elemento é montado no popup grande
 * (fundo branco) e no canvas principal — arraste/redimensione em qualquer um
 * dos dois e a config COMPARTILHADA atualiza na hora (o outro espelha).
 *
 * Cada elemento é 100% independente:
 * - mover com o mouse (arraste do corpo);
 * - redimensionar a largura com a alça lateral (→ aumenta/diminui);
 * - texto: alça de canto aumenta/diminui o TAMANHO DA FONTE;
 * - posição/tamanho/opacidade nunca interferem no outro elemento.
 */

/** Cor clássica do selo azul de verificado. */
export const COR_SELO_AZUL = '#1d9bf0';

/** Texto da identidade (nome do canal | @ do canal) — arrastável + alças. */
export function ElementoIdentidadeTexto({ chave, t, escala = 1, aoAtualizarConfig, somenteLeitura = false, selecionado = false, aoSelecionar }) {
  if (!t || !t.visivel || String(t.conteudo || '').trim() === '') return null;
  const ruta = ['identidade', chave];
  // Handlers criados por render (mesmo padrão dos textos da arte).
  const arrastar = gerarArrasteDeRuta(ruta, aoAtualizarConfig);
  const alcaLargura = gerarRedimensionarLarguraRuta(ruta, 10, 100, aoAtualizarConfig);
  const alcaTamanho = gerarRedimensionarTextoTamanho(ruta, aoAtualizarConfig);
  const idElemento = chave === 'nome' ? 'identidadeNome' : 'identidadeUsuario';
  return (
    <div
      role={somenteLeitura ? undefined : 'button'}
      tabIndex={somenteLeitura ? undefined : 0}
      aria-label={`Arrastar ${chave} do canal`}
      data-elemento={idElemento}
      data-x={String(t.x)}
      data-y={String(t.y)}
      onPointerDown={somenteLeitura ? undefined : (e) => { if (typeof aoSelecionar === 'function') aoSelecionar(idElemento); arrastar(e); }}
      className={`edl-texto-canvas absolute select-none ${somenteLeitura ? 'pointer-events-none' : ''} ${selecionado ? 'edl-elemento-selecionado' : ''}`}
      style={{
        left: `${t.x}%`,
        top: `${t.y}%`,
        width: `${t.largura}%`,
        transform: 'translate(-50%, 0)',
        textAlign: t.alinhamento || 'centro',
        fontFamily: familiaDeFonte(t.fonte),
        fontSize: (t.tamanho || 40) * escala,
        fontWeight: pesoDeTexto(t.peso),
        color: t.cor,
        opacity: (t.opacidade ?? 100) / 100,
        // Acima das faixas de cobertura do corte (z-16) — mesma ordem do FFmpeg.
        zIndex: 17,
      }}
    >
      {t.conteudo}
      {!somenteLeitura && (
        <>
          {/* Alça lateral: aumenta/diminui a LARGURA do bloco */}
          <span
            role="slider"
            aria-label={`Redimensionar largura do ${chave} do canal`}
            data-largura={String(t.largura)}
            onPointerDown={alcaLargura}
            className="absolute w-2 h-6 rounded-sm border-2 border-white shadow"
            style={{ right: -7, top: '50%', transform: 'translateY(-50%)', background: '#94a3b8', cursor: 'ew-resize', touchAction: 'none' }}
          />
          {/* Alça de canto: aumenta/diminui o TAMANHO DA FONTE */}
          <span
            role="slider"
            aria-label={`Aumentar ou diminuir o ${chave} do canal`}
            data-tamanho={String(t.tamanho)}
            onPointerDown={alcaTamanho}
            className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
            style={{ right: -7, bottom: -7, background: '#94a3b8', cursor: 'nwse-resize', touchAction: 'none' }}
          />
        </>
      )}
    </div>
  );
}

/** Selo azul de verificado — arrastável + redimensionável (centrado em x/y). */
export function ElementoIdentidadeSelo({ selo, aoAtualizarConfig, somenteLeitura = false, selecionado = false, aoSelecionar }) {
  if (!selo || !selo.visivel) return null;
  const arrastar = gerarArrasteDeRuta(['identidade', 'selo'], aoAtualizarConfig);
  const alcaLargura = gerarRedimensionarLarguraRuta(['identidade', 'selo'], 1, 12, aoAtualizarConfig);
  return (
    <div
      role={somenteLeitura ? undefined : 'button'}
      tabIndex={somenteLeitura ? undefined : 0}
      aria-label="Arrastar selo de verificado"
      data-elemento="selo"
      data-x={String(selo.x)}
      data-y={String(selo.y)}
      onPointerDown={somenteLeitura ? undefined : (e) => { if (typeof aoSelecionar === 'function') aoSelecionar('selo'); arrastar(e); }}
      className={`edl-logo absolute select-none ${somenteLeitura ? 'pointer-events-none' : ''} ${selecionado ? 'edl-elemento-selecionado' : ''}`}
      style={{
        left: `${selo.x}%`,
        top: `${selo.y}%`,
        width: `${Math.max(0.5, selo.largura || 3.4)}%`,
        transform: 'translate(-50%, -50%)',
        opacity: (selo.opacidade ?? 100) / 100,
        // Acima das faixas de cobertura do corte (z-16) — mesma ordem do FFmpeg.
        zIndex: 17,
      }}
    >
      {/* PNG do usuário (importado no popup) tem prioridade; sem imagem, o
          ícone vetorial BadgeCheck é o fallback (comportamento anterior). */}
      {selo.urlImagem ? (
        <img
          src={selo.urlImagem}
          alt="Selo de verificado"
          draggable={false}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      ) : (
        <BadgeCheck
          aria-hidden="true"
          strokeWidth={2}
          style={{ width: '100%', height: 'auto', display: 'block', color: COR_SELO_AZUL, fill: COR_SELO_AZUL }}
        />
      )}
      {/* Alça: aumenta/diminui o selo (SÓ na célula editável) */}
      {!somenteLeitura && (
        <span
          role="slider"
          aria-label="Redimensionar selo de verificado"
          data-largura={String(selo.largura)}
          onPointerDown={alcaLargura}
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
          style={{ right: -6, bottom: -6, background: '#94a3b8', cursor: 'nwse-resize', touchAction: 'none' }}
        />
      )}
    </div>
  );
}
