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
    <div className="border border-line rounded-lg p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-lg font-semibold">Publicação automática</h3>
        <button
          onClick={() => setRegra({ ...regra, ativa: !regra.ativa })}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            regra.ativa ? 'border-marquee text-marquee bg-marquee/10' : 'border-line text-text-dim'
          }`}
        >
          {regra.ativa ? 'Ativada' : 'Desativada'}
        </button>
      </div>
      <p className="text-[11px] text-text-dim mb-4">
        Quando ativada, todo vídeo que terminar de processar no template entra sozinho no próximo
        horário livre — sem precisar agendar manualmente.
      </p>

      <div className="grid grid-cols-3 gap-6">
        <div>
          <label className="text-xs text-text-dim block mb-2">
            Vídeos por dia ({regra.horarios.length})
          </label>
          <div className="space-y-2">
            {regra.horarios.map((horario, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={horario}
                  onChange={(e) => mudarHorario(i, e.target.value)}
                  className="bg-surface border border-line rounded-md px-2 py-1.5 text-sm outline-none focus:border-marquee"
                />
                {regra.horarios.length > 1 && (
                  <button onClick={() => removerHorario(i)} className="text-status-erro text-xs">
                    remover
                  </button>
                )}
              </div>
            ))}
            <button onClick={adicionarHorario} className="text-xs text-marquee hover:underline">
              + horário
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-text-dim block mb-2">Dias da semana</label>
          <div className="flex flex-wrap gap-1.5">
            {DIAS.map((dia) => {
              const ativo = regra.diasSemana.includes(dia.valor);
              return (
                <button
                  key={dia.valor}
                  onClick={() => alternarDia(dia.valor)}
                  className={`text-xs w-11 py-1.5 rounded-md border ${
                    ativo ? 'border-marquee text-marquee bg-marquee/10' : 'border-line text-text-dim'
                  }`}
                >
                  {dia.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-text-dim block mb-2">Redes sociais</label>
          <div className="flex gap-2">
            {REDES_DISPONIVEIS.map((rede) => {
              const ativo = regra.redes.includes(rede.id);
              return (
                <button
                  key={rede.id}
                  type="button"
                  onClick={() => alternarRede(rede.id)}
                  className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${
                    ativo ? 'border-marquee bg-marquee/10' : 'border-line opacity-60 hover:opacity-100'
                  }`}
                >
                  <RedeLabel rede={rede.id} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={salvar}
        disabled={salvando}
        className="mt-4 text-sm bg-marquee text-base px-4 py-2 rounded-md font-medium hover:brightness-110 disabled:opacity-50"
      >
        {salvando ? 'Salvando...' : 'Salvar regra'}
      </button>
    </div>
  );
}
