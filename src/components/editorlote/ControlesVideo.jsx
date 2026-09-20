import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, Volume2, VolumeX, RotateCcw } from 'lucide-react';

/**
 * EDITOR EM LOTE — reproductor REAL del vídeo no canvas central.
 *
 * O `<video>` deixou de ser um preview mudo surdo: agora tem:
 * - Play / Pause
 * - áudio (NÃO mutado por padrão)
 * - volume (slider) + silenciar
 * - barra de progresso com busqueda (seek) e tempo decorrido/total
 *
 * Toda a estrutura do player leva `data-edl-jugador` (compatibilidade) e a
 * barra de controles leva `data-edl-controles`: só a BARRA não arrasta
 * (play/seek/volume seguem funcionando) — o vídeo em si é arrastável
 * (gerarArrastreArea / gerarArrastarEnquadramentoVideo).
 *
 * SEPARAÇÃO ESTRUTURAL (CORTE x CONTROLES): o corte de bordas (clip-path no
 * EditorCanvas) recorta SOMENTE o conteúdo visual do vídeo original. A BARRA
 * de controles NÃO mora dentro da camada recortada: o EditorCanvas entrega
 * `destinoControles` (nó FIXO no fundo do preview, FORA do clip-path) e a
 * barra é PORTADA pra lá (createPortal). Assim os controles:
 * - nunca são cortados pelas linhas de corte;
 * - nunca mudam de posição por causa do corte (fixos no preview);
 * - continuam sempre visíveis e 100% interativos (play/pause, progresso,
 *   volume). Sem `destinoControles` (SSR/testes), a barra renderiza in-place
 *   (fallback idêntico ao comportamento anterior).
 */

