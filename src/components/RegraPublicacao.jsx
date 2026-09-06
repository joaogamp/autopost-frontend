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
    <div className="glass-panel rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-display text-lg font-bold text-slate-900">Publicação automática</h3>
        </div>

        <button
          onClick={() => setRegra({ ...regra, ativa: !regra.ativa })}
          className={`text-xs px-3.5 py-1.5 rounded-full font-bold border transition-all flex items-center gap-1.5 ${
            regra.ativa
              ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
              : 'border-slate-200 text-slate-500 bg-slate-100'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${regra.ativa ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          <span>{regra.ativa ? 'Ativada' : 'Desativada'}</span>
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-6 max-w-2xl leading-relaxed font-medium">
        Quando ativada, todo vídeo que terminar de processar no template entra sozinho no próximo
        horário livre — sem precisar agendar manualmente.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-200/80">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-2.5">
            Vídeos por dia ({regra.horarios.length})
          </label>
          <div className="space-y-2">
            {regra.horarios.map((horario, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={horario}
                  onChange={(e) => mudarHorario(i, e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-indigo-600 transition-colors"
                />
                {regra.horarios.length > 1 && (
                  <button
                    onClick={() => removerHorario(i)}
                    className="text-rose-600 hover:text-rose-700 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    remover
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={adicionarHorario}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline pt-1 inline-block"
            >
              + Adicionar horário
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-2.5">Dias da semana</label>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((dia) => {
              const ativo = regra.diasSemana.includes(dia.valor);
              return (
                <button
                  key={dia.valor}
                  onClick={() => alternarDia(dia.valor)}
                  className={`text-xs font-bold w-10 py-2 rounded-xl border transition-all ${
                    ativo
                      ? 'border-indigo-200 text-indigo-700 bg-indigo-50 shadow-xs'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900 bg-slate-50'
                  }`}
                >
                  {dia.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-2.5">Redes sociais</label>
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
                      ? 'border-indigo-200 text-indigo-700 bg-indigo-50 shadow-xs'
                      : 'border-slate-200 text-slate-400 bg-slate-50 hover:text-slate-600'
                  }`}
                >
                  <RedeLabel rede={rede.id} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pt-5 mt-4 border-t border-slate-200/80 flex items-center justify-end">
        <button
          onClick={salvar}
          disabled={salvando}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          <span>{salvando ? 'Salvando...' : 'Salvar regra'}</span>
        </button>
      </div>
    </div>
  );
}
