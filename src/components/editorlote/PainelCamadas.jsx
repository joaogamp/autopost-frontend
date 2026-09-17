import {
  Scissors,
  Paintbrush,
  Type,
  Image as ImageIcon,
  ImagePlus,
  Film,
  Scan,
  User,
  AtSign,
  BadgeCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

/**
 * EDITOR EM LOTE — PAINEL DIREITO: CAMADAS.
 *
 * Cada elemento da composição é UMA camada (sem duplicatas: cada função tem
 * um único caminho — logo, textos, identidade, imagens, área, corte, vídeo,
 * fundo). A ordem da lista É a ordem de composição (de cima pra baixo no
 * preview e no render):
 *
 *   imagens → logo → texto principal → texto inferior → nome → @ → selo →
 *   área do vídeo (guia) → corte de borda → vídeo (base) → fundo (base).
 *
 * Cada camada:
 *  - clicar SELECIONA (destaca no preview + abre a configuração à esquerda);
 *  - olho MOSTRA/OCULTA escrevendo no flag REAL que viaja pro render
 *    (`visivel` da logo/textos/identidade/imagens, `ativo` do corte,
 *    `mostrarMarcacao` do guia da área). Vídeo e Fundo são a base da
 *    composição — não têm olho (ocultá-los não existe no render).
 */

/** Constrói a lista de camadas a partir da config COMPARTILHADA. Exportada
 * pra testes e pra manter UMA única definição da ordem de composição. */
export function construirCamadas(config) {
  if (!config || typeof config !== 'object') return [];
  const camadas = [];

  (config.imagens || []).forEach((im) => {
    if (!im) return;
    camadas.push({
      id: `imagem:${im.id}`,
      rotulo: im.nome || 'Imagem',
      Icone: ImagePlus,
      temOlho: true,
      visivel: !!im.visivel,
      alternar: (v) => ({ imagens: (config.imagens || []).map((x) => (x && x.id === im.id ? { ...x, visivel: v } : x)) }),
    });
  });

  camadas.push({
    id: 'logo',
    rotulo: 'Logo',
    Icone: ImageIcon,
    temOlho: true,
    visivel: !!config.logo?.visivel,
    alternar: (v) => ({ logo: { ...config.logo, visivel: v } }),
  });

  camadas.push({
    id: 'textoSuperior',
    rotulo: 'Texto principal',
    Icone: Type,
    temOlho: true,
    visivel: !!config.textos?.superior?.visivel,
    alternar: (v) => ({ textos: { ...config.textos, superior: { ...config.textos?.superior, visivel: v } } }),
  });

  camadas.push({
    id: 'textoInferior',
    rotulo: 'Texto inferior',
    Icone: Type,
    temOlho: true,
    visivel: !!config.textos?.inferior?.visivel,
    alternar: (v) => ({ textos: { ...config.textos, inferior: { ...config.textos?.inferior, visivel: v } } }),
  });

  camadas.push({
    id: 'identidadeNome',
    rotulo: 'Nome do canal',
    Icone: User,
    temOlho: true,
    visivel: !!config.identidade?.nome?.visivel,
    alternar: (v) => ({ identidade: { ...config.identidade, nome: { ...config.identidade?.nome, visivel: v } } }),
  });

  camadas.push({
    id: 'identidadeUsuario',
    rotulo: 'Usuário (@)',
    Icone: AtSign,
    temOlho: true,
    visivel: !!config.identidade?.usuario?.visivel,
    alternar: (v) => ({ identidade: { ...config.identidade, usuario: { ...config.identidade?.usuario, visivel: v } } }),
  });

  camadas.push({
    id: 'selo',
    rotulo: 'Selo de verificado',
    Icone: BadgeCheck,
    temOlho: true,
    visivel: !!config.identidade?.selo?.visivel,
    alternar: (v) => ({ identidade: { ...config.identidade, selo: { ...config.identidade?.selo, visivel: v } } }),
  });

  camadas.push({
    id: 'area',
    rotulo: 'Área do vídeo',
    Icone: Scan,
    temOlho: true,
    visivel: !!config.areaVideo?.mostrarMarcacao,
    // O olho da área controla o GUIA (marcação tracejada) na prévia — a área
    // em si é só a janela de composição do vídeo, nunca um elemento desenhado.
    dicaOlho: 'Mostrar/ocultar o guia da área na prévia',
    alternar: (v) => ({ areaVideo: { ...config.areaVideo, mostrarMarcacao: v } }),
  });

  camadas.push({
    id: 'corte',
    rotulo: 'Corte de borda',
    Icone: Scissors,
    temOlho: true,
    visivel: !!config.corteBordas?.ativo,
    // Flag REAL do render: desligar remove o corte do vídeo final.
    dicaOlho: 'Ativar/desativar o corte de bordas (vale pro render)',
    alternar: (v) => ({ corteBordas: { ...config.corteBordas, ativo: v } }),
  });

  camadas.push({ id: 'video', rotulo: 'Vídeo', Icone: Film, temOlho: false, visivel: true });
  camadas.push({ id: 'fundo', rotulo: 'Fundo', Icone: Paintbrush, temOlho: false, visivel: true });

  return camadas;
}

export default function PainelCamadas({ config, aoAtualizarConfig, elementoSelecionado, aoSelecionarElemento }) {
  const camadas = construirCamadas(config);

  return (
    <div className="h-full min-h-0 flex flex-col bg-[color:var(--edl-painel)]">
      {/* Cabeçalho */}
      <div className="shrink-0 px-3 py-3 border-b border-[color:var(--edl-borda)] flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 edl-icone-b shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
          <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
          <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
        </svg>
        <h2 className="font-display text-xs font-extrabold text-white">Camadas</h2>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--edl-roxo)' }}
        >
          {camadas.length}
        </span>
      </div>

      {/* Lista — ordem da composição (topo = frente) */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2">
        {camadas.length === 0 ? (
          <p className="text-[10px] font-semibold px-2 py-3" style={{ color: 'var(--edl-texto-mut)' }}>
            Nenhuma camada.
          </p>
        ) : (
          <ul className="flex flex-col gap-1" role="listbox" aria-label="Camadas da composição">
            {camadas.map((camada) => {
              const selecionada = elementoSelecionado === camada.id;
              const Icone = camada.Icone;
              return (
                <li key={camada.id}>
                  <div
                    className={`group flex items-center gap-1.5 rounded-lg pr-1 transition-colors ${
                      selecionada ? '' : 'hover:bg-white/5'
                    }`}
                    style={selecionada ? { background: 'rgba(236,72,153,0.14)', boxShadow: 'inset 0 0 0 1.5px var(--edl-rosa)' } : null}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={selecionada}
                      onClick={() => aoSelecionarElemento && aoSelecionarElemento(camada.id)}
                      className="edl-ring-foco flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left"
                      title={selecionada ? 'Camada selecionada' : `Selecionar ${camada.rotulo}`}
                    >
                      <Icone className={`w-3.5 h-3.5 shrink-0 ${selecionada ? 'edl-icone-a' : 'edl-icone-b opacity-80'}`} />
                      <span
                        className={`text-[11px] font-bold truncate ${selecionada ? 'text-white' : ''}`}
                        style={{ color: selecionada ? undefined : 'var(--edl-texto-dim)' }}
                      >
                        {camada.rotulo}
                      </span>
                    </button>

                    {camada.temOlho ? (
                      <button
                        type="button"
                        onClick={() =>
                          aoAtualizarConfig &&
                          aoAtualizarConfig((cfg) => ({ ...cfg, ...camada.alternar(!camada.visivel) }))
                        }
                        title={camada.dicaOlho || (camada.visivel ? 'Ocultar camada' : 'Mostrar camada')}
                        aria-label={`${camada.visivel ? 'Ocultar' : 'Mostrar'} ${camada.rotulo}`}
                        aria-pressed={camada.visivel}
                        className={`edl-ring-foco shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors ${
                          camada.visivel ? 'text-white/80 hover:text-white' : 'text-white/30 hover:text-white/60'
                        }`}
                      >
                        {camada.visivel ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span
                        className="shrink-0 w-6 h-6 flex items-center justify-center opacity-0"
                        title={`${camada.rotulo} é a base da composição — sempre visível`}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="shrink-0 px-3 py-2 text-[9px] font-semibold leading-relaxed border-t border-[color:var(--edl-borda)]" style={{ color: 'var(--edl-texto-mut)' }}>
        Ordem da composição (topo = frente). Clique numa camada pra editar à
        esquerda e destacá-la no preview; o olho liga/desliga o flag real que
        vai pro render.
      </p>
    </div>
  );
}
