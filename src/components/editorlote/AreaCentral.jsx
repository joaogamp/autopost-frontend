import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import EditorCanvas from './EditorCanvas';
import { rotuloDeVideo } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — ÁREA CENTRAL de visualização dos vídeos.
 *
 * É O PRÓPRIO ESPAÇO CENTRAL (NÃO uma seção separada, NÃO uma faixa abaixo
 * do preview): mostra os MESMOS vídeos importados da coluna ESQUERDA, cada
 * um renderizado com o MESMO EditorCanvas (config COMPARTILHADA — logo,
 * textos, identidade, área do vídeo e corte de bordas aparecen iguais em
 * todas as células).
 *
 * 6X / 1X / 2X / 3X = modo de visualização do espaço central (padrão 6X):
 * - 6X (GRADE PADRÃO DO LOTE): 6 vídeos DIFERENTES por fileira, continuando
 *   nas linhas seguintes: [V1][V2][V3][V4][V5][V6] / [V7][V8]...
 * - 1X (VÍDEO ÚNICO/DESTAQUE): SOMENTE o vídeo selecionado no centro — É o
 *   preview principal editável. Não mostra outro vídeo abaixo: NÃO continua
 *   a lista de vídeos neste modo;
 * - 2X (MÚLTIPLOS): 2 vídeos DIFERENTES lado a lado, continuando nas linhas
 *   seguintes: [V1][V2] / [V3][V4] / [V5][V6] ...;
 * - 3X (MÚLTIPLOS): 3 vídeos DIFERENTES lado a lado, continuando nas linhas
 *   seguintes: [V1][V2][V3] / [V4][V5][V6] / [V7][V8][V9] ....
 * NUNCA repite o mesmo vídeo; scroll VERTICAL mostra os demais.
 *
 * PRÉVIA x VÍDEOS (fluxo simplificado): com `previewAtivo = false` o centro
 * mostra SOMENTE os vídeos importados (sem template, sem composição, 6 por
 * fileira). O template/área só entram na tela quando o usuário clica em
 * "Mostrar Preview" (painel DIREITO — PainelFluxo): aí cada célula passa a
 * mostrar template + vídeo dentro da área marcada (MESMA geometria do render).
 *
 * Edição COMPARTILHADA: clicar numa célula selecciona o vídeo principal
 * (idêntico a clicar na esquerda). SÓ a célula selecionada é interativa
 * (ControlesVideo PAUSADO com Play manual + arrastes/manijas); as demais
 * mostran SOLO a thumbnail estática (parada, sem áudio, sem autoplay/loop).
 * Al mudar 1X/2X/3X a `claveReproductor` cambia e o player se remonta
 * pausado — nunca fica um vídeo antigo tocando em background.
 *
 * VÍDEO BASE: o vídeo SELECIONADO é o "vídeo base" do editor — a célula dele
 * mostra o selo discreto "Base" + a LIXEIRA pequena (remove só o vídeo base
 * da lista do Editor; o arquivo original continua na Biblioteca). Sem seleção,
 * o modo 1X mostra um estado explícito ("Nenhum vídeo base selecionado") para
 * o usuário escolher outro.
 *
 * CÉLULAS SEM MOLDURA: a grade 2X/3X NÃO usa card/fundo/borde/glow — cada
 * vídeo é somente o canvas branco 9:16 (única excepción: as linhas
 * pontilhadas das ferramentas REAIS de edición, área do vídeo e cortes).
 *
 * NÃO cria segunda lista de vídeos: `itens` é a MESMA lista da esquerda
 * (mesmos ids/objetos). Percentual/status vêm da cola real (GET /api/fila).
 */

const JANELA = 60;
const PASSO = 30;

