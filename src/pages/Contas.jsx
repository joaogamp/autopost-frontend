import { useEffect, useState } from 'react';
import { buscarContas, conectarInstagram, desconectarConta } from '../lib/api';
import RedeLabel from '../components/RedeLabel';
import { Info, LogOut, CheckCircle2, XCircle, Key, User } from 'lucide-react';

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
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-text">Contas</h2>
        <p className="text-xs text-text-muted mt-1 font-medium">Conecte suas contas de redes sociais para habilitar o envio automático</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* Instagram Card */}
        <div className="glass-panel rounded-2xl p-6 border border-line shadow-sm flex flex-col justify-between bg-surface">
          <div>
            <div className="flex items-center justify-between mb-5 border-b border-line pb-4">
              <h3 className="font-display text-lg font-bold text-text flex items-center gap-2">
                <RedeLabel rede="instagram" iconClass="w-5 h-5" />
              </h3>
              <span
                className={`text-xs px-3.5 py-1 rounded-full font-bold border flex items-center gap-1.5 transition-all ${
                  contas.instagram
                    ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                    : 'border-rose-500/30 text-rose-300 bg-rose-500/10'
                }`}
              >
                {contas.instagram ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>{contas.instagram ? 'Conectado' : 'Não conectado'}</span>
              </span>
            </div>

            {contas.instagram ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-surface-hover border border-line space-y-2">
                  {contas.instagram.username && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-rosa" />
                      <span className="text-xs text-text-muted font-bold">Conta:</span>
                      <p className="text-sm font-extrabold text-rosa">@{contas.instagram.username.replace(/^@/, '')}</p>
                    </div>
                  )}
                  <p className="text-xs text-text-muted font-mono font-medium flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-text-muted" />
                    <span>Token:</span>
                    <span className="text-text-dim font-bold">{contas.instagram.tokenMascarado || 'EAAxxx...ab3f'}</span>
                  </p>
                </div>
                <button
                  onClick={() => aoDesconectar('instagram')}
                  className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:underline px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar conta</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-text-dim block mb-1.5">Token de acesso</label>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Cole o token do Graph API aqui"
                    className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-xs text-text outline-none focus:border-rosa transition-colors font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-dim block mb-1.5">ID da conta comercial</label>
                  <input
                    value={igUserId}
                    onChange={(e) => setIgUserId(e.target.value)}
                    placeholder="Ex: 17841400000000000"
                    className="w-full bg-surface border border-line rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
                  />
                </div>
                {erro && <p className="text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl">{erro}</p>}
                <button
                  onClick={conectar}
                  disabled={conectando}
                  className="w-full bg-rosa hover:bg-rosa-hover text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rosa/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{conectando ? 'Testando conexão...' : 'Conectar Instagram'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* YouTube Card */}
        <div className="glass-panel rounded-2xl p-6 border border-line shadow-sm flex flex-col justify-between bg-surface">
          <div>
            <div className="flex items-center justify-between mb-5 border-b border-line pb-4">
              <h3 className="font-display text-lg font-bold text-text flex items-center gap-2">
                <RedeLabel rede="youtube" iconClass="w-5 h-5" />
              </h3>
              <span className="text-xs px-3.5 py-1 rounded-full font-bold border border-rose-500/30 text-rose-300 bg-rose-500/10 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Não conectado</span>
              </span>
            </div>
            <div className="p-4 rounded-xl bg-surface-hover border border-line text-xs text-text-muted leading-relaxed space-y-2 font-medium">
              <p className="font-bold text-text">Integração YouTube API</p>
              <p>Requer a configuração de credenciais OAuth 2.0 no Google Cloud Console.</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-line">
            <button
              disabled
              className="w-full bg-surface-hover border border-line text-text-muted px-4 py-2.5 rounded-xl text-xs font-bold opacity-70 cursor-not-allowed"
            >
              Em breve
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel p-4.5 rounded-2xl border border-line max-w-4xl flex items-start gap-3 bg-surface shadow-xs">
        <Info className="w-5 h-5 text-rosa shrink-0 mt-0.5" />
        <p className="text-xs text-text-dim leading-relaxed font-medium">
          O <RedeLabel rede="instagram" /> baixa o vídeo através de uma URL pública no momento da publicação — o servidor
          precisa estar acessível pela internet (notadamente Oracle Cloud/public IP) na hora de publicar de verdade.
        </p>
      </div>
    </div>
  );
}
