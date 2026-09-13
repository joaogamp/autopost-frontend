import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderEditor from '../components/editorlote/HeaderEditor';
import PainelDownloads from '../components/editorlote/PainelDownloads';
import GradeVideos from '../components/editorlote/GradeVideos';
import EditorCanvas from '../components/editorlote/EditorCanvas';
import PainelEditor from '../components/editorlote/PainelEditor';
import { usePoolDeVideos } from '../hooks/usePoolDeVideos';
import { criarConfigPadrao } from '../lib/configEditorLote';
import { processarLote, salvarTemplateDoEditor, buscarFila, urlArquivo } from '../lib/api';
import {
  configParaTemplatePayload,
  assinarConfig,
  urlLogoDoTemplate,
  proporcaoDaImagem,
} from '../lib/mapearEditorLote';

/**
 * EDITOR EM LOTE — página (header + 3 colunas), conectada ao FLUXO REAL:
 *
 *   ESQUERDA  PainelDownloads  — importa vídeos por URL (download REAL no
 *                               servidor: POST /api/importar-url + ffprobe +
 *                               thumbnail + biblioteca)
 *   CENTRO    GradeVideos      — todos os vídeos do lote (quantidade
 *                               arbitrária; thumbnails reais + lazy loading +
 *                               janela progressiva)
 *   DIREITA   EditorCanvas + PainelEditor — canvas 9:16 + controles da
 *                               CONFIG COMPARTILHADA (vale pro lote inteiro,
 *                               sem botão "Aplicar a todos")
 *
 * "Processar vídeos" (REAL): salva a config compartilhada como TEMPLATE no
 * servidor (POST /api/templates, multipart com a logo) → enfileira os vídeos
 * (POST /api/lote → Supabase fila_processamento) → a Oracle e/ou o WORKER
 * LOCAL (node worker-local.js, reserva atômica) processam → a UI acompanha o
 * progresso REAL via GET /api/fila (percentual por card, thumbnail e MP4 do
 * final quando concluído).
 *
 * Pool (usePoolDeVideos): no máximo 3 vídeos completos carregando ao mesmo
 * tempo; os demais cards ficam só na thumbnail.
 */

const CHAVE_LOTE = 'autopost:editorlote:v1';

/** Junta a config salva sobre a padrão (tolerante a versões antigas). */
function mesclarConfig(salva) {
  const base = criarConfigPadrao();
  if (!salva || typeof salva !== 'object') return base;
  return {
    ...base,
    ...salva,
    canvas: { ...base.canvas, ...salva.canvas },
    areaVideo: { ...base.areaVideo, ...salva.areaVideo },
    logo: { ...base.logo, ...salva.logo },
    texto: { ...base.texto, ...salva.texto },
  };
}

function carregarLoteSalvo() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOTE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || !Array.isArray(dados.itens)) return null;
    const config = mesclarConfig(dados.config);
    // blob: URLs não sobrevivem ao reload — descarta.
    if (config.logo.url && String(config.logo.url).startsWith('blob:')) {
      config.logo = { ...config.logo, url: null, arquivo: null };
    }
    // Sem limite de quantidade — restaura tudo o que foi salvo.
    const itens = dados.itens
      .filter((v) => v && v.id)
      .map((v) => ({
        ...v,
        bibliotecaId: v.bibliotecaId || null,
        filaId: v.filaId || null,
        percentual: v.percentual || 0,
        erroMensagem: v.erroMensagem || null,
        urlFonte: v.urlFonte || v.url || null,
        status: v.status || 'pronto',
      }));
    return { itens, config, templateId: dados.templateId || null, assinatura: dados.assinatura || null };
  } catch {
    return null;
  }
}

