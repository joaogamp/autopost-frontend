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
export function ElementoIdentidadeTexto({ chave, t, escala = 1, aoAtualizarConfig }) {
  if (!t || !t.visivel || String(t.conteudo || '').trim() === '') return null;
  const ruta = ['identidade', chave];
  // Handlers criados por render (mesmo padrão dos textos da arte).
  const arrastar = gerarArrasteDeRuta(ruta, aoAtualizarConfig);
  const alcaLargura = gerarRedimensionarLarguraRuta(ruta, 10, 100, aoAtualizarConfig);
  const alcaTamanho = gerarRedimensionarTextoTamanho(ruta, aoAtualizarConfig);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Arrastar ${chave} do canal`}
      data-x={String(t.x)}
      data-y={String(t.y)}
      onPointerDown={arrastar}
      className="edl-texto-canvas absolute select-none"
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
      }}
    >
      {t.conteudo}
      {/* Alça lateral: aumenta/diminui a LARGURA do bloco */}
      <span
        role="slider"
        aria-label={`Redimensionar largura do ${chave} do canal`}
        data-largura={String(t.largura)}
        onPointerDown={alcaLargura}
        className="absolute w-2 h-6 rounded-sm border-2 border-white shadow"
        style={{ right: -7, top: '50%', transform: 'translateY(-50%)', background: 'var(--edl-roxo)', cursor: 'ew-resize', touchAction: 'none' }}
      />
      {/* Alça de canto: aumenta/diminui o TAMANHO DA FONTE */}
      <span
        role="slider"
        aria-label={`Aumentar ou diminuir o ${chave} do canal`}
        data-tamanho={String(t.tamanho)}
        onPointerDown={alcaTamanho}
        className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
        style={{ right: -7, bottom: -7, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
      />
    </div>
  );
}

/** Selo azul de verificado — arrastável + redimensionável (centrado em x/y). */
export function ElementoIdentidadeSelo({ selo, aoAtualizarConfig }) {
  if (!selo || !selo.visivel) return null;
  const arrastar = gerarArrasteDeRuta(['identidade', 'selo'], aoAtualizarConfig);
  const alcaLargura = gerarRedimensionarLarguraRuta(['identidade', 'selo'], 1, 12, aoAtualizarConfig);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Arrastar selo de verificado"
      data-x={String(selo.x)}
      data-y={String(selo.y)}
      onPointerDown={arrastar}
      className="edl-logo absolute select-none"
      style={{
        left: `${selo.x}%`,
        top: `${selo.y}%`,
        width: `${Math.max(0.5, selo.largura || 3.4)}%`,
        transform: 'translate(-50%, -50%)',
        opacity: (selo.opacidade ?? 100) / 100,
      }}
    >
      <BadgeCheck
        aria-hidden="true"
        strokeWidth={2}
        style={{ width: '100%', height: 'auto', display: 'block', color: COR_SELO_AZUL, fill: COR_SELO_AZUL }}
      />
      {/* Alça: aumenta/diminui o selo */}
      <span
        role="slider"
        aria-label="Redimensionar selo de verificado"
        data-largura={String(selo.largura)}
        onPointerDown={alcaLargura}
        className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
        style={{ right: -6, bottom: -6, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
      />
    </div>
  );
}
