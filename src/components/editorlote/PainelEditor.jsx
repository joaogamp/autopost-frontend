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
  posicaoEfetivaDoVideo,
  atualizarPosicaoVideoNoConfig,
  editarTodosOsVideos,
  areaVideoEfetivaDoVideo,
  atualizarAreaVideoNoConfig,
  normalizarZoomVideo,
  ZOOM_VIDEO_MIN,
  ZOOM_VIDEO_MAX,
  CANVAS_LARGURA,
  CANVAS_ALTURA,
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
 * POSIÇÃO DO VÍDEO — X/Y em PIXELS do canvas 1080x1920.
 *
 * RESPONSABILIDADE SEPARADA DO CORTE (e nunca misturada com ele):
 *
 *      CORTE   = janela/área VISÍVEL  (%, da ALTURA do vídeo)  -> "corte"
 *      POSIÇÃO = deslocamento X/Y     (px, do CANVAS 1080x1920) -> aqui
 *
 * Este bloco:
 *  · LÊ pelo mesmo `posicaoEfetivaDoVideo` que o Preview e o render consomem
 *    (global ⊕ `posicaoPorVideo[id]`), então o número mostrado é o número que
 *    entra no `overlay=x:y` do FFmpeg — prévia = render;
 *  · ESCREVE só por `atualizarPosicaoVideoNoConfig`, que respeita o escopo
 *    "Editar todos / Apenas este vídeo" e NUNCA toca `corteBordas` nem
 *    `overridesPorVideo`. Não existe uma segunda via de escrita aqui;
 *  · NÃO importa, NÃO lê e NÃO altera `corte`, `topPx`/`basePx` ou qualquer
 *    valor do corte: trocar o corte não move estes campos, e mexer aqui não
 *    altera o corte.
 *
 * O valor digitado é gravado EXATO (sem clamp na escrita). O ajuste aos limites
 * do quadro acontece na LEITURA (`limitarMovimentoVideo`, dentro de
 * `geometriaVideoFinal`), que é a mesma conta do render — por isso o campo
 * mostra sempre o valor EFETIVO, e não o bruto.
 * ------------------------------------------------------------------------- */

/** Texto do campo numérico: vazio enquanto não há valor, para poder apagar.
 * `null` (sem valor) = CENTRALIZADO e aparece como campo vazio com placeholder. */
function textoCampoPosicao(valor) {
  return valor == null ? '' : String(Math.round(valor));
}

/** Converte o que o usuário digitou em valor gravável.
 * `''` (campo vazio) = CENTRALIZADO (`null`) — é a única forma de voltar ao
 * centro, e `null` continua significando "centralizado" ponta a ponta. */
