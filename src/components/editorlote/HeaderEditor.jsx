import { Layers, Save, Zap, Send, Loader2 } from 'lucide-react';

/**
 * EDITOR EM LOTE — header superior.
 * Título + quantidade do lote + status + ações gerais com o gradiente rosa→roxo.
 *
 * DOIS BOTÕES (fluxo em duas fases):
 *  • "Implementar vídeo" — ÚNICA ação que renderiza: salva o template e
 *    enfileira o lote (mesma areaVideo para todos); os finais aparecem no
 *    Editor como PRONTOS para conferência.
 *  • "Processar vídeos" — APENAS encaminhamento: valida os PRONTOS e navega
 *    para o Agendar (NÃO renderiza, NÃO cria fila — os finais já existem).
 */
export default function HeaderEditor({
  total,
  status,
  aoSalvar,
  aoProcessar,
  salvando,
  processando,
  prontos = 0,
  aoEncaminhar,
  encaminhando = false,
}) {
  return (
    <header className="shrink-0 px-5 py-3.5 border-b border-[color:var(--edl-borda)] bg-[color:var(--edl-painel)] flex items-center gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--edl-grad)' }}>
          <Layers className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-base font-extrabold tracking-tight text-white leading-none">
            Editor em Lote
          </h1>
          <p className="text-[11px] font-medium mt-1 leading-none" style={{ color: 'var(--edl-texto-dim)' }}>
            {total} vídeo{total === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full edl-superficie">
        <span
          className="edl-dot"
          style={{
            background:
              status === 'Pronto' ? '#22c55e' : status === 'Processando' ? 'var(--edl-rosa)' : 'var(--edl-roxo)',
            boxShadow: '0 0 8px rgba(236,72,153,0.5)',
          }}
        />
        <span className="text-[11px] font-bold" style={{ color: 'var(--edl-texto-dim)' }}>
          {status}
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={aoSalvar}
          disabled={salvando}
          className="edl-botao-fantasma edl-ring-foco flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin edl-icone-a" /> : <Save className="w-3.5 h-3.5 edl-icone-a" />}
          Salvar
        </button>
        <button
          onClick={aoEncaminhar}
          disabled={encaminhando || !prontos}
          title={
            prontos
              ? 'Encaminha os vídeos PRONTOS para o Agendar (sem renderizar novamente)'
              : 'Nenhum vídeo PRONTO — clique em "Implementar vídeo" para gerar os finais'
          }
          className="edl-botao-fantasma edl-ring-foco flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {encaminhando ? <Loader2 className="w-3.5 h-3.5 animate-spin edl-icone-a" /> : <Send className="w-3.5 h-3.5 edl-icone-a" />}
          {encaminhando ? 'Encaminhando...' : prontos ? `Processar vídeos (${prontos})` : 'Processar vídeos'}
        </button>
        <button
          onClick={aoProcessar}
          disabled={processando}
          className="edl-botao-grad edl-ring-foco flex items-center gap-2 text-xs font-extrabold px-4 py-2 rounded-lg disabled:opacity-60"
        >
          {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 fill-white" />}
          {processando ? 'Enviando...' : 'Implementar vídeo'}
        </button>
      </div>
    </header>
  );
}