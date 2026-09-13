import { useState } from 'react';
import {
  Wand2,
  Type,
  Image as ImageIcon,
  LayoutTemplate,
  Eye,
  EyeOff,
  Trash2,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { CORES_FUNDO, criarConfigPadrao } from '../../lib/configEditorLote';

/**
 * EDITOR EM LOTE — coluna DIREITA: painel do editor (PainelEditor).
 *
 * TODOS os controles escrevem na CONFIG COMPARTILHADA do lote: não existe
 * configuração por vídeo e NÃO existe botão "Aplicar a todos" — cada mudança
 * de logo/texto/tela repinta o canvas e vale para TODOS os vídeos, na hora.
 *
 * Abas: Logo (upload + posição/tamanho/opacidade) · Texto (conteúdo, tamanho,
 * cor, posição — o processamento centraliza as linhas e usa a fonte bold do
 * sistema) · Tela (fundo, encaixe do vídeo, área do vídeo).
 */

const ABAS = [
  { id: 'logo', label: 'Logo', Icone: ImageIcon },
  { id: 'texto', label: 'Texto', Icone: Type },
  { id: 'canvas', label: 'Tela', Icone: LayoutTemplate },
];

/* ---------- controles base ---------- */

function Rotulo({ children, valor }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
        {children}
      </span>
      {valor !== undefined && (
        <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
          {valor}
        </span>
      )}
    </div>
  );
}

function Deslizador({ rotulo, valor, min, max, passo = 1, sufixo = '', aoMudar }) {
  return (
    <div>
      <Rotulo valor={`${valor}${sufixo}`}>{rotulo}</Rotulo>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="w-full accent-pink-500 cursor-pointer"
      />
    </div>
  );
}

function Alternar({ rotulo, ativo, aoMudar }) {
  return (
    <button
      type="button"
      onClick={() => aoMudar(!ativo)}
      className="edl-ring-foco edl-superficie w-full flex items-center justify-between px-3 py-2 rounded-lg"
      style={{ color: ativo ? 'var(--edl-texto)' : 'var(--edl-texto-mut)' }}
    >
      <span className="flex items-center gap-2 text-[11px] font-bold">
        {ativo ? <Eye className="w-3.5 h-3.5 edl-icone-a" /> : <EyeOff className="w-3.5 h-3.5 opacity-70" />}
        {rotulo}
      </span>
      <span
        className="relative w-8 h-[18px] rounded-full transition-colors shrink-0"
        style={{ background: ativo ? 'var(--edl-grad)' : '#2a2a35' }}
      >
        <span
          className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
          style={{ left: ativo ? 16 : 2 }}
        />
      </span>
    </button>
  );
}

