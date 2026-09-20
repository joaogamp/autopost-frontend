import { useRef, useState } from 'react';
import {
  Scissors,
  Paintbrush,
  Type,
  Image as ImageIcon,
  ImagePlus,
  LayoutTemplate,
  Film,
  Scan,
  User,
  AtSign,
  BadgeCheck,
  Eye,
  EyeOff,
  Upload,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { corteEfetivoDoVideo, atualizarCorteNoConfig } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — PAINEL DIREITO: CAMADAS.
 *
 * O painel ficou com SOMENTE os dois controles deste fluxo:
 *
 *   1. TEMPLATE — PNG/JPG/WebP importado DIRETO do computador (input file,
 *      sem popup/modal intermediário). Entra centralizado no canvas como
 *      FUNDO; controle de trocar/remover/visibilidade (flag real do render).
 *
 *   2. ÁREA DO VÍDEO — fica SOBRE o template: o clique seleciona o retângulo
 *      (arraste/redimensione no Preview pra definir exatamente onde o vídeo
 *      entra) e o olho liga/desliga o guia na prévia.
 *
 * `construirCamadas` continua exportada pra manter/documentar a ORDEM de
 * composição do render (testes): imagens → logo → textos → identidade →
 * selo → templateFundo → área → corte → vídeo → fundo.
 */

/** Constrói a lista de camadas a partir da config COMPARTILHADA. Exportada
 * pra testes e pra manter UMA única definição da ordem de composição. */
export function construirCamadas(config, idSelecionado = null) {
  if (!config || typeof config !== 'object') return [];
  const camadas = [];

  (config.imagens || []).forEach((im) => {
    if (!im) return;
    camadas.push({
      id: `imagem:${im.id}`,
      rotulo: im.nome || 'Imagem',
      Icone: ImagePlus,
      temOlho: true,
      visivel: !!im.visivel,
      alternar: (v) => ({ imagens: (config.imagens || []).map((x) => (x && x.id === im.id ? { ...x, visivel: v } : x)) }),
    });
  });

  camadas.push({
    id: 'logo',
    rotulo: 'Logo',
    Icone: ImageIcon,
    temOlho: true,
    visivel: !!config.logo?.visivel,
    alternar: (v) => ({ logo: { ...config.logo, visivel: v } }),
  });

  camadas.push({
    id: 'textoSuperior',
    rotulo: 'Texto principal',
    Icone: Type,
    temOlho: true,
    visivel: !!config.textos?.superior?.visivel,
    alternar: (v) => ({ textos: { ...config.textos, superior: { ...config.textos?.superior, visivel: v } } }),
  });

  camadas.push({
    id: 'textoInferior',
    rotulo: 'Texto inferior',
    Icone: Type,
    temOlho: true,
    visivel: !!config.textos?.inferior?.visivel,
    alternar: (v) => ({ textos: { ...config.textos, inferior: { ...config.textos?.inferior, visivel: v } } }),
  });

  camadas.push({
    id: 'identidadeNome',
    rotulo: 'Nome do canal',
    Icone: User,
    temOlho: true,
    visivel: !!config.identidade?.nome?.visivel,
    alternar: (v) => ({ identidade: { ...config.identidade, nome: { ...config.identidade?.nome, visivel: v } } }),
  });

  camadas.push({
    id: 'identidadeUsuario',
    rotulo: 'Usuário (@)',
    Icone: AtSign,
    temOlho: true,
    visivel: !!config.identidade?.usuario?.visivel,
    alternar: (v) => ({ identidade: { ...config.identidade, usuario: { ...config.identidade?.usuario, visivel: v } } }),
  });

  camadas.push({
    id: 'selo',
    rotulo: 'Selo de verificado',
    Icone: BadgeCheck,
    temOlho: true,
    visivel: !!config.identidade?.selo?.visivel,
    alternar: (v) => ({ identidade: { ...config.identidade, selo: { ...config.identidade?.selo, visivel: v } } }),
  });

  // TEMPLATE DE FUNDO IMPORTADO - camada visual propria (fundo).
  if (config.templateFundo && typeof config.templateFundo.url === 'string' && config.templateFundo.url.startsWith('data:image/')) {
    camadas.push({
      id: 'templateFundo',
      rotulo: config.templateFundo.nome || 'Template de fundo',
      Icone: LayoutTemplate,
      temOlho: true,
      visivel: config.templateFundo.visivel !== false,
      dicaOlho: 'Mostrar/ocultar o template de fundo na previa',
      alternar: (v) => ({ templateFundo: { ...config.templateFundo, visivel: v } }),
    });
  }

  camadas.push({
    id: 'area',
    rotulo: 'Área do vídeo',
    Icone: Scan,
    temOlho: true,
    visivel: !!config.areaVideo?.mostrarMarcacao,
    // O olho da área controla o GUIA (marcação tracejada) na prévia — a área
    // em si é só a janela de composição do vídeo, nunca um elemento desenhado.
    dicaOlho: 'Mostrar/ocultar o guia da área na prévia',
    alternar: (v) => ({ areaVideo: { ...config.areaVideo, mostrarMarcacao: v } }),
  });

  // FONTE ÚNICA do corte: o olho mostra o estado EFETIVO (override do vídeo
  // vence o global — o mesmo que o preview recorta) e o clique escreve pela
  // MESMA função do painel e do arraste das linhas (atualizarCorteNoConfig).
  // Desligar remove também o override do vídeo atual — o corte desliga DE
  // VERDADE (preview e render juntos). As linhas permanecem SEMPRE visíveis
  // como referência; só a máscara (clip-path) e o render se desligam.
  const corteEfetivo = corteEfetivoDoVideo(config, idSelecionado);
  camadas.push({
    id: 'corte',
    rotulo: 'Corte de borda',
    Icone: Scissors,
    temOlho: true,
    visivel: corteEfetivo.ativo,
    // Chave REAL do render: desligar remove o corte do vídeo final.
    dicaOlho: 'Ativar/desativar o corte de bordas (vale pro render)',
    alternar: (v) => atualizarCorteNoConfig(config, idSelecionado, { ativo: v }),
  });

  camadas.push({ id: 'video', rotulo: 'Vídeo', Icone: Film, temOlho: false, visivel: true });
  camadas.push({ id: 'fundo', rotulo: 'Fundo', Icone: Paintbrush, temOlho: false, visivel: true });

  return camadas;
}

export default function PainelCamadas({ config, aoAtualizarConfig, elementoSelecionado, aoSelecionarElemento }) {
  const inputRef = useRef(null);
  const [erroTemplate, setErroTemplate] = useState('');

  const templateFundo = (config && config.templateFundo) || {};
  const temTemplate = typeof templateFundo.url === 'string' && templateFundo.url.startsWith('data:image/');
  const templateVisivel = templateFundo.visivel !== false;
  const guiaAtiva = !!config.areaVideo?.mostrarMarcacao;
  const areaSelecionada = elementoSelecionado === 'area';

  /* ------------- TEMPLATE DE FUNDO (importação DIRETA do PC — sem popup) ------------- */
  const LIMITE_TEMPLATE_BYTES = 6 * 1024 * 1024;

  function lerTemplateComoDataUrl(arquivo, aoPronto) {
    if (!arquivo) return;
    const tipo = String(arquivo.type || '');
    if (!tipo.startsWith('image/')) { setErroTemplate('Escolha um arquivo de imagem (PNG/JPG/WebP).'); return; }
    if (arquivo.size > LIMITE_TEMPLATE_BYTES) { setErroTemplate('Template muito grande (max. 6 MB).'); return; }
    setErroTemplate('');
    const leitor = new FileReader();
    leitor.onload = () => {
      const du = (typeof leitor.result === 'string' && leitor.result.indexOf('data:image/') === 0) ? leitor.result : null;
      if (!du) { setErroTemplate('Nao foi possivel ler o template.'); return; }
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

  function aoEscolherTemplateFundo(e) {
    const arquivo = e.target.files ? e.target.files[0] : null;
    if (!arquivo) return;
    e.target.value = '';
    lerTemplateComoDataUrl(arquivo, (dataUrl, nome, wNat, hNat) => {
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        templateFundo: { url: dataUrl, nome: nome || 'Template', larguraNatural: wNat || 0, alturaNatural: hNat || 0, visivel: true },
        // O template é o FUNDO do canvas e vale para TODO o lote (config
        // compartilhada — nenhum template por vídeo). A Área do vídeo NÃO é
        // redefinida aqui: ela é exatamente o espaço que o vídeo deve preencher
        // e o usuário a posiciona/redimensiona no Preview — apenas o guia é
        // ligado para referência imediata.
        areaVideo: { ...cfg.areaVideo, mostrarMarcacao: true },
      }));
      if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento('area');
    });
  }

  function aoRemoverTemplateFundo() {
    aoAtualizarConfig((cfg) => ({ ...cfg, templateFundo: { url: null, nome: '', larguraNatural: 0, alturaNatural: 0, visivel: true } }));
    if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento(null);
  }

  function alternarTemplateVisivel(v) {
    aoAtualizarConfig((cfg) => ({ ...cfg, templateFundo: { ...cfg.templateFundo, visivel: v } }));
  }

  function alternarGuiaArea(v) {
    aoAtualizarConfig((cfg) => ({ ...cfg, areaVideo: { ...cfg.areaVideo, mostrarMarcacao: v } }));
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-[color:var(--edl-painel)]">
      {/* Cabeçalho */}
      <div className="shrink-0 px-3 py-3 border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 edl-icone-b shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
        </svg>
        <h2 className="font-display text-xs font-extrabold text-white">Camadas</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* TEMPLATE — importação DIRETA do PC (input file; SEM popup/modal) */}
        <section className="px-3 py-3 space-y-2.5 border-b border-[color:var(--edl-borda)]">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-3.5 h-3.5 edl-icone-a shrink-0" />
            <h3 className="font-display text-[11px] font-extrabold text-white">Template</h3>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={aoEscolherTemplateFundo}
          />
          {temTemplate ? (
            <>
              <div className="flex items-center gap-3">
                <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-[color:var(--edl-borda)]" style={{ background: '#0d0d13' }}>
                  <img src={templateFundo.url} alt={templateFundo.nome || 'Template'} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-white truncate">{templateFundo.nome || 'Template'}</p>
                  {templateFundo.larguraNatural > 0 && templateFundo.alturaNatural > 0 ? (
                    <p className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
                      {`${Math.round(templateFundo.larguraNatural)}×${Math.round(templateFundo.alturaNatural)} px`}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="edl-ring-foco edl-superficie flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg"
                    >
                      <Upload className="w-3 h-3 edl-icone-a" />
                      Trocar
                    </button>
                    <button
                      type="button"
                      onClick={aoRemoverTemplateFundo}
                      className="edl-ring-foco edl-superficie flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg"
                      style={{ color: '#f87171' }}
                    >
                      <Trash2 className="w-3 h-3" />
                      Remover
                    </button>
                  </div>
                </div>
              </div>

              {/* olho — flag REAL que vai pro render (EditorCanvas + overlay) */}
              <button
                type="button"
                onClick={() => alternarTemplateVisivel(!templateVisivel)}
                title={templateVisivel ? 'Ocultar o template na prévia e no render' : 'Mostrar o template na prévia e no render'}
                aria-pressed={templateVisivel}
                className="edl-ring-foco edl-superficie w-full flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ color: templateVisivel ? 'var(--edl-texto)' : 'var(--edl-texto-mut)' }}
              >
                <span className="flex items-center gap-2 text-[11px] font-bold">
                  {templateVisivel ? <Eye className="w-3.5 h-3.5 edl-icone-a" /> : <EyeOff className="w-3.5 h-3.5 opacity-70" />}
                  Template visível
                </span>
                <span className="relative w-8 h-[18px] rounded-full transition-colors shrink-0" style={{ background: templateVisivel ? 'var(--edl-grad)' : 'rgba(255,255,255,0.15)' }}>
                  <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all shadow" style={{ left: templateVisivel ? 16 : 2 }} />
                </span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="edl-botao-grad edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-extrabold px-3 py-2.5 rounded-lg"
            >
              <Upload className="w-3.5 h-3.5" />
              Importar template (PNG/JPG/WebP)
            </button>
          )}
          {erroTemplate ? (
            <p className="text-[10px] font-bold text-rose-400 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {erroTemplate}
            </p>
          ) : null}
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            O template entra centralizado no canvas, como FUNDO. O vídeo fica
            SOMENTE dentro da área marcada, por cima dele.
          </p>
        </section>

        {/* ÁREA DO VÍDEO — retângulo sobre o template (arraste/redimensione no Preview) */}
        <section className="px-3 py-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <Scan className="w-3.5 h-3.5 edl-icone-a shrink-0" />
            <h3 className="font-display text-[11px] font-extrabold text-white">Área do vídeo</h3>
          </div>
          <div
            className={`group flex items-center gap-1.5 rounded-lg pr-1 transition-colors ${areaSelecionada ? '' : 'hover:bg-white/5'}`}
            style={areaSelecionada ? { background: 'rgba(236,72,153,0.14)', boxShadow: 'inset 0 0 0 1.5px var(--edl-rosa)' } : null}
          >
            <button
              type="button"
              onClick={() => aoSelecionarElemento && aoSelecionarElemento('area')}
              className="edl-ring-foco flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left"
              title={areaSelecionada ? 'Área do vídeo selecionada' : 'Selecionar a área do vídeo'}
            >
              <Scan className={`w-3.5 h-3.5 shrink-0 ${areaSelecionada ? 'edl-icone-a' : 'edl-icone-b opacity-80'}`} />
              <span className={`text-[11px] font-bold truncate ${areaSelecionada ? 'text-white' : ''}`} style={{ color: areaSelecionada ? undefined : 'var(--edl-texto-dim)' }}>
                Área do vídeo
              </span>
            </button>
            <button
              type="button"
              onClick={() => alternarGuiaArea(!guiaAtiva)}
              title={guiaAtiva ? 'Ocultar o guia da área na prévia' : 'Mostrar o guia da área na prévia'}
              aria-label={`${guiaAtiva ? 'Ocultar' : 'Mostrar'} o guia da área do vídeo`}
              aria-pressed={guiaAtiva}
              className={`edl-ring-foco shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors ${guiaAtiva ? 'text-white/80 hover:text-white' : 'text-white/30 hover:text-white/60'}`}
            >
              {guiaAtiva ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            A área fica SOBRE o template: arraste o retângulo no Preview e use
            a alça de canto pra redimensionar — o vídeo ocupa SOMENTE essa área.
          </p>
        </section>
      </div>

      <p className="shrink-0 px-3 py-2 text-[9px] font-semibold leading-relaxed border-t border-[color:var(--edl-borda)]" style={{ color: 'var(--edl-texto-mut)' }}>
        Template no fundo · Área do vídeo por cima: o vídeo ocupa SOMENTE a
        área marcada, sobre o template importado.
      </p>
    </div>
  );
}
