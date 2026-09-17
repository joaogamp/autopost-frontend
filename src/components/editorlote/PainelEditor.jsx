import { useEffect, useRef, useState } from 'react';
import { Type, Film, Eye, EyeOff, Trash2, Upload, RotateCcw, AlertCircle, X, BadgeCheck, ImagePlus, Scan, Image as ImageIcon } from 'lucide-react';
import BotaoEmoji from './BotaoEmoji';
import {
  CORES_FUNDO,
  criarConfigPadrao,
  criarIdentidadePadrao,
  criarImagemPadrao,
  CORTE_MAXIMO,
  corteEfetivoDoVideo,
  atualizarCorteNoConfig,
  FONTES_TEXTO,
  PESOS_TEXTO,
  ALINEACIONES_TEXTO,
} from '../../lib/configEditorLote';
import PainelDownloads from './PainelDownloads';
import ListaVideos from './ListaVideos';

/**
 * EDITOR EM LOTE — COLUNA ESQUERDA: "Adicionar elementos" + configuração do
 * elemento selecionado (o Preview central fica SEMPRE visível; nada é
 * substituído por tela branca).
 *
 *  - "Adicionar elementos": Logo · Texto · Imagem · Vídeo (um caminho único
 *    por funcionalidade — sem dois botões de logo, sem dois sistemas de texto);
 *  - abaixo, a CONFIGURAÇÃO do elemento selecionado (camada selecionada no
 *    painel de Camadas ou clicada direto no Preview);
 *  - textos/imagem/vídeo abrem POPUPS PEQUENOS ancorados neste painel — nunca
 *    cobrem o Preview;
 *  - posição/tamanho são 100% mouse no Preview: AQUI não existe X/Y, slider de
 *    posição nem campo numérico de coordenada (só estilo e escala/opacidade).
 *
 * Toda escrita vai para a CONFIG COMPARTILHADA do lote (um único estado):
 * mudar qualquer coisa repinta o canvas e vale para todos os vídeos, na hora.
 */

/* ---------- controles base (tema escuro edl-) ---------- */

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
        style={{ background: ativo ? 'var(--edl-grad)' : 'rgba(255,255,255,0.15)' }}
      >
        <span className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all shadow" style={{ left: ativo ? 16 : 2 }} />
      </span>
    </button>
  );
}

function LinhaAcoes({ children }) {
  return <div className="flex items-center gap-1.5 flex-wrap">{children}</div>;
}

function BotaoPequeno({ children, onClick, icone: Icone, tom = 'neutro', title }) {
  const classe =
    tom === 'perigo'
      ? 'border-rose-500/40 text-rose-300 hover:text-rose-200 hover:border-rose-400/70'
      : tom === 'destaque'
        ? 'border-transparent text-white'
        : 'border-[color:var(--edl-borda)] text-[color:var(--edl-texto-dim)] hover:text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`edl-ring-foco flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${classe}`}
      style={tom === 'destaque' ? { background: 'var(--edl-grad)' } : undefined}
    >
      {Icone ? <Icone className="w-3 h-3" /> : null}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * BLOCOS DE CONFIGURAÇÃO POR ELEMENTO
 * Nenhum campo de POSIÇÃO (x/y) em lugar algum: mover/redimensionar é 100%
 * mouse no Preview. Aqui só conteúdo, estilo, largura/escala e visibilidade.
 * ------------------------------------------------------------------------- */

/** Atualiza UM campo de um bloco de texto da arte (superior/inferior). */
function mudarTexto(aoAtualizarConfig, chave, campo, valor) {
  aoAtualizarConfig((cfg) => ({
    ...cfg,
    textos: {
      ...cfg.textos,
      [chave]: {
        ...(cfg.textos?.[chave] || {}),
        [campo]: valor,
        // Opt-in ao digitar: conteúdo não vazio liga o elemento.
        ...(campo === 'conteudo' && String(valor || '').trim() !== '' ? { visivel: true } : null),
      },
    },
  }));
}

function SelecaoTipografia({ t, aoMudar }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Rotulo>Fonte</Rotulo>
          <select
            value={t.fonte}
            onChange={(e) => aoMudar('fonte', e.target.value)}
            className="edl-input w-full text-[11px] font-semibold px-2 py-1.5 rounded-lg outline-none"
          >
            {FONTES_TEXTO.map((f) => (
              <option key={f.id} value={f.id}>{f.rotulo}</option>
            ))}
          </select>
        </div>
        <div>
          <Rotulo>Peso</Rotulo>
          <select
            value={t.peso}
            onChange={(e) => aoMudar('peso', e.target.value)}
            className="edl-input w-full text-[11px] font-semibold px-2 py-1.5 rounded-lg outline-none"
          >
            {PESOS_TEXTO.map((p) => (
              <option key={p.id} value={p.id}>{p.rotulo}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Rotulo>Alinhamento</Rotulo>
        <div className="flex gap-1.5">
          {ALINEACIONES_TEXTO.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => aoMudar('alinhamento', a.id)}
              className={`edl-ring-foco flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${
                t.alinhamento === a.id
                  ? 'border-[color:var(--edl-rosa)] text-white'
                  : 'border-[color:var(--edl-borda)] text-[color:var(--edl-texto-dim)] hover:text-white'
              }`}
              style={t.alinhamento === a.id ? { background: 'rgba(236,72,153,0.14)' } : undefined}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Rotulo>Cor</Rotulo>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={t.cor || '#0f172a'}
            onChange={(e) => aoMudar('cor', e.target.value)}
            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-[color:var(--edl-borda)] p-0.5"
          />
          <input
            type="text"
            value={t.cor || '#0f172a'}
            spellCheck={false}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) aoMudar('cor', e.target.value);
            }}
            className="edl-input flex-1 text-[11px] font-mono px-2.5 py-1.5 rounded-lg outline-none"
          />
        </div>
      </div>
    </>
  );
}

