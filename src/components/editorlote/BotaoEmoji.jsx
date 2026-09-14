import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

/** Paleta curada estilo WhatsApp (~72 emojis comuns). Zero dependência. */
export const EMOJIS_COMUNS = [
  '😂','❤️','👍','🔥','👏','😮','😢','🙏','💪','🎉',
  '😍','🥰','😎','🤔','👀','💯','✅','❌','⚠️','⭐',
  '✨','💥','🎯','🚀','💡','🎁','🏆','👑','💎','🍀',
  '😀','😁','😅','🤣','😉','😋','😜','🤪','🥳','😭',
  '😡','🤯','🥺','😴','🤝','👋','✌️','🤞','🫶','❤️‍🔥',
  '💔','💖','💙','💚','💜','🖤','🤍','💰','📈','📣',
  '🎬','🎥','🎙️','🎧','📸','✂️','📌','🔔','⏰','🕐',
  '🌟','🌈','☀️','🌙','⚡','🌊','🌹','🍒','🍑','🔞',
  '🆕','🆒',
];

/** Insere texto na posição do cursor de um input/textarea, preservando seleção. */
export function inserirNoCursor(el, texto) {
  if (!el) return texto;
  try {
    const inicio = el.selectionStart ?? String(el.value ?? '').length;
    const fim = el.selectionEnd ?? inicio;
    const atual = String(el.value ?? '');
    const novo = atual.slice(0, inicio) + texto + atual.slice(fim);
    return { novo, cursor: inicio + texto.length };
  } catch {
    return { novo: String(el?.value || '') + texto, cursor: null };
  }
}

/** Botão [🙂] + popover compacto para o PRÓPRIO campo de texto. */
export default function BotaoEmoji({ campoRef, aoInserir }) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (e) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false);
    };
    const tecla = (e) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('pointerdown', fechar);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointerdown', fechar);
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto ]);

  const escolher = (emoji) => {
    const el = campoRef?.current;
    if (el) {
      const { novo, cursor } = inserirNoCursor(el, emoji);
      aoInserir(novo);
      requestAnimationFrame(() => {
        try {
          el.focus();
          if (cursor != null) el.setSelectionRange(cursor, cursor);
        } catch { /* noop */ }
      });
    } else {
      aoInserir(emoji, true);
    }
    setAberto(false);
  };

  return (
    <div ref={caixaRef} className="relative shrink-0">
      <button
        type="button"
        title="Inserir emoji"
        aria-label="Inserir emoji"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="edl-ring-foco w-9 h-9 rounded-lg flex items-center justify-center text-lg leading-none transition-colors edl-superficie hover:brightness-150"
      >
        <Smile className="w-4 h-4 edl-icone-a" />
      </button>
      {aberto && (
        <div
          role="dialog"
          aria-label="Escolher emoji"
          className="absolute right-0 bottom-11 z-[90] w-[248px] rounded-xl p-2 grid grid-cols-8 gap-0.5 overflow-y-auto"
          style={{ background: 'var(--edl-painel)', border: '1px solid var(--edl-borda)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', maxHeight: 192 }}
        >
          {EMOJIS_COMUNS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => escolher(em)}
              className="edl-ring-foco text-[19px] leading-none w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center"
            >
              {em}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
