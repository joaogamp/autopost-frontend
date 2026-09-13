import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderEditor from '../components/editorlote/HeaderEditor';
import PainelDownloads from '../components/editorlote/PainelDownloads';
import ListaVideos from '../components/editorlote/ListaVideos';
import GradeVideos from '../components/editorlote/GradeVideos';
import EditorCanvas from '../components/editorlote/EditorCanvas';
import PainelEditor from '../components/editorlote/PainelEditor';
import { usePoolDeVideos } from '../hooks/usePoolDeVideos';
import { criarConfigPadrao, criarIdentidadePadrao } from '../lib/configEditorLote';
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
 *   ESQUERDA  PainelDownloads  — importa vídeos LOCAIS (upload REAL no
 *                               servidor: POST /api/upload + ffprobe +
 *                               thumbnail + biblioteca) + GRADE dos vídeos do
 *                               lote (GradeVideos, modos 1X/2X/3X, scroll
 *                               vertical; clicar num vídeo abre no Canvas)
 *
 *   CENTRO    EditorCanvas (elemento PRINCIPAL) — canvas 9:16 GRANDE com
 *                               vídeo REAL (play/pausa/áudio/volume/progresso)
 *                               + logo + DOIS textos (superior/inferior) +
 *                               área do vídeo arrastável/redimensionável +
 *                               corte de bordas (linhas pontilhadas
 *                               superiores/inferiores INDEPENDENTES,
 *                               arrastáveis) — prévia em tempo real
 *
 *   DIREITA   PainelEditor     — controles da CONFIG COMPARTILHADA (vale pro
 *                               lote inteiro, sem botão "Aplicar a todos"):
 *                               Logo (popup grande) · Texto superior/inferior ·
 *                               Área do vídeo · Corte de bordas
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
 *
 * Persistência (localStorage `autopost:editorlote:v1`): autosave 350ms +
 * flush no unmount + `pagehide` (reload/fechar aba) + retomada do polling.
 * Persiste vídeos importados (metadados + URLs absolutas), vídeo selecionado,
 * templateId e TODA a config compartilhada — incluindo a logo (como dataURL,
 * pois File/blob: não sobrevivem). Ao voltar, tudo é restaurado como estava.
 */

const CHAVE_LOTE = 'autopost:editorlote:v1';

const EXTENSAO_POR_TIPO_LOGO = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/**
 * Reconstrói um File a partir de um dataURL (SÍNCRONO — usado ao restaurar a
 * logo, para que "Processar vídeos" reenvie a imagem sem re-escolher o arquivo).
 */
