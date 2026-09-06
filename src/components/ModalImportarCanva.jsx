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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-line rounded-lg p-6 max-w-md w-full">
        <h3 className="font-display text-xl font-bold mb-1">Importar template do Canva</h3>
        <p className="text-xs text-text-dim mb-4">
          Exporte do Canva como PNG com fundo transparente. Deixe a área do vídeo totalmente
          transparente (sem nada desenhado ali). Se quiser texto dinâmico, pinte um retângulo
          sólido na cor marcadora abaixo onde ele deve aparecer.
        </p>

        <label className="text-xs text-text-dim block mb-1">Nome do template</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Cineplay Review"
          className="w-full bg-base border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-marquee mb-4"
        />

        <label className="text-xs text-text-dim block mb-1">Arquivo PNG (exportado do Canva)</label>
        <input
          type="file"
          accept="image/png"
          onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          className="w-full text-sm mb-4"
        />

        <label className="text-xs text-text-dim block mb-1">
          Cor do marcador de texto (opcional — deixe padrão se não souber)
        </label>
        <div className="flex items-center gap-2 mb-5">
          <input
            type="color"
            value={corMarcador}
            onChange={(e) => setCorMarcador(e.target.value)}
            className="w-9 h-9 rounded border border-line bg-transparent cursor-pointer"
          />
          <span className="text-sm text-text-dim">{corMarcador}</span>
        </div>

        {erro && <p className="text-xs text-status-erro mb-3">{erro}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onFechar} className="text-sm border border-line px-4 py-2 rounded-md hover:bg-surface-hover">
            Cancelar
          </button>
          <button
            onClick={importar}
            disabled={enviando}
            className="text-sm bg-marquee text-base px-4 py-2 rounded-md font-medium hover:brightness-110 disabled:opacity-50"
          >
            {enviando ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
