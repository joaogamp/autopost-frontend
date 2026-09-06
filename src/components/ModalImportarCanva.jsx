import { useState } from 'react';
import { importarTemplateCanva } from '../lib/api';

export default function ModalImportarCanva({ onFechar, onImportado }) {
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [corMarcador, setCorMarcador] = useState('#FF00FF');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function importar() {
    setErro('');
    if (!nome.trim()) return setErro('Dá um nome pro template.');
    if (!arquivo) return setErro('Escolha o arquivo PNG exportado do Canva.');

    setEnviando(true);
    const resultado = await importarTemplateCanva({ nome, arquivoOverlay: arquivo, corMarcadorTexto: corMarcador });
    setEnviando(false);

    if (resultado.erro) return setErro(resultado.erro);
    onImportado(resultado);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-panel rounded-2xl p-6 max-w-lg w-full border border-slate-200 shadow-xl space-y-5 relative bg-white">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">Importar template do Canva</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">
              Exporte do Canva como PNG com fundo transparente. Deixe a área do vídeo totalmente
              transparente.
            </p>
          </div>
          <button
            onClick={onFechar}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Nome do template</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Cineplay Review"
              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-indigo-600 transition-colors font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">Arquivo PNG (exportado do Canva)</label>
            <input
              type="file"
              accept="image/png"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">
              Cor do marcador de texto (opcional)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={corMarcador}
                onChange={(e) => setCorMarcador(e.target.value)}
                className="w-9 h-9 rounded-xl border border-slate-200 bg-transparent cursor-pointer"
              />
              <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                {corMarcador}
              </span>
            </div>
          </div>

          {erro && <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={onFechar}
            className="text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-4 py-2.5 rounded-xl transition-all shadow-xs"
          >
            Cancelar
          </button>
          <button
            onClick={importar}
            disabled={enviando}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <span>{enviando ? 'Importando...' : 'Importar Template'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
