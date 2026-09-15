import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageOff, Trash2 } from 'lucide-react';
import {
  CORTE_MAXIMO,
  CANVAS_LARGURA,
  CANVAS_ALTURA,
  familiaDeFonte,
  pesoDeTexto,
  corteEfetivoDoVideo,
} from '../../lib/configEditorLote';
import {
  gerarArrasteDeRuta,
  gerarArrastreArea,
  gerarRedimensionarArea,
  gerarRedimensionarLogo,
  gerarRedimensionarTextoLargura,
  gerarArrastarCorteSuperior,
  gerarArrastarCorteInferior,
} from './arraste';
import ControlesVideo from './ControlesVideo';
import { ElementoIdentidadeTexto, ElementoIdentidadeSelo } from './ElementoIdentidade';

/**
 * EDITOR EM LOTE — canvas de edición (EditorCanvas).
 *
 * Canvas 9:16 reutilizado em DOIS lugares:
 * - CÉLULA SELECIONADA da área central (interativo=true): canvas completo,
 *   editável — vídeo REAL com ControlesVideo + logo + textos + identidade +
 *   guia da área arrastável/redimensionável + cortes arrastáveis;
 * - DEMAIS CÉLULAS (interativo=false): SOMENTE visualização do MESMO canvas
 *   com a MESMA config compartilhada (logo/textos/identidade/área/cortes
 *   aparecem iguais), mas sem arrastes/manijas/áudio — SOLO thumbnail
 *   estática (parada), nunca un <video> con autoplay/loop en background.
 *
 * PRÉVIA x PROCESSAMENTO (separaçom obrigatória):
 * - A PRÉVIA mostra o VÍDEO ORIGINAL NORMAL, ocupando o canvas inteiro com
 *   `object-fit: contain` (quadro completo do que foi baixado/importado);
 * - `areaVideo` (área de composiçom) NUNCA recorta a prévia: aqui ela é só um
 *   GUIA tracejado de onde o vídeo entra no FINAL;
 * - o corte automático de bordas (detecçom) também NUNCA aparece na prévia —
 *   roda só no processamento (FFmpeg/worker);
 * - logo, textos e identidade continuam sendo renderizados por cima do vídeo
 *   original (posiçom/tamanho/proporçom preservados; editáveis normalmente).
 */

/** Altura MÁXIMA padrão do preview 9:16 na TELA (px). Pode ser sobrescrita
 * por célula via prop `alturaMaxima` (a área central usa valores menores
 * nos modos 2X/3X para caberem lado a lado). */
const ALTURA_MAXIMA_PADRAO = 500;

/** Encaixe da PRÉVIA: `contain` = vídeo ORIGINAL inteiro, sem cortes — o
 * usuário vê exatamente o que baixou (o `fit` do template é aplicado só no
 * processamento final, dentro da área de composiçom). */
const ENCAIXE_PREVIA = 'contain';


