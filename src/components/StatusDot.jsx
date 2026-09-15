import { Clock, Loader2, CheckCircle2, AlertCircle, Upload, Calendar, FileText, Video, Film, Ban } from 'lucide-react';

const CONFIG = {
  // ---- Estados da fila de PROCESSAMENTO (Editor/Dashboard) — não alterar ----
  aguardando: {
    bgDot: 'bg-slate-400',
    badge: 'bg-surface-hover text-text-dim border-line',
    label: 'Aguardando',
    icon: Clock,
  },
  processando: {
    bgDot: 'bg-blue-500 animate-pulse',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    label: 'Processando',
    icon: Loader2,
    spin: true,
  },
  renderizando: {
    bgDot: 'bg-purple-500 animate-pulse',
    badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    label: 'Renderizando',
    icon: Video,
    spin: true,
  },
  concluido: {
    bgDot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    label: 'Concluído',
    icon: CheckCircle2,
  },
  rascunho: {
    bgDot: 'bg-slate-400',
    badge: 'bg-surface-hover text-text-dim border-line',
    label: 'Rascunho',
    icon: FileText,
  },
  // ---- Estados de AGENDAMENTO (rótulos da UI; valores internos não mudam) ----
  pronto: {
    bgDot: 'bg-slate-300',
    badge: 'bg-surface-hover text-text-dim border-line',
    label: 'Pronto',
    icon: Film,
  },
  programado: {
    bgDot: 'bg-rosa',
    badge: 'bg-rosa-dim text-rosa-hover border-rosa-borda/80',
    label: 'Programado',
    icon: Calendar,
  },
  publicando: {
    bgDot: 'bg-amber-500 animate-pulse',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    label: 'Publicando',
    icon: Upload,
    spin: true,
  },
  publicado: {
    bgDot: 'bg-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    label: 'Publicado',
    icon: CheckCircle2,
  },
  erro: {
    bgDot: 'bg-rose-500',
    badge: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    label: 'Erro',
    icon: AlertCircle,
  },
  cancelado: {
    bgDot: 'bg-slate-500',
    badge: 'bg-surface-hover text-text-muted border-line',
    label: 'Cancelado',
    icon: Ban,
  },
  // Compatibilidade: agendamentos vindos do backend com status interno 'agendado'.
  agendado: {
    bgDot: 'bg-rosa',
    badge: 'bg-rosa-dim text-rosa-hover border-rosa-borda/80',
    label: 'Programado',
    icon: Calendar,
  },
};

export default function StatusDot({ status, comRotulo = false, iconOnly = false }) {
  const conf = CONFIG[status] || CONFIG.aguardando;
  const IconComponent = conf.icon || Clock;

  if (iconOnly) {
    return <IconComponent className={`w-3.5 h-3.5 ${conf.spin ? 'animate-spin' : ''}`} title={conf.label} />;
  }

  if (comRotulo) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${conf.badge}`}>
        <IconComponent className={`w-3.5 h-3.5 ${conf.spin ? 'animate-spin' : ''}`} />
        <span>{conf.label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center" title={conf.label}>
      <span className={`w-2 h-2 rounded-full ${conf.bgDot}`} />
    </span>
  );
}