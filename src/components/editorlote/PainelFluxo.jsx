import { useRef, useState } from 'react';
import { Upload, Scan, Eye, LayoutTemplate, AlertCircle, X } from 'lucide-react';
import EditorCanvas from './EditorCanvas';
import { criarConfigPadrao, CANVAS_LARGURA, CANVAS_ALTURA } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — PAINEL DIREITO ÚNICO (fluxo simplificado):
 *
 *   TEMPLATE
 *   [ Importar template ]      → PNG/JPG/WebP do PC (input file direto)
 *   [ Marcar espaço do vídeo ] → modo de marcação: mostra SOMENTE o template
 *                                com o retângulo da área arrastável/
 *                                redimensionável (SEM vídeo — Estado A)
 *   [ Mostrar Preview ]        → aplica template + área em TODOS os vídeos
 *                                (Estado B)
 *
 * NÃO recria elementos do template (a arte importada JÁ contém tudo — fundo,
 * textos, imagens, gráficos): o Editor em Lote apenas recebe o template,
 * define a área do vídeo e compõe. NADA de logo/overlay extra: o template é a
 * fonte visual completa. A marcação usa o MESMO EditorCanvas / arraste.js /
 * config.areaVideo — prévia e render compartilham a MESMA geometria
 * (x/y/largura/altura em px do canvas 1080×1920).
 */

/** Área padrão ao importar template (antes de o usuário marcar): retângulo
 * central ~85% × ~70% — nunca cobre a arte inteira. */
const AREA_TEMPLATE_LARGURA_PCT = 0.85;
const AREA_TEMPLATE_ALTURA_PCT = 0.7;
const LIMITE_TEMPLATE_BYTES = 6 * 1024 * 1024;

/** Lê imagem do PC como dataURL (mesma mecânica do PainelCamadas antigo). */
function lerImagemComoDataUrl(arquivo, limite, aoPronto, aoErro) {
  if (!arquivo) return;
  if (!String(arquivo.type || '').startsWith('image/')) {
    aoErro('Escolha um arquivo de imagem (PNG/JPG/WebP).');
    return;
  }
  if (arquivo.size > limite) {
    aoErro(`Imagem muito grande (máx. ${Math.round(limite / 1024 / 1024)} MB).`);
    return;
  }
  const leitor = new FileReader();
  leitor.onload = () => {
    const du = typeof leitor.result === 'string' && leitor.result.startsWith('data:image/') ? leitor.result : null;
    if (!du) { aoErro('Não foi possível ler a imagem.'); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = 1080;
        const w0 = img.naturalWidth || maxW;
        const h0 = img.naturalHeight || 1440;
        const sc = w0 > maxW ? maxW / w0 : 1;
        const w = Math.max(1, Math.round(w0 * sc));
        const h = Math.max(1, Math.round(h0 * sc));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        aoPronto(cv.toDataURL('image/png'), arquivo.name || null, w0, h0);
      } catch { aoPronto(du, arquivo.name || null, 0, 0); }
    };
    img.onerror = () => aoPronto(du, arquivo.name || null, 0, 0);
    img.src = du;
  };
  leitor.readAsDataURL(arquivo);
}

