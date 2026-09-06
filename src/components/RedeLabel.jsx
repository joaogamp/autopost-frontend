import RedeIcon from './RedeIcon';

export default function RedeLabel({ rede, className = '', comIcone = true, iconOnly = false, iconClass = 'w-4 h-4', colored = true }) {
  const r = (rede || '').toLowerCase();
  
  if (iconOnly) {
    return <RedeIcon rede={r} className={iconClass} colored={colored} />;
  }

  const nomeExibicao = r === 'instagram' ? 'Instagram' : r === 'youtube' ? 'YouTube' : rede;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {comIcone && <RedeIcon rede={r} className={iconClass} colored={colored} />}
      <span>{nomeExibicao}</span>
    </span>
  );
}
