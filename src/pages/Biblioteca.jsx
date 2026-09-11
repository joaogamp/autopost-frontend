import { useEffect, useRef, useState } from 'react';
import { buscarBiblioteca, enviarVideos, processarLote, listarTemplates, urlArquivo, listarFinais, excluirVideo } from '../lib/api';
import StatusDot from '../components/StatusDot';
import RedeIcon from '../components/RedeIcon';
import { Zap, Plus, Upload, Check, Play, Trash2, X, Loader2, AlertTriangle } from 'lucide-react';

export default function Biblioteca() {
  const [videos, setVideos] = useState([]);
  const [finais, setFinais] = useState({});
  const [selecionados, setSelecionados] = useState(new Set());
  const [enviando, setEnviando] = useState(false);
  const [processandoLote, setProcessandoLote] = useState(false);
  const [processandoAuto, setProcessandoAuto] = useState(false);
  const [erroLote, setErroLote] = useState('');
  const [vista, setVista] = useState('prontos'); // 'prontos' | 'todos'
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const inputRef = useRef(null);

  // Preview: modal de vídeo (original e/ou finais), aberto via botão "Preview"
  // ou pelo mini-card de cada final.
  const [preview, setPreview] = useState(null); // { video, opcoes: [{tipo, chave, label, url}], chave }

  // Exclusão: modal de confirmação + estado de carregamento + erros da API.
  const [excluirAlvo, setExcluirAlvo] = useState(null); // vídeo a excluir
  const [excluindoId, setExcluindoId] = useState(null); // id em exclusão (impede duplo clique)
  const [erroExclusao, setErroExclusao] = useState('');

  // Carga os templates uma só vez (serve pra procesar vídeos brutos na
  // Biblioteca com um template escolhido — nunca hardcoded).
  useEffect(() => {
    listarTemplates().then((ts) => {
      setTemplates(ts);
      if (ts.length > 0) setTemplateId(ts[0].id);
    });
  }, []);

  async function carregar() {
    // Robustez: a Biblioteca sempre atualiza a lista de vídeos, mesmo que o
    // /api/finais falhe. Uma falha em listarFinais() NÃO pode esconder a tela.
    const [bibResultado, finsResultado] = await Promise.allSettled([buscarBiblioteca(), listarFinais()]);

    if (bibResultado.status === 'fulfilled') {
      setVideos(bibResultado.value);
    } else {
      // Mantém os vídeos já carregados e apenas registra o erro (não trava nada).
      console.error('[Biblioteca] Falha ao buscar biblioteca:', bibResultado.reason?.message || bibResultado.reason);
    }

    if (finsResultado.status === 'fulfilled') {
      const mapaFinais = {};
      for (const f of finsResultado.value) {
        if (!mapaFinais[f.originalId]) mapaFinais[f.originalId] = [];
        mapaFinais[f.originalId].push(f);
      }
      setFinais(mapaFinais);
    } else {
      console.error('[Biblioteca] Falha ao buscar finais:', finsResultado.reason?.message || finsResultado.reason);
    }
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 3000);
    return () => clearInterval(intervalo);
  }, []);

  // ---------------------------------------------------------------
  // PREVIEW — abre o modal de vídeo dentro da própria aplicação (sem abrir
  // nova aba). Monta as opções com as URL reais retornadas pela API:
  //   - original: `video.urlOriginal` (serve output/uploads)
  //   - finais:   `f.urlFinal` + `f.thumbnailFinal` (serve output/publicados)
  // Quando existem finais concluídos, o FINAL é priorizado no preview.
  // ---------------------------------------------------------------
  function abrirPreview(video, finalInicialId) {
    const finalsProntos = (finais[video.id] || [])
      .filter((f) => f.status === 'concluido' && f.urlFinal)
      .map((f) => ({
        tipo: 'final',
        chave: f.id,
        label: f.templateNome || 'Final',
        url: urlArquivo(f.urlFinal),
        thumb: f.thumbnailFinal ? urlArquivo(f.thumbnailFinal) : null,
      }));

    const opcoes = [];
    if (video.urlOriginal) {
      opcoes.push({
        tipo: 'original',
        chave: 'original',
        label: 'Original',
        url: urlArquivo(video.urlOriginal),
        thumb: video.thumbnailUrl ? urlArquivo(video.thumbnailUrl) : null,
      });
    }
    opcoes.push(...finalsProntos);

    const chaveInicial =
      finalInicialId ||
      (finalsProntos.length > 0 ? finalsProntos[0].chave : 'original');
    setPreview({
      video,
      opcoes,
      chave: opcoes.some((o) => o.chave === chaveInicial) ? chaveInicial : opcoes[0]?.chave || null,
    });
  }

  function fecharPreview() {
    setPreview(null);
  }

  // ---------------------------------------------------------------
  // EXCLUSÃO — modal de confirmação + chamada ao backend.
  // ---------------------------------------------------------------
  function iniciarExclusao(video) {
    setExcluirAlvo(video);
    setErroExclusao('');
  }

  function cancelarExclusao() {
    if (excluindoId) return; // não cancela no meio da exclusão
    setExcluirAlvo(null);
    setErroExclusao('');
  }

  async function confirmarExclusao() {
    const video = excluirAlvo;
    if (!video || excluindoId) return; // impede duplo clique
    setExcluindoId(video.id);
    setErroExclusao('');
    try {
      await excluirVideo(video.id);
      setExcluirAlvo(null);
      setSelecionados((atual) => {
        const novo = new Set(atual);
        novo.delete(video.id);
        return novo;
      });
      await carregar(); // atualiza a lista sem recarregar a página
    } catch (erro) {
      setErroExclusao(erro.message || 'Erro ao excluir o vídeo.');
    } finally {
      setExcluindoId(null);
    }
  }

  // Fecha modais com a tecla ESC (mas nunca durante uma exclusão em andamento).
  useEffect(() => {
    function aoTeclar(e) {
      if (e.key !== 'Escape' || excluindoId) return;
      setPreview(null);
      setExcluirAlvo(null);
      setErroExclusao('');
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [excluindoId]);

  // Trava o scroll do fundo enquanto um modal está aberto.
  useEffect(() => {
    const aberto = Boolean(preview || excluirAlvo);
    document.body.style.overflow = aberto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [preview, excluirAlvo]);

  async function aoSelecionarArquivos(e) {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (arquivos.length === 0) return;

    setEnviando(true);
    setErroLote('');
    setProcessandoAuto(false);
    try {
      // 1. Upload — o servidor responde com { videos } (cada um com seu id).
      const resp = await enviarVideos(arquivos);
      const videosEnviados = resp && Array.isArray(resp.videos) ? resp.videos : [];

      // 2. Atualiza a Biblioteca imediatamente com os vídeos recém-enviados.
      await carregar();

      if (videosEnviados.length === 0) {
        setErroLote('Upload concluído, mas o servidor não retornou os vídeos. Nada foi processado — tente adicionar novamente.');
        return;
      }
      if (!templateId) {
        setErroLote(`${videosEnviados.length} vídeo(s) enviado(s), mas nenhum template está selecionado. Selecione um template e processe manualmente.`);
        return;
      }

      // 3. Monta o payload a partir dos vídeos criados no /api/upload.
      const lista = videosEnviados.map((videoEnviado) => ({
        bibliotecaId: videoEnviado.id,
        tituloIA: String(videoEnviado.nomeOriginal || '').replace(/\.[^.]+$/, ''),
      }));

      // 4. Processa automaticamente com o template selecionado na Biblioteca.
      setProcessandoAuto(true);
      setProcessandoLote(true);
      try {
        await processarLote(templateId, lista);
      } catch (erroProcessamento) {
        // Upload ocorreu, mas o processamento falhou — deixe isso bem claro.
        setErroLote(
          `Upload concluído com ${videosEnviados.length} vídeo(s), mas o processamento falhou: ${erroProcessamento.message || 'erro desconhecido'}`
        );
        console.error('[aoSelecionarArquivos] Falha no processamento após o upload:', erroProcessamento);
      } finally {
        // NUNCA deixa o estado preso em "processando".
        setProcessandoLote(false);
        setProcessandoAuto(false);
        // 5. Atualiza a Biblioteca com o status/fila do processamento recém-iniciado.
        await carregar();
      }
    } catch (erroUpload) {
      // Falha no upload em si.
      setErroLote(`Falha no upload: ${erroUpload.message || 'erro desconhecido'}`);
      console.error('[aoSelecionarArquivos] Falha no upload:', erroUpload);
    } finally {
      // Garantia absoluta: nunca fica preso em "Enviando..." nem rejection silenciosa.
      setEnviando(false);
    }
  }

  function alternarSelecao(id) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  async function processarSelecionados() {
    const candidatos = videos.filter((v) => selecionados.has(v.id));
    const disponibles = candidatos;
    const jaConcluidos = candidatos.filter((v) => v.status === 'concluido');
    const omitidos = jaConcluidos.length;

    if (!templateId) {
      setErroLote('Selecciona un template pra processar.');
      return;
    }
    if (disponibles.length === 0) {
      setErroLote('Selecione pelo menos um vídeo.');
      return;
    }

    const lista = disponibles.map((v) => ({ bibliotecaId: v.id, tituloIA: v.nomeOriginal.replace(/\.[^.]+$/, '') }));

    setErroLote(omitidos > 0
      ? `${omitidos} vídeo(s) já concluído(s) será(ão) reprocessado(s) com o template selecionado.`
      : '');
    setProcessandoLote(true);
    try {
      await processarLote(templateId, lista);
      setSelecionados(new Set());
    } catch (e) {
      setErroLote(e.message || 'Erro desconhecido ao processar lote.');
    } finally {
      setProcessandoLote(false);
      carregar();
    }
  }

  // Aba "Prontos": mostra o original se ele está concluído OU se existe ao
  // menos um FINAL concluído para aquele originalId (mesmo que o status do
  // original na biblioteca não tenha sido atualizado).
  const videosProntos = videos.filter(
    (v) => v.status === 'concluido' || (finais[v.id] || []).some((f) => f.status === 'concluido')
  );
  const videosVisibles = vista === 'todos' ? videos : videosProntos;
  const pendentesSelecionados = videos.some((v) => selecionados.has(v.id) && v.status !== 'concluido');

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Biblioteca</h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">Gerencie seu repositório de vídeos brutos e processe em lote</p>
        </div>

        <div className="flex items-center gap-3">
          {selecionados.size > 0 && pendentesSelecionados && (
            <button
              onClick={processarSelecionados}
              disabled={processandoLote}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>{processandoLote ? 'Enviando lote...' : `Processar ${selecionados.size} vídeo(s)`}</span>
            </button>
          )}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="text-xs bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-indigo-600" />
            <span>{enviando ? 'Enviando...' : 'Adicionar vídeos'}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={aoSelecionarArquivos}
          />
        </div>
      </div>

      {/* Tabs Prontos/Todos + seletor de template */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setVista('prontos')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
              vista === 'prontos'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Prontos ({videosProntos.length})
          </button>
          <button
            onClick={() => setVista('todos')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
              vista === 'todos'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Todos ({videos.length})
          </button>
        </div>

        <label className="text-[11px] font-bold text-slate-500 shrink-0">Template pra processar:</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full sm:w-56 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600 font-medium"
        >
          {templates.length === 0 && <option value="">Nenhún template criado</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>
      </div>

      {/* Erro de lote */}
      {erroLote && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-4 py-3 rounded-xl flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{erroLote}</span>
        </div>
      )}

      {/* Grid Content */}
      {videos.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="glass-panel border-2 border-dashed border-slate-300 hover:border-indigo-500/60 rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 group shadow-xs"
        >
          <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="font-display text-base font-bold text-slate-900 mb-1">Nenhum vídeo na biblioteca</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
            Clique aqui ou no botão acima para importar seus arquivos de vídeo e começar o processamento.
          </p>
        </div>
      ) : videosVisibles.length === 0 ? (
        <div className="glass-panel rounded-2xl border-2 border-dashed border-slate-300 p-14 text-center shadow-xs">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7" />
          </div>
          <h3 className="font-display text-base font-bold text-slate-900 mb-1">Nenhún vídeo concluído</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
            Os vídeos que terminen de processarse com un template aparecerán aquí, prontos pra Programar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {videosVisibles.map((video) => {
            const selecionado = selecionados.has(video.id);
            const redesVideo = video.redes || ['instagram', 'youtube'];
            return (
              <div
                key={video.id}
                onClick={() => alternarSelecao(video.id)}
                className={`group text-left rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer relative shadow-xs ${
                  selecionado
                    ? 'border-indigo-600 ring-2 ring-indigo-600/30 bg-indigo-50/20'
                    : 'border-slate-200 hover:border-slate-300 glass-card hover:-translate-y-1'
                }`}
              >
                <div className="aspect-[9/16] bg-slate-900 relative overflow-hidden">
                  {video.thumbnailUrl ? (
                    <img
                      src={urlArquivo(video.thumbnailUrl)}
                      alt={video.nomeOriginal}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                      <svg className="w-6 h-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-[10px]">Sem preview</span>
                    </div>
                  )}

                  {/* Finais do original: um mini-card por final (1 original → N
                      finais, um por template). Mostra thumbnail, template usado,
                      status e link pro vídeo final de CADA final. */}
                  {(() => {
                    const finalsDoOriginal = finais[video.id] || [];
                    if (finalsDoOriginal.length === 0) return null;
                    return (
                      <div
                        className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-end gap-1 p-1.5 bg-gradient-to-t from-slate-900/90 via-slate-900/45 to-transparent"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {finalsDoOriginal.map((f) => {
                          const pronto = f.status === 'concluido';
                          return (
                            <div
                              key={f.id}
                              title={`${f.templateNome || 'Final'} — ${pronto ? 'pronto pra agendar' : f.status}`}
                              className="flex items-center gap-1 rounded-lg bg-white/95 border border-white/70 shadow-sm px-1 py-0.5"
                            >
                              {f.thumbnailFinal ? (
                                <img
                                  src={urlArquivo(f.thumbnailFinal)}
                                  alt={f.templateNome || 'Final'}
                                  className="w-4 h-6 rounded object-cover"
                                />
                              ) : (
                                <span className="w-4 h-6 rounded bg-slate-200 flex items-center justify-center text-[7px] text-slate-500 font-black">
                                  FD
                                </span>
                              )}
                              {pronto && f.urlFinal ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    abrirPreview(video, f.id);
                                  }}
                                  title={`Preview do final • ${f.templateNome || 'Final'}`}
                                  className="text-[9px] font-extrabold text-indigo-700 hover:text-indigo-900 hover:underline leading-none max-w-[72px] truncate cursor-pointer"
                                >
                                  {f.templateNome || 'Final'}
                                </button>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-600 leading-none max-w-[72px] truncate">
                                  {f.templateNome || 'Final'}
                                </span>
                              )}
                              <StatusDot status={f.status} comRotulo={false} />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Platforms Icon Tag at Top-Left */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-1.5 py-1 rounded-lg border border-white/20">
                    {redesVideo.map((r) => (
                      <RedeIcon key={r} rede={r} className="w-3.5 h-3.5" colored={true} />
                    ))}
                  </div>

                  {/* Selection Overlay */}
                  {selecionado && (
                    <div className="absolute inset-0 bg-indigo-600/30 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-lg">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    </div>
                  )}

                  {/* Duration Tag */}
                  {video.duracaoSegundos != null && (
                    <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold bg-slate-900/80 text-white backdrop-blur-md px-1.5 py-0.5 rounded border border-white/20">
                      {video.duracaoSegundos}s
                    </span>
                  )}
                </div>

                <div className="p-2.5 flex items-center justify-between gap-2 border-t border-slate-100 bg-white">
                  <span className="text-[11px] font-semibold truncate text-slate-700 group-hover:text-indigo-600 transition-colors">
                    {video.nomeOriginal}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {video.status === 'processando' && (
                      <span className="text-[10px] font-mono font-bold text-indigo-600">{video.percentual || 0}%</span>
                    )}
                    {video.status === 'concluido' && (
                      <span className="text-[10px] font-extrabold text-emerald-600" title="Pronto pra publicar">✓</span>
                    )}
                    <StatusDot status={video.status} comRotulo={false} />
                  </span>
                </div>

                {/* Ações do card: Preview (modal interno) e Excluir */}
                <div
                  className="px-2 pb-2 flex items-center gap-1.5 bg-white border-t border-slate-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => abrirPreview(video)}
                    disabled={excluindoId === video.id}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 hover:text-indigo-800 transition-colors disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-current shrink-0" />
                    <span>Preview</span>
                  </button>
                  <button
                    onClick={() => iniciarExclusao(video)}
                    disabled={excluindoId === video.id}
                    title="Excluir vídeo (removerá também os finais)"
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 hover:text-rose-700 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Excluir</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Preview — player de vídeo interno (sem abrir nova aba) */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          onClick={fecharPreview}
        >
          <div
            className="w-full max-w-md bg-slate-950 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{preview.video.nomeOriginal}</p>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {preview.opcoes.find((o) => o.chave === preview.chave)?.label || 'Preview'}
                </p>
              </div>
              <button
                onClick={fecharPreview}
                className="shrink-0 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 flex items-center justify-center transition-colors"
                title="Fechar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {preview.opcoes.length > 1 && (
              <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto border-b border-white/10 bg-slate-900">
                {preview.opcoes.map((opcao) => {
                  const ativa = preview.chave === opcao.chave;
                  return (
                    <button
                      key={opcao.chave}
                      onClick={() => setPreview({ ...preview, chave: opcao.chave })}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                        ativa
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white/10 text-slate-300 hover:bg-white/20'
                      }`}
                    >
                      {opcao.tipo === 'original' ? (
                        <Play className="w-3 h-3" />
                      ) : (
                        <Zap className="w-3 h-3 fill-current" />
                      )}
                      <span>{opcao.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="aspect-[9/16] bg-black flex items-center justify-center">
              {preview.chave ? (
                <video
                  key={preview.chave}
                  src={preview.opcoes.find((o) => o.chave === preview.chave)?.url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-xs text-slate-500 font-medium px-4 text-center">
                  Nenhuma versão disponível para preview.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal de confirmação de exclusão */}
      {excluirAlvo &&
        (() => {
          const numeroFinais = (finais[excluirAlvo.id] || []).length;
          const processandoAinda =
            excluirAlvo.status === 'processando' || excluirAlvo.status === 'aguardando';
          return (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
              onClick={cancelarExclusao}
            >
              <div
                className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-slate-900">Excluir vídeo</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 break-words">
                      {excluirAlvo.nomeOriginal}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Tem certeza que deseja excluir este vídeo?
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    {numeroFinais > 0
                      ? `O registro da Biblioteca, ${numeroFinais} final(is) e todos os arquivos relacionados (vídeo, finais e thumbnails) serão removidos. Esta ação é irreversível.`
                      : 'O registro da Biblioteca e os arquivos relacionados (vídeo e thumbnail) serão removidos. Esta ação é irreversível.'}
                  </p>

                  {processandoAinda && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-2.5 rounded-xl">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        Este vídeo ainda está em processamento. A exclusão será bloqueada até que o
                        processamento termine (ou seja cancelado).
                      </span>
                    </div>
                  )}

                  {erroExclusao && (
                    <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-2.5 rounded-xl">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                      <span>{erroExclusao}</span>
                    </div>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/60">
                  <button
                    onClick={cancelarExclusao}
                    disabled={excluindoId !== null}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 px-4 py-2.5 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarExclusao}
                    disabled={excluindoId !== null}
                    className="flex items-center gap-2 text-xs bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-rose-600/20 transition-all transform active:scale-95 disabled:opacity-50"
                  >
                    {excluindoId === excluirAlvo.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
