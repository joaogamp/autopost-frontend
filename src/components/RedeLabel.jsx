export default function RedeLabel({ rede, className = '' }) {
  const r = (rede || '').toLowerCase();
  if (r === 'instagram') {
    return <span className={`text-brand-instagram ${className}`}>Instagram</span>;
  }
  if (r === 'youtube') {
    return <span className={`text-brand-youtube ${className}`}>YouTube</span>;
  }
  return <span className={className}>{rede}</span>;
}