export default function PainelFluxo({
  config,
  aoAtualizarConfig,
  previewAtivo,
  aoAlternarPreview,
  elementoSelecionado,
  aoSelecionarElemento,
}) {
  const inputTemplateRef = useRef(null);
  const [erro, setErro] = useState('');
  const [marcaAberta, setMarcaAberta] = useState(false);

  const templateFundo = (config && config.templateFundo) || {};
  const temTemplate = typeof templateFundo.url === 'string' && templateFundo.url.startsWith('data:image/');

  /* ------------- IMPORTAR TEMPLATE (TEMPLATE BASE do lote) ------------- */
  function aoEscolherTemplate(e) {
    const arquivo = e.target.files ? e.target.files[0] : null;
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    lerImagemComoDataUrl(arquivo, LIMITE_TEMPLATE_BYTES, (dataUrl, nome, wNat, hNat) => {
      aoAtualizarConfig((cfg) => {
        // REGRA 14 — estado antigo ZERADO: o template novo SUBSTITUI por
        // completo a base visual anterior. A config nasce limpa
        // (`criarConfigPadrao`) e só o lote atual (loteId/loteCriadoEm) é
        // preservado: sem textos, logo, imagens, identidade, cortes ou
        // enquadramento herdados de template/lote anterior.
        const base = criarConfigPadrao();
        const larguraArea = Math.round(CANVAS_LARGURA * AREA_TEMPLATE_LARGURA_PCT);
        const alturaArea = Math.round(CANVAS_ALTURA * AREA_TEMPLATE_ALTURA_PCT);
        return {
          ...base,
          loteId: cfg?.loteId || null,
          loteCriadoEm: cfg?.loteCriadoEm || null,
          templateFundo: { url: dataUrl, nome: nome || 'Template', larguraNatural: wNat || 0, alturaNatural: hNat || 0, visivel: true },
          areaVideo: {
            ...base.areaVideo,
            x: Math.round((CANVAS_LARGURA - larguraArea) / 2),
            y: Math.round((CANVAS_ALTURA - alturaArea) / 2),
            largura: larguraArea,
            altura: alturaArea,
            mostrarMarcacao: true,
          },
        };
      });
      // O template NÃO vai para o centro: ele fica disponível para a marcação
      // e para o Preview. Fecha a marcação/preview anteriores para o usuário
      // seguir o fluxo (marcar → Mostrar Preview).
      setMarcaAberta(false);
      if (typeof aoAlternarPreview === 'function') aoAlternarPreview(false);
    }, setErro);
  }

  function aoRemoverTemplate() {
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      templateFundo: { url: null, nome: '', larguraNatural: 0, alturaNatural: 0, visivel: true },
    }));
    setMarcaAberta(false);
    if (typeof aoAlternarPreview === 'function') aoAlternarPreview(false);
  }

  /* -------- ÁREA DO VÍDEO (marcação reusa o EditorCanvas existente) -------- */
  // O painel de marcação mostra o template com o retângulo arrastável/
  // redimensionável — o MESMO canvas, o MESMO arraste.js e a MESMA
  // config.areaVideo que a prévia e o render usam (prévia = render).
  function painelMarcacao() {
    if (!marcaAberta || !temTemplate) return null;
    return (
      // GAVETA LATERAL DIREITA (NÃO um modal sobre o centro): o template com o
      // retângulo da área aparece SOMENTE aqui, ao lado do painel direito, e o
      // centro continua mostrando apenas os vídeos importados.
      <div
        className="fixed inset-y-0 right-0 z-40 w-[min(660px,94vw)] flex flex-col border-l border-[color:var(--edl-borda)]"
        style={{ background: 'var(--edl-painel)', boxShadow: '-18px 0 50px -14px rgba(0,0,0,0.85)' }}
        role="dialog"
        aria-label="Marcar espaço do vídeo"
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--edl-borda)]">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 edl-icone-a" />
            <h3 className="font-display text-xs font-extrabold text-white">Marcar espaço do vídeo</h3>
          </div>
          <button
            type="button"
            onClick={() => { setMarcaAberta(false); }}
            aria-label="Fechar marcação"
            className="edl-ring-foco w-7 h-7 rounded-lg flex items-center justify-center text-[color:var(--edl-texto-dim)] hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="shrink-0 px-4 py-2 text-[10px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
          Arraste o retângulo e use as alças para definir EXATAMENTE onde o vídeo
          aparece no resultado final. O template NÃO é alterado — só a posição e o
          tamanho (x, y, largura, altura) da área do vídeo. O resultado final usa
          esta MESMA geometria.
        </p>
        <div className="min-h-0 overflow-auto px-4 pb-4">
          {/* MESMO EditorCanvas da prévia, mas no ESTADO A (marcação): só o
              TEMPLATE + o RETÂNGULO da área — SEM vídeo nenhum. Nenhum vídeo
              (nem thumbnail) é renderizado dentro do retângulo; ele é apenas
              marcação geométrica (x/y/largura/altura) que o Preview usará
              depois. Interativo para arrastar/redimensionar o retângulo. */}
          <EditorCanvas
            config={config}
            aoAtualizarConfig={aoAtualizarConfig}
            itemSelecionado={null}
            urlVideoAtiva={null}
            interativo
            alturaMaxima={620}
            mostrarRodape={false}
            forcarTemplateVisivel
            previewAtivo={false}
            elementoSelecionado={elementoSelecionado}
            aoSelecionarElemento={aoSelecionarElemento}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-full min-h-0 flex flex-col bg-[color:var(--edl-painel)] overflow-y-auto">
      {/* CABEÇALHO */}
      <div className="shrink-0 px-3 py-3 border-b border-[color:var(--edl-borda)]">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="w-3.5 h-3.5 edl-icone-a" />
          <h2 className="font-display text-xs font-extrabold text-white">TEMPLATE</h2>
        </div>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* 1) IMPORTAR TEMPLATE — abre o seletor de arquivos direto do PC */}
        <input ref={inputTemplateRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={aoEscolherTemplate} />
        <button
          type="button"
          onClick={() => inputTemplateRef.current?.click()}
          className="edl-botao-grad edl-ring-foco w-full flex items-center justify-center gap-2 text-xs font-extrabold py-2.5 rounded-lg"
        >
          <Upload className="w-3.5 h-3.5" />
          Importar template
        </button>
        {temTemplate ? (
          <div className="flex items-center gap-2.5 edl-superficie rounded-lg p-2">
            <div className="w-10 h-14 rounded-md overflow-hidden shrink-0 flex items-center justify-center border border-[color:var(--edl-borda)]" style={{ background: '#0d0d13' }}>
              <img src={templateFundo.url} alt={templateFundo.nome || 'Template'} className="max-w-full max-h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-white truncate">{templateFundo.nome || 'Template'}</p>
              <p className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
                {templateFundo.larguraNatural > 0 ? `${Math.round(templateFundo.larguraNatural)}×${Math.round(templateFundo.alturaNatural)} px` : 'Template base do lote'}
              </p>
            </div>
            <button
              type="button"
              onClick={aoRemoverTemplate}
              title="Remover template"
              className="edl-ring-foco shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[color:var(--edl-texto-dim)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}
        {erro ? (
          <p className="text-[10px] font-bold flex items-start gap-1.5" style={{ color: '#f87171' }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
          </p>
        ) : null}

        {/* 2) MARCAR ESPAÇO DO VÍDEO — só disponível com template importado.
            Abre a GAVETA DE MARCAÇÃO à direita (o centro continua só com os
            vídeos): o retângulo define x/y/largura/altura usados no preview e
            no render final. */}
        <button
          type="button"
          disabled={!temTemplate}
          onClick={() => {
            setMarcaAberta(!marcaAberta);
          }}
          title={temTemplate ? 'Abrir o modo de marcação da área do vídeo' : 'Importe um template primeiro'}
          className="edl-botao-fantasma edl-ring-foco w-full flex items-center justify-center gap-2 text-xs font-extrabold py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-default"
        >
          <Scan className="w-3.5 h-3.5 edl-icone-a" />
          {marcaAberta ? 'Fechar marcação' : 'Marcar espaço do vídeo'}
        </button>
        {temTemplate && config.areaVideo ? (
          <p className="text-[9px] font-mono font-bold px-1" style={{ color: 'var(--edl-texto-mut)' }}>
            Área: x {Math.round(config.areaVideo.x)} · y {Math.round(config.areaVideo.y)} · {Math.round(config.areaVideo.largura)}×{Math.round(config.areaVideo.altura)} px
          </p>
        ) : null}

        {/* 3) MOSTRAR PREVIEW — aplica o MESMO template + a MESMA área em TODOS
            os vídeos importados (6 por fileira). Antes do clique o centro
            mostra SOMENTE os vídeos. */}
        <button
          type="button"
          disabled={!temTemplate}
          onClick={() => { if (typeof aoAlternarPreview === 'function') aoAlternarPreview(!previewAtivo); }}
          aria-pressed={!!previewAtivo}
          title={!temTemplate
            ? 'Importe um template primeiro'
            : previewAtivo
              ? 'Voltar à visualização dos vídeos (sem template)'
              : 'Aplicar o template + área em TODOS os vídeos'}
          className={`edl-ring-foco w-full flex items-center justify-center gap-2 text-xs font-extrabold py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-default ${previewAtivo ? '' : 'edl-botao-grad'}`}
          style={previewAtivo ? { background: 'rgba(236,72,153,0.14)', border: '1.5px solid var(--edl-rosa)', color: '#fff' } : undefined}
        >
          <Eye className="w-3.5 h-3.5" />
          {previewAtivo ? 'Ocultar Preview' : 'Mostrar Preview'}
        </button>
        <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
          O Preview aplica este template e esta área em TODOS os vídeos importados.
          Antes dele, o centro mostra somente os vídeos.
        </p>
      </div>

      {marcaAberta ? (
        <p className="mt-auto px-3 py-2 text-[9px] font-semibold border-t border-[color:var(--edl-borda)]" style={{ color: 'var(--edl-texto-mut)' }}>
          Marcação aberta à direita — só o template + o retângulo (sem vídeo). O Preview aplica a geometria marcada em todos os vídeos.
        </p>
      ) : (
        <p className="mt-auto px-3 py-2 text-[9px] font-semibold border-t border-[color:var(--edl-borda)]" style={{ color: 'var(--edl-texto-mut)' }}>
          Importe vídeos à esquerda · importe o template · marque a área · mostre o Preview.
        </p>
      )}

      {painelMarcacao()}
    </div>
  );
}