function formatoTiempo(segs) {
  if (!Number.isFinite(segs) || segs < 0) return '0:00';
  const total = Math.floor(segs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ControlesVideo({ src, estiloVideo = null, posicaoObjeto = null, onDimensoes = null, destinoControles = null }) {
  // A ÁREA DO VÍDEO é exatamente o espaço que o vídeo deve preencher: o vídeo
  // ocupa SEMPRE 100% da área (object-fit: cover, centralizado) — nunca fica
  // pequeno/centralizado dentro dela. Qualquer valor legado do `encaixe`
  // ('cobrir'/'ajustar') é irrelevante: a geometria de preenchimento é cover
  // tanto na prévia (CSS) quanto no render (FFmpeg scale=increase+crop).
  const encaixeFinal = 'cover';
  const videoRef = useRef(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [volumen, setVolumen] = useState(100);
  const [silenciado, setSilenciado] = useState(false);

  // Al montar (src nuevo — el padre usa key={src}) o NÃO inicia
  // reproducción automática: el vídeo queda PAUSADO no primer frame, listo
  // para que el usuário pulse Play. Sin autoplay, sin loop automático.
  // Se mantienen Play/Pause, áudio (no muteado por defecto), volume e barra
  // de progresso.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setVolumen(100);
    setSilenciado(false);
    setReproduciendo(false);
  }, []);

  const terminado = duracion > 0 && !reproduciendo && progreso >= duracion - 0.08;

  function toggleReproduccion() {
    const v = videoRef.current;
    if (!v) return;
    if (terminado) {
      v.currentTime = 0;
      setProgreso(0);
      v.play().catch(() => setReproduciendo(false));
      return;
    }
    if (v.paused) {
      v.play().catch(() => setReproduciendo(false));
    } else {
      v.pause();
    }
  }

  function buscar(valor) {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(valor) || 0;
    v.currentTime = t;
    setProgreso(t);
  }

  function aoCambiarVolumen(valor) {
    const v = videoRef.current;
    setVolumen(valor);
    setSilenciado(valor === 0);
    if (v) {
      v.muted = valor === 0;
      v.volume = valor / 100;
    }
  }

  function alternarSilencio() {
    const v = videoRef.current;
    const novoSilencio = !silenciado;
    setSilenciado(novoSilencio);
    if (v) {
      v.muted = novoSilencio;
      if (!novoSilencio) {
        const vol = Math.max(20, Math.round((v.volume || 1) * 100));
        setVolumen(vol);
        v.volume = vol / 100;
      }
    }
  }

  // BARRA DE CONTROLES — camada FIXA do preview, estruturalmente SEPARADA do
  // vídeo recortado. O EditorCanvas entrega `destinoControles` (nó no fundo do
  // canvas, FORA do clip-path) e a barra é PORTADA pra lá: o corte de bordas
  // recorta SOMENTE o conteúdo visual do vídeo — play/pause, tempo, progresso,
  // volume e demais controles nunca são cortados, nunca mudam de posição por
  // causa do corte e seguem 100% interativos. FUNDO TRANSPARENTE: NENHUMA
  // camada translúcida sobre o vídeo/canvas — a área cortada (revelada pelo
  // clip-path no EditorCanvas) mostra o `corFundo` PURO (branco puro com
  // #ffffff), sem véu/gradiente escurecendo a região junto às linhas de corte.
  // Os botões/chips mantêm os seus próprios fundos (bg-black/45).
  // `onPointerDown` com stopPropagation: cliques nos controles NÃO vazam para
  // o canvas (não deselecionam, não iniciam arraste do vídeo) — passa a valer
  // também via portal, onde a barra não é mais descendente no DOM da camada de
  // vídeo. `pointerEvents: 'auto'` explícito: no portal o pai não é mais o
  // player box.
  const barra = (
    <div
      data-edl-controles="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-2 px-2 py-1.5 text-white"
      style={{ background: 'transparent', pointerEvents: 'auto' }}
    >
      <button
        type="button"
        onClick={toggleReproduccion}
        title={terminado ? 'Reproduzir de novo' : reproduciendo ? 'Pausar' : 'Reproduzir'}
        className="edl-ring-foco w-7 h-7 rounded-md bg-black/45 flex items-center justify-center shrink-0"
      >
        {terminado ? (
          <RotateCcw className="w-3.5 h-3.5" />
        ) : reproduciendo ? (
          <Pause className="w-3.5 h-3.5 fill-white" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-white" />
        )}
      </button>

      <span className="text-[8px] font-mono font-bold shrink-0" style={{ color: 'rgba(255,255,255,0.85)' }}>
        {formatoTiempo(progreso)}
        <span style={{ opacity: 0.55 }}> / {formatoTiempo(duracion)}</span>
      </span>

      <input
        type="range"
        aria-label="Progresso do vídeo"
        min={0}
        max={duracion > 0 ? duracion : 0}
        step="0.05"
        value={Math.min(progreso, duracion > 0 ? duracion : 0)}
        onChange={(e) => buscar(e.target.value)}
        className="flex-1 min-w-0 h-1.5 accent-pink-500 cursor-pointer"
      />

      <button
        type="button"
        onClick={alternarSilencio}
        title={silenciado ? 'Activar áudio' : 'Silenciar'}
        className="edl-ring-foco w-6 h-6 rounded-md bg-black/45 flex items-center justify-center shrink-0"
      >
        {silenciado ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
      </button>

      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={100}
        step={1}
        value={silenciado ? 0 : volumen}
        onChange={(e) => aoCambiarVolumen(Number(e.target.value))}
        className="w-14 h-1.5 accent-pink-500 cursor-pointer"
        title="Volume"
      />
    </div>
  );

  return (
    // `pointer-events: auto` explícito: a camada de vídeo do EditorCanvas é
    // `pointer-events-none` (para os cliques fora do player caírem no guia da
    // área); o player (vídeo) continua 100% interativo.
    <div
      data-edl-jugador="true"
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'auto' }}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="w-full h-full"
        style={{ objectFit: encaixeFinal, ...(posicaoObjeto ? { objectPosition: posicaoObjeto } : null), ...(estiloVideo || null) }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuracion(d);
          // Dimensões REAIS do vídeo (largura/altura da fonte): o arraste e o
          // zoom do enquadramento usam para acompanhar o mouse 1:1.
          if (typeof onDimensoes === 'function') {
            onDimensoes({ largura: e.currentTarget.videoWidth, altura: e.currentTarget.videoHeight });
          }
        }}
        onTimeUpdate={(e) => setProgreso(e.currentTarget.currentTime || 0)}
        onPlay={() => setReproduciendo(true)}
        onPause={() => setReproduciendo(false)}
        onEnded={() => {
          setReproduciendo(false);
          setProgreso(duracion || 0);
        }}
      />

      {/* CONTROLES DO PLAYER — FORA da máscara/clip do vídeo. Com o destino
          fixo do EditorCanvas, a barra vive numa camada própria no fundo do
          preview (nunca cortada pelas linhas de corte, nunca reposicionada por
          causa delas). Sem destino (SSR/testes): fallback in-place. */}
      {destinoControles ? createPortal(barra, destinoControles) : barra}
    </div>
  );
}