function arquivoDeDataUrl(dataUrl) {
  try {
    const partes = String(dataUrl).split(',');
    const tipo = /data:(.*?);base64/.exec(partes[0] || '')?.[1] || 'image/png';
    const bin = atob(partes[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = EXTENSAO_POR_TIPO_LOGO[tipo] || 'png';
    return new File([bytes], `logo-restaurada.${ext}`, { type: tipo });
  } catch {
    return null;
  }
}

/** Sanitiza os vídeos para persistência (SÓ metadados serializáveis). */
function itensParaSalvar(itens) {
  return (Array.isArray(itens) ? itens : [])
    .filter((it) => it && it.id && (it.urlFonte || it.thumbnail))
    .map((it) => ({
      id: it.id,
      bibliotecaId: it.bibliotecaId || it.id,
      nome: it.nome ?? null,
      thumbnail: it.thumbnail ?? null,
      urlFonte: it.urlFonte ?? null,
      duracao: it.duracao ?? null,
      filaId: it.filaId ?? null,
    }));
}

/**
 * Sanitiza a config para persistência. File e `blob:` NUNCA vão pro
 * localStorage (não sobrevivem a reload) — a logo persiste como dataURL em
 * `logo.logoDataUrl` (convertida pelo effect de conversão).
 */
function configParaSalvar(config, logoDataUrl) {
  const base = config && typeof config === 'object' ? config : criarConfigPadrao();
  const urlAtual = typeof base.logo?.url === 'string' ? base.logo.url : null;
  const urlLogo = urlAtual && !urlAtual.startsWith('blob:') ? urlAtual : logoDataUrl || null;
  const doBase =
    typeof base.logo?.logoDataUrl === 'string' && base.logo.logoDataUrl.startsWith('data:')
      ? base.logo.logoDataUrl
      : null;
  const dataUrl = doBase || logoDataUrl || (urlLogo && urlLogo.startsWith('data:') ? urlLogo : null);
  return {
    ...base,
    canvas: { ...base.canvas },
    areaVideo: { ...base.areaVideo },
    logo: {
      ...base.logo,
      url: urlLogo,
      arquivo: null,
      alturaProporcao: base.logo?.alturaProporcao ?? null,
      logoDataUrl: dataUrl,
    },
    textos: {
      superior: { ...base.textos?.superior },
      inferior: { ...base.textos?.inferior },
    },
    identidade: base.identidade
      ? {
        nome: { ...base.identidade.nome },
        usuario: { ...base.identidade.usuario },
        selo: { ...base.identidade.selo },
      }
      : base.identidade,
    corteBordas: base.corteBordas ? { ...base.corteBordas } : base.corteBordas,
  };
}

/** Junta a config salva sobre a padrão (tolerante a versões antigas). */
function mesclarConfig(salva) {
  const base = criarConfigPadrao();
  const padraoIdentidade = criarIdentidadePadrao();
  if (!salva || typeof salva !== 'object') return base;
  // Configs salvas ANTES da renomeação usavam a chave `corte` — migra para o
  // nome unificado `corteBordas` (front + back).
  const { corte, ...salvaSemLegado } = salva;
  return {
    ...base,
    ...salvaSemLegado,
    canvas: { ...base.canvas, ...salva.canvas },
    areaVideo: { ...base.areaVideo, ...salva.areaVideo },
    logo: { ...base.logo, ...salva.logo },
    // DOIS textos independentes: `textos.superior` + `textos.inferior`.
    // Configs antigas tinham um único `texto` — migra pra superior.
    textos: {
      superior: { ...base.textos.superior, ...(salva.textos?.superior || salva.texto || {}) },
      inferior: { ...base.textos.inferior, ...(salva.textos?.inferior || {}) },
    },
    corteBordas: { ...base.corteBordas, ...(salva.corteBordas || corte) },
    // IDENTIDADE DO CANAL (logo + nome + @ + selo azul): mescla os padrões
    // (configs antigas, sem `identidade`, ganham os valores padrão) — cada
    // elemento fica INDEPENDENTE e vale pro lote inteiro (config única).
    identidade: {
      ...padraoIdentidade,
      ...salva.identidade,
      nome: { ...padraoIdentidade.nome, ...salva.identidade?.nome },
      usuario: { ...padraoIdentidade.usuario, ...salva.identidade?.usuario },
      selo: { ...padraoIdentidade.selo, ...salva.identidade?.selo },
    },
  };
}

function carregarLoteSalvo() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOTE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || !Array.isArray(dados.itens)) return null;
    const config = mesclarConfig(dados.config);
    // LOGO: `blob:` e `File` NÃO sobrevivem a sair/voltar — a logo persiste
    // como dataURL (`logo.logoDataUrl`); aqui ela volta como url E como File
    // reconstruído (o "Processar" reenvia sem re-escolher o arquivo). Sem
    // dataURL e sem URL de servidor, a logo volta vazia (resto preservado).
    const salvaLogo = dados.config?.logo || {};
    const dataUrl =
      typeof salvaLogo.logoDataUrl === 'string' && salvaLogo.logoDataUrl.startsWith('data:')
        ? salvaLogo.logoDataUrl
        : null;
    let urlLogo =
      typeof salvaLogo.url === 'string' && !salvaLogo.url.startsWith('blob:') ? salvaLogo.url : null;
    if (!urlLogo) urlLogo = dataUrl;
    config.logo = {
      ...config.logo,
      url: urlLogo,
      arquivo: urlLogo && urlLogo.startsWith('data:') ? arquivoDeDataUrl(urlLogo) : null,
      logoDataUrl: dataUrl || (urlLogo && urlLogo.startsWith('data:') ? urlLogo : null),
      alturaProporcao: urlLogo ? config.logo.alturaProporcao ?? null : null,
    };
    // VÍDEOS: só metadados serializáveis (id + URLs ABSOLUTAS do servidor —
    // continuam válidas após sair/voltar). Estado de fila é resetado p/ valor
    // seguro; o polling é RETOMADO no mount quando há filaId (efeito abaixo).
    const itens = dados.itens
      .filter((v) => v && v.id && (v.urlFonte || v.url || v.thumbnail))
      .map((v) => ({
        id: v.id,
        bibliotecaId: v.bibliotecaId || v.id || null,
        nome: v.nome ?? null,
        thumbnail: v.thumbnail ?? null,
        urlFonte: v.urlFonte || v.url || null,
        duracao: v.duracao ?? null,
        filaId: v.filaId ?? null,
        status: v.filaId ? 'aguardando' : 'pronto',
        percentual: 0,
        erroMensagem: null,
      }));
    // Seleção consistente: o id restaurado tem prioridade; se sumiu, null
    // (o efeito abaixo abre o primeiro da lista).
    const idSelecionado = itens.some((it) => it.id === dados.idSelecionado)
      ? dados.idSelecionado
      : null;
    return {
      itens,
      config,
      idSelecionado,
      templateId: dados.templateId || null,
      assinatura: dados.assinatura || null,
    };
  } catch {
    return null;
  }
}