export default function PainelEditor({ config, aoAtualizarConfig, itemSelecionado }) {
  const [aba, setAba] = useState('logo');

  const aoMudarLogo = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, [campo]: valor } }));
  const aoMudarTexto = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({ ...cfg, texto: { ...cfg.texto, [campo]: valor } }));
  const aoMudarCanvas = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({ ...cfg, canvas: { ...cfg.canvas, [campo]: valor } }));
  const aoMudarArea = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({ ...cfg, areaVideo: { ...cfg.areaVideo, [campo]: valor } }));

  function aoEscolherLogo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (config.logo.url && config.logo.url.startsWith('blob:')) URL.revokeObjectURL(config.logo.url);
    const url = URL.createObjectURL(arquivo);
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, url, arquivo, visivel: true } }));
    e.target.value = '';
    // Proporção real da imagem (altura/largura): o template do servidor usa
    // largura × altura em px — sem isso a altura do overlay seria um chute.
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        aoAtualizarConfig((cfg) => ({
          ...cfg,
          logo: { ...cfg.logo, alturaProporcao: img.naturalHeight / img.naturalWidth },
        }));
      }
    };
    img.src = url;
  }

  function aoRemoverLogo() {
    if (config.logo.url && config.logo.url.startsWith('blob:')) URL.revokeObjectURL(config.logo.url);
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, url: null, arquivo: null } }));
  }

  function aoRestaurar() {
    aoAtualizarConfig((cfg) => {
      const padrao = criarConfigPadrao();
      // Mantém a logo atual (re-enviar o arquivo é chato).
      return { ...padrao, logo: { ...padrao.logo, url: cfg.logo.url, arquivo: cfg.logo.arquivo } };
    });
  }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="px-4 pt-3.5 pb-3 border-b border-[color:var(--edl-borda)]">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 edl-icone-a" />
          <h2 className="font-display text-sm font-extrabold text-white">Editor</h2>
          <div className="flex-1" />
          {itemSelecionado ? (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full truncate max-w-[150px]"
              style={{ background: 'rgba(236,72,153,0.14)', color: 'var(--edl-rosa)' }}
              title={itemSelecionado.nome}
            >
              {itemSelecionado.nome}
            </span>
          ) : (
            <span className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
              nenhum vídeo selecionado
            </span>
          )}
        </div>
      </div>

      {/* Edição compartilhada — vale pro lote inteiro (sem "aplicar a todos") */}
      <div className="px-4 pt-3">
        <div
          className="rounded-lg px-3 py-2 flex items-start gap-2"
          style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)' }}
        >
          <Wand2 className="w-3.5 h-3.5 edl-icone-b shrink-0 mt-0.5" />
          <p className="text-[10px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-dim)' }}>
            Edição compartilhada: logo/texto valem{' '}
            <span className="edl-grad-texto font-extrabold">para todos os vídeos</span> do lote — a mudança é
            instantânea e vai pro template REAL do servidor ao processar.
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex px-2 mt-2 border-b border-[color:var(--edl-borda)]">
        {ABAS.map(({ id, label, Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`edl-ring-foco flex-1 flex items-center justify-center gap-1.5 text-[11px] font-extrabold py-2.5 ${
              aba === id ? 'edl-tab-ativa' : 'edl-tab'
            }`}
          >
            <Icone className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ABA LOGO */}
      {aba === 'logo' && (
        <div className="px-4 py-3.5 space-y-3.5">
          {config.logo.url ? (
            <div className="edl-superficie rounded-lg p-2.5 flex items-center gap-2.5">
              <div className="w-12 h-12 rounded-md bg-white flex items-center justify-center overflow-hidden shrink-0 p-1.5">
                <img
                  src={config.logo.url}
                  alt="Logo atual"
                  onLoad={(e) => {
                    const im = e.currentTarget;
                    if (im.naturalWidth > 0) {
                      const prop = im.naturalHeight / im.naturalWidth;
                      if (Math.abs((config.logo.alturaProporcao || 0) - prop) > 0.001) {
                        aoMudarLogo('alturaProporcao', prop);
                      }
                    }
                  }}
                  className="max-w-full max-h-full"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white truncate">
                  {config.logo.arquivo?.nome || 'Logo aplicada'}
                </p>
                <p className="text-[9px] font-semibold mt-0.5" style={{ color: 'var(--edl-texto-mut)' }}>
                  aplicada em todos os vídeos do lote
                </p>
              </div>
              <button
                type="button"
                onClick={aoRemoverLogo}
                title="Remover logo do lote"
                className="edl-ring-foco w-8 h-8 rounded-lg edl-superficie flex items-center justify-center shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 edl-icone-a" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="edl-input-logo"
              className="edl-ring-foco edl-superficie rounded-lg py-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer border border-dashed"
              style={{ borderColor: 'rgba(236,72,153,0.45)' }}
            >
              <Upload className="w-4 h-4 edl-icone-a" />
              <span className="text-[11px] font-bold text-white">Enviar logo</span>
              <span className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
                PNG/SVG com fundo transparente fica melhor
              </span>
            </label>
          )}
          <input id="edl-input-logo" type="file" accept="image/*" className="hidden" onChange={aoEscolherLogo} />
          {config.logo.url && (
            <label
              htmlFor="edl-input-logo"
              className="edl-botao-fantasma edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2 rounded-lg cursor-pointer"
            >
              <Upload className="w-3 h-3 edl-icone-b" />
              Trocar logo
            </label>
          )}

          <Deslizador rotulo="Posição X" sufixo="%" valor={Math.round(config.logo.x)} min={0} max={100} aoMudar={(v) => aoMudarLogo('x', v)} />
          <Deslizador rotulo="Posição Y" sufixo="%" valor={Math.round(config.logo.y)} min={0} max={100} aoMudar={(v) => aoMudarLogo('y', v)} />
          <Deslizador rotulo="Largura" sufixo="%" valor={Math.round(config.logo.largura)} min={2} max={60} aoMudar={(v) => aoMudarLogo('largura', v)} />
          <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(config.logo.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudarLogo('opacidade', v)} />
          <Alternar rotulo="Logo visível no lote" ativo={!!config.logo.visivel} aoMudar={(v) => aoMudarLogo('visivel', v)} />
        </div>
      )}
      {/* ABA TEXTO */}
      {aba === 'texto' && (
        <div className="px-4 py-3.5 space-y-3.5">
          <div>
            <Rotulo>Texto do lote</Rotulo>
            <textarea
              value={config.texto.conteudo}
              onChange={(e) => aoMudarTexto('conteudo', e.target.value)}
              rows={3}
              placeholder="Escreve o texto que vai em todos os vídeos..."
              className="edl-input w-full text-[12px] font-medium px-2.5 py-2 resize-none leading-relaxed"
            />
          </div>

          <p className="text-[9px] font-semibold" style={{ color: 'var(--edl-texto-mut)' }}>
            No vídeo final as linhas ficam centralizadas (fonte bold do sistema), igual à prévia.
          </p>

          <Deslizador rotulo="Tamanho" sufixo="px" valor={config.texto.tamanho} min={16} max={160} aoMudar={(v) => aoMudarTexto('tamanho', v)} />

          <div>
            <Rotulo>Cor</Rotulo>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.texto.cor}
                onChange={(e) => aoMudarTexto('cor', e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-[color:var(--edl-borda)] p-0.5"
              />
              <input
                type="text"
                value={config.texto.cor}
                spellCheck={false}
                onChange={(e) => {
                  if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) aoMudarTexto('cor', e.target.value);
                }}
                className="edl-input flex-1 text-[11px] font-mono px-2.5 py-2 uppercase"
              />
            </div>
          </div>

          <Deslizador rotulo="Posição X" sufixo="%" valor={Math.round(config.texto.x)} min={0} max={100} aoMudar={(v) => aoMudarTexto('x', v)} />
          <Deslizador rotulo="Posição Y" sufixo="%" valor={Math.round(config.texto.y)} min={0} max={100} aoMudar={(v) => aoMudarTexto('y', v)} />
          <Deslizador rotulo="Largura do bloco" sufixo="%" valor={Math.round(config.texto.largura)} min={20} max={100} aoMudar={(v) => aoMudarTexto('largura', v)} />
          <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(config.texto.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudarTexto('opacidade', v)} />
          <Alternar rotulo="Texto visível no lote" ativo={!!config.texto.visivel} aoMudar={(v) => aoMudarTexto('visivel', v)} />
        </div>
      )}

      {/* ABA TELA (canvas + área do vídeo) */}
      {aba === 'canvas' && (
        <div className="px-4 py-3.5 space-y-3.5">
          <div>
            <Rotulo>Cor de fundo do canvas</Rotulo>
            <div className="flex items-center gap-1.5 flex-wrap">
              {CORES_FUNDO.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => aoMudarCanvas('corFundo', c)}
                  className={`w-7 h-7 rounded-lg border-2 transition-colors ${
                    config.canvas.corFundo === c
                      ? 'border-[color:var(--edl-rosa)]'
                      : 'border-[color:var(--edl-borda)]'
                  }`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={config.canvas.corFundo}
                onChange={(e) => aoMudarCanvas('corFundo', e.target.value)}
                title="Cor personalizada"
                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-2 border-[color:var(--edl-borda)] p-0"
              />
            </div>
          </div>

          <div>
            <Rotulo>Encaixe do vídeo na área</Rotulo>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'cobrir', titulo: 'Preenche a área inteira (pode cortar bordas)' },
                { id: 'ajustar', titulo: 'Cabe inteiro dentro da área (barras laterais)' },
              ].map(({ id, titulo }) => {
                const ativo = (config.areaVideo.fit || 'cobrir') === id;
                return (
                  <button
                    key={id}
                    type="button"
                    title={titulo}
                    onClick={() => aoMudarArea('fit', id)}
                    className={`edl-ring-foco h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-colors ${
                      ativo ? 'edl-botao-grad' : 'edl-superficie'
                    }`}
                    style={ativo ? undefined : { color: 'var(--edl-texto-dim)' }}
                  >
                    {id === 'cobrir' ? 'Cobrir' : 'Ajustar'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-1">
            <Rotulo>Área do vídeo (px do canvas)</Rotulo>
            <div className="edl-superficie rounded-lg p-3 space-y-3">
              <Deslizador rotulo="X" sufixo="px" valor={config.areaVideo.x} min={0} max={500} aoMudar={(v) => aoMudarArea('x', v)} />
              <Deslizador rotulo="Y" sufixo="px" valor={config.areaVideo.y} min={0} max={1200} aoMudar={(v) => aoMudarArea('y', v)} />
              <Deslizador rotulo="Largura" sufixo="px" valor={config.areaVideo.largura} min={100} max={1080} aoMudar={(v) => aoMudarArea('largura', v)} />
              <Deslizador rotulo="Altura" sufixo="px" valor={config.areaVideo.altura} min={100} max={1920} aoMudar={(v) => aoMudarArea('altura', v)} />
              <Alternar
                rotulo="Marcação da área"
                ativo={!!config.areaVideo.mostrarMarcacao}
                aoMudar={(v) => aoMudarArea('mostrarMarcacao', v)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={aoRestaurar}
            className="edl-botao-fantasma edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2.5 rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5 edl-icone-a" />
            Restaurar padrão (mantém a logo)
          </button>
        </div>
      )}
    </div>
  );
}