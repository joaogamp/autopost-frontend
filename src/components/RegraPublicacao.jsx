import { useEffect, useState } from 'react';
import { buscarRegraPublicacao, salvarRegraPublicacao } from '../lib/api';
import RedeLabel from './RedeLabel';

const DIAS = [
  { valor: 1, label: 'Seg' },
  { valor: 2, label: 'Ter' },
  { valor: 3, label: 'Qua' },
  { valor: 4, label: 'Qui' },
  { valor: 5, label: 'Sex' },
  { valor: 6, label: 'Sáb' },
  { valor: 0, label: 'Dom' },
];

const REDES_DISPONIVEIS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
];

export default function RegraPublicacao() {
  const [regra, setRegra] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    buscarRegraPublicacao().then(setRegra);
  }, []);

  if (!regra) return null;

  function adicionarHorario() {
    setRegra({ ...regra, horarios: [...regra.horarios, '12:00'] });
  }

  function mudarHorario(indice, valor) {
    const novos = [...regra.horarios];
    novos[indice] = valor;
    setRegra({ ...regra, horarios: novos });
  }

  function removerHorario(indice) {
    setRegra({ ...regra, horarios: regra.horarios.filter((_, i) => i !== indice) });
  }

  function alternarDia(valor) {
    const jaTem = regra.diasSemana.includes(valor);
    setRegra({
      ...regra,
      diasSemana: jaTem ? regra.diasSemana.filter((d) => d !== valor) : [...regra.diasSemana, valor],
    });
  }

  function alternarRede(id) {
    const jaTem = regra.redes.includes(id);
    setRegra({
      ...regra,
      redes: jaTem ? regra.redes.filter((r) => r !== id) : [...regra.redes, id],
    });
  }

  async function salvar() {
    setSalvando(true);
    const atualizada = await salvarRegraPublicacao(regra);
    setRegra(atualizada);
    setSalvando(false);
  }

  return (
    <div className="glass-panel rounded-2xl p-6 border border-line shadow-sm mb-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rosa-dim border border-rosa-borda text-rosa flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-display text-lg font-bold text-text">Publicação automática</h3>
        </div>

        <button
          onClick={() => setRegra({ ...regra, ativa: !regra.ativa })}
          className={`text-xs px-3.5 py-1.5 rounded-full font-bold border transition-all flex items-center gap-1.5 ${
            regra.ativa
              ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
              : 'border-line text-text-muted bg-surface-hover'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${regra.ativa ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          <span>{regra.ativa ? 'Ativada' : 'Desativada'}</span>
        </button>
      </div>

      <p className="text-xs text-text-muted mb-6 max-w-2xl leading-relaxed font-medium">
        Quando ativada, todo vídeo que terminar de processar no template entra sozinho no próximo
        horário livre — sem precisar agendar manualmente.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-line">
        <div>
          <label className="text-xs font-bold text-text-dim block mb-2.5">
            Vídeos por dia ({regra.horarios.length})
          </label>
          <div className="space-y-2">
            {regra.horarios.map((horario, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={horario}
                  onChange={(e) => mudarHorario(i, e.target.value)}
                  className="bg-surface border border-line rounded-xl px-3 py-1.5 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
                />
                {regra.horarios.length > 1 && (
                  <button
                    onClick={() => removerHorario(i)}
                    className="text-rose-400 hover:text-rose-300 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    remover
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={adicionarHorario}
              className="text-xs font-bold text-rosa hover:text-rosa-hover hover:underline pt-1 inline-block"
            >
              + Adicionar horário
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-text-dim block mb-2.5">Dias da semana</label>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((dia) => {
              const ativo = regra.diasSemana.includes(dia.valor);
              return (
                <button
                  key={dia.valor}
                  onClick={() => alternarDia(dia.valor)}
                  className={`text-xs font-bold w-10 py-2 rounded-xl border transition-all ${
                    ativo
                      ? 'border-rosa-borda text-rosa-hover bg-rosa-dim shadow-xs'
                      : 'border-line text-text-muted hover:border-line-light hover:text-text bg-surface-hover'
                  }`}
                >
                  {dia.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-text-dim block mb-2.5">Redes sociais</label>
          <div className="flex gap-2">
            {REDES_DISPONIVEIS.map((rede) => {
              const ativo = regra.redes.includes(rede.id);
              return (
                <button
                  key={rede.id}
                  type="button"
                  onClick={() => alternarRede(rede.id)}
                  className={`text-xs px-4 py-2 rounded-xl border font-bold transition-all ${
                    ativo
                      ? 'border-rosa-borda text-rosa-hover bg-rosa-dim shadow-xs'
                      : 'border-line text-text-muted bg-surface-hover hover:text-text-dim'
                  }`}
                >
                  <RedeLabel rede={rede.id} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pt-5 mt-4 border-t border-line flex items-center justify-end">
        <button
          onClick={salvar}
          disabled={salvando}
          className="text-xs bg-rosa hover:bg-rosa-hover text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-rosa/20 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <span>{salvando ? 'Salvando...' : 'Salvar regra'}</span>
        </button>
      </div>
    </div>
  );
}