function valorDoCampoPosicao(texto) {
  const bruto = String(texto ?? '').trim();
  if (bruto === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function CampoPosicao({ rotulo, valor, aoMudar, desabilitado, titulo }) {
  const [texto, setTexto] = useState(() => textoCampoPosicao(valor));
  // Reflete a config quando ela muda por FORA deste campo (arraste no Preview,
  // botão "Centralizar", F5) — mas nunca sobrescreve o que está sendo digitado.
  const externoRef = useRef(null);
  useEffect(() => {
    const externo = textoCampoPosicao(valor);
    if (externo !== externoRef.current) {
      externoRef.current = externo;
      setTexto(externo);
    }
  }, [valor]);
  return (
    <div className="flex-1 min-w-0">
      <Rotulo>{rotulo}</Rotulo>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        value={texto}
        disabled={!!desabilitado}
        title={titulo}
        placeholder="centro"
        aria-label={rotulo}
        onChange={(e) => {
          // Texto vazio/inválido = centralizado (não grava lixo na config).
          const v = valorDoCampoPosicao(e.target.value);
          externoRef.current = textoCampoPosicao(v);
          setTexto(e.target.value);
          aoMudar(v);
        }}
        onBlur={(e) => {
          // Ao sair do campo, normaliza o texto para o valor realmente gravado
          // (ex.: o usuário digitou "abc" -> mostra "centro").
          const v = valorDoCampoPosicao(e.target.value);
          externoRef.current = textoCampoPosicao(v);
          setTexto(textoCampoPosicao(v));
          aoMudar(v);
        }}
        className="edl-ring-foco w-full text-[11px] font-mono font-bold px-2 py-1.5 rounded-lg border border-[color:var(--edl-borda)] text-white disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      />
    </div>
  );
}

/**
 * Bloco de POSIÇÃO do vídeo. Recebe a CONFIG e o id do vídeo da célula — não
 * recebe, não calcula e não enxerga nada de corte.
 */
function BlocoPosicaoVideo({ config, idVideo, aoAtualizarConfig }) {
  // MESMA função que o Preview (`EditorCanvas`) e o payload (`mapearEditorLote`)
  // consomem — é por isso que o número da tela é o número do vídeo final.
  const posicao = posicaoEfetivaDoVideo(config, idVideo || null);
  // O escopo (lido aqui para o TEXTO) decide ONDE grava; quem decide de fato é
  // a própria função de escrita, que relê o escopo da config mais recente.
  const todos = editarTodosOsVideos(config);
  const aoMover = (eixo, valor) =>
    aoAtualizarConfig((cfg) =>
      atualizarPosicaoVideoNoConfig(cfg, {
        todos: editarTodosOsVideos(cfg),
        videoId: idVideo || null,
        mudancas: { [eixo]: valor },
      }),
    );
  const aoCentralizar = () =>
    aoAtualizarConfig((cfg) =>
      atualizarPosicaoVideoNoConfig(cfg, {
        todos: editarTodosOsVideos(cfg),
        videoId: idVideo || null,
        mudancas: { offsetX: null, offsetY: null },
      }),
    );
  const centralizado = posicao.offsetX == null && posicao.offsetY == null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Rotulo>Posição do vídeo (px)</Rotulo>
        <BotaoPequeno icone={RotateCcw} onClick={aoCentralizar} title="Voltar o vídeo ao centro do quadro (X e Y = centro)">
          Centralizar
        </BotaoPequeno>
      </div>
      <div className="flex gap-2">
        <CampoPosicao
          rotulo="X"
          valor={posicao.offsetX}
          aoMudar={(v) => aoMover('offsetX', v)}
          titulo="Posição horizontal do vídeo, em pixels do quadro 1080x1920"
        />
        <CampoPosicao
          rotulo="Y"
          valor={posicao.offsetY}
          aoMudar={(v) => aoMover('offsetY', v)}
          titulo="Posição vertical do vídeo, em pixels do quadro 1080x1920"
        />
      </div>
      <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
        {centralizado
          ? 'Vídeo centralizado. Arraste no Preview ou digite X/Y para tirá-lo de cima dos textos e logos do template.'
          : `Vídeo em X ${posicao.offsetX} / Y ${posicao.offsetY} px do quadro ${CANVAS_LARGURA}×${CANVAS_ALTURA}.`}
        {' '}Independente do corte: mexer aqui não altera as bordas cortadas.
        {todos ? '' : ' Vale só para este vídeo.'}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * BLOCOS DE CONFIGURAÇÃO POR ELEMENTO
 * Nenhum campo de POSIÇÃO (x/y) dos OUTROS elementos: mover/redimensionar
 * texto/logo/imagem é 100% mouse no Preview. A ÚNICA exceção é o VÍDEO, que
 * tem o bloco acima — a posição dele é o `overlay=x:y` do render.
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
    <div className="px-3.5 py-3.5 space-y-3.5">
      <span className="text-[11px] font-extrabold text-white">{rotulo}</span>
      <div>
        <Rotulo>Escrever texto</Rotulo>
        <textarea
          rows={3}
          value={t.conteudo || ''}
          onChange={(e) => aoMudar('conteudo', e.target.value)}
          placeholder="Escreva aqui…"
          className="edl-input w-full text-[11px] font-semibold px-2.5 py-2 rounded-lg resize-y outline-none"
        />
      </div>
      <div>
        <Rotulo>Fonte</Rotulo>
        <select
          value={t.fonte}
          onChange={(e) => aoMudar('fonte', e.target.value)}
          className="edl-input w-full text-[11px] font-semibold px-2.5 py-2 rounded-lg outline-none"
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
          className="edl-input w-full text-[11px] font-semibold px-2.5 py-2 rounded-lg outline-none"
        >
          {PESOS_TEXTO.map((p) => (
            <option key={p.id} value={p.id}>{p.rotulo}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
            Emoji
          </span>
          <BotaoEmoji aoInserir={(emoji) => aoMudar('conteudo', `${t.conteudo || ''}${emoji}`)} />
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
              className={`edl-ring-foco flex-1 text-[10px] font-bold px-2 py-2 rounded-lg border transition-colors ${
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
            className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border border-[color:var(--edl-borda)] p-0.5 shrink-0"
          />
          <input
            type="text"
            value={t.cor || '#0f172a'}
            spellCheck={false}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) aoMudar('cor', e.target.value);
            }}
            className="edl-input flex-1 min-w-0 text-[11px] font-mono px-2.5 py-2 rounded-lg outline-none"
          />
        </div>
      </div>
      <Deslizador rotulo="Tamanho da fonte" sufixo="px" valor={Math.round(t.tamanho ?? 72)} min={10} max={160} aoMudar={(v) => aoMudar('tamanho', v)} />
      <Deslizador rotulo="Largura do bloco" sufixo="%" valor={Math.round(t.largura ?? 46)} min={10} max={100} aoMudar={(v) => aoMudar('largura', v)} />
      <Deslizador rotulo="Opacidade" sufixo="%" valor={Math.round(t.opacidade ?? 100)} min={0} max={100} aoMudar={(v) => aoMudar('opacidade', v)} />
      <Alternar rotulo={`${rotulo} visível`} ativo={!!t.visivel} aoMudar={(v) => aoMudar('visivel', v)} />
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
        Arraste o selo no Preview pra posicionar (sem X/Y).
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

const CLASSE_POPUP_TEXTO =
  'relative mx-2 my-2 z-10 rounded-xl border border-[color:var(--edl-borda)] p-3.5 shadow-2xl';

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
    if (id === 'texto') { // template-selecao
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
      /* ÁREA EFETIVA do vídeo (global ⊕ `areaPorVideo[id]`) — a MESMA função que
         o preview e o payload consomem. Toda escrita passa por
         `atualizarAreaVideoNoConfig`, que respeita o escopo "Editar todos" e
         NUNCA perde o enquadramento de quem foi editado sozinho. */
      const area = areaVideoEfetivaDoVideo(config, idSelecionado);
      /* ZOOM DO VÍDEO — UI FUNCIONAL (o texto antigo prometia a roda do mouse,
         que não existia). Slider (− / valor / +) + redefinir, gravando
         `areaVideo.zoom` (normalizado 1..4 — nunca < 1, o vídeo nunca fica menor
         que a área) e `deslocamentoX/Y` (centro em 50/50). É o MESMO valor que a
         roda do mouse grava no preview e que vira `scale`/`crop` no FFmpeg. */
      const zoom = normalizarZoomVideo(area.zoom);
      const aoMudarZoom = (novoZoom, deslocamentos = null) =>
        aoAtualizarConfig((cfg) => atualizarAreaVideoNoConfig(cfg, {
          todos: editarTodosOsVideos(cfg) || !idSelecionado,
          videoId: idSelecionado,
          mudancas: deslocamentos ? { zoom: novoZoom, ...deslocamentos } : { zoom: novoZoom },
        }));
      const passoZoom = 0.1;
      const pctZoom = Math.round(zoom * 100);
      return (
        <div className="px-3.5 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-white">Vídeo</span>
            <BotaoPequeno icone={Film} onClick={() => setPopup('video')}>Importar vídeos</BotaoPequeno>
          </div>
          <div>
            <Rotulo>Encaixe dentro da área</Rotulo>
            {/* INVARIANTE DO FLUXO: o vídeo SEMPRE preenche 100% da Área (cover
                — prévia e render usam a MESMA geometria de scale+crop). O modo
                'ajustar' (vídeo menor, centralizado, com fundo ao redor) não
                existe mais — a Área é a janela e o vídeo se adapta a ela, nunca
                o contrário. O indicador é fixo em "Cobrir". */}
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex-1 text-[10px] font-bold px-2 py-1.5 rounded-lg border border-[color:var(--edl-rosa)] text-white cursor-default"
                style={{ background: 'rgba(236,72,153,0.14)' }}
              >
                Cobrir (sempre preenche 100%)
              </button>
            </div>
          </div>
          {/* ZOOM DO VÍDEO — o controle que faltava: − / slider / + / redefinir.
              O valor é gravado em `areaVideo.zoom` (normalizado em 1..4) e viaja
              no payload como o `scale`/`crop` do FFmpeg — prévia = render. */}
          <div role="group" aria-label="Zoom do vídeo">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--edl-texto-dim)' }}>
                Zoom do vídeo
              </span>
              <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--edl-texto-mut)' }}>
                {pctZoom}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => aoMudarZoom(normalizarZoomVideo(zoom - passoZoom))}
                disabled={zoom <= ZOOM_VIDEO_MIN}
                aria-label="Diminuir zoom do vídeo"
                title="Diminuir zoom"
                className="edl-botao-fantasma edl-ring-foco w-7 h-7 shrink-0 rounded-lg text-[14px] font-black leading-none disabled:opacity-40"
              >
                −
              </button>
              <input
                type="range"
                aria-label="Zoom do vídeo"
                min={ZOOM_VIDEO_MIN * 100}
                max={ZOOM_VIDEO_MAX * 100}
                step={10}
                value={pctZoom}
                onChange={(e) => aoMudarZoom(normalizarZoomVideo(Number(e.target.value) / 100))}
                className="flex-1 h-1.5 accent-pink-500 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => aoMudarZoom(normalizarZoomVideo(zoom + passoZoom))}
                disabled={zoom >= ZOOM_VIDEO_MAX}
                aria-label="Aumentar zoom do vídeo"
                title="Aumentar zoom"
                className="edl-botao-fantasma edl-ring-foco w-7 h-7 shrink-0 rounded-lg text-[14px] font-black leading-none disabled:opacity-40"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => aoMudarZoom(ZOOM_VIDEO_MIN, { deslocamentoX: 50, deslocamentoY: 50 })}
                disabled={pctZoom === Math.round(ZOOM_VIDEO_MIN * 100)}
                aria-label="Redefinir enquadramento do vídeo"
                title="Redefinir enquadramento (volta a 100%, centralizado)"
                className="edl-botao-fantasma edl-ring-foco w-7 h-7 shrink-0 rounded-lg flex items-center justify-center disabled:opacity-40"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>
          {/* POSIÇÃO DO VÍDEO (X/Y) — bloco SEPARADO do corte logo abaixo/ acima.
              Ele lê e escreve SÓ `posicaoVideo`/`posicaoPorVideo` (px do quadro);
              o corte continua lendo/escrevendo SÓ `corteBordas`/`overridesPorVideo`
              (em % da altura do vídeo). Os dois blocos não se tocam. */}
          <BlocoPosicaoVideo
            config={config}
            idVideo={idSelecionado}
            aoAtualizarConfig={aoAtualizarConfig}
          />
          <p className="text-[9px] font-semibold leading-relaxed" style={{ color: 'var(--edl-texto-mut)' }}>
            Zoom do vídeo: use o controle acima, ou a roda do mouse SOBRE o vídeo no
            Preview (mantém o ponto sob o cursor). Acima de 100% o vídeo amplia e o
            arraste enquadra o conteúdo dentro da área. A posição X/Y acima é
            independente do zoom.
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
          {/* DETECÇÃO AUTOMÁTICA POR VÍDEO — DESATIVADA neste fluxo. O lote é
              renderizado com UM ÚNICO template BASE (o MESMO corte de bordas
              para todos os vídeos), então um resultado POR VÍDEO nunca
              chegaria ao vídeo final: só faria a prévia mostrar um corte
              diferente do render. O corte continua 100% definido pelo usuário
              (toggle + sliders aqui + linhas no Preview) e vale pro render. */}
          {typeof aoDetectarBordas === 'function' ? (
            <button
              type="button"
              onClick={aoDetectarBordas}
              disabled
              aria-disabled="true"
              title="Indisponível neste fluxo: o lote inteiro usa UM template BASE — o mesmo corte de bordas para todos os vídeos. Ajuste o corte pelo toggle/sliders/linhas (vale pro render)."
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
          Adicione elementos acima: Logo · Texto · Imagem · Vídeo. O Template e
          a Área do vídeo ficam no painel “Camadas”, à direita.
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

      {/* POPUP — TEXTO: configuração COMPLETA visível de uma vez (SEM scroll
          interno). Toggle Superior/Inferior troca TUDO junto (textarea +
          controles + elementoSelecionado). Edição live — fecha só com X. */}

{popup === 'texto' ? (
        <div
          className={CLASSE_POPUP_TEXTO}
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
          <div className="flex gap-1.5 mt-2">
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
          <div className="mt-1 -mx-1">
            <BlocoTexto
              chave={alvoTexto}
              rotulo={alvoTexto === 'inferior' ? 'Texto inferior' : 'Texto principal'}
              t={textos[alvoTexto] || {}}
              aoAtualizarConfig={aoAtualizarConfig}
            />
          </div>
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



