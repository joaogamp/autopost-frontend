export default function CartaoEstatistica({ rotulo, valor, corDestaque }) {
  return (
    <div className="border border-line rounded-lg px-5 py-4 bg-surface/40">
      <p className="text-xs text-text-dim mb-1">{rotulo}</p>
      <p
        className="font-display text-4xl font-bold leading-none"
        style={corDestaque ? { color: corDestaque } : undefined}
      >
        {valor}
      </p>
    </div>
  );
}
