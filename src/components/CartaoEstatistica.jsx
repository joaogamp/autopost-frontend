export default function CartaoEstatistica({ rotulo, valor, corDestaque, icon: Icon }) {
  const accentColor = corDestaque || '#4f46e5';

  return (
    <div className="glass-card rounded-2xl px-6 py-5 border border-slate-200 hover:border-slate-300 transition-all duration-200 relative overflow-hidden group shadow-sm bg-white">
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-1 opacity-90 transition-opacity"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
      />
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{rotulo}</p>
        {Icon ? (
          <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" style={{ color: accentColor }} />
        ) : (
          <div
            className="w-2.5 h-2.5 rounded-full group-hover:scale-125 transition-transform"
            style={{ backgroundColor: accentColor }}
          />
        )}
      </div>
      <p
        className="font-display text-4xl font-extrabold tracking-tight text-slate-900"
        style={corDestaque ? { color: corDestaque } : undefined}
      >
        {valor}
      </p>
    </div>
  );
}