export default function EditorCanvas({
  config,
  aoAtualizarConfig,
  itemSelecionado,
  urlVideoAtiva,
  // Quando `false`, o canvas vira SOMENTE visualização (célula NÃO
  // selecionada da área central): sem arrastes, sem manijas, sem ControlesVideo
  // com áudio — mostra thumbnail/vídeo mutado + overlays da config compartilhada.
  interativo = true,
  alturaMaxima = ALTURA_MAXIMA_PADRAO,
  // Rodapé "Editando: ..." (modo editor único). Nas células da área central
  // o nome/status é renderizado pela própria área — então fica desligado.
  mostrarRodape = true,
  // Layout compacto de célula (área central): sem `flex-1`, largura total.
  compacto = false,
  // Token de "remontaje" del reproductor: a área central muda de modo (1X→2X→3X)
  // y al cambiar, el ControlesVideo DEBE remontar-se pausado (nunca queda un
  // vídeo antiguo reproduciendo). Se concatena a la `key` do reproductor.
  claveReproductor = '',
  // Card do VÍDEO BASE (célula selecionada na área central): mostra o selo
  // discreto "Base" + a LIXEIRA pequena no canto do canvas.
  base = false,
  // Remove o VÍDEO BASE deste card (removçom LOCAL: sai da lista do Editor e do
  // localStorage; o arquivo original continua na Biblioteca — sem DELETE).
  aoRemoverBase,
}) {
  const canvasRef = useRef(null);
  const contenedorRef = useRef(null);
  const [escala, setEscala] = useState(1);

  // Somente a célula selecionada da área central edita: as demais são
  // SOMENTE visualização (mesmos overlays, sem arraste/manijas).
  const podeEditar = interativo && typeof aoAtualizarConfig === 'function';
  const atualizador = podeEditar ? aoAtualizarConfig : () => {};

  // Handlers — arrastre genérico por ruta: cada elemento es independente.
  // Nas células NÃO selecionadas (podeEditar=false) os handlers viram no-op.
  const arrastarLogo = gerarArrasteDeRuta(['logo'], atualizador);
  const arrastarTextoSuperior = gerarArrasteDeRuta(['textos', 'superior'], atualizador);
  const arrastarTextoInferior = gerarArrasteDeRuta(['textos', 'inferior'], atualizador);
  const redimensionarLogo = gerarRedimensionarLogo(atualizador);
  const redimensionarTextoSup = gerarRedimensionarTextoLargura(['textos', 'superior'], atualizador);
  const redimensionarTextoInf = gerarRedimensionarTextoLargura(['textos', 'inferior'], atualizador);
  const arrastarArea = gerarArrastreArea(atualizador);
  const redimensionarAreaDireita = gerarRedimensionarArea('direita', atualizador);
  const redimensionarAreaAbaixo = gerarRedimensionarArea('abaixo', atualizador);
  const redimensionarAreaCanto = gerarRedimensionarArea('canto', atualizador);
  const corredorSuperior = gerarArrastarCorteSuperior(atualizador, itemSelecionado?.id || null);
  const corredorInferior = gerarArrastarCorteInferior(atualizador, itemSelecionado?.id || null);

  // Compatibilidade com configs legadas (antes de `textos` superior/inferior).
  const textos = config.textos && (config.textos.superior || config.textos.inferior)
    ? config.textos
    : { superior: config.texto || {}, inferior: {} };
  const textoSup = textos.superior || {};
  const textoInf = textos.inferior || {};

  const corFundo = config.canvas.corFundo;
  const area = config.areaVideo;
  const logo = config.logo || {};
  const identidade = config.identidade || null;
  const corte = corteEfetivoDoVideo(config, itemSelecionado?.id);
  const corteGlobal = config.corteBordas || {};
  const corteAtivo = !!corte.ativo || !!(itemSelecionado?.id && config?.overridesPorVideo?.[itemSelecionado.id]);
  const corteSup = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.superior) || 0));
  const corteInf = Math.min(CORTE_MAXIMO, Math.max(0, Number(corte.inferior) || 0));
  const corteMostraClip = corteSup > 0 || corteInf > 0;
  const corteSupEfetivo = corteSup;
  const corteInfEfetivo = corteInf;
  // Linha inferior vive em 100%−inf. Evita que cruce la superior si el usuario
  // força valores extremos (superior + inferior ≥ 100) — los valores siguen
  // sendo independentes en la config.
  const posLinhaInferior = Math.max(corteSup + 1, 100 - corteInf);
  const item = itemSelecionado;
  // NOTA: `area.fit` (cobrir/ajustar) é usado SOMENTE no vídeo FINAL (vai no
  // template → scale/crop/pad do FFmpeg). A PRÉVIA sempre mostra o vídeo
  // ORIGINAL inteiro (`ENCAIXE_PREVIA = 'contain'`).

  // Escalada do canvas 9:16: observa o CONTENEDOR da célula (contenedorRef)
  // e calcula a maior escala que mantiene a proporção 1080×1920 cabendo inteira
  // (ancho e alto). As linhas/faixas de corte usam top/height em % — posicionamento
  // independente da escala.
  const aoAtualizarDataset = useCallback(() => {
    const el = canvasRef.current;
    const cont = contenedorRef.current;
    if (!el) return;
    const cw = cont ? cont.clientWidth : 0;
    const ch = cont ? cont.clientHeight : 0;
    const novaEscala =
      cw > 0 && ch > 0
        ? Math.min(cw / CANVAS_LARGURA, ch / CANVAS_ALTURA, alturaMaxima / CANVAS_ALTURA)
        : 1;
    setEscala(novaEscala);
    el.dataset.canvasLargura = String(CANVAS_LARGURA);
    el.dataset.canvasAltura = String(CANVAS_ALTURA);
    el.dataset.escala = String(novaEscala);
  }, [alturaMaxima]);

  useEffect(() => {
    aoAtualizarDataset();
    const cont = contenedorRef.current;
    if (!cont) return;
    const ro = new ResizeObserver(aoAtualizarDataset);
    ro.observe(cont);
    return () => ro.disconnect();
  }, [aoAtualizarDataset]);

  return (
    <div
      ref={contenedorRef}
      className={
        compacto
          ? 'w-full flex flex-col items-center justify-start relative overflow-hidden px-1 pt-1 pb-0'
          : 'flex-1 min-w-0 flex flex-col items-center justify-center relative overflow-hidden px-2 pt-2 pb-1'
      }
    >
      {/* Canvas 9:16 (fundo = corFundo que vai pro template) */}
      <div
        ref={canvasRef}
        className="edl-canvas-branco relative overflow-hidden"
        style={{
          width: Math.round(CANVAS_LARGURA * escala),
          height: Math.round(CANVAS_ALTURA * escala),
          borderRadius: 14,
          background: corFundo,
        }}
      >
        {/* CORTE DE BORDAS — linhas pontilhadas (arrastáveis SÓ na célula
            selecionada; nas demais são SOMENTE visualização). São APENAS
            GUIAS de ediçom: a prévia continua mostrando o VÍDEO ORIGINAL
            inteiro — o corte (manual sup/inf e/ou automático) é aplicado
            SOMENTE no processamento final. */}
        {(corteAtivo || podeEditar) && (
          <>
            {(corteSupEfetivo > 0 || corteInfEfetivo > 0) && (
              <div aria-hidden className="absolute left-0 right-0 top-0 z-10 pointer-events-none" style={{ height: `${corteSupEfetivo}%`, background: 'rgba(0,0,0,0.45)' }} />
            )}
            {(corteSupEfetivo > 0 || corteInfEfetivo > 0) && (
              <div aria-hidden className="absolute left-0 right-0 bottom-0 z-10 pointer-events-none" style={{ height: `${corteInfEfetivo}%`, background: 'rgba(0,0,0,0.45)' }} />
            )}
            {/* Linha superior de corte */}
            <div
              role={podeEditar ? 'slider' : undefined}
              aria-label="Corte superior"
              aria-valuemin={0}
              aria-valuemax={CORTE_MAXIMO}
              aria-valuenow={Math.round(corteSup)}
              aria-valuetext={`${Math.round(corteSup)}% da altura`}
              data-posY={String(corteSup)}
              onPointerDown={podeEditar ? corredorSuperior : undefined}
              className={`edl-corredor-corte absolute left-0 right-0 z-20 touch-none ${podeEditar ? 'cursor-row-resize' : 'pointer-events-none'}`}
              style={{
                top: `${corteSup}%`,
                borderTop: '2px dashed var(--edl-roxo)',
              }}
            >
              {/* Alça visual central (só na célula editável) */}
              {podeEditar && (
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: 'var(--edl-roxo)' }} />
              )}
            </div>

            {/* Linha inferior de corte */}
            <div
              role={podeEditar ? 'slider' : undefined}
              aria-label="Corte inferior"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(posLinhaInferior)}
              aria-valuetext={`${Math.round(posLinhaInferior)}% da altura`}
              data-posY={String(posLinhaInferior)}
              onPointerDown={podeEditar ? corredorInferior : undefined}
              className={`edl-corredor-corte absolute left-0 right-0 z-20 touch-none ${podeEditar ? 'cursor-row-resize' : 'pointer-events-none'}`}
              style={{
                top: `${posLinhaInferior}%`,
                borderBottom: '2px dashed var(--edl-roxo)',
              }}
            >
              {/* Alça visual central (só na célula editável) */}
              {podeEditar && (
                <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: 'var(--edl-roxo)' }} />
              )}
            </div>

            {/* FASE 2: o corte EFETIVO (global + override do video) APARECE
                na previa via clip + sombras (feedback imediato do arraste e da
                deteccao). O arquivo original segue intacto; o mesmo % vai ao
                render final (Fase 3). */}
          </>
        )}

        {/* VÍDEO (original + edicoes da previa): sem corte mostra o quadro
            completo (`contain`); com corte efetivo, a camada leva `clip-path`
            com o mesmo % do render. Arquivo original intacto; `areaVideo` segue
            como guia (so o FINAL compoe). */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={corteMostraClip ? { clipPath: `inset(${corteSupEfetivo}% 0 ${corteInfEfetivo}% 0)` } : undefined}>
          {podeEditar && urlVideoAtiva ? (
            <ControlesVideo
              key={`${urlVideoAtiva}|${claveReproductor}`}
              src={urlVideoAtiva}
              encaixe={ENCAIXE_PREVIA}
            />
          ) : item && item.thumbnail ? (
            <img
              src={item.thumbnail}
              alt={item.nome || 'Video'}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="w-full h-full pointer-events-none"
              style={{ objectFit: ENCAIXE_PREVIA }}
            />
          ) : item && (
            <div className="flex flex-col items-center gap-1 pointer-events-none">
              <ImageOff className="w-5 h-5" style={{ color: 'rgba(236,72,153,0.6)' }} />
              <span className="text-[8px] font-black tracking-widest" style={{ color: 'rgba(139,92,246,0.75)' }}>
                VÍDEO ORIGINAL
              </span>
            </div>
          )}
        </div>

        {/* VÍDEO BASE — selo discreto + LIXEIRA (só no card do vídeo base).
            A lixeira remove o vídeo base da lista do Editor (e do localStorage):
            é removçom LOCAL — o arquivo original NÃO é apagado da Biblioteca/
            Oracle nem da fila, e os demais vídeos do lote ficam intactos. */}
        {base && (
          <span
            className="edl-selo-base absolute z-40 text-[8px] font-black px-1.5 py-0.5 rounded"
            style={{ top: 6, left: 6 }}
          >
            BASE
          </span>
        )}
        {base && typeof aoRemoverBase === 'function' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              aoRemoverBase();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Remover vídeo base do Editor"
            title="Remover vídeo base do Editor (o arquivo original continua na Biblioteca)"
            className="edl-lixeira edl-ring-foco absolute z-40 w-6 h-6 rounded-md flex items-center justify-center"
            style={{ top: 6, right: 6, cursor: 'pointer' }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}

        {/* ÁREA DO VÍDEO — GUIA da COMPOSIÇÃO FINAL (nunca recorta a prévia).
            O retângulo tracejado mostra ONDE o vídeo entra no vídeo FINAL
            (`areaVideo` → scale/crop/pad do FFmpeg), mas a prévia segue
            mostrando o VÍDEO ORIGINAL inteiro. É só ferramenta de ediçom: com a
            "Marcação da área" DESLIGADA fica invisível e `pointer-events-none`
            (nunca atrapalha o player); LIGADA, pode ser arrastado/
            redimensionado na célula selecionada. */}
        <div
          role={podeEditar && area.mostrarMarcacao ? 'button' : undefined}
          tabIndex={podeEditar && area.mostrarMarcacao ? 0 : undefined}
          aria-label="Mover a área do vídeo (composiçom final)"
          data-x={String(area.x)}
          data-y={String(area.y)}
          data-largura={String(area.largura)}
          data-altura={String(area.altura)}
          onPointerDown={podeEditar && area.mostrarMarcacao ? arrastarArea : undefined}
          className={`edl-area-video absolute overflow-hidden flex items-center justify-center touch-none select-none ${podeEditar && area.mostrarMarcacao ? '' : 'pointer-events-none'}`}
          style={{
            left: area.x * escala,
            top: area.y * escala,
            width: area.largura * escala,
            height: area.altura * escala,
            borderRadius: 8 * escala,
            cursor: podeEditar && area.mostrarMarcacao ? 'move' : 'default',
            border: area.mostrarMarcacao ? undefined : '2px dashed transparent',
            backgroundColor: area.mostrarMarcacao ? undefined : 'transparent',
          }}
        >

          {/* Manijas de redimensionar (SÓ na célula editável) */}
          {podeEditar && area.mostrarMarcacao && (
            <>
              <span
                role="slider"
                aria-label="Redimensionar largura da área"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaDireita}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ right: -5, top: '50%', transform: 'translateY(-50%)', width: 12, height: 26, background: 'var(--edl-rosa)', cursor: 'ew-resize', touchAction: 'none' }}
              />
              <span
                role="slider"
                aria-label="Redimensionar altura da área"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaAbaixo}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 26, height: 12, background: 'var(--edl-roxo)', cursor: 'ns-resize', touchAction: 'none' }}
              />
              <span
                role="slider"
                aria-label="Redimensionar área (canto)"
                data-x={String(area.x)}
                data-y={String(area.y)}
                data-largura={String(area.largura)}
                data-altura={String(area.altura)}
                onPointerDown={redimensionarAreaCanto}
                className="absolute z-30 rounded-sm border-2 border-white shadow"
                style={{ right: -5, bottom: -5, width: 14, height: 14, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
              />
            </>
          )}
        </div>

        {/* LOGO sobre o canvas — arrastável SÓ na célula selecionada. O onLoad
            captura a proporção da imagem (altura/largura) que o template usa pra
            calcular a altura em px do overlay. */}
        {logo.visivel && logo.url && (
          <div
            role={podeEditar ? 'button' : undefined}
            tabIndex={podeEditar ? 0 : undefined}
            aria-label="Arrastar logo"
            data-x={logo.x}
            data-y={logo.y}
            onPointerDown={podeEditar ? arrastarLogo : undefined}
            className={`edl-logo absolute ${podeEditar ? '' : 'pointer-events-none'}`}
            style={{
              left: `${logo.x}%`,
              top: `${logo.y}%`,
              width: `${logo.largura}%`,
              transform: 'translate(-50%, 0)',
              opacity: (logo.opacidade ?? 100) / 100,
              // Acima da camada do vídeo original e do guia da área — mesma
              // ordem do FFmpeg (vídeo/composição antes do overlay da logo).
              zIndex: 17,
            }}
          >
            <img
              src={logo.url}
              alt="Logo"
              draggable={false}
              onLoad={(e) => {
                if (!podeEditar) return;
                const img = e.currentTarget;
                if (img.naturalWidth > 0) {
                  const prop = img.naturalHeight / img.naturalWidth;
                  if (Math.abs((logo.alturaProporcao || 0) - prop) > 0.001) {
                    atualizador((cfg) => ({ ...cfg, logo: { ...cfg.logo, alturaProporcao: prop } }));
                  }
                }
              }}
              className="w-full h-auto pointer-events-none"
            />
            {/* Manija de redimensionar a logo (SÓ na célula editável) */}
            {podeEditar && (
              <span
                role="slider"
                aria-label="Redimensionar logo"
                data-largura={String(logo.largura)}
                onPointerDown={redimensionarLogo}
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow"
                style={{ right: -8, bottom: -8, background: 'var(--edl-grad)', cursor: 'nwse-resize', touchAction: 'none' }}
              />
            )}
          </div>
        )}

        {/* DOIS TEXTOS INDEPENDENTES (superior e inferior) — cada um tem
            conteúdo, posição, tamanho, largura, fonte, peso, cor, alinhamento,
            opacidade e visibilidade PRÓPRIOS. Arrastáveis SÓ na célula
            selecionada; nas demais são SOMENTE visualização. */}
        {[
          { chave: 'superior', rotulo: 'Texto superior', t: textoSup },
          { chave: 'inferior', rotulo: 'Texto inferior', t: textoInf },
        ].map(({ chave, rotulo, t }) => {
          if (!t.visivel || String(t.conteudo || '').trim() === '') return null;
          const arrastar = chave === 'superior' ? arrastarTextoSuperior : arrastarTextoInferior;
          const redimensionar = chave === 'superior' ? redimensionarTextoSup : redimensionarTextoInf;
          return (
            <div
              key={chave}
              role={podeEditar ? 'button' : undefined}
              tabIndex={podeEditar ? 0 : undefined}
              aria-label={`Arrastar ${rotulo.toLowerCase()}`}
              data-x={String(t.x)}
              data-y={String(t.y)}
              onPointerDown={podeEditar ? arrastar : undefined}
              className={`edl-texto-canvas absolute ${podeEditar ? '' : 'pointer-events-none'}`}
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
                // Acima da camada do vídeo original e do guia da área — mesma
                // ordem do FFmpeg (vídeo/composição antes dos textos).
                zIndex: 17,
              }}
            >
              {t.conteudo}
              {/* Manija de largura (SÓ na célula editável) */}
              {podeEditar && (
                <span
                  role="slider"
                  aria-label={`Redimensionar largura do ${rotulo.toLowerCase()}`}
                  data-largura={String(t.largura)}
                  onPointerDown={redimensionar}
                  className="absolute w-2.5 h-9 rounded-sm border-2 border-white shadow"
                  style={{ right: -9, top: '50%', transform: 'translateY(-50%)', background: 'var(--edl-rosa)', cursor: 'ew-resize', touchAction: 'none' }}
                />
              )}
            </div>
          );
        })}

        {/* IDENTIDADE DO CANAL — nome do canal, @ do canal e selo azul de
            verificado: elementos INDEPENDENTES (posição/tamanho próprios).
            Editáveis SÓ na célula selecionada (nas demais, somente leitura). */}
        <ElementoIdentidadeTexto chave="nome" t={identidade?.nome} escala={escala} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} />
        <ElementoIdentidadeTexto chave="usuario" t={identidade?.usuario} escala={escala} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} />
        <ElementoIdentidadeSelo selo={identidade?.selo} aoAtualizarConfig={atualizador} somenteLeitura={!podeEditar} />
      </div>

      {/* Rodapé do canvas (só no modo editor único; células usam o próprio rodapé) */}
      {mostrarRodape && (
        <p className="text-[9px] font-semibold mt-3" style={{ color: 'var(--edl-texto-mut)' }}>
          {item ? `Editando: ${item.nome}` : 'Selecione um vídeo na lista'} • {CANVAS_LARGURA}×{CANVAS_ALTURA} (9:16) • prévia: vídeo original • encaixe do final: {area.fit}
        </p>
      )}
    </div>
  );
}