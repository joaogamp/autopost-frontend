import { useEffect, useRef, useState } from 'react';
import CaixaArrastavel from '../components/CaixaArrastavel';
import ListaProgreso from '../components/ListaProgreso';
import { listarTemplates, salvarTemplate, urlPreviewTemplate, excluirTemplate, enviarVideos, processarLote, urlArquivo } from '../lib/api';
import ModalImportarCanva from '../components/ModalImportarCanva';
import { Plus, Download, Trash2, Edit3, Save, Image, Type, Lightbulb, Layers, Zap, Upload } from 'lucide-react';

const CANVAS_LARGURA = 1080;
const CANVAS_ALTURA = 1920;
const LARGURA_DISPLAY = 260; // px na tela
const ESCALA = LARGURA_DISPLAY / CANVAS_LARGURA;
const ALTURA_DISPLAY = CANVAS_ALTURA * ESCALA;

// Aspecto da miniatura do card na lista (`aspect-[9/16]`). Usado só para
// replicar o recorte do `object-cover`; não depende da resolução da tela.
const THUMB_ASPECTO_LARGURA = 9;
const THUMB_ASPECTO_ALTURA = 16;

/**
 * Mapea a areaVideo do template (coordenadas reais do canvas, ex: 1080×1920)
 * sobre a miniatura do card, que exibe o design com `object-cover`. Para
 * canvas que não coincidem com o aspecto 9:16 da miniatura, o cover recorta
 * a imagem centrada — aqui calculamos EXACTAMENTE essa região visível pra
 * que a marcação caiga sobre o ponto certo, sem valores fixos.
 * Retorna um style em % pronto pra um div absoluto (ou null se não há área).
 */
function estiloAreaSobreThumbnail(template, propLargura, propAltura) {
  const area = template.areaVideo;
  const canvasLargura = template.canvasLargura || CANVAS_LARGURA;
  const canvasAltura = template.canvasAltura || CANVAS_ALTURA;
  if (
    !area ||
    typeof area.x !== 'number' ||
    typeof area.y !== 'number' ||
    !(area.largura > 0) ||
    !(area.altura > 0)
  ) {
    return null;
  }

  // Geometría do object-cover em unidades relativas ao contenedor.
  const escala = Math.max(propLargura / canvasLargura, propAltura / canvasAltura);
  const imgLargura = canvasLargura * escala;
  const imgAltura = canvasAltura * escala;
  const offsetX = (propLargura - imgLargura) / 2;
  const offsetY = (propAltura - imgAltura) / 2;

  const left = offsetX + (area.x / canvasLargura) * imgLargura;
  const top = offsetY + (area.y / canvasAltura) * imgAltura;

  return {
    left: `${(left / propLargura) * 100}%`,
    top: `${(top / propAltura) * 100}%`,
    width: `${(area.largura / canvasLargura) * (imgLargura / propLargura) * 100}%`,
    height: `${(area.altura / canvasAltura) * (imgAltura / propAltura) * 100}%`,
  };
}

/** Camada visual sobre a miniatura: azul semitransparente + rótulo centrado. */
function marcacaoAreaVideoCard(template) {
  const estilo = estiloAreaSobreThumbnail(template, THUMB_ASPECTO_LARGURA, THUMB_ASPECTO_ALTURA);
  if (!estilo) return null;
  return (
    <div
      className="absolute pointer-events-none overflow-hidden flex items-center justify-center"
      style={{
        ...estilo,
        backgroundColor: 'rgba(37, 99, 235, 0.35)',
        border: '1px dashed rgba(37, 99, 235, 0.9)',
      }}
    >
      <span
        className="text-[9px] font-black tracking-wide text-white text-center px-0.5 leading-tight pointer-events-none"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
      >
        ÁREA DO VÍDEO
      </span>
    </div>
  );
}

/**
 * Define se um template pode ser editado no editor visual.
 * - Templates do editor (sem `tipo`): sempre editáveis.
 * - Templates importados do Canva (`tipo === 'importado'`): também editáveis —
 *   o editor renderiza o design original (overlay PNG) como fundo do canvas pra
 *   reposicionar a área de vídeo, e o backend preserva `tipo`/`overlayPath` ao
 *   salvar (ver POST /api/templates). Importados sem `overlayPath` (design
 *   irrecuperável) ficam bloqueados, exibindo o rótulo "Importado".
 */
function podeEditarTemplate(t) {
  if (!t) return false;
  return t.tipo !== 'importado' || !!t.overlayPath;
}