export default function EditorLote() {
  const loteSalvo = useMemo(() => carregarLoteSalvo(), []);
  const [itens, setItens] = useState(() => loteSalvo?.itens || []);
  const [config, setConfig] = useState(() => loteSalvo?.config || criarConfigPadrao());
  const [idSelecionado, setIdSelecionado] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [enfileirando, setEnfileirando] = useState(false);
  const [templateIdSalvo, setTemplateIdSalvo] = useState(() => loteSalvo?.templateId || null);
  const [assinaturaSalva, setAssinaturaSalva] = useState(() => loteSalvo?.assinatura || null);
  const [toast, setToast] = useState(null);
  const timerToast = useRef(null);
  const pollRef = useRef(null);
  const inicioFilaRef = useRef(0);
  const avisoWorkerRef = useRef(false);

  const pool = usePoolDeVideos(itens, idSelecionado);

  const mostrarToast = useCallback((mensagem, tipo = 'ok') => {
    setToast({ mensagem, tipo });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => clearTimeout(timerToast.current), []);

  // Seleciona o primeiro vídeo automaticamente (o canvas nunca fica vazio).
  useEffect(() => {
    if (!idSelecionado && itens.length > 0) setIdSelecionado(itens[0].id);
  }, [itens, idSelecionado]);

  const aoAdicionarVideo = useCallback((novo) => {
    setItens((atual) => {
      // Sem limite de quantidade — só evita duplicado (mesmo vídeo da
      // biblioteca importado duas vezes).
      if (atual.some((v) => v.id === novo.id)) return atual;
      return [
        ...atual,
        {
          id: novo.id,
          bibliotecaId: novo.bibliotecaId || novo.id || null,
          nome: novo.nome || null,
          thumbnail: novo.thumbnail || null,
          urlFonte: novo.urlFonte || novo.url || null,
          duracao: novo.duracao || null,
          status: novo.status || 'pronto',
          percentual: 0,
          filaId: null,
          erroMensagem: null,
        },
      ];
    });
  }, []);

  const aoSelecionar = useCallback((item) => setIdSelecionado(item.id), []);
  const aoFocar = useCallback((item) => pool.solicitar(item.id), [pool.solicitar]);

  const itemSelecionado = useMemo(
    () => itens.find((v) => v.id === idSelecionado) || null,
    [itens, idSelecionado]
  );
  const urlVideoAtiva = idSelecionado ? pool.ativos[idSelecionado] || null : null;

  // -----------------------------------------------------------------------
  // FLUXO REAL — template no servidor + fila (Supabase) + worker local
  // -----------------------------------------------------------------------

  /** Salva/atualiza o TEMPLATE no servidor a partir da config compartilhada. */
  const garantirTemplate = useCallback(async () => {
    let configAtual = config;
    // Proporção da logo em falta (ex.: config restaurada do localStorage)?
    // Carrega a imagem agora — o template precisa de largura × altura em px.
    if (configAtual.logo.visivel && configAtual.logo.url && !configAtual.logo.alturaProporcao) {
      const prop = await proporcaoDaImagem(configAtual.logo.url);
      if (prop) {
        configAtual = { ...configAtual, logo: { ...configAtual.logo, alturaProporcao: prop } };
        setConfig(configAtual);
      }
    }

    const assinatura = assinarConfig(configAtual);
    if (templateIdSalvo && assinatura === assinaturaSalva) {
      return { templateId: templateIdSalvo, assinatura };
    }

    const template = await salvarTemplateDoEditor({
      payload: configParaTemplatePayload(configAtual),
      arquivoLogo: configAtual.logo.visivel && configAtual.logo.url ? configAtual.logo.arquivo || null : null,
      templateId: templateIdSalvo || null,
    });

    // URL estável da logo no servidor (a mesma que o worker baixa depois) —
    // substitui o blob: local na config compartilhada.
    const urlLogoServidor = urlLogoDoTemplate(template);
    if (urlLogoServidor) {
      configAtual = { ...configAtual, logo: { ...configAtual.logo, url: urlLogoServidor } };
      setConfig(configAtual);
    }
    const assinaturaFinal = assinarConfig(configAtual);
    setTemplateIdSalvo(template.id);
    setAssinaturaSalva(assinaturaFinal);
    return { templateId: template.id, assinatura: assinaturaFinal };
  }, [config, templateIdSalvo, assinaturaSalva]);

  /** Acompanha o progresso REAL dos itens na fila (GET /api/fila). */
  const iniciarPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const fila = await buscarFila();
        setItens((atual) => {
          let mudou = false;
          const proximo = atual.map((it) => {
            if (!it.filaId) return it;
            const linha = fila.find((f) => f.id === it.filaId);
            if (!linha) return it;
            const status = ['aguardando', 'processando', 'concluido', 'erro'].includes(linha.status)
              ? linha.status
              : it.status;
            const percentual = Number(linha.percentual) || 0;
            const erroMensagem = linha.erroMensagem || null;
            // Concluído → thumbnail e MP4 do FINAL (reais, do servidor).
            const thumbnail =
              status === 'concluido' ? urlArquivo(`/arquivos/thumbnails/${it.filaId}.jpg`) : it.thumbnail;
            const urlFonte =
              status === 'concluido' ? urlArquivo(`/arquivos/publicados/${it.filaId}.mp4`) : it.urlFonte;
            if (
              it.status === status &&
              it.percentual === percentual &&
              it.erroMensagem === erroMensagem &&
              it.thumbnail === thumbnail &&
              it.urlFonte === urlFonte
            ) {
              return it;
            }
            mudou = true;
            return { ...it, status, percentual, erroMensagem, thumbnail, urlFonte };
          });
          return mudou ? proximo : atual;
        });
      } catch {
        /* rede instável — tenta de novo no próximo tick */
      }
    }, 2000);
  }, []);

  const pararPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => pararPolling(), [pararPolling]);

  // Fila vazia → para o polling. Fila parada demais → avisa sobre o worker.
  useEffect(() => {
    const temAtivos = itens.some((it) => it.status === 'aguardando' || it.status === 'processando');
    if (!temAtivos && pollRef.current) {
      pararPolling();
      mostrarToast('Processamento do lote concluído.');
    }
    const temAguardando = itens.some((it) => it.status === 'aguardando');
    const temProcessando = itens.some((it) => it.status === 'processando');
    if (temProcessando) {
      inicioFilaRef.current = 0; // Oracle/worker ativo — zera o relógio
      avisoWorkerRef.current = false;
    } else if (
      temAguardando &&
      inicioFilaRef.current &&
      Date.now() - inicioFilaRef.current > 60000 &&
      !avisoWorkerRef.current
    ) {
      avisoWorkerRef.current = true;
      mostrarToast('Ninguém pegou a fila — inicie o Worker local: node worker-local.js', 'erro');
    }
  }, [itens, mostrarToast, pararPolling]);

  /** Status do lote derivado da FILA REAL (pro header). */
  const statusTexto = useMemo(() => {
    const aguardando = itens.filter((i) => i.status === 'aguardando').length;
    const processando = itens.filter((i) => i.status === 'processando').length;
    const concluidos = itens.filter((i) => i.status === 'concluido').length;
    const erros = itens.filter((i) => i.status === 'erro').length;
    if (enfileirando) return 'Enfileirando...';
    if (processando > 0) return `Processando: ${processando} em andamento`;
    if (aguardando > 0) return `Na fila: ${aguardando} aguardando`;
    if (erros > 0) return `Concluído com ${erros} erro(s)`;
    if (concluidos > 0) return `Pronto — ${concluidos} final(is)`;
    return 'Pronto';
  }, [itens, enfileirando]);

  const aoSalvar = useCallback(async () => {
    setSalvando(true);
    try {
      const { templateId, assinatura } = await garantirTemplate();
      const configPraSalvar = { ...config, logo: { ...config.logo, arquivo: null } };
      localStorage.setItem(
        CHAVE_LOTE,
        JSON.stringify({ itens, config: configPraSalvar, templateId, assinatura })
      );
      mostrarToast(`Lote salvo — ${itens.length} vídeo(s) + template no servidor.`);
    } catch (erro) {
      mostrarToast(erro.message || 'Não foi possível salvar o lote.', 'erro');
    } finally {
      setSalvando(false);
    }
  }, [config, itens, garantirTemplate, mostrarToast]);

  const aoProcessar = useCallback(async () => {
    if (enfileirando) return;
    const enfileiraveis = itens.filter((it) => it.bibliotecaId && it.status !== 'concluido');
    if (enfileiraveis.length === 0) {
      mostrarToast('Importe vídeos pela central de downloads antes de processar.', 'erro');
      return;
    }
    if (itens.some((it) => it.status === 'aguardando' || it.status === 'processando')) {
      mostrarToast('Este lote já está na fila de processamento.', 'erro');
      return;
    }

    setEnfileirando(true);
    try {
      // 1) Config compartilhada vira template REAL no servidor (com a logo).
      const { templateId } = await garantirTemplate();

      // 2) Enfileira na fila REAL (Supabase) — a Oracle e o worker local
      //    consomem com reserva atômica. O texto do lote vai como tituloIA.
      const videos = enfileiraveis.map((it) => ({
        bibliotecaId: it.bibliotecaId,
        tituloIA:
          config.texto.visivel && config.texto.conteudo.trim() !== '' ? config.texto.conteudo.trim() : '',
      }));
      const resposta = await processarLote(templateId, videos);
      const ids = resposta.ids || [];

      const mapaFila = new Map();
      enfileiraveis.forEach((it, i) => {
        if (ids[i]) mapaFila.set(it.bibliotecaId, ids[i]);
      });

      inicioFilaRef.current = Date.now();
      avisoWorkerRef.current = false;
      setItens((atual) =>
        atual.map((it) => {
          const filaId = mapaFila.get(it.bibliotecaId);
          return filaId ? { ...it, filaId, status: 'aguardando', percentual: 0, erroMensagem: null } : it;
        })
      );
      iniciarPolling();
      mostrarToast(`${ids.length} vídeo(s) na fila REAL de processamento.`);
    } catch (erro) {
      mostrarToast(erro.message || 'Falha ao enfileirar o lote.', 'erro');
    } finally {
      setEnfileirando(false);
    }
  }, [itens, config, enfileirando, garantirTemplate, iniciarPolling, mostrarToast]);

  return (
    <div className="edl-root h-full w-full flex flex-col overflow-hidden">
      <HeaderEditor
        total={itens.length}
        status={statusTexto}
        aoSalvar={aoSalvar}
        aoProcessar={aoProcessar}
        salvando={salvando}
        processando={enfileirando}
      />

      <div className="flex-1 min-h-0 flex">
        {/* ESQUERDA — central de downloads */}
        <aside className="w-[280px] shrink-0 h-full min-h-0">
          <PainelDownloads aoAdicionarVideo={aoAdicionarVideo} />
        </aside>

        {/* CENTRO — todos os vídeos do lote */}
        <section className="flex-1 min-w-0 h-full min-h-0">
          <GradeVideos
            itens={itens}
            idSelecionado={idSelecionado}
            ativosNoPool={pool.ativos}
            aoSelecionar={aoSelecionar}
            aoFocar={aoFocar}
          />
        </section>

        {/* DIREITA — editor: canvas fixo no topo + controles da config compartilhada */}
        <aside className="w-[340px] shrink-0 h-full min-h-0 overflow-y-auto border-l border-[color:var(--edl-borda)]">
          <div
            className="sticky top-0 z-10 border-b border-[color:var(--edl-borda)]"
            style={{ background: 'var(--edl-fundo)' }}
          >
            <EditorCanvas
              config={config}
              aoAtualizarConfig={setConfig}
              itemSelecionado={itemSelecionado}
              urlVideoAtiva={urlVideoAtiva}
            />
          </div>
          <PainelEditor config={config} aoAtualizarConfig={setConfig} itemSelecionado={itemSelecionado} />
        </aside>
      </div>

      {/* Toast de feedback */}
      {toast && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 edl-superficie rounded-xl px-4 py-2.5 flex items-center gap-2.5"
          style={{ background: 'var(--edl-painel)', boxShadow: '0 12px 40px -8px rgba(236,72,153,0.35)' }}
        >
          <span
            className="edl-dot shrink-0"
            style={{
              background: toast.tipo === 'erro' ? '#f87171' : '#22c55e',
              boxShadow: toast.tipo === 'erro' ? '0 0 8px rgba(248,113,113,0.6)' : '0 0 8px rgba(34,197,94,0.6)',
            }}
          />
          <span className="text-[11px] font-bold text-white">{toast.mensagem}</span>
        </div>
      )}
    </div>
  );
}
