import { useEffect, useRef, useState } from 'react';
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
 * Toda a estrutura leva `data-edl-jugador` para que a ÁREA DO VÍDEO não
 * arrastre quando o usuário interage com o reproductor (gerarArrastreArea).
 */

function formatoTiempo(segs) {
  if (!Number.isFinite(segs) || segs < 0) return '0:00';
  const total = Math.floor(segs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ControlesVideo({ src, encaixe }) {
  const videoRef = useRef(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [duracion, setDuracion] = useState(0);
  const [progreso, setProgreso] = useState(0);
  const [volumen, setVolumen] = useState(100);
  const [silenciado, setSilenciado] = useState(false);

  // Al montar (src nuevo — el padre usa key={src}) intenta reproducción con
  // sonido; si el navegador lo bloquea, el usuario pulsa Play.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setVolumen(100);
    setSilenciado(false);
    v.play().catch(() => setReproduciendo(false));
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

  return (
    <div data-edl-jugador="true" className="absolute inset-0 w-full h-full">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        className="w-full h-full"
        style={{ objectFit: encaixe }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuracion(d);
        }}
        onTimeUpdate={(e) => setProgreso(e.currentTarget.currentTime || 0)}
        onPlay={() => setReproduciendo(true)}
        onPause={() => setReproduciendo(false)}
        onEnded={() => {
          setReproduciendo(false);
          setProgreso(duracion || 0);
        }}
      />

      {/* Barra de controles — Play/Pause · tempo · progresso · volume */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-2 px-2 py-1.5 text-white"
        style={{ background: 'linear-gradient(to top, rgba(10,10,16,0.95), rgba(10,10,16,0.45))' }}
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
    </div>
  );
}