/** Bloco de TEXTO da arte (superior/inferior) — CONTAINER ÚNICO da ferramenta.
 * Contém o ÚNICO textarea + todos os controles (emoji, fonte, peso,
 * alinhamento, cor, tamanho, largura, opacidade, visibilidade). Usado tanto
 * no popup de texto quanto na configuração inline — nunca os dois ao mesmo
 * tempo (o painel principal esconde quando há popup). Edição é live via
 * `mudarTexto` (prévia atualiza na hora). */
function BlocoTexto({ chave, rotulo, t, aoAtualizarConfig }) {
  const aoMudar = (campo, valor) => mudarTexto(aoAtualizarConfig, chave, campo, valor);
  return (
    <div className="px-3.5 py-3.5 space-y-3">
      <span className="text-[11px] font-extrabold text-white">{rotulo}</span>
      <div>
        <Rotulo>Escrever texto</Rotulo>
        <textarea
          rows={4}
          value={t.conteudo || ''}
          onChange={(e) => aoMudar('conteudo', e.target.value)}
          placeholder="Escreva aqui…"
          className="edl-input w-full text-[11px] font-semibold px-2.5 py-2 rounded-lg resize-y outline-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <Rotulo>Emoji</Rotulo>
        <BotaoEmoji aoInserir={(emoji) => aoMudar('conteudo', `${t.conteudo || ''}${emoji}`)} />
      </div>
      <SelecaoTipografia t={t} aoMudar={aoMudar} />
      <Deslizador rotulo="Tamanho da fonte" sufixo="px" valor={Math.round(t.tamanho ?? 72)} min={10} max={160} aoMudar={(v) => aoMudar('tamanho', v)} />
      <Deslizador rotulo="Largura do bloco" sufixo="%" valor={Math.round(t.largura ?? 46)} min={10} max={100} aoMudar={(v) => aoMudar('largura', v)} />
      <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(t.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
      <Alternar rotulo={`${rotulo} visível`} ativo={!!t.visivel} aoMudar={(v) => aoMudar('visivel', v)} />
      <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
        Mover e redimensionar: direto no Preview (arraste o texto; alça lateral
        = largura). Sem X/Y — a posição é sempre mouse.
      </p>
    </div>
  );
}

/** Bloco de IDENTIDADE (nome do canal | @ do canal). */
function BlocoIdentidade({ chave, rotulo, t, aoAtualizarConfig }) {
  const aoMudar = (campo, valor) =>
    aoAtualizarConfig((cfg) => {
      const pad = criarIdentidadePadrao();
      const atual = { ...pad, ...cfg.identidade };
      atual[chave] = {
        ...pad[chave],
        ...atual[chave],
        [campo]: valor,
        ...(campo === 'conteudo' && String(valor || '').trim() !== '' ? { visivel: true } : null),
      };
      return { ...cfg, identidade: atual };
    });
  return (
    <div className="px-3.5 py-3.5 space-y-3">
      <span className="text-[11px] font-extrabold text-white">{rotulo}</span>
      <div>
        <Rotulo>Conteúdo</Rotulo>
        <textarea
          value={t.conteudo || ''}
          onChange={(e) => aoMudar('conteudo', e.target.value)}
          rows={2}
          placeholder={chave === 'usuario' ? '@seucanal' : 'Nome do canal'}
          className="edl-input w-full text-[11px] font-semibold px-2.5 py-2 rounded-lg resize-y outline-none"
        />
      </div>
      <div className="flex items-center justify-between">
        <Rotulo>Emoji</Rotulo>
        <BotaoEmoji aoInserir={(emoji) => aoMudar('conteudo', `${t.conteudo || ''}${emoji}`)} />
      </div>
      <SelecaoTipografia t={t} aoMudar={aoMudar} />
      <Deslizador rotulo="Tamanho da fonte" sufixo="px" valor={Math.round(t.tamanho ?? 40)} min={10} max={120} aoMudar={(v) => aoMudar('tamanho', v)} />
      <Deslizador rotulo="Largura do bloco" sufixo="%" valor={Math.round(t.largura ?? 46)} min={10} max={100} aoMudar={(v) => aoMudar('largura', v)} />
      <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(t.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
      <Alternar rotulo={`${rotulo} visível`} ativo={!!t.visivel} aoMudar={(v) => aoMudar('visivel', v)} />
      <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
        Elemento independente: arraste no Preview pra posicionar (sem X/Y) e
        use as alças pra largura/tamanho.
      </p>
    </div>
  );
}

/** Bloco da LOGO — "Sua logo [prévia] [Trocar]": UM único caminho de logo
 * (um botão de envio e um de troca usando O MESMO input — nunca dois sistemas). */
function BlocoLogo({ config, aoAtualizarConfig, aoEscolherLogo, aoRemoverLogo }) {
  const inputRef = useRef(null);
  const logo = config.logo || {};
  const temLogo = !!(config.logo.visivel && config.logo.url);
  const aoMudar = (campo, valor) => aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, [campo]: valor } }));
  return (
    <div className="px-3.5 py-3.5 space-y-3">
      <span className="text-[11px] font-extrabold text-white">Sua logo</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={aoEscolherLogo}
      />
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-[color:var(--edl-borda)]" style={{ background: '#0d0d13' }}>
          {temLogo ? (
            <img src={config.logo.url} alt="Logo" className="max-w-full max-h-full object-contain" />
          ) : (
            <ImageIcon className="w-5 h-5 edl-icone-b opacity-60" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <LinhaAcoes>
            <BotaoPequeno icone={Upload} onClick={() => inputRef.current?.click()} tom="destaque">
              {temLogo ? 'Trocar' : 'Enviar logo'}
            </BotaoPequeno>
            {temLogo ? (
              <BotaoPequeno icone={Trash2} tom="perigo" onClick={aoRemoverLogo}>Remover</BotaoPequeno>
            ) : null}
          </LinhaAcoes>
          <p className="text-[9px] font-semibold mt-1.5" style={{ color: 'var(--edl-texto-mut)' }}>
            PNG (SVG/JPEG também) · continua a mesma logo compartilhada do lote.
          </p>
        </div>
      </div>
      {temLogo ? (
        <>
          <Deslizador rotulo="Largura da logo" sufixo="%" valor={Math.round(logo.largura ?? 22)} min={3} max={100} aoMudar={(v) => aoMudar('largura', v)} />
          <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(logo.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
          <Alternar rotulo="Logo visível" ativo={!!logo.visivel} aoMudar={(v) => aoMudar('visivel', v)} />
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            Arraste a logo direto no Preview pra mover (sem X/Y).
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Bloco do SELO DE VERIFICADO — usado na configuração inline E dentro do
 * popup pequeno de selo (MESMO caminho, zero duplicação). Sem PNG, o selo
 * usa o ícone vetorial (nunca texto falso). Posição/tamanho: 100% mouse no
 * Preview. */
function BlocoSelo({ selo, aoAtualizarConfig, aoEscolherSelo, aoRemoverSelo }) {
  const inputRef = useRef(null);
  const s = selo || {};
  const temPng = typeof s.urlImagem === 'string' && s.urlImagem.startsWith('data:image/');
  const aoMudar = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      identidade: {
        ...criarIdentidadePadrao(),
        ...cfg.identidade,
        selo: { ...(cfg.identidade?.selo || {}), [campo]: valor },
      },
    }));
  return (
    <div className="px-3.5 py-3.5 space-y-3">
      <span className="text-[11px] font-extrabold text-white">Selo de verificado</span>
      <input ref={inputRef} type="file" accept="image/png,image/webp" className="hidden" onChange={aoEscolherSelo} />
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-[color:var(--edl-borda)]" style={{ background: '#0d0d13' }}>
          {temPng ? (
            <img src={s.urlImagem} alt="Selo" className="max-w-full max-h-full object-contain" />
          ) : (
            <BadgeCheck className="w-6 h-6" style={{ color: '#1d9bf0' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <LinhaAcoes>
            <BotaoPequeno icone={Upload} onClick={() => inputRef.current?.click()} tom="destaque">
              {temPng ? 'Trocar PNG' : 'Enviar PNG'}
            </BotaoPequeno>
            {temPng ? (
              <BotaoPequeno icone={Trash2} tom="perigo" onClick={aoRemoverSelo}>Remover PNG</BotaoPequeno>
            ) : null}
          </LinhaAcoes>
          <p className="text-[9px] font-semibold mt-1.5" style={{ color: 'var(--edl-texto-mut)' }}>
            {temPng
              ? 'PNG do usuário no Preview e no render (mesma imagem).'
              : 'Sem PNG, o selo usa o ícone vetorial padrão.'}
          </p>
        </div>
      </div>
      <Deslizador rotulo="Largura do selo" sufixo="%" valor={Math.round((s.largura ?? 3.4) * 10) / 10} min={0.5} max={12} passo={0.1} aoMudar={(v) => aoMudar('largura', v)} />
      <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(s.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
      <Alternar rotulo="Selo visível" ativo={!!s.visivel} aoMudar={(v) => aoMudar('visivel', v)} />
      <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
        Arraste o selo no Preview pra posicionar (sem X/Y). Ele também aparece
        como camada no painel “Camadas”.
      </p>
    </div>
  );
}

/** Bloco de IMAGEM (Adicionar elementos → Imagem): troca/remoção + estilo. */
function BlocoImagem({ imagem, aoAtualizarConfig, aoTrocarImagem, aoRemoverImagem }) {
  const inputRef = useRef(null);
  if (!imagem) return null;
  const aoMudar = (campo, valor) =>
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      imagens: (cfg.imagens || []).map((im) => (im && im.id === imagem.id ? { ...im, [campo]: valor } : im)),
    }));
  return (
    <div className="px-3.5 py-3.5 space-y-3">
      <span className="text-[11px] font-extrabold text-white">Imagem</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => aoTrocarImagem(e, imagem.id)}
      />
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-[color:var(--edl-borda)]" style={{ background: '#0d0d13' }}>
          <img src={imagem.url} alt={imagem.nome || 'Imagem'} className="max-w-full max-h-full object-contain" />
        </div>
        <LinhaAcoes>
          <BotaoPequeno icone={Upload} onClick={() => inputRef.current?.click()}>Trocar</BotaoPequeno>
          <BotaoPequeno icone={Trash2} tom="perigo" onClick={() => aoRemoverImagem(imagem.id)}>Remover</BotaoPequeno>
        </LinhaAcoes>
      </div>
      <Deslizador rotulo="Largura" sufixo="%" valor={Math.round(imagem.largura ?? 30)} min={2} max={100} aoMudar={(v) => aoMudar('largura', v)} />
      <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(imagem.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
      <Alternar rotulo="Imagem visível" ativo={!!imagem.visivel} aoMudar={(v) => aoMudar('visivel', v)} />
      <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
        Arraste no Preview pra mover e use a alça de canto pra redimensionar
        (sem X/Y). A imagem entra no mesmo PNG de overlay do render.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ADICIONAR ELEMENTOS (4 botões — um caminho único por funcionalidade)
 * ------------------------------------------------------------------------- */
const ADICIONAR = [
  { id: 'logo', rotulo: 'Logo', Icone: ImageIcon },
  { id: 'texto', rotulo: 'Texto', Icone: Type },
  { id: 'imagem', rotulo: 'Imagem', Icone: ImagePlus },
  { id: 'video', rotulo: 'Vídeo', Icone: Film },
];

/** Popup pequeno — SEMPRE ancorado dentro deste painel para NUNCA cobrir o
 * Preview central. */
const CLASSE_POPUP =
  'relative mx-2 my-2 z-10 rounded-xl border border-[color:var(--edl-borda)] p-3 shadow-2xl max-h-[480px] overflow-y-auto';

/** Rótulos dos popups pequenos de LOGO / FUNDO / IDENTIDADE / SELO — MESMO
 * padrão visual dos popups de texto/imagem/vídeo (CLASSE_POPUP, ancorado no
 * PAINEL ESQUERDO): o Preview central NUNCA é coberto nem substituído. */
const POPUP_ROTULOS = {
  logo: 'Sua logo',
  fundo: 'Fundo do vídeo',
  identidade: 'Identidade do canal',
  selo: 'Selo de verificado',
};

export default function PainelEditor({
  config,
  aoAtualizarConfig,
  elementoSelecionado = null,
  aoSelecionarElemento,
  itensLote = [],
  aoDetectarBordas,
  detectandoBordas = false,
  progressoBordas = null,
  // Popup pequeno de VÍDEO — MESMA lista única do Editor (sem cópia/duplicata).
  itens = [],
  idSelecionado = null,
  aoSelecionarVideo,
  aoFocarVideo,
  aoRemoverVideo,
  aoAdicionarVideo,
}) {
  const [popup, setPopup] = useState(null); // 'logo' | 'texto' | 'imagem' | 'video' | 'fundo' | 'identidade' | 'selo' | null
  const [alvoTexto, setAlvoTexto] = useState('superior');
  const [erroPopup, setErroPopup] = useState('');
  /** Última seleção já processada pela auto-abertura (Camadas ⇄ Preview). */
  const ultimaSelecaoRef = useRef(null);

  /** Popup correspondente a UMA seleção — mesmo caminho p/ Camadas e Preview. */
  function abrirPopupPara(sel) {
    if (sel === 'logo') {
      setErroPopup('');
      setPopup('logo');
      return;
    }
    if (sel === 'fundo') {
      setPopup('fundo');
      return;
    }
    if (sel === 'identidadeNome' || sel === 'identidadeUsuario') {
      setPopup('identidade');
      return;
    }
    if (sel === 'selo') {
      setPopup('selo');
      return;
    }
    if (sel === 'textoSuperior') {
      abrirPopupTexto('superior');
      return;
    }
    if (sel === 'textoInferior') {
      abrirPopupTexto('inferior');
      return;
    }
    // imagem:<id> · video · area · corte → configuração INLINE (sem popup).
    fecharPopup();
  }

  /** Fechar popup: NÃO reabre sozinho — só um NOVO clique de seleção reabre. */
  function fecharPopup() {
    ultimaSelecaoRef.current = null;
    setPopup(null);
  }

  // AUTO-ABERTURA por seleção (Camadas ⇄ Preview): qualquer mudança de
  // elementoSelecionado (clique na camada à direita OU no elemento do Preview)
  // abre o popup correspondente. Fechar via X não reabre sozinho.
  useEffect(() => {
    const sel = elementoSelecionado;
    if (!sel || sel === ultimaSelecaoRef.current) return;
    ultimaSelecaoRef.current = sel;
    abrirPopupPara(sel);
  }, [elementoSelecionado]);

  const textos = config.textos || {};
  const identidade = { ...criarIdentidadePadrao(), ...(config.identidade || {}) };
  const imagemSelecionada =
    typeof elementoSelecionado === 'string' && elementoSelecionado.startsWith('imagem:')
      ? (config.imagens || []).find((im) => im.id === elementoSelecionado.slice(7)) || null
      : null;

  /* ---------------- LOGO (UM único caminho) ---------------- */

  /** Envia/troca a logo (mesmo input para os dois estados). */
  function aoEscolherLogo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const logoAtual = config.logo || {};
    if (logoAtual.url && String(logoAtual.url).startsWith('blob:')) URL.revokeObjectURL(logoAtual.url);
    const url = URL.createObjectURL(arquivo);
    aoAtualizarConfig((cfg) => ({ ...cfg, logo: { ...cfg.logo, url, arquivo, visivel: true } }));
    e.target.value = '';
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

  /** Remoção COMPLETA da logo — regra definitiva anti-ressurreição (url +
   * arquivo + dataURL + visibilidade + proporção zerados). */
  function aoRemoverLogo() {
    if (config.logo?.url && String(config.logo.url).startsWith('blob:')) URL.revokeObjectURL(config.logo.url);
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      logo: {
        ...cfg.logo,
        url: null,
        arquivo: null,
        logoDataUrl: null,
        alturaProporcao: null,
        visivel: false,
      },
    }));
  }

  /* ---------------- SELO (PNG próprio, dataURL) ---------------- */

  function aoEscolherSelo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    e.target.value = '';
    const leitor = new FileReader();
    leitor.onload = () => {
      const dataUrl =
        typeof leitor.result === 'string' && leitor.result.startsWith('data:image/') ? leitor.result : null;
      if (!dataUrl) return;
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        identidade: {
          ...criarIdentidadePadrao(),
          ...cfg.identidade,
          selo: { ...(cfg.identidade?.selo || {}), urlImagem: dataUrl, visivel: true },
        },
      }));
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) {
          aoAtualizarConfig((cfg) => ({
            ...cfg,
            identidade: {
              ...criarIdentidadePadrao(),
              ...cfg.identidade,
              selo: {
                ...(cfg.identidade?.selo || {}),
                alturaProporcao: img.naturalHeight / img.naturalWidth,
              },
            },
          }));
        }
      };
      img.src = dataUrl;
    };
    leitor.readAsDataURL(arquivo);
  }

  /** Remove o PNG do selo e desliga o elemento (o vetorial não volta sozinho). */
  function aoRemoverSelo() {
    aoAtualizarConfig((cfg) => ({
      ...cfg,
      identidade: {
        ...criarIdentidadePadrao(),
        ...cfg.identidade,
        selo: { ...(cfg.identidade?.selo || {}), urlImagem: null, alturaProporcao: 1, visivel: false },
      },
    }));
  }

  /* ---------------- IMAGEM (dataURL — vai pro overlay do render) ---------------- */

  const LIMITE_IMAGEM_BYTES = 3 * 1024 * 1024;

  function lerImagemComoDataUrl(arquivo, aoPronto) {
    if (!arquivo) return;
    if (!/^image\//.test(arquivo.type || '')) {
      setErroPopup('Escolha um arquivo de imagem (PNG/JPG/WebP).');
      return;
    }
    if (arquivo.size > LIMITE_IMAGEM_BYTES) {
      setErroPopup('Imagem muito grande (máx. 3 MB) — ela viaja dentro do template.');
      return;
    }
    setErroPopup('');
    const leitor = new FileReader();
    leitor.onload = () => {
      const dataUrl =
        typeof leitor.result === 'string' && leitor.result.startsWith('data:image/') ? leitor.result : null;
      if (!dataUrl) {
        setErroPopup('Não foi possível ler a imagem.');
        return;
      }
      aoPronto(dataUrl, arquivo.name || null);
    };
    leitor.readAsDataURL(arquivo);
  }

  /** Adiciona uma IMAGEM à composição (vira elemento + camada, na hora). */
  function aoEscolherImagem(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    e.target.value = '';
    lerImagemComoDataUrl(arquivo, (dataUrl, nome) => {
      const nova = criarImagemPadrao({ url: dataUrl, alturaProporcao: 1, nome });
      aoAtualizarConfig((cfg) => ({ ...cfg, imagens: [...(cfg.imagens || []), nova] }));
      if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento(`imagem:${nova.id}`);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) {
          aoAtualizarConfig((cfg) => ({
            ...cfg,
            imagens: (cfg.imagens || []).map((im) =>
              im.id === nova.id ? { ...im, alturaProporcao: img.naturalHeight / img.naturalWidth } : im
            ),
          }));
        }
      };
      img.src = dataUrl;
      fecharPopup();
    });
  }

  /** Troca o arquivo de uma imagem existente (mantém posição/largura). */
  function aoTrocarImagem(e, id) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    e.target.value = '';
    lerImagemComoDataUrl(arquivo, (dataUrl, nome) => {
      aoAtualizarConfig((cfg) => ({
        ...cfg,
        imagens: (cfg.imagens || []).map((im) => (im && im.id === id ? { ...im, url: dataUrl, nome: nome || im.nome } : im)),
      }));
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) {
          aoAtualizarConfig((cfg) => ({
            ...cfg,
            imagens: (cfg.imagens || []).map((im) =>
              im.id === id ? { ...im, alturaProporcao: img.naturalHeight / img.naturalWidth } : im
            ),
          }));
        }
      };
      img.src = dataUrl;
    });
  }

  function aoRemoverImagem(id) {
    aoAtualizarConfig((cfg) => ({ ...cfg, imagens: (cfg.imagens || []).filter((im) => im && im.id !== id) }));
    if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento(null);
  }

  /* ---------------- RESTAURAR PADRÃO (reutilização explícita) ---------------- */

  function aoRestaurar() {
    const base = criarConfigPadrao();
    aoAtualizarConfig((cfg) => ({
      ...base,
      loteId: cfg.loteId,
      loteCriadoEm: cfg.loteCriadoEm,
      // Logo e identidade são escolha EXPLÍCITA do usuário: sobrevivem ao reset.
      logo: cfg.logo,
      identidade: cfg.identidade,
    }));
  }

  /* ---------------- POPUP DE TEXTO: container ÚNICO (config completa imediata).
   * Edição 100% live via `mudarTexto` — sem Cancelar/Confirmar. O toggle troca
   * TUDO junto via `trocarAlvoTexto` (textarea + controles + seleção). ------ */

  function abrirPopupTexto(alvo = null) {
    const escolhido = alvo || (elementoSelecionado === 'textoInferior' ? 'inferior' : 'superior');
    setAlvoTexto(escolhido);
    setErroPopup('');
    setPopup('texto');
    if (typeof aoSelecionarElemento === 'function') {
      aoSelecionarElemento(escolhido === 'inferior' ? 'textoInferior' : 'textoSuperior');
    }
  }

  /** Troca o alvo (superior/inferior): textarea + controles + seleção juntos. */
  function trocarAlvoTexto(alvo) {
    setAlvoTexto(alvo);
    if (typeof aoSelecionarElemento === 'function') {
      aoSelecionarElemento(alvo === 'inferior' ? 'textoInferior' : 'textoSuperior');
    }
  }

  /* ---------------- BOTÕES "ADICIONAR ELEMENTOS" ---------------- */

  function aoClicarAdicionar(id) {
    if (id === 'logo') {
      setErroPopup('');
      setPopup('logo');
      if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento('logo');
      return;
    }
    if (id === 'texto') {
      abrirPopupTexto();
      return;
    }
    if (id === 'imagem') {
      setErroPopup('');
      setPopup('imagem');
      return;
    }
    if (id === 'video') {
      setErroPopup('');
      setPopup('video');
      if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento('video');
      return;
    }
    // LOGO — popup pequeno (MESMO padrão dos demais). ÚNICO caminho de logo:
    // este popup reutiliza o renderConfig('logo') (BlocoLogo: prévia + Trocar).
    if (typeof aoSelecionarElemento === 'function') aoSelecionarElemento('logo');
    setErroPopup('');
    setPopup('logo');
  }

  /* ---------------- CONFIGURAÇÃO DO ELEMENTO SELECIONADO ---------------- */

  function renderConfig() {
    const sel = elementoSelecionado;

    if (sel === 'logo') {
      return (
        <BlocoLogo
          config={config}
          aoAtualizarConfig={aoAtualizarConfig}
          aoEscolherLogo={aoEscolherLogo}
          aoRemoverLogo={aoRemoverLogo}
        />
      );
    }

    if (sel === 'textoSuperior' || sel === 'textoInferior') {
      const chave = sel === 'textoSuperior' ? 'superior' : 'inferior';
      return (
        <BlocoTexto
          chave={chave}
          rotulo={sel === 'textoSuperior' ? 'Texto principal' : 'Texto inferior'}
          t={textos[chave] || {}}
          aoAtualizarConfig={aoAtualizarConfig}
        />
      );
    }

    if (sel === 'identidadeNome' || sel === 'identidadeUsuario') {
      const chave = sel === 'identidadeNome' ? 'nome' : 'usuario';
      return (
        <BlocoIdentidade
          chave={chave}
          rotulo={sel === 'identidadeNome' ? 'Nome do canal' : 'Usuário (@)'}
          t={identidade[chave] || {}}
          aoAtualizarConfig={aoAtualizarConfig}
        />
      );
    }

    if (sel === 'selo') {
      return (
        <BlocoSelo
          selo={identidade.selo}
          aoAtualizarConfig={aoAtualizarConfig}
          aoEscolherSelo={aoEscolherSelo}
          aoRemoverSelo={aoRemoverSelo}
        />
      );
    }

    if (imagemSelecionada) {
      return (
        <BlocoImagem
          imagem={imagemSelecionada}
          aoAtualizarConfig={aoAtualizarConfig}
          aoTrocarImagem={aoTrocarImagem}
          aoRemoverImagem={aoRemoverImagem}
        />
      );
    }

    if (sel === 'area' || sel === 'video') {
      const area = config.areaVideo || {};
      const aoMudarArea = (campo, valor) =>
        aoAtualizarConfig((cfg) => ({ ...cfg, areaVideo: { ...cfg.areaVideo, [campo]: valor } }));
      return (
        <div className="px-3.5 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-white">Vídeo</span>
            <BotaoPequeno icone={Film} onClick={() => setPopup('video')}>Importar vídeos</BotaoPequeno>
          </div>
          <div>
            <Rotulo>Encaixe dentro da área</Rotulo>
            <div className="flex gap-1.5">
              {[
                { id: 'cobrir', rotulo: 'Cobrir' },
                { id: 'ajustar', rotulo: 'Ajustar' },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => aoMudarArea('fit', o.id)}
                  className={`edl-ring-foco flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${
                    area.fit === o.id
                      ? 'border-[color:var(--edl-rosa)] text-white'
                      : 'border-[color:var(--edl-borda)] text-[color:var(--edl-texto-dim)] hover:text-white'
                  }`}
                  style={area.fit === o.id ? { background: 'rgba(236,72,153,0.14)' } : undefined}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
          </div>
          <Alternar
            rotulo="Mostrar guia da área"
            ativo={!!area.mostrarMarcacao}
            aoMudar={(v) => aoMudarArea('mostrarMarcacao', v)}
          />
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            Zoom do vídeo: roda do mouse SOBRE o vídeo no Preview. Mover: arraste
            o vídeo direto no Preview (posição) — com zoom ampliado (acima de
            100%), o arraste enquadra o conteúdo dentro da área. Sem X/Y.
          </p>
        </div>
      );
    }

    if (sel === 'corte') {
      // FONTE ÚNICA: o painel lê os MESMOS valores que o Preview recorta
      // (corteEfetivoDoVideo — override do vídeo vence o global) e escreve
      // pela MESMA função do arraste das linhas (atualizarCorteNoConfig).
      // SLIDER ⇄ CONFIG ⇄ PREVIEW sincronizados: o % exibido é o mesmo do
      // clip-path e do render.
      const corte = corteEfetivoDoVideo(config, idSelecionado);
      const aoMudarCorte = (campo, valor) =>
        aoAtualizarConfig((cfg) => atualizarCorteNoConfig(cfg, idSelecionado, { [campo]: valor }));
      return (
        <div className="px-3.5 py-3.5 space-y-3">
          <span className="text-[11px] font-extrabold text-white">Corte de bordas</span>
          <Alternar rotulo="Corte ativo (vai pro render)" ativo={!!corte.ativo} aoMudar={(v) => aoMudarCorte('ativo', v)} />
          <Deslizador rotulo="Borda superior" sufixo="%" valor={Math.round(corte.superior || 0)} min={0} max={CORTE_MAXIMO} aoMudar={(v) => aoMudarCorte('superior', v)} />
          <Deslizador rotulo="Borda inferior" sufixo="%" valor={Math.round(corte.inferior || 0)} min={0} max={CORTE_MAXIMO} aoMudar={(v) => aoMudarCorte('inferior', v)} />
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            Arraste as linhas tracejadas no Preview pra ajustar o corte (sem
            X/Y). O corte usa o MESMO valor no FFmpeg — prévia = render.
          </p>
          {typeof aoDetectarBordas === 'function' ? (
            <button
              type="button"
              onClick={aoDetectarBordas}
              disabled={detectandoBordas}
              className="edl-botao-fantasma edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2.5 rounded-lg disabled:opacity-50"
            >
              <Scan className="w-3.5 h-3.5 edl-icone-b" />
              {detectandoBordas ? 'Detectando…' : 'Corte automático de bordas'}
            </button>
          ) : null}
          {progressoBordas !== null && progressoBordas !== undefined ? (
            <p className="text-[9px] font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
              Progresso: {Math.round(progressoBordas)}%
            </p>
          ) : null}
        </div>
      );
    }

    if (sel === 'fundo') {
      return (
        <div className="px-3.5 py-3.5 space-y-3">
          <span className="text-[11px] font-extrabold text-white">Fundo</span>
          <div>
            <Rotulo>Cor de fundo do canvas</Rotulo>
            <div className="flex items-center gap-1.5 flex-wrap">
              {CORES_FUNDO.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => aoAtualizarConfig((cfg) => ({ ...cfg, canvas: { ...cfg.canvas, corFundo: c } }))}
                  className={`w-7 h-7 rounded-lg border-2 transition-colors ${
                    config.canvas?.corFundo === c ? 'border-[color:var(--edl-rosa)]' : 'border-[color:var(--edl-borda)]'
                  }`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={config.canvas?.corFundo || '#ffffff'}
                onChange={(e) => aoAtualizarConfig((cfg) => ({ ...cfg, canvas: { ...cfg.canvas, corFundo: e.target.value } }))}
                title="Cor personalizada"
                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-2 border-[color:var(--edl-borda)] p-0"
              />
            </div>
          </div>
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            O fundo é a base da composição (não some no render) e também aparece
            nas áreas reveladas pelo corte.
          </p>
        </div>
      );
    }

    // NENHUM elemento selecionado — painel informativo (o Preview continua visível).
    return (
      <div className="px-3.5 py-3.5 space-y-3.5">
        <div className="edl-superficie rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
              Canvas
            </span>
            <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
              1080×1920 (9:16)
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
              Configuração
            </span>
            <span className="text-[10px] font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
              única · compartilhada
            </span>
          </div>
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            Selecione uma camada no painel “Camadas” (à direita) ou clique num
            elemento direto no Preview. Toda mudança vale para TODOS os vídeos do
            lote, na hora — sem botão “Aplicar a todos”.
          </p>
        </div>
        <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
          Adicione elementos acima: Logo · Texto · Imagem · Vídeo. Os demais
          elementos (Fundo, Corte, Nome, @, Selo, Área) já existem como camadas.
        </p>
        <button
          type="button"
          onClick={aoRestaurar}
          className="edl-botao-fantasma edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2.5 rounded-lg"
        >
          <RotateCcw className="w-3.5 h-3.5 edl-icone-a" />
          Restaurar padrão (mantém logo e identidade)
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 flex flex-col bg-[color:var(--edl-painel)]">
      {/* CABEÇALHO — ADICIONAR ELEMENTOS (4 botões, um caminho por função) */}
      <div className="shrink-0 px-3 py-3 border-b border-[color:var(--edl-borda)]">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 edl-icone-a shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          <h2 className="font-display text-xs font-extrabold text-white">Adicionar elementos</h2>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5">
          {ADICIONAR.map((item) => {
            const Icone = item.Icone;
            const ativo =
              item.id === 'logo'
                ? elementoSelecionado === 'logo'
                : item.id === 'texto'
                  ? elementoSelecionado === 'textoSuperior' || elementoSelecionado === 'textoInferior'
                  : item.id === 'video'
                    ? elementoSelecionado === 'video' || elementoSelecionado === 'area'
                    : !!imagemSelecionada;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => aoClicarAdicionar(item.id)}
                title={`Adicionar ${item.rotulo}`}
                aria-pressed={ativo}
                className={`edl-ring-foco flex items-center justify-center gap-1.5 text-[10px] font-bold px-2 py-2.5 rounded-lg border transition-colors ${
                  ativo
                    ? 'border-[color:var(--edl-rosa)] text-white'
                    : 'border-[color:var(--edl-borda)] text-[color:var(--edl-texto-dim)] hover:text-white'
                }`}
                style={ativo ? { background: 'rgba(236,72,153,0.14)' } : { background: 'rgba(255,255,255,0.02)' }}
              >
                <Icone className={`w-3.5 h-3.5 ${ativo ? 'edl-icone-a' : 'edl-icone-b opacity-80'}`} />
                {item.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONFIGURAÇÃO do elemento selecionado (context panel).
          Escondida quando há popup — o popup 'texto' contém o BlocoTexto
          completo, então há sempre UMA única instância visível. */}
      {!popup && (
        <div className="min-h-0 overflow-y-auto overflow-x-hidden" role={elementoSelecionado ? 'dialog' : undefined} aria-label={elementoSelecionado ? 'Configuração do elemento' : undefined}>
          {elementoSelecionado && <button type="button" className="edl-botao-fantasma text-xs m-2 p-2 rounded-lg" onClick={() => aoSelecionarElemento(null)}>Fechar configuração</button>}
          {renderConfig()}
        </div>
      )}

{/* POPUPS PEQUENOS — LOGO · FUNDO · IDENTIDADE · SELO (UM único bloco por
          popup; MESMO padrão dos popups de texto/imagem/vídeo: ancorados NESTE
          painel esquerdo — o Preview central NUNCA é coberto nem substituído).
          O conteúdo REUTILIZA o renderConfig() do elemento selecionado: um
          único caminho por função, sem X/Y (movimentação é 100% mouse no
          Preview). */}
      {popup && POPUP_ROTULOS[popup] ? (
        <div
          className={CLASSE_POPUP}
          style={{ background: 'var(--edl-painel)', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.8)' }}
          role="dialog"
          aria-label={`Editar ${POPUP_ROTULOS[popup]}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-white">{POPUP_ROTULOS[popup]}</span>
            <button
              type="button"
              onClick={fecharPopup}
              aria-label="Fechar"
              className="edl-ring-foco w-6 h-6 rounded-lg flex items-center justify-center text-[color:var(--edl-texto-dim)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* IDENTIDADE: alterna Nome do canal ⇄ Usuário (@) sem fechar o popup. */}
          {popup === 'identidade' && typeof aoSelecionarElemento === 'function' ? (
            <div className="flex gap-1.5 mt-2.5">
              {[
                { id: 'identidadeNome', rotulo: 'Nome do canal' },
                { id: 'identidadeUsuario', rotulo: 'Usuário (@)' },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => aoSelecionarElemento(o.id)}
                  className={`edl-ring-foco flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${
                    elementoSelecionado === o.id
                      ? 'border-[color:var(--edl-rosa)] text-white'
                      : 'border-[color:var(--edl-borda)] text-[color:var(--edl-texto-dim)] hover:text-white'
                  }`}
                  style={elementoSelecionado === o.id ? { background: 'rgba(236,72,153,0.14)' } : undefined}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2">{renderConfig()}</div>
        </div>
      ) : null}

      {/* POPUP — TEXTO: container ÚNICO com configuração COMPLETA imediata.
          Toggle Superior/Inferior troca TUDO junto (textarea + controles +
          elementoSelecionado). Edição live — fecha só com X. Preview visível. */}

{popup === 'texto' ? (
        <div
          className={CLASSE_POPUP}
          style={{ background: 'var(--edl-painel)', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.8)' }}
          role="dialog"
          aria-label="Editar texto"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-white">Texto</span>
            <button
              type="button"
              onClick={fecharPopup}
              aria-label="Fechar"
              className="edl-ring-foco w-6 h-6 rounded-lg flex items-center justify-center text-[color:var(--edl-texto-dim)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-2.5">
            {[
              { id: 'superior', rotulo: 'Texto superior' },
              { id: 'inferior', rotulo: 'Texto inferior' },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => trocarAlvoTexto(o.id)}
                className={`edl-ring-foco flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-colors ${
                  alvoTexto === o.id
                    ? 'border-[color:var(--edl-rosa)] text-white'
                    : 'border-[color:var(--edl-borda)] text-[color:var(--edl-texto-dim)] hover:text-white'
                }`}
                style={alvoTexto === o.id ? { background: 'rgba(236,72,153,0.14)' } : undefined}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
          <div className="mt-2 -mx-3.5 -mb-3.5">
            <BlocoTexto
              chave={alvoTexto}
              rotulo={alvoTexto === 'inferior' ? 'Texto inferior' : 'Texto principal'}
              t={textos[alvoTexto] || {}}
              aoAtualizarConfig={aoAtualizarConfig}
            />
          </div>
          <p className="text-[9px] font-semibold leading-relaxed mt-2" style={{ color: 'var(--edl-texto-mut)' }}>
            O Preview atualiza em tempo real.
          </p>
        </div>
      ) : null}

      {/* POPUP PEQUENO — IMAGEM (upload → entra na composição na hora) */}
      {popup === 'imagem' ? (
        <div
          className={CLASSE_POPUP}
          style={{ background: 'var(--edl-painel)', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.8)' }}
          role="dialog"
          aria-label="Adicionar imagem"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-white">Adicionar imagem</span>
            <button
              type="button"
              onClick={fecharPopup}
              aria-label="Fechar"
              className="edl-ring-foco w-6 h-6 rounded-lg flex items-center justify-center text-[color:var(--edl-texto-dim)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <label className="edl-botao-grad edl-ring-foco w-full flex items-center justify-center gap-2 text-[11px] font-extrabold py-2.5 rounded-lg mt-2.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Escolher imagem
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={aoEscolherImagem} />
          </label>
          <p className="text-[9px] font-semibold leading-relaxed mt-2" style={{ color: 'var(--edl-texto-mut)' }}>
            A imagem entra na composição imediatamente, vira uma camada e é
            arrastável/redimensionável no Preview (PNG/JPG/WebP até 3 MB).
          </p>
          {erroPopup ? (
            <p className="text-[10px] font-bold mt-2 flex items-start gap-1.5" style={{ color: '#f87171' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {erroPopup}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* POPUP PEQUENO — VÍDEO (MESMA lista única do Editor: importar + base) */}
      {popup === 'video' ? (
        <div
          className={`${CLASSE_POPUP} p-0 flex flex-col`}
          style={{ background: 'var(--edl-painel)', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.8)' }}
          role="dialog"
          aria-label="Vídeos do lote"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[color:var(--edl-borda)]">
            <span className="text-[11px] font-extrabold text-white">Vídeos do lote</span>
            <button
              type="button"
              onClick={fecharPopup}
              aria-label="Fechar"
              className="edl-ring-foco w-6 h-6 rounded-lg flex items-center justify-center text-[color:var(--edl-texto-dim)] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <PainelDownloads aoAdicionarVideo={aoAdicionarVideo} />
          <div className="flex-1 min-h-0 flex flex-col" style={{ maxHeight: 260 }}>
            <ListaVideos
              itens={itens}
              idSelecionado={idSelecionado}
              aoSelecionar={aoSelecionarVideo}
              aoFocar={aoFocarVideo}
              aoRemover={aoRemoverVideo}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}



