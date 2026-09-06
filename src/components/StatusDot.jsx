import { Clock, Loader2, CheckCircle2, AlertCircle, Upload, Calendar, FileText, Video } from 'lucide-react';

const CONFIG = {
  aguardando: {
    bgDot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-700 border-slate-200/80',
    label: 'Aguardando',
    icon: Clock,
  },
  agendado: {
    bgDot: 'bg-indigo-500',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    label: 'Agendado',
    icon: Calendar,
  },
  processando: {
    bgDot: 'bg-blue-500 animate-pulse',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
    label: 'Processando',
    icon: Loader2,
    spin: true,
  },
  renderizando: {
    bgDot: 'bg-purple-500 animate-pulse',
    badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
    label: 'Renderizando',
    icon: Video,
  },
  publicando: {
    bgDot: 'bg-amber-500 animate-pulse',
    badge: 'bg-amber-50 text-amber-700 border-amber-200/80',
    label: 'Publicando',
    icon: Upload,
  },
  concluido: {
    bgDot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    label: 'Concluído',
    icon: CheckCircle2,
  },
  publicado: {
    bgDot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    label: 'Publicado',
    icon: CheckCircle2,
  },
  erro: {
    bgDot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
    label: 'Erro',
    icon: AlertCircle,
  },
  rascunho: {
    bgDot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600 border-slate-200/80',
    label: 'Rascunho',
    icon: FileText,
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
