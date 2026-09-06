import { useEffect, useState } from 'react';
import CaixaArrastavel from '../components/CaixaArrastavel';
import { listarTemplates, salvarTemplate, urlPreviewTemplate, excluirTemplate } from '../lib/api';
import ModalImportarCanva from '../components/ModalImportarCanva';
import { Plus, Download, Trash2, Edit3, Save, Image, Type, Lightbulb, Layers } from 'lucide-react';

const CANVAS_LARGURA = 1080;
const CANVAS_ALTURA = 1920;
const LARGURA_DISPLAY = 260; // px na tela
const ESCALA = LARGURA_DISPLAY / CANVAS_LARGURA;
const ALTURA_DISPLAY = CANVAS_ALTURA * ESCALA;

function novoTemplateEmBranco() {
  return {
    id: null,
    nome: '',
    corFundo: '#15131A',
    areaVideo: { x: 90, y: 300, largura: 900, altura: 1200 },
    logo: null, // { x, y, largura, altura }
    texto: null, // { x, y, largura, altura, tamanhoFonte, cor }
  };
}

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [editando, setEditando] = useState(null); // null = lista; objeto = editor aberto
  const [arquivoLogo, setArquivoLogo] = useState(null);
  const [previewLogoUrl, setPreviewLogoUrl] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);

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
  }

  function abrirExistente(template) {
    setEditando({ ...template });
    setArquivoLogo(null);
    setPreviewLogoUrl(template.logo?.url ? `http://localhost:3333${template.logo.url}` : null);
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
        canvasLargura: CANVAS_LARGURA,
        canvasAltura: CANVAS_ALTURA,
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
                  <img
                    src={urlPreviewTemplate(t.id)}
                    alt={t.nome}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
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
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    {t.tipo !== 'importado' ? (
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
      </div>
    );
  }

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
            <span>Canvas: 1080 × 1920 (Visualização 9:16)</span>
          </div>

          <div
            className="relative shrink-0 rounded-xl overflow-hidden border-2 border-slate-300 shadow-xl ring-1 ring-black/5"
            style={{ width: LARGURA_DISPLAY, height: ALTURA_DISPLAY, backgroundColor: editando.corFundo }}
          >
            {/* Área de vídeo */}
            <CaixaArrastavel
              area={editando.areaVideo}
              escala={ESCALA}
              cor="#2563eb"
              rotulo="Vídeo"
              onChange={(nova) => setEditando({ ...editando, areaVideo: nova })}
            />

            {/* Logo */}
            {editando.logo && (
              <CaixaArrastavel
                area={editando.logo}
                escala={ESCALA}
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
                escala={ESCALA}
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