/** GRAVA o estado atual do editor no localStorage (autosave + botão Salvar). */
function salvarEstadoNoDisco({ itens, config, idSelecionado, templateId, assinatura, logoDataUrl }) {
  try {
    const carga = JSON.stringify({
      itens: itensParaSalvar(itens),
      config: configParaSalvar(config, logoDataUrl || null),
      idSelecionado: idSelecionado || null,
      templateId: templateId || null,
      assinatura: assinatura || null,
    });
    try {
      localStorage.setItem(CHAVE_LOTE, carga);
    } catch {
      // Quota excedida (logo em dataURL grande): regrava SEM a imagem — todo
      // o resto (vídeos, seleção, config) continua persistido.
      if (logoDataUrl) {
        try {
          localStorage.setItem(
            CHAVE_LOTE,
            JSON.stringify({
              itens: itensParaSalvar(itens),
              config: configParaSalvar(config, null),
              idSelecionado: idSelecionado || null,
              templateId: templateId || null,
              assinatura: assinatura || null,
            })
          );
        } catch {
          /* storage bloqueado — o editor segue funcionando sem persistir */
        }
      }
    }
  } catch {
    /* estado não-serializável — nunca quebra a UI */
  }
}

export default function EditorLote() {
  const loteSalvo = useMemo(() => carregarLoteSalvo(), []);
  const [itens, setItens] = useState(() => loteSalvo?.itens || []);
  const [config, setConfig] = useState(() => loteSalvo?.config || criarConfigPadrao());
  // Vídeo aberto no editor — TAMBÉM persistido (voltar = exatamente como estava).
  const [idSelecionado, setIdSelecionado] = useState(() => loteSalvo?.idSelecionado || null);
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

  // Seleciona o primeiro vídeo automaticamente (o canvas nunca fica vazio) e
  // mantém a seleção consistente: o vídeo restaurado do localStorage tem
  // prioridade; se ele não existir mais, cai pro primeiro da lista.
  useEffect(() => {
    if (itens.length === 0) {
      if (idSelecionado) setIdSelecionado(null);
      return;
    }
    if (!idSelecionado || !itens.some((it) => it.id === idSelecionado)) {
      setIdSelecionado(itens[0].id);
    }
  }, [itens, idSelecionado]);

  // dataURL da logo (File/blob: não sobrevivem a sair/voltar — o dataURL
  // sim). Inicializado com o valor restaurado, se houver.
  const logoDataUrlRef = useRef(
    loteSalvo?.config?.logo?.logoDataUrl && String(loteSalvo.config.logo.logoDataUrl).startsWith('data:')
      ? { arquivo: loteSalvo.config.logo.arquivo || null, dataUrl: loteSalvo.config.logo.logoDataUrl }
      : null
  );

  // Espelho em ref (sempre fresco): o flush de unmount/pagehide usa este.
  const estadoAtualRef = useRef(null);
  estadoAtualRef.current = {
    itens,
    config,
    idSelecionado,
    templateId: templateIdSalvo,
    assinatura: assinaturaSalva,
  };

  /** Descarrega o estado atual no localStorage (unmount + pagehide). */
  const descarregar = useCallback(() => {
    const atual = estadoAtualRef.current;
    if (!atual) return;
    salvarEstadoNoDisco({ ...atual, logoDataUrl: logoDataUrlRef.current?.dataUrl || null });
  }, []);

  // LOGO → dataURL: File/blob: NÃO sobrevivem a sair/voltar; o dataURL
  // (persistido em `logo.logoDataUrl`) sobrevive. Converte quando o arquivo
  // muda e regrava na hora (sem esperar outra edição).
  useEffect(() => {
    const arq = config.logo?.arquivo;
    if (!(arq instanceof File)) {
      if (!config.logo?.url) logoDataUrlRef.current = null;
      return undefined;
    }
    if (logoDataUrlRef.current?.arquivo === arq && logoDataUrlRef.current?.dataUrl) return undefined;
    let vivo = true;
    const leitor = new FileReader();
    leitor.onload = () => {
      if (!vivo) return;
      const dataUrl = String(leitor.result || '');
      if (!dataUrl.startsWith('data:')) return;
      logoDataUrlRef.current = { arquivo: arq, dataUrl };
      const atual = estadoAtualRef.current;
      if (atual) salvarEstadoNoDisco({ ...atual, logoDataUrl: dataUrl });
    };
    try {
      leitor.readAsDataURL(arq);
    } catch {
      // File ilegível: mantém o último dataURL válido (se houver).
    }
    return () => {
      vivo = false;
    };
  }, [config.logo]);

  // AUTOSAVE — qualquer mudança (vídeos, seleção ou a config inteira: logo,
  // identidade, textos, área do vídeo, corte, fundo) é gravada no localStorage
  // com debounce curto. Sair da aba e voltar recupera TUDO. Os itens guardam
  // URLs do servidor (uploads/thumbnails) — os vídeos sobrevivem e o pool
  // (usePoolDeVideos) remonta o <video> a partir da urlFonte.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        salvarEstadoNoDisco({
          itens,
          config,
          idSelecionado,
          templateId: templateIdSalvo,
          assinatura: assinaturaSalva,
          logoDataUrl: logoDataUrlRef.current?.dataUrl || null,
        }),
      350
    );
    return () => clearTimeout(timer);
  }, [itens, config, idSelecionado, templateIdSalvo, assinaturaSalva]);

  // Flush no unmount: garante que o ÚLTIMO estado vá pro localStorage mesmo
  // que o usuário saia da aba dentro da janela do debounce (trocar de página
  // desmonta esta página). Reload/fechar a aba: o cleanup do React NÃO roda —
  // `pagehide` garante o save nesses casos.
  useEffect(() => () => descarregar(), [descarregar]);
  useEffect(() => {
    window.addEventListener('pagehide', descarregar);
    return () => window.removeEventListener('pagehide', descarregar);
  }, [descarregar]);

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

  // Ao VOLTAR pro editor: se havia itens em processamento quando o usuário
  // saiu, retoma o acompanhamento do progresso automaticamente (a fila REAL
  // continua na Oracle/worker — só a UI tinha parado de olhar).
  const filaRetomadaRef = useRef(false);
  useEffect(() => {
    if (filaRetomadaRef.current) return;
    filaRetomadaRef.current = true;
    if (itens.some((it) => it.filaId && (it.status === 'aguardando' || it.status === 'processando'))) {
      iniciarPolling();
    }
  }, [itens, iniciarPolling]);

  // Fila vazia → para o polling. Fila parada demais → avisa sobre o worker.
  useEffect(() => {
    const temAtivos = itens.some((it) => it.status === 'aguardando' || it.status === 'processando');
    if (!temAtivos && pollRef.current) {
      pararPolling();
      mostrarToast('Processamento concluído.');
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
      // Grava o estado completo (itens + config + vídeo aberto) no localStorage.
      salvarEstadoNoDisco({ itens, config, idSelecionado, templateId, assinatura });
      mostrarToast(`Salvo — ${itens.length} vídeo(s) importado(s) + template no servidor.`);
    } catch (erro) {
      mostrarToast(erro.message || 'Não foi possível salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }, [config, itens, idSelecionado, garantirTemplate, mostrarToast]);

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
      //    consomem com reserva atômica. O texto SUPERIOR do lote vai como
      //    tituloIA (DOIS textos: superior + inferior, independentes).
      const textoSup = config.textos?.superior || config.texto;
      const videos = enfileiraveis.map((it) => ({
        bibliotecaId: it.bibliotecaId,
        tituloIA:
          textoSup.visivel && String(textoSup.conteudo || '').trim() !== ''
            ? String(textoSup.conteudo).trim()
            : '',
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
        {/* ESQUERDA — importação + LISTA dos vídeos importados (forma PRINCIPAL
            de selecionar o vídeo que aparece no Canvas/editor) */}
        <aside className="w-[280px] shrink-0 h-full min-h-0 flex flex-col border-r border-[color:var(--edl-borda)]">
          <PainelDownloads aoAdicionarVideo={aoAdicionarVideo} />
          <ListaVideos
            itens={itens}
            idSelecionado={idSelecionado}
            aoSelecionar={aoSelecionar}
            aoFocar={aoFocar}
          />
        </aside>

        {/* CENTRO — em cima o Canvas/preview de edição (SEPARADO da grade,
            tamanho médio) e embaixo a GRADE dos vídeos (1X/2X/3X = nº de
            colunas com vídeos DIFERENTES por linha, scroll vertical) */}
        <section className="flex-1 min-w-0 h-full min-h-0 flex flex-col">
          <div className="shrink-0 h-[52%] min-h-[380px] max-h-[560px] flex border-b border-[color:var(--edl-borda)]">
            <EditorCanvas
              config={config}
              aoAtualizarConfig={setConfig}
              itemSelecionado={itemSelecionado}
              urlVideoAtiva={urlVideoAtiva}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <GradeVideos
              itens={itens}
              idSelecionado={idSelecionado}
              ativosNoPool={pool.ativos}
              aoSelecionar={aoSelecionar}
              aoFocar={aoFocar}
            />
          </div>
        </section>

        {/* DIREITA — SOMENTE ferramentas do editor: Logo (popup de identidade:
            logo/nome/@/selo) · Texto superior · Texto inferior · Área do vídeo ·
            Corte de bordas · Fundo · Propriedades — config COMPARTILHADA */}
        <aside className="w-[340px] shrink-0 h-full min-h-0 overflow-y-auto border-l border-[color:var(--edl-borda)]">
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