function novoTemplateEmBranco() {
  return {
    id: null,
    nome: '',
    corFundo: '#15131A',
canvasLargura: CANVAS_LARGURA,
    canvasAltura: CANVAS_ALTURA,
    areaVideo: { x: 90, y: 300, largura: 900, altura: 1200, fit: 'cobrir', detectarContenido: false },
    logo: null, // { x, y, largura, altura }
    texto: null, // { x, y, largura, altura, tamanhoFonte, cor }
  };
}

export default function Templates({ aoMudarPagina = null }) {
  const [templates, setTemplates] = useState([]);
  const [editando, setEditando] = useState(null); // null = lista; objeto = editor aberto
  const [arquivoLogo, setArquivoLogo] = useState(null);
  const [previewLogoUrl, setPreviewLogoUrl] = useState(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  // Fluxo "Aplicar este template"
  const [aplicandoTemplate, setAplicandoTemplate] = useState(null); // { id, nome } | null
  const [lote, setLote] = useState(null); // { ids, terminado } | null
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [erroAplicar, setErroAplicar] = useState('');
  const [resumenLote, setResumenLote] = useState(null); // { total, concluido, erro } | null
  const inputVideosRef = useRef(null);

  async function carregar() {
    setTemplates(await listarTemplates());
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirNovo() {
    setEditando(novoTemplateEmBranco());
    setArquivoLogo(null);
    setPreviewLogoUrl(null);
    setPreviewVideoUrl(null);
  }

  function abrirExistente(template) {
    // Compatibilidad: templates guardados sin las opciones nuevas reciben
    // los valores por defecto (comportamiento actual: cubrir, sin detección).
    const areaVideo = {
      fit: 'cobrir',
      detectarContenido: false,
      ...(template.areaVideo || {}),
    };
    setEditando({ ...template, areaVideo });
    setArquivoLogo(null);
    setPreviewLogoUrl(template.logo?.url ? urlArquivo(template.logo.url) : null);
    setPreviewVideoUrl(null);
  }

  function aoEscolherLogo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setArquivoLogo(arquivo);
    setPreviewLogoUrl(URL.createObjectURL(arquivo));
    if (!editando.logo) {
      setEditando({ ...editando, logo: { x: 40, y: 60, largura: 260, altura: 100 } });
    }
  }

  // Preview LOCAL (solo navegador) para ver cómo encajará el vídeo en la zona,
  // respetando el modo Cubrir/Ajustar. No se sube al servidor.
  function aoElegirPreviewVideo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setPreviewVideoUrl(URL.createObjectURL(arquivo));
    e.target.value = '';
  }

  function alternarAreaTexto() {
    setEditando({
      ...editando,
      texto: editando.texto
        ? null
        : { x: 90, y: 1550, largura: 900, altura: 220, tamanhoFonte: 48, cor: '#FFFFFF' },
    });
  }

  async function salvar() {
    if (!editando.nome.trim()) return alert('Dá um nome pro template primeiro.');
    setSalvando(true);
    await salvarTemplate(
      {
        id: editando.id,
        nome: editando.nome,
        corFundo: editando.corFundo,
        canvasLargura: editando.canvasLargura || CANVAS_LARGURA,
        canvasAltura: editando.canvasAltura || CANVAS_ALTURA,
        areaVideo: editando.areaVideo,
        logoPosicao: editando.logo,
        texto: editando.texto,
      },
      arquivoLogo
    );
    setSalvando(false);
    setEditando(null);
    carregar();
  }

  async function apagar(id) {
    if (!confirm('Excluir esse template?')) return;
    await excluirTemplate(id);
    carregar();
  }

  // ---------- FLUXO "APLICAR TEMPLATE" ----------
  function abrirAplicar(template) {
    setAplicandoTemplate({ id: template.id, nome: template.nome });
    setLote(null);
    setErroAplicar('');
    setResumenLote(null);
  }

  function cerrarAplicar() {
    setAplicandoTemplate(null);
    setLote(null);
    setErroAplicar('');
    setResumenLote(null);
  }

  async function aoAplicarVideos(e) {
    const arquivos = Array.from(e.target.files || []);
    if (arquivos.length === 0 || !aplicandoTemplate) return;
    setEnviandoLote(true);
    setErroAplicar('');
    try {
      // 1) Envía os vídeos (vão a Biblioteca como "aguardando")
      const { videos } = await enviarVideos(arquivos);
      // 2) Dispara o lote com ESTE template (nunca hardcoded)
      const lista = videos.map((v) => ({
        bibliotecaId: v.id,
        tituloIA: v.nomeOriginal.replace(/\.[^.]+$/, ''),
      }));
      const resultado = await processarLote(aplicandoTemplate.id, lista);
      setLote({ ids: resultado.ids || [], terminado: false });
    } catch (err) {
      setErroAplicar(err.message || 'Erro ao enviar/processar os vídeos.');
    } finally {
      setEnviandoLote(false);
      e.target.value = '';
    }
  }

  function aoTerminarLote(items) {
    const concluido = items.filter((it) => it.status === 'concluido').length;
    setResumenLote({ total: items.length, concluido, erro: items.length - concluido });
    setLote((actual) => (actual ? { ...actual, terminado: true } : actual));
  }

  // ---------- TELA DE LISTA ----------
  if (!editando) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Templates</h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">Crie e configure layouts visuais para sobreposição em vídeos</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setImportando(true)}
              className="text-xs bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl font-bold transition-all shadow-xs flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Importar do Canva</span>
            </button>
            <button
              onClick={abrirNovo}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all transform active:scale-95 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Novo template</span>
            </button>
          </div>
        </div>

        {importando && (
          <ModalImportarCanva
            onFechar={() => setImportando(false)}
            onImportado={() => {
              setImportando(false);
              carregar();
            }}
          />
        )}

        {templates.length === 0 ? (
          <div className="glass-panel border-2 border-dashed border-slate-300 rounded-2xl p-16 text-center shadow-xs bg-white">
            <div className="w-14 h-14 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="font-display text-base font-bold text-slate-900 mb-1">Nenhum template encontrado</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-6 font-medium">
              Crie um novo template visual do zero ou importe um design pronto exportado do Canva.
            </p>
            <button
              onClick={abrirNovo}
              className="text-xs bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-xl shadow-md hover:bg-indigo-700 transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Criar primeiro template</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {templates.map((t) => (
              <div
                key={t.id}
                className="glass-card rounded-xl overflow-hidden border border-slate-200 hover:border-slate-300 transition-all duration-200 transform hover:-translate-y-1 shadow-xs group"
              >
                <div className="aspect-[9/16] bg-slate-900 relative overflow-hidden">
                  <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
                    <img
                      src={urlPreviewTemplate(t.id)}
                      alt={t.nome}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Overlay de visualização: marcação da areaVideo salva (X/Y/largura/altura reais do canvas) */}
                    {marcacaoAreaVideoCard(t)}
                  </div>
                  {t.tipo === 'importado' && (
                    <span className="absolute top-2 right-2 text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 backdrop-blur-md font-semibold">
                      Canva
                    </span>
                  )}
                </div>

                <div className="p-3 border-t border-slate-100 bg-white">
                  <p className="text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors mb-2">
                    {t.nome}
                  </p>
                  <button
                    onClick={() => abrirAplicar(t)}
                    className="w-full text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Aplicar este template</span>
                  </button>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 mt-1">
                    {podeEditarTemplate(t) ? (
                      <button
                        onClick={() => abrirExistente(t)}
                        className="text-indigo-600 hover:text-indigo-700 hover:underline text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 font-medium">Importado</span>
                    )}
                    <button
                      onClick={() => apagar(t.id)}
                      className="text-rose-600 hover:text-rose-700 hover:underline text-[11px] font-semibold flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {aplicandoTemplate && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-panel rounded-2xl p-6 max-w-xl w-full border border-slate-200 shadow-xl space-y-5 relative bg-white">
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">Aplicar template</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
                    “{aplicandoTemplate.nome}” será aplicado tal qual — o vídeo não se edita: nada de cortes,
                    filtros, legendas, áudio ou duração alterados.
                  </p>
                </div>
                <button
                  onClick={cerrarAplicar}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Cerrar"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!lote ? (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    Selecciona uno o varios vídeos. Se enviarán e entrarán na fila de processamento com este
                    template. Os concluídos ficam guardados automáticamente na <b>Biblioteca</b>, listos pra
                    <b>Programar</b>.
                  </p>

                  {erroAplicar && (
                    <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">
                      {erroAplicar}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={cerrarAplicar}
                      className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl transition-all shadow-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => inputVideosRef.current?.click()}
                      disabled={enviandoLote}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{enviandoLote ? 'Enviando...' : 'Seleccionar vídeos'}</span>
                    </button>
                    <input
                      ref={inputVideosRef}
                      type="file"
                      accept="video/*"
                      multiple
                      hidden
                      onChange={aoAplicarVideos}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <ListaProgreso ids={lote.ids} onTerminado={aoTerminarLote} />

                  {resumenLote && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 flex items-start gap-2">
                      <span className="shrink-0">✓</span>
                      <span>
                        Lote terminado: {resumenLote.concluido} concluído(s), {resumenLote.erro} com erro.
                        Os vídeos concluídos já estão na <b>Biblioteca</b>.
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={cerrarAplicar}
                      className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl transition-all shadow-xs"
                    >
                      Cerrar
                    </button>
                    <button
                      onClick={() => aoMudarPagina?.('biblioteca')}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Ir a Biblioteca → Programar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

// Dimensões reais do canvas: templates importados do Canva podem ter
  // resolução diferente de 1080x1920 — usa a do template quando existir.
  const canvasLargura = editando.canvasLargura || CANVAS_LARGURA;
  const canvasAltura = editando.canvasAltura || CANVAS_ALTURA;
  const escala = LARGURA_DISPLAY / canvasLargura;
  const alturaDisplay = canvasAltura * escala;
  // ---------- TELA DO EDITOR ----------
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">
            {editando.id ? 'Editar template' : 'Novo template'}
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">Ajuste as posições de vídeo, logo e texto no canvas do template</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditando(null)}
            className="text-xs bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl font-bold transition-all shadow-xs"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{salvando ? 'Salvando...' : 'Salvar template'}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Canvas Studio Container */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-200 shadow-sm bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] flex flex-col items-center justify-center relative bg-white">
          <div className="text-[10px] font-mono font-semibold text-slate-500 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600" />
            <span>Canvas: {canvasLargura} × {canvasAltura}</span>
          </div>

          <div
            className="relative shrink-0 rounded-xl overflow-hidden border-2 border-slate-300 shadow-xl ring-1 ring-black/5"
            style={{ width: LARGURA_DISPLAY, height: alturaDisplay, backgroundColor: editando.corFundo }}
          >
{/* Fundo do template importado do Canva: mostra o design real pra posicionar a área de vídeo por cima */}
            {editando.tipo === 'importado' && editando.id && (
              <img
                src={urlPreviewTemplate(editando.id)}
                alt=""
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ objectFit: 'fill' }}
              />
            )}
            {/* Área de vídeo */}
            <CaixaArrastavel
              area={editando.areaVideo}
              escala={escala}
              cor="#2563eb"
              rotulo="Vídeo"
              onChange={(nova) => setEditando({ ...editando, areaVideo: nova })}
              filho={
                <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
                  {previewVideoUrl && (
                    <img
                      src={previewVideoUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ objectFit: editando.areaVideo.fit === 'ajustar' ? 'contain' : 'cover' }}
                    />
                  )}
                  <div
                    className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none"
                    style={{ backgroundColor: 'rgba(37, 99, 235, 0.35)' }}
                  >
                    <span
                      className="text-[11px] font-black tracking-wide text-white text-center px-1 leading-tight pointer-events-none"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
                    >
                      ÁREA DO VÍDEO
                    </span>
                  </div>
                </div>
              }
            />

            {/* Logo */}
            {editando.logo && (
              <CaixaArrastavel
                area={editando.logo}
                escala={escala}
                cor="#d97706"
                rotulo="Logo"
                onChange={(nova) => setEditando({ ...editando, logo: nova })}
                filho={
                  previewLogoUrl ? (
                    <img src={previewLogoUrl} className="w-full h-full object-contain pointer-events-none" />
                  ) : null
                }
              />
            )}

            {/* Área de texto */}
            {editando.texto && (
              <CaixaArrastavel
                area={editando.texto}
                escala={escala}
                cor="#059669"
                rotulo="Texto"
                onChange={(nova) => setEditando({ ...editando, texto: { ...editando.texto, ...nova } })}
                filho={
                  <span
                    className="text-[10px] flex items-center justify-center w-full h-full text-center px-1 font-bold"
                    style={{ color: editando.texto.cor }}
                  >
                    Título gerado pela IA
                  </span>
                }
              />
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div className="flex-1 max-w-md space-y-6 glass-panel p-6 rounded-2xl border border-slate-200 shadow-sm bg-white">
          <h3 className="font-display text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
            Propriedades do Layout
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Nome do template</label>
              <input
                value={editando.nome}
                onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                placeholder="Ex: Cineplay Review"
                className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-600 transition-all font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Cor de fundo do template</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editando.corFundo}
                  onChange={(e) => setEditando({ ...editando, corFundo: e.target.value })}
                  className="w-10 h-10 rounded-xl border border-slate-200 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
                  {editando.corFundo}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200/80 pt-4 space-y-3">
              <label className="text-xs font-bold text-slate-600 block">Zona del vídeo (X · Y · tamaño)</label>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                Arrastra la caja azul en el canvas o edita los números. Vale igual para todos los vídeos procesados con este template.
              </p>

              {/* Modo de encaje */}
              <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
                <button
                  onClick={() => setEditando({ ...editando, areaVideo: { ...editando.areaVideo, fit: 'cobrir' } })}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-1 ${
                    editando.areaVideo.fit !== 'ajustar'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Cubrir
                </button>
                <button
                  onClick={() => setEditando({ ...editando, areaVideo: { ...editando.areaVideo, fit: 'ajustar' } })}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-1 ${
                    editando.areaVideo.fit === 'ajustar'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Ajustar
                </button>
              </div>

              {/* Coordenadas / tamaño */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['x', 'X'],
                  ['y', 'Y'],
                  ['largura', 'Anchura'],
                  ['altura', 'Altura'],
                ].map(([campo, rotulo]) => (
                  <div key={campo}>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1">{rotulo}</label>
                    <input
                      type="number"
                      value={editando.areaVideo[campo]}
                      onChange={(e) => {
                        const valor = parseInt(e.target.value, 10);
                        if (Number.isNaN(valor)) return;
                        setEditando({ ...editando, areaVideo: { ...editando.areaVideo, [campo]: valor } });
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-600 font-mono font-medium"
                    />
                  </div>
                ))}
              </div>

              {/* Detección automática de la región útil */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editando.areaVideo.detectarContenido === true}
                  onChange={(e) =>
                    setEditando({ ...editando, areaVideo: { ...editando.areaVideo, detectarContenido: e.target.checked } })
                  }
                  className="mt-0.5 accent-indigo-600"
                />
                <span className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  <b>Detectar área útil del vídeo automáticamente.</b> Analiza cada vídeo de entrada y recorta
                  barras, logos, marcas e interfaces de redes antes de encajarlo. Si no detecta nada con confianza,
                  usa el vídeo completo.
                </span>
              </label>

              {/* Preview local */}
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">Probar con una imagen</label>
                <label className="inline-flex items-center gap-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer transition-all shadow-xs">
                  <Image className="w-4 h-4 text-indigo-600" />
                  <span>{previewVideoUrl ? 'Cambiar imagen' : 'Elegir imagen'}</span>
                  <input type="file" accept="image/*" hidden onChange={aoElegirPreviewVideo} />
                </label>
                {previewVideoUrl && (
                  <button
                    onClick={() => setPreviewVideoUrl(null)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline px-2 py-1 rounded-lg ml-2"
                  >
                    Quitar preview
                  </button>
                )}
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed font-medium">
                  Preview solo visual (navegador): muestra cómo encajará el vídeo. Cubrir recorta para llenar;
                  Ajustar centra con el color de fondo del template.
                </p>
              </div>
            </div>

{editando.tipo !== 'importado' && (
            <div className="border-t border-slate-200/80 pt-4">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Imagem da Logo</label>
              <label className="inline-flex items-center gap-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl cursor-pointer transition-all shadow-xs">
                <Image className="w-4 h-4 text-indigo-600" />
                <span>{editando.logo ? 'Trocar imagem da logo' : 'Enviar logo'}</span>
                <input type="file" accept="image/png,image/webp" hidden onChange={aoEscolherLogo} />
              </label>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed font-medium">
                Arraste a caixa amarela no canvas para posicionar; puxe o canto inferior direito para redimensionar.
              </p>
            </div>
            )}

            <div className="border-t border-slate-200/80 pt-4">
              <label className="text-xs font-bold text-slate-600 block mb-1.5">Texto dinâmico (título da IA)</label>
              <button
                onClick={alternarAreaTexto}
                className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-xs"
              >
                <Type className="w-4 h-4 text-indigo-600" />
                <span>{editando.texto ? 'Remover área de texto' : '+ Adicionar área de texto'}</span>
              </button>

              {editando.texto && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Tamanho da fonte</label>
                    <input
                      type="number"
                      value={editando.texto.tamanhoFonte}
                      onChange={(e) =>
                        setEditando({ ...editando, texto: { ...editando.texto, tamanhoFonte: parseInt(e.target.value) || 42 } })
                      }
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-600 font-mono font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Cor do texto</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editando.texto.cor}
                        onChange={(e) => setEditando({ ...editando, texto: { ...editando.texto, cor: e.target.value } })}
                        className="w-8 h-8 rounded border border-slate-200 bg-transparent cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-slate-600 font-semibold">{editando.texto.cor}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-500 border-t border-slate-200 pt-4 leading-relaxed font-medium flex items-start gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              A área azul (Vídeo) marca onde o vídeo processado vai encaixar — vale a mesma posição para todos os vídeos que usarem este template.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
