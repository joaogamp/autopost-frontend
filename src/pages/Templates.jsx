import { useEffect, useState } from 'react';
import CaixaArrastavel from '../components/CaixaArrastavel';
import { listarTemplates, salvarTemplate, urlPreviewTemplate, excluirTemplate } from '../lib/api';
import ModalImportarCanva from '../components/ModalImportarCanva';

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
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-3xl font-bold">Templates</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setImportando(true)}
              className="text-sm border border-line px-4 py-2 rounded-md hover:bg-surface"
            >
              Importar do Canva
            </button>
            <button
              onClick={abrirNovo}
              className="text-sm bg-marquee text-base px-4 py-2 rounded-md font-medium hover:brightness-110"
            >
              + Novo template
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
          <div className="border border-dashed border-line rounded-lg py-16 text-center text-text-dim text-sm">
            Nenhum template ainda. Clique em "Novo template" pra criar o primeiro.
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="border border-line rounded-lg overflow-hidden bg-surface/40">
                <img src={urlPreviewTemplate(t.id)} alt={t.nome} className="w-full aspect-[9/16] object-cover" />
                <div className="p-2">
                  <p className="text-sm font-medium truncate">{t.nome}</p>
                  <div className="flex gap-2 mt-1">
                    {t.tipo !== 'importado' && (
                      <button onClick={() => abrirExistente(t)} className="text-xs text-marquee hover:underline">
                        Editar
                      </button>
                    )}
                    {t.tipo === 'importado' && <span className="text-xs text-text-dim">Importado</span>}
                    <button onClick={() => apagar(t.id)} className="text-xs text-status-erro hover:underline">
                      Excluir
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-3xl font-bold">
          {editando.id ? 'Editar template' : 'Novo template'}
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setEditando(null)} className="text-sm border border-line px-4 py-2 rounded-md hover:bg-surface">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="text-sm bg-marquee text-base px-4 py-2 rounded-md font-medium hover:brightness-110 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar template'}
          </button>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Canvas do editor */}
        <div
          className="relative shrink-0 rounded-md overflow-hidden border border-line"
          style={{ width: LARGURA_DISPLAY, height: ALTURA_DISPLAY, backgroundColor: editando.corFundo }}
        >
          {/* Área de vídeo */}
          <CaixaArrastavel
            area={editando.areaVideo}
            escala={ESCALA}
            cor="#4c8dff"
            rotulo="Vídeo"
            onChange={(nova) => setEditando({ ...editando, areaVideo: nova })}
          />

          {/* Logo */}
          {editando.logo && (
            <CaixaArrastavel
              area={editando.logo}
              escala={ESCALA}
              cor="#f2b705"
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
              cor="#2dd4bf"
              rotulo="Texto"
              onChange={(nova) => setEditando({ ...editando, texto: { ...editando.texto, ...nova } })}
              filho={
                <span
                  className="text-[10px] flex items-center justify-center w-full h-full text-center px-1"
                  style={{ color: editando.texto.cor }}
                >
                  Título gerado pela IA
                </span>
              }
            />
          )}
        </div>

        {/* Painel de controles */}
        <div className="flex-1 max-w-sm space-y-5">
          <div>
            <label className="text-xs text-text-dim block mb-1">Nome do template</label>
            <input
              value={editando.nome}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
              placeholder="Ex: Cineplay Review"
              className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee"
            />
          </div>

          <div>
            <label className="text-xs text-text-dim block mb-1">Cor de fundo do template</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={editando.corFundo}
                onChange={(e) => setEditando({ ...editando, corFundo: e.target.value })}
                className="w-10 h-10 rounded border border-line bg-transparent cursor-pointer"
              />
              <span className="text-sm text-text-dim">{editando.corFundo}</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-dim block mb-1">Logo</label>
            <label className="inline-block text-sm border border-line px-3 py-2 rounded-md cursor-pointer hover:bg-surface">
              {editando.logo ? 'Trocar imagem da logo' : 'Enviar logo'}
              <input type="file" accept="image/png,image/webp" hidden onChange={aoEscolherLogo} />
            </label>
            <p className="text-[11px] text-text-dim mt-1">
              Arraste a caixa dourada no canvas pra posicionar; puxe o cantinho pra redimensionar.
            </p>
          </div>

          <div>
            <label className="text-xs text-text-dim block mb-1">Texto dinâmico (título da IA)</label>
            <button
              onClick={alternarAreaTexto}
              className="text-sm border border-line px-3 py-2 rounded-md hover:bg-surface"
            >
              {editando.texto ? 'Remover área de texto' : '+ Adicionar área de texto'}
            </button>

            {editando.texto && (
              <div className="mt-3 flex items-center gap-4">
                <div>
                  <label className="text-[11px] text-text-dim block mb-1">Tamanho da fonte</label>
                  <input
                    type="number"
                    value={editando.texto.tamanhoFonte}
                    onChange={(e) =>
                      setEditando({ ...editando, texto: { ...editando.texto, tamanhoFonte: parseInt(e.target.value) || 42 } })
                    }
                    className="w-20 bg-surface border border-line rounded-md px-2 py-1 text-sm outline-none focus:border-marquee"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-dim block mb-1">Cor do texto</label>
                  <input
                    type="color"
                    value={editando.texto.cor}
                    onChange={(e) => setEditando({ ...editando, texto: { ...editando.texto, cor: e.target.value } })}
                    className="w-9 h-9 rounded border border-line bg-transparent cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-text-dim border-t border-line pt-3">
            A área azul (Vídeo) marca onde o vídeo processado vai encaixar — vale a mesma posição pra
            todos os vídeos que usarem esse template.
          </p>
        </div>
      </div>
    </div>
  );
}
