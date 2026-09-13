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
 * 1X / 2X / 3X = modo de visualização do espaço central:
 * - 1X (VÍDEO ÚNICO/DESTAQUE): SOMENTE o vídeo selecionado no centro — É o
 *   preview principal editável. Não mostra outro vídeo abaixo: NÃO continua
 *   a lista de vídeos neste modo;
 * - 2X (MÚLTIPLOS): 2 vídeos DIFERENTES lado a lado, continuando nas linhas
 *   seguintes: [V1][V2] / [V3][V4] / [V5][V6] ...;
 * - 3X (MÚLTIPLOS): 3 vídeos DIFERENTES lado a lado, continuando nas linhas
 *   seguintes: [V1][V2][V3] / [V4][V5][V6] / [V7][V8][V9] ....
 * NUNCA repite o mesmo vídeo; scroll VERTICAL mostra os demais (2X/3X).
 *
 * Edição COMPARTILHADA: clicar numa célula selecciona o vídeo principal
 * (idêntico a clicar na esquerda). SÓ a célula selecionada é interativa
 * (ControlesVideo + arrastes/manijas); as demais são SOMENTE visualização
 * (thumbnail real ou <video> mutado dos slots do pool + overlays iguais).
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
];

const ROTULOS_STATUS = {
  pronto: 'Importado',
  aguardando: 'Na fila',
  processando: 'Processando',
  concluido: '✓ Pronto',
  erro: 'Erro',
};
function AreaCentral(p) {
  const itens = p.itens || [];
  const idSelecionado = p.idSelecionado;
  const urlVideoAtiva = p.urlVideoAtiva;
  const ativosNoPool = p.ativosNoPool;
  const config = p.config;
  const aoAtualizarConfig = p.aoAtualizarConfig;
  const aoSelecionar = p.aoSelecionar;
  const aoFocar = p.aoFocar;
  const containerRef = useRef(null);
  const sentinelaRef = useRef(null);
  const [limite, setLimite] = useState(JANELA);
  const [colunas, setColunas] = useState(1);
  // 1X = modo de VÍDEO ÚNICO/destaque: SOMENTE o vídeo selecionado no centro,
  // sem continuar a lista abaixo. 2X/3X = múltiplos vídeos lado a lado.
  const modoUnico = colunas === 1;
  // Preview principal: o vídeo seleccionado (fallback ao primeiro da lista).
  // A seleção continua sendo feita pela lista da ESQUERDA (via `aoSelecionar`).
  const seleccionadoItem = useMemo(
    () => itens.find((v) => v.id === idSelecionado) || itens[0] || null,
    [itens, idSelecionado]
  );
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
  const alturaPorCelula = colunas === 1 ? 660 : colunas === 2 ? 380 : 300;
  const gradeCls = 'grid gap-3 w-full';
  const modoUnicoCls = 'w-full max-w-[560px] mx-auto mt-20';
  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 bg-[color:var(--edl-painel)]">
      <div className="shrink-0 px-3 py-1.5 border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <Film className="w-3.5 h-3.5 edl-icone-b shrink-0" />
        <h2 className="font-display text-xs font-extrabold text-white">Visualização</h2>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}>
          {itens.length}
        </span>
        <div className="flex-1" />
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
             (preview principal editável). NÃO continua a lista de vídeos abaixo.
             SIN moldura/card: apenas o canvas branco 9:16 com o vídeo dentro
             (as linhas pontilhadas da área do vídeo/corte continuam sendo
             ferramentas de edición e ficam intactas). */
          <div className={modoUnicoCls}>
            <EditorCanvas
              config={config}
              aoAtualizarConfig={aoAtualizarConfig}
              itemSelecionado={seleccionadoItem}
              urlVideoAtiva={urlVideoAtiva}
              interativo
              alturaMaxima={alturaPorCelula}
              mostrarRodape={false}
              compacto
            />
          </div>
        ) : (
          <div className={gradeCls} style={{ gridTemplateColumns: 'repeat(' + colunas + ', minmax(0, 1fr))' }}>
            {visiveis.map((item, i) => (
              <CelulaVideo key={item.id} item={item} indice={i} itens={itens} idSelecionado={idSelecionado} urlVideoAtiva={urlVideoAtiva} ativosNoPool={ativosNoPool} config={config} aoAtualizarConfig={aoAtualizarConfig} aoSelecionar={aoSelecionar} aoFocar={aoFocar} alturaPorCelula={alturaPorCelula} />
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
  const urlCelula = selecionado ? props.urlVideoAtiva : (props.ativosNoPool ? props.ativosNoPool[item.id] : null) || null;
  const corStatus = item.status === 'concluido' ? '#4ade80' : item.status === 'erro' ? '#f87171' : item.status === 'processando' ? 'var(--edl-rosa)' : 'var(--edl-texto-mut)';
  const classes = 'edl-ring-foco w-full rounded-xl text-left transition-all border overflow-hidden cursor-pointer';
  const estiloCard = {
    background: 'var(--edl-card)',
    borderColor: 'var(--edl-borda)',
  };
  return (
    <div onClick={() => props.aoSelecionar(item)} onMouseEnter={() => { if (props.aoFocar) props.aoFocar(item); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.aoSelecionar(item); } }} aria-current={selecionado} title={nome + ' — abrir no editor'} className={classes} style={estiloCard}>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-black text-white" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <Film className="w-3 h-3 shrink-0" />
        <span className="truncate flex-1">{nome}</span>
        {selecionado && <span className="shrink-0">NO EDITOR</span>}
      </div>
      <div className={selecionado ? undefined : 'pointer-events-none'}>
        <EditorCanvas config={props.config} aoAtualizarConfig={selecionado ? props.aoAtualizarConfig : undefined} itemSelecionado={item} urlVideoAtiva={urlCelula} interativo={selecionado} alturaMaxima={props.alturaPorCelula} mostrarRodape={false} compacto />
      </div>
      <div className="flex items-center gap-1 px-2 py-1 text-[8px] font-semibold truncate border-t border-[color:var(--edl-borda)]" style={{ color: corStatus }}>
        <Film className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">{ROTULOS_STATUS[item.status] || 'Importado'}{item.status === 'erro' && item.erroMensagem ? ' - ' + String(item.erroMensagem).slice(0, 60) : ''}</span>
      </div>
    </div>
  );
}

export default memo(AreaCentral);

