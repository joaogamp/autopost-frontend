import { useRef, useState } from 'react';
import { Upload, LayoutTemplate, AlertCircle, X, Scissors, Wand2, RotateCcw, Power } from 'lucide-react';
import {
  criarConfigPadrao,
  criarAreaTemplatePadrao,
  rotuloDeVideo,
  CANVAS_LARGURA,
  CANVAS_ALTURA,
  CORTE_MAXIMO,
  corteAutomaticoDoVideo,
  resumoDoCorteDoVideo,
  atualizarCorteNoConfig,
  usarCorteAutomaticoDoVideo,
  limparCorteDoVideo,
  editarTodosOsVideos,
} from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — PAINEL DIREITO ÚNICO (fluxo simplificado):
 *
 *   TEMPLATE
 *   [ Importar template ] → PNG/JPG/WebP do PC (input file direto)
 *
 * NÃO existe a ferramenta "Marcar espaço do vídeo", a gaveta "Área do vídeo",
 * nem qualquer editor de posicionamento/enquadramento do vídeo: o template é
 * composto assim que é importado e o vídeo aparece normalmente na prévia.
 *
 * NÃO recria elementos do template (a arte importada JÁ contém tudo — fundo,
 * textos, imagens, gráficos): o Editor em Lote apenas recebe o template,
 * compõe e corta. NADA de logo/overlay extra: o template é a fonte visual
 * completa. A prévia usa o MESMO EditorCanvas / config.areaVideo — prévia e
 * render compartilham a MESMA geometria (x/y/largura/altura em px do canvas
 * 1080×1920). A `areaVideo` permanece no estado e no payload: ela é apenas
 * calculada pelo sistema, nunca digitada/ajustada pelo usuário.
 */

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
  itens,
  aoAtualizarConfig,
  // VÍDEO EM FOCO no editor (o "Base" da área central / da lista). Todo o
  // corte manual é INDIVIDUAL: os controles e as linhas pertencem a este id.
  idSelecionado,
  // Liga/desliga a FERRAMENTA de arrastar as linhas no canvas. É só interface:
  // desligar as linhas NÃO desliga o corte, e ligar as linhas NÃO detecta nada.
  linhasCorteAtivas,
  aoAlternarLinhasCorte,
}) {
  const inputTemplateRef = useRef(null);
  const [erro, setErro] = useState('');

  const templateFundo = (config && config.templateFundo) || {};
  const temTemplate = typeof templateFundo.url === 'string' && templateFundo.url.startsWith('data:image/');

  /* --- DETECÇÃO AUTOMÁTICA DE BORDAS (INDICADOR MÍNIMO — somente leitura) ---
   * A detecção roda sozinha no import (EditorLote.detectarCorteAutomatico) e
   * grava SÓ INFORMAÇÃO em `config.overridesPorVideo[videoId].deteccao`. Ela
   * NUNCA vira corte efetivo sozinha: o vídeo importado nasce sem edição.
   * Aqui só AVISAMOS que a informação existe (texto pequeno por vídeo).
   * NÃO é controle novo: sem slider, sem toggle, sem botão. O corte efetivo só
   * nasce quando o usuário arrasta a linha/slider, ou clica em "Usar detecção". */
  const cortesAutomaticos = (Array.isArray(itens) ? itens : []).map((item, indice) => {
    const det = corteAutomaticoDoVideo(config, item?.id);
    if (!det) return null;
    const sup = Number(det.superior) || 0;
    const inf = Number(det.inferior) || 0;
    // Uma casa decimal, sem zero à direita: mostra o número QUE O DETECTOR
    // GRAVOU (ex.: 34.5, 9.9) em vez de um inteiro arredondado que pareceria
    // discordar do valor validado (arredondar 34.5 para "35%" seria enganoso).
    const pct = (n) => `${Math.round(n * 10) / 10}%`;
    const partes = [];
    if (sup > 0) partes.push(`${pct(sup)} topo`);
    if (inf > 0) partes.push(`${pct(inf)} base`);
    if (partes.length === 0) return null;
    return {
      id: item.id,
      nome: item.nome || rotuloDeVideo(indice),
      texto: `corte automático: ${partes.join(' · ')}`,
    };
  }).filter(Boolean);

  /* --- CORTE MANUAL POR LINHAS (o MESMO vídeo, ajuste do usuário) -----------
   * FONTE SEPARADA da detecção: aqui NENHUM pixel é analisado. O usuário liga
   * a ferramenta, arrasta a linha superior/inferior no canvas ou usa os
   * sliders, e o valor é gravado em `overridesPorVideo[videoId]` com
   * `origem:'manual'`. O `automatico` (bruto do detector) fica guardado ao
   * lado para a interface comparar e para o botão "Usar detecção automática".
   * Cada vídeo tem o SEU estado: trocar de vídeo e voltar encontra o corte
   * que foi deixado. */
  const videoEmFoco = (Array.isArray(itens) ? itens : []).find((v) => v && v.id === idSelecionado) || null;
  const indiceFoco = videoEmFoco ? (Array.isArray(itens) ? itens : []).findIndex((v) => v && v.id === idSelecionado) : -1;
  const nomeFoco = videoEmFoco ? (videoEmFoco.nome || rotuloDeVideo(indiceFoco)) : null;
  const resumo = resumoDoCorteDoVideo(config, idSelecionado);
  // ESCOPO DE EDIÇÃO (toggle OFF = "Editando apenas este vídeo" /
  // ON = "Editando todos os vídeos"). A chave mora na
  // PRÓPRIA config (persistida com o lote), então o modo sobrevive a F5 e é
  // lido pelas funções puras (`editarTodosOsVideos`) tanto pela interface
  // quanto pelas escritas de área/corte.
  const todosOsVideos = editarTodosOsVideos(config);
  // ALTERNAR O ESCOPO só muda a chave `editarTodos`: NENHUM override é apagado
  // aqui. Só o ato de EDITAR o corte com "Todos os vídeos" ligado substitui os
  // ajustes individuais de corte (e aí a página avisa com "Desfazer"). Área e
  // posição nunca são apagadas por essa troca.
  const aoAlternarEscopo = (ligado) => aoAtualizarConfig((cfg) => ({ ...cfg, editarTodos: !!ligado }));
  // Escrita MANUAL do corte — MESMA fonte de escrita das linhas arrastadas no
  // preview (`atualizarCorteNoConfig`), agora ciente do ESCOPO do toggle:
  //   · "Todos"      → grava no corteBordas global e SUBSTITUI os ajustes
  //     individuais de corte do lote (FASE 2: o escopo é literal); a área, a
  //     posição e a detecção automática não são tocadas;
  //   · "Apenas este" → grava no override DESTE vídeo (os outros intactos).
  // Assim slider, linha arrastada e detecção automática nunca divergem.
  const aoMudarManual = (campo, valor) =>
    aoAtualizarConfig((cfg) => atualizarCorteNoConfig(cfg, idSelecionado, { [campo]: valor }));
  // Volta ao valor bruto do detector (ou limpa o corte se nunca detectou).
  const aoUsarAutomatico = () => aoAtualizarConfig((cfg) => usarCorteAutomaticoDoVideo(cfg, idSelecionado));
  // Desliga o corte DESTE vídeo (prévia e render juntos).
  const aoDesligarCorte = () => aoAtualizarConfig((cfg) => limparCorteDoVideo(cfg, idSelecionado));
  const pct = (n) => `${Math.round((Number(n) || 0) * 10) / 10}%`;

  /* ------------- IMPORTAR TEMPLATE (TEMPLATE BASE do lote) ------------- */
  function aoEscolherTemplate(e) {
    const arquivo = e.target.files ? e.target.files[0] : null;
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    lerImagemComoDataUrl(arquivo, LIMITE_TEMPLATE_BYTES, (dataUrl, nome, wNat, hNat) => {
      aoAtualizarConfig((cfg) => {
        // O template é uma CAMADA por cima do vídeo — ele NUNCA encolhe o
        // vídeo. Dois conceitos separados (Opção B):
        //
        //  · `areaVideo`   → posição FÍSICA do vídeo. Fica no canvas INTEIRO
        //                     (0,0,1080×1920) para o vídeo ocupar a tela toda,
        //                     exatamente como antes de importar o template.
        //  · `areaTemplate`→ o retângulo VAZADO do template (o buraco que
        //     revela o vídeo). Recebe a MESMA geometria central de 85%×70%
        //     que antes era gravada em `areaVideo`, então a moldura visual do
        //     template fica IDÊNTICA — só o vídeo deixa de ser reduzido.
        //
        // PRESERVAÇÃO: a configuração atual é mantida. Trocar a arte do
        // template NÃO pode apagar `corteBordas` (o corte de bordas global),
        // `overridesPorVideo` (cortes automáticos/manuais por vídeo),
        // `areaPorVideo` (ajustes individuais de área/enquadramento),
        // textos, identidade, imagens e enquadramento. A única geometria
        // realmente trocada é a do VÍDEO, que volta ao canvas inteiro
        // (config nova do lote = geometricamente neutra).
        const base = criarConfigPadrao();
        return {
          ...cfg,
          // Geometria do vídeo: canvas inteiro (neutra) — o vídeo sempre
          // ocupa 100% da tela, com ou sem template.
          areaVideo: { ...base.areaVideo },
          // Retângulo vazado do template: o buraco de 85%×70% centralizado.
          areaTemplate: criarAreaTemplatePadrao(),
          templateFundo: { url: dataUrl, nome: nome || 'Template', larguraNatural: wNat || 0, alturaNatural: hNat || 0, visivel: true },
        };
      });
      // O template passa a compor o centro NA HORA: não há mais gaveta de
      // marcação nem "Estado A" (template sem vídeo) para fechar.
    }, setErro);
  }

  function aoRemoverTemplate() {
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      templateFundo: { url: null, nome: '', larguraNatural: 0, alturaNatural: 0, visivel: true },
    }));
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
        {/* 0) ESCOPO DE EDIÇÃO — toggle único. Só muda `editarTodos`; a escrita continua igual. */}
        <div
          className="rounded-lg border p-2.5"
          style={{
            borderColor: todosOsVideos ? 'var(--edl-rosa)' : 'rgba(56,189,248,0.55)',
            background: todosOsVideos ? 'rgba(236,72,153,0.10)' : 'rgba(56,189,248,0.10)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--edl-texto-mut)' }}>
                Escopo da edição
              </p>
              <p className="text-[11px] font-extrabold text-white leading-tight truncate">
                {todosOsVideos ? 'Editando todos os vídeos' : 'Editando apenas este vídeo'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={todosOsVideos}
              aria-label={todosOsVideos ? 'Editando todos os vídeos' : 'Editando apenas este vídeo'}
              title={todosOsVideos
                ? 'Ligado: editando todos os vídeos. Desligue para editar apenas este vídeo.'
                : 'Desligado: editando apenas este vídeo. Ligue para editar todos os vídeos.'}
              onClick={() => aoAlternarEscopo(!todosOsVideos)}
              className="edl-ring-foco shrink-0 w-[46px] h-[26px] rounded-full relative transition-colors"
              style={{ background: todosOsVideos ? 'var(--edl-rosa)' : 'rgba(56,189,248,0.35)', border: '1.5px solid rgba(255,255,255,0.35)' }}
            >
              <span
                aria-hidden="true"
                className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all"
                style={{ left: todosOsVideos ? 24 : 4 }}
              />
            </button>
          </div>
        </div>

        {/* 1) IMPORTAR TEMPLATE */}
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

        {/* TEMPLATE SEMPRE VISÍVEL. O template compõe assim que é importado e o
            vídeo aparece no preview normalmente, dentro do retângulo que o
            próprio template deixa vazar. A `areaVideo` continua existindo como
            DADO interno (posicionamento no canvas + buraco do template) — ela
            não é mais mostrada nem editada pelo usuário aqui. */}
        {temTemplate ? (
          <div className="edl-superficie rounded-lg p-2 space-y-1">
            <p className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--edl-texto-mut)' }}>
              Template aplicado em todos os vídeos
            </p>
            <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
              O template fica visível com o vídeo aparecendo normalmente ao lado.
            </p>
          </div>
        ) : null}

        {/* CORTE DE BORDAS — AS DUAS FONTES, SEPARADAS E VISÍVEIS.
            (1) AUTOMÁTICO: o que o `detectorBordas.js` encontrou sozinho no
                import (leitura pura — este painel não o recalcula, não o
                sobrescreve e não depende dele);
            (2) MANUAL: o ajuste do usuário pelas LINHAS arrastáveis do canvas
                (ou pelos sliders abaixo) — gravado só neste vídeo.
            As duas se informam, nunca se misturam: "Usar detecção automática"
            volta ao bruto; o corte efetivo que vai pro vídeo final é sempre o
            mesmo que a prévia mostra. */}
        <div className="pt-3 mt-1 border-t border-[color:var(--edl-borda)] space-y-2.5">
          <div className="flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5 edl-icone-a shrink-0" />
            <h3 className="font-display text-[11px] font-extrabold text-white">Corte de bordas</h3>
          </div>

          {!videoEmFoco ? (
            <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
              Selecione um vídeo (na lista ou no centro) para ver e ajustar o
              corte dele. Cada vídeo tem o seu próprio corte.
            </p>
          ) : (
            <>
              {/* Vídeo em foco + o que realmente vai para o vídeo final. */}
              <div className="rounded-lg px-2.5 py-2 edl-superficie">
                <p className="text-[9px] font-bold truncate mb-1" style={{ color: 'var(--edl-texto-dim)' }} title={nomeFoco}>
                  {nomeFoco}
                </p>
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-mut)' }}>
                    Vai para o vídeo final
                  </span>
                  <span className="text-[10px] font-black text-white">
                    {pct(resumo.efetivo.superior)} · {pct(resumo.efetivo.inferior)}
                  </span>
                </div>
                <p className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
                  {resumo.temCorte
                    ? 'origem: ajuste manual (linha)'
                    : 'origem: sem corte'}
                </p>
              </div>

              {/* (1) DETECÇÃO AUTOMÁTICA — somente leitura (diagnóstico). */}
              <div className="rounded-lg px-2.5 py-2 border" style={{ borderColor: 'rgba(236,72,153,0.35)', background: 'rgba(236,72,153,0.06)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Wand2 className="w-3 h-3 shrink-0 edl-icone-a" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--edl-texto-mut)' }}>
                    Detecção automática
                  </span>
                </div>
                {resumo.automatico ? (
                  <p className="text-[10px] font-bold text-white">
                    Superior {pct(resumo.automatico.superior)} · Inferior {pct(resumo.automatico.inferior)}
                  </p>
                ) : (
                  <p className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
                    Nenhuma borda detectada neste vídeo.
                  </p>
                )}
                {resumo.automatico && !resumo.temCorte ? (
                  <button
                    type="button"
                    onClick={aoUsarAutomatico}
                    title="Aplicar o valor detectado como corte manual deste vídeo (só entra no vídeo final depois disso)"
                    className="edl-ring-foco mt-1.5 w-full flex items-center justify-center gap-1.5 text-[10px] font-extrabold py-1.5 rounded-lg"
                    style={{ background: 'rgba(236,72,153,0.18)', color: '#fff' }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Usar detecção
                  </button>
                ) : null}
              </div>

              {/* (2) MANUAL — a ferramenta do usuário. Nenhum pixel é lido
                  aqui: o usuário move a linha (ou o slider) e o valor vai para
                  `overridesPorVideo[<este vídeo>]` com origem 'manual'. */}
              <div className="rounded-lg px-2.5 py-2 border" style={{ borderColor: 'rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.07)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Scissors className="w-3 h-3 shrink-0" style={{ color: '#38bdf8' }} />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider" style={{ color: 'var(--edl-texto-mut)' }}>
                    Ajuste manual
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => aoAlternarLinhasCorte && aoAlternarLinhasCorte(!linhasCorteAtivas)}
                  aria-pressed={!!linhasCorteAtivas}
                  title={linhasCorteAtivas
                    ? 'Ocultar as linhas de corte no vídeo'
                    : 'Mostrar as linhas de corte para arrastar'}
                  className="edl-ring-foco w-full flex items-center justify-center gap-1.5 text-[10px] font-extrabold py-1.5 rounded-lg"
                  style={linhasCorteAtivas
                    ? { background: 'rgba(56,189,248,0.22)', border: '1.5px solid #38bdf8', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--edl-borda)', color: 'var(--edl-texto-dim)' }}
                >
                  {linhasCorteAtivas ? 'Ocultar linhas' : 'Corte manual por linhas'}
                </button>
                {linhasCorteAtivas ? (
                  <p className="text-[9px] font-semibold leading-relaxed mt-1.5" style={{ color: 'var(--edl-texto-mut)' }}>
                    Arraste a linha azul no vídeo (topo e base) ou use os controles abaixo.{' '}
                    {todosOsVideos
                      ? 'Com "Todos os vídeos" ligado, o corte vale para o lote inteiro.'
                      : 'Vale só para este vídeo; os demais mantêm o corte deles.'}
                  </p>
                ) : null}
                {/* Sliders = MESMA escrita das linhas (fonte única) para quem
                    prefere número exato. Ao mexer, o corte vira 'manual'. */}
                {[
                  { campo: 'superior', rotulo: 'Superior', valor: resumo.efetivo.superior },
                  { campo: 'inferior', rotulo: 'Inferior', valor: resumo.efetivo.inferior },
                ].map((linha) => (
                  <label key={linha.campo} className="block mt-1.5">
                    <span className="flex items-center justify-between text-[9px] font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
                      <span>{linha.rotulo}</span>
                      <span className="font-mono text-white">{pct(linha.valor)}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={CORTE_MAXIMO}
                      step={0.5}
                      value={Number(linha.valor) || 0}
                      onChange={(e) => aoMudarManual(linha.campo, Number(e.target.value))}
                      className="w-full mt-0.5"
                      aria-label={`Corte ${linha.rotulo.toLowerCase()} (ajuste manual)`}
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={aoDesligarCorte}
                disabled={!resumo.temCorte}
                title="Remover o corte deste vídeo (a prévia e o vídeo final voltam ao vídeo inteiro)"
                className="edl-ring-foco w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-default"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--edl-borda)', color: 'var(--edl-texto-dim)' }}
              >
                <Power className="w-3 h-3" />
                Desligar corte deste vídeo
              </button>
            </>
          )}

          {/* Panorâmica do LOTE: cada vídeo com corte DETECTADO (origem auto),
              em qualquer modo. Leitura pura. */}
          {cortesAutomaticos.length > 0 ? (
            <div className="pt-2 border-t border-[color:var(--edl-borda)]">
              <p className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--edl-texto-mut)' }}>
                Automático no lote
              </p>
              <ul className="flex flex-col gap-1">
                {cortesAutomaticos.map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5 min-w-0">
                    <Scissors className="w-3 h-3 shrink-0 mt-px edl-icone-a" />
                    <span className="min-w-0">
                      <span className="block text-[9px] font-bold truncate" style={{ color: 'var(--edl-texto-dim)' }}>
                        {c.nome}
                      </span>
                      <span className="block text-[9px] font-semibold truncate" style={{ color: 'var(--edl-texto-mut)' }}>
                        {c.texto}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-auto px-3 py-2 text-[9px] font-semibold border-t border-[color:var(--edl-borda)]" style={{ color: 'var(--edl-texto-mut)' }}>
        Importe vídeos à esquerda e o template acima: o template já aparece
        no centro, com o vídeo dentro do retângulo.
      </p>
    </div>
  );
}
