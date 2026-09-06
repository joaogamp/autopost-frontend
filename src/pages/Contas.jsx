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
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Contas</h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">Conecte suas contas de redes sociais para habilitar o envio automático</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* Instagram Card */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-center justify-between mb-5 border-b border-slate-200 pb-4">
              <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                <RedeLabel rede="instagram" iconClass="w-5 h-5" />
              </h3>
              <span
                className={`text-xs px-3.5 py-1 rounded-full font-bold border flex items-center gap-1.5 transition-all ${
                  contas.instagram
                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                    : 'border-rose-200 text-rose-700 bg-rose-50'
                }`}
              >
                {contas.instagram ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>{contas.instagram ? 'Conectado' : 'Não conectado'}</span>
              </span>
            </div>

            {contas.instagram ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  {contas.instagram.username && (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs text-slate-500 font-bold">Conta:</span>
                      <p className="text-sm font-extrabold text-indigo-600">@{contas.instagram.username.replace(/^@/, '')}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 font-mono font-medium flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-400" />
                    <span>Token:</span>
                    <span className="text-slate-700 font-bold">{contas.instagram.tokenMascarado || 'EAAxxx...ab3f'}</span>
                  </p>
                </div>
                <button
                  onClick={() => aoDesconectar('instagram')}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar conta</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1.5">Token de acesso</label>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Cole o token do Graph API aqui"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-600 transition-colors font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1.5">ID da conta comercial</label>
                  <input
                    value={igUserId}
                    onChange={(e) => setIgUserId(e.target.value)}
                    placeholder="Ex: 17841400000000000"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-indigo-600 transition-colors"
                  />
                </div>
                {erro && <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">{erro}</p>}
                <button
                  onClick={conectar}
                  disabled={conectando}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{conectando ? 'Testando conexão...' : 'Conectar Instagram'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* YouTube Card */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-center justify-between mb-5 border-b border-slate-200 pb-4">
              <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                <RedeLabel rede="youtube" iconClass="w-5 h-5" />
              </h3>
              <span className="text-xs px-3.5 py-1 rounded-full font-bold border border-rose-200 text-rose-700 bg-rose-50 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Não conectado</span>
              </span>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 leading-relaxed space-y-2 font-medium">
              <p className="font-bold text-slate-900">Integração YouTube API</p>
              <p>Requer a configuração de credenciais OAuth 2.0 no Google Cloud Console.</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-slate-200/80">
            <button
              disabled
              className="w-full bg-slate-100 border border-slate-200 text-slate-400 px-4 py-2.5 rounded-xl text-xs font-bold opacity-70 cursor-not-allowed"
            >
              Em breve
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel p-4.5 rounded-2xl border border-slate-200 max-w-4xl flex items-start gap-3 bg-white shadow-xs">
        <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          O <RedeLabel rede="instagram" /> baixa o vídeo através de uma URL pública no momento da publicação — o servidor
          precisa estar acessível pela internet (notadamente Oracle Cloud/public IP) na hora de publicar de verdade.
        </p>
      </div>
    </div>
  );
}
