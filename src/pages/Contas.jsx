import { useEffect, useState } from 'react';
import { buscarContas, conectarInstagram, desconectarConta } from '../lib/api';
import RedeLabel from '../components/RedeLabel';

export default function Contas() {
  const [contas, setContas] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setContas(await buscarContas());
  }

  useEffect(() => {
    carregar();
  }, []);

  async function conectar() {
    setErro('');
    if (!accessToken.trim() || !igUserId.trim()) {
      return setErro('Preencha o token e o ID da conta comercial.');
    }
    setConectando(true);
    const resultado = await conectarInstagram(accessToken.trim(), igUserId.trim());
    setConectando(false);

    if (resultado.erro) return setErro(resultado.erro);

    setAccessToken('');
    setIgUserId('');
    carregar();
  }

  async function aoDesconectar(plataforma) {
    await desconectarConta(plataforma);
    setAccessToken('');
    setIgUserId('');
    setErro('');
    carregar();
  }

  if (!contas) return null;

  return (
    <div>
      <h2 className="font-display text-3xl font-bold mb-6">Contas</h2>

      <div className="grid grid-cols-2 gap-5 max-w-3xl">
        {/* Instagram */}
        <div className="border border-line rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-semibold">
              <RedeLabel rede="instagram" />
            </h3>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                contas.instagram
                  ? 'bg-status-concluido/20 text-status-concluido'
                  : 'bg-status-erro/20 text-status-erro'
              }`}
            >
              {contas.instagram ? 'Conectado' : 'Não conectado'}
            </span>
          </div>

          {contas.instagram ? (
            <div>
              {contas.instagram.username && (
                <p className="text-sm font-medium">@{contas.instagram.username.replace(/^@/, '')}</p>
              )}
              <p className="text-xs text-text-dim mt-1">
                Token: {contas.instagram.tokenMascarado || 'EAAxxx...ab3f'}
              </p>
              <button
                onClick={() => aoDesconectar('instagram')}
                className="text-xs text-status-erro hover:underline mt-3"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-dim block mb-1">Token de acesso</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="Cole o token aqui"
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee"
                />
              </div>
              <div>
                <label className="text-xs text-text-dim block mb-1">ID da conta comercial</label>
                <input
                  value={igUserId}
                  onChange={(e) => setIgUserId(e.target.value)}
                  placeholder="Ex: 17841400000000000"
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee"
                />
              </div>
              {erro && <p className="text-xs text-status-erro">{erro}</p>}
              <button
                onClick={conectar}
                disabled={conectando}
                className="text-sm bg-marquee text-base px-4 py-2 rounded-md font-medium hover:brightness-110 disabled:opacity-50"
              >
                {conectando ? 'Testando conexão...' : 'Conectar'}
              </button>
            </div>
          )}
        </div>

        {/* YouTube */}
        <div className="border border-line rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-semibold">
              <RedeLabel rede="youtube" />
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-status-erro/20 text-status-erro font-medium">
              Não conectado
            </span>
          </div>
          <p className="text-xs text-text-dim">
            Ainda não configurado. Precisa das credenciais OAuth do Google Cloud Console.
          </p>
        </div>
      </div>

      <p className="text-[11px] text-text-dim mt-6 max-w-3xl border-t border-line pt-4">
        O <RedeLabel rede="instagram" /> baixa o vídeo através de uma URL pública no momento da publicação — o servidor
        precisa estar acessível pela internet (não só localhost) na hora de publicar de verdade.
      </p>
    </div>
  );
}