const MODOS_AREA = [
  { colunas: 1, rotulo: '1X', titulo: '1X — vídeo único (destaque)' },
  { colunas: 2, rotulo: '2X', titulo: '2X — 2 vídeos lado a lado' },
  { colunas: 3, rotulo: '3X', titulo: '3X — 3 vídeos lado a lado' },
  { colunas: 6, rotulo: '6X', titulo: '6X — 6 vídeos por fileira (grade padrão do lote)' },
];

function AreaCentral(p) {
  const itens = p.itens || [];
  const idSelecionado = p.idSelecionado;
  const urlVideoAtiva = p.urlVideoAtiva;
  const config = p.config;
  const aoAtualizarConfig = p.aoAtualizarConfig;
  const aoSelecionar = p.aoSelecionar;
  const aoFocar = p.aoFocar;
  // Lixeira dos vídeos do Editor (removçom LOCAL — ver EditorLote.aoRemoverVideo).
  const aoRemoverItem = p.aoRemoverItem;
  const containerRef = useRef(null);
  const sentinelaRef = useRef(null);
  // Referencia à célula ATUALMENTE selecionada + flag de "fuera de vista":
  // serve para pausar obrigatoriamente o player quando a célula seleccionada
  // deixa de intersectar o contenedor (nunca un vídeo tocando off-screen).
  const celulaSelRef = useRef(null);
  const [selFuera, setSelFuera] = useState(false);
  const [limite, setLimite] = useState(JANELA);
  const [colunas, setColunas] = useState(6);
  // 1X = modo de VÍDEO ÚNICO/destaque: SOMENTE o vídeo selecionado no centro,
  // sem continuar a lista abaixo. 2X/3X = múltiplos vídeos lado a lado.
  const modoUnico = colunas === 1;
  // Preview principal: o vídeo seleccionado (fallback ao primeiro da lista).
  // A seleção continua sendo feita pela lista da ESQUERDA (via `aoSelecionar`).
  const seleccionadoItem = useMemo(
    () => itens.find((v) => v.id === idSelecionado) || itens[0] || null,
    [itens, idSelecionado]
  );
  // VÍDEO BASE = o vídeo com a seleção VÁLIDA (a que a lista/célula apontam).
  // `false` (após remover o base pela lixeira) = modo 1X mostra o estado "sem
  // vídeo base" e nenhum card ganha selo/lixeira.
  const temBase = !!idSelecionado && itens.some((it) => it.id === idSelecionado);
  const visiveis = useMemo(() => itens.slice(0, limite), [itens, limite]);
  // Carga progressiva e sentinela só existem nos modos múltiplos (2X/3X);
  // em 1X nunca se continua a lista de vídeos.
  const temMais = !modoUnico && itens.length > visiveis.length;
  const assinaturaIds = useMemo(() => itens.map((v) => v.id).join(','), [itens]);
  useEffect(() => {
    setLimite(JANELA);
    if (containerRef.current && containerRef.current.scrollTo) {
      containerRef.current.scrollTo({ top: 0 });
    }
  }, [assinaturaIds]);
  useEffect(() => {
    const sentinela = sentinelaRef.current;
    if (!sentinela) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setLimite((l) => Math.min(itens.length, l + PASSO));
        }
      },
      { root: containerRef.current, rootMargin: '600px' }
    );
    obs.observe(sentinela);
    return () => obs.disconnect();
  }, [itens.length, temMais]);

  // Pausa automática off-screen: se a célula seleccionada deixa de
  // intersectar o contenedor, a clave do reproductor cambia -> ControlesVideo
  // se remonta PAUSADO. Garantiza que nenhum vídeo toque sem que o usuário
  // o veja (nada de background playback).
  useEffect(() => {
    const cont = containerRef.current;
    const celda = celulaSelRef.current;
    if (!cont || !celda) return undefined;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) setSelFuera(!e.isIntersecting);
      },
      { root: cont, threshold: 0 }
    );
    obs.observe(celda);
    return () => obs.disconnect();
  }, [colunas, seleccionadoItem ? seleccionadoItem.id : null]);
  const alturaPorCelula = colunas === 1 ? 660 : colunas === 2 ? 380 : colunas === 3 ? 300 : 260;
  const gradeCls = 'edl-grade-previews grid gap-3 w-full';
  const modoUnicoCls = 'w-full max-w-[560px] mx-auto mt-3';
  // Clave do reproductor por modo (1X/2X/3X) + visibilidad: qualquer cambio
  // remonta o player PAUSADO (sem autoplay, sem loop), nunca deja un vídeo
  // tocando em background tras mudar la vista.
  const claveReproductor = colunas + 'X|' + (selFuera ? 'off' : 'on');
  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-[color:var(--edl-painel)]">
      <div className="shrink-0 px-3 py-1.5 border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <Film className="w-3.5 h-3.5 edl-icone-b shrink-0" />
        <h2 className="font-display text-xs font-extrabold text-white">Visualização</h2>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}>
          {itens.length}
        </span>
        <div className="flex-1" />
        {/* O botão "Mostrar Preview" vive no PAINEL DIREITO (PainelFluxo) — sem
            duplicar a ação aqui. O selo abaixo só indica que a composição
            (template + área marcada) está aplicada nos vídeos do centro. */}
        {p.previewAtivo ? (
          <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.18)', color: '#4ade80' }}>
            PREVIEW
          </span>
        ) : null}
        <div className="flex items-center gap-0.5 edl-superficie rounded-lg p-0.5 shrink-0" role="group" aria-label="Vídeos lado a lado">
          {MODOS_AREA.map((m) => (
            <button key={m.colunas} type="button" title={m.titulo} aria-pressed={colunas === m.colunas} onClick={() => setColunas(m.colunas)} className="edl-ring-foco w-8 h-6 rounded-md text-[10px] font-black transition-colors" style={colunas === m.colunas ? { background: 'var(--edl-grad)', color: '#fff' } : { color: 'var(--edl-texto-mut)' }}>
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-2">
        {itens.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="edl-superficie rounded-lg px-4 py-3 text-center max-w-[240px]">
              <Film className="w-5 h-5 mx-auto edl-icone-a opacity-70" />
              <h3 className="font-display text-xs font-extrabold text-white mt-1.5">Nenhum vídeo importado</h3>
              <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-dim)' }}>
                Importe vídeos na coluna da esquerda.
              </p>
            </div>
          </div>
        ) : modoUnico ? (
          /* 1X — VÍDEO ÚNICO/destaque: SOMENTE o vídeo selecionado no centro
             (preview principal editável = VÍDEO BASE). NÃO continua a lista de
             vídeos abaixo. SIN moldura/card: apenas o canvas branco 9:16 com o
             vídeo ORIGINAL dentro (as linhas pontilhadas da área do vídeo/corte
             continuam sendo ferramentas de edición e ficam intactas).
             SEM VÍDEO BASE (base removida pela lixeira): estado explícito —
             basta clicar num vídeo da lista (ou numa célula) para escolher. */
          temBase ? (
            <div ref={celulaSelRef} className={modoUnicoCls}>
              <EditorCanvas
                config={config}
                aoAtualizarConfig={aoAtualizarConfig}
                itemSelecionado={seleccionadoItem}
                urlVideoAtiva={urlVideoAtiva}
                interativo
                alturaMaxima={alturaPorCelula}
                mostrarRodape={false}
                compacto
                claveReproductor={claveReproductor}
                elementoSelecionado={p.elementoSelecionado}
                aoSelecionarElemento={p.aoSelecionarElemento}
                base
                aoRemoverBase={aoRemoverItem ? () => aoRemoverItem(seleccionadoItem) : undefined}
                previewAtivo={!!p.previewAtivo}
              />
            </div>
          ) : (
            <div className={modoUnicoCls}>
              <div className="edl-superficie rounded-lg px-4 py-3 text-center max-w-[260px] mx-auto">
                <Film className="w-5 h-5 mx-auto edl-icone-a opacity-70" />
                <h3 className="font-display text-xs font-extrabold text-white mt-1.5">Nenhum vídeo base selecionado</h3>
                <p className="text-[10px] font-medium mt-1" style={{ color: 'var(--edl-texto-dim)' }}>
                  Clique num vídeo da lista (ou numa célula) para usá-lo como base do editor.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className={gradeCls} style={{ gridTemplateColumns: 'repeat(' + colunas + ', minmax(0, 1fr))' }}>
            {visiveis.map((item, i) => (
              <CelulaVideo
                key={item.id}
                item={item}
                indice={i}
                itens={itens}
                idSelecionado={idSelecionado}
                urlVideoAtiva={urlVideoAtiva}
                config={config}
                aoAtualizarConfig={aoAtualizarConfig}
                aoSelecionar={aoSelecionar}
                aoFocar={aoFocar}
                aoRemoverItem={aoRemoverItem}
                alturaPorCelula={alturaPorCelula}
                claveReproductor={claveReproductor}
                referenciaSel={item.id === idSelecionado ? celulaSelRef : undefined}
                elementoSelecionado={p.elementoSelecionado}
                aoSelecionarElemento={p.aoSelecionarElemento}
                /* Cada célula recebe a MESMA flag de preview da área central:
                   antes do clique em "Mostrar Preview" nenhuma célula compõe. */
                previewAtivo={!!p.previewAtivo}
              />
            ))}
          </div>
        )}
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

function CelulaVideo(props) {
  const item = props.item;
  const itens = props.itens;
  const idx = itens.findIndex((v) => v.id === item.id);
  const nome = item.nome || rotuloDeVideo(idx >= 0 ? idx : props.indice);
  const selecionado = item.id === props.idSelecionado;
  // Sem moldura/card/glow/fundo: cada célula é SOLO o canvas branco 9:16 com
  // o vídeo (thumbnail estática) dentro. Nada de borde/background decorativo.
  return (
    <div
      ref={props.referenciaSel}
      onClick={() => props.aoSelecionar(item)}
      onMouseEnter={() => { if (props.aoFocar) props.aoFocar(item); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.aoSelecionar(item); } }}
      aria-current={selecionado}
      title={nome + ' — abrir no editor'}
      className="edl-ring-foco w-full overflow-hidden"
    >
      {/* MESMO canvas do editor (config COMPARTILHADA) sem moldura: a célula
          NÃO selecionada fica parada (thumbnail estática, sem <video>); a
          selecionada mostra o player PAUSADO (Play manual, sem autoplay). */}
      <div className={selecionado ? undefined : 'pointer-events-none'}>
        <EditorCanvas
          config={props.config}
          aoAtualizarConfig={selecionado ? props.aoAtualizarConfig : undefined}
          itemSelecionado={item}
          urlVideoAtiva={props.urlVideoAtiva}
          interativo={selecionado}
          alturaMaxima={props.alturaPorCelula}
          mostrarRodape={false}
          compacto
          claveReproductor={props.claveReproductor}
          /* SELEÇÃO DE ELEMENTOS (Camadas ⇄ Preview): só a célula editável
             seleciona/destaca — as demais são somente leitura. */
          elementoSelecionado={selecionado ? props.elementoSelecionado : null}
          aoSelecionarElemento={selecionado ? props.aoSelecionarElemento : undefined}
          /* Só a célula do VÍDEO BASE (selecionada) mostra o selo "Base" + a
             lixeira que remove o vídeo base do Editor (local, sem apagar o
             arquivo original). */
          base={selecionado}
          previewAtivo={!!props.previewAtivo}
          aoRemoverBase={
            selecionado && props.aoRemoverItem ? () => props.aoRemoverItem(item) : undefined
          }
        />
      </div>
    </div>
  );
}

export default memo(AreaCentral);

