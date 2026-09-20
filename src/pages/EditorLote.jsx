import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderEditor from '../components/editorlote/HeaderEditor';
import AreaCentral from '../components/editorlote/AreaCentral';
import PainelEditor from '../components/editorlote/PainelEditor';
import PainelCamadas from '../components/editorlote/PainelCamadas';
import PainelDownloads from '../components/editorlote/PainelDownloads';
import ListaVideos from '../components/editorlote/ListaVideos';
import { usePoolDeVideos } from '../hooks/usePoolDeVideos';
import {
  criarConfigPadrao,
  criarConfigLimpaDeLote,
  criarIdentidadePadrao,
  loteTemEdicoesAtivas,
  normalizarConfigEditor,
} from '../lib/configEditorLote';
import { detectarBordasDoVideo } from '../lib/detectorBordas.js';
import { processarLote, salvarTemplateDoEditor, buscarFila, buscarBiblioteca, urlArquivo, listarFinais } from '../lib/api';
import {
  configParaTemplatePayload,
  assinarConfig,
  urlLogoDoTemplate,
  proporcaoDaImagem,
} from '../lib/mapearEditorLote';

/**
 * EDITOR EM LOTE — página (header + 3 colunas), conectada ao FLUXO REAL:
 *
 *   ESQUERDA  PainelDownloads + ListaVideos — importa videos LOCAIS
 *                               (upload REAL no servidor) + lista dos videos
 *                               importados (clicar seleciona o video principal).
 *
 *   CENTRO    AreaCentral — O PROPRIO ESPACO CENTRAL mostra os MESMOS videos
 *                               da esquerda (sem secao separada, sem faixa
 *                               abaixo do preview). Topo com botoes 1X/2X/3X =
 *                               SOMENTE qtd. de videos lado a lado (1/2/3
 *                               videos DIFERENTES por linha, demais nas linhas
 *                               seguintes). Cada celula usa o MESMO
 *                               EditorCanvas (config COMPARTILHADA); clicar
 *                               seleciona o video principal editavel (SOMENTE
 *                               a celula selecionada edita).
 *
 *   DIREITA   PainelEditor     — controles da CONFIG COMPARTILHADA (vale pro
 *                               lote inteiro, sem botão "Aplicar a todos"):
 *                               Logo (popup grande) · Texto superior/inferior ·
 *                               Área do vídeo · Corte de bordas
 *
 * PRÉVIA x PROCESSAMENTO: o canvas (AreaCentral → EditorCanvas) mostra SEMPRE
 * o VÍDEO ORIGINAL NORMAL (quadro completo, `contain`) + logo/textos/
 * identidade — a área de composiçom (`areaVideo`) é apenas um GUIA tracejado e
 * o corte automático de bordas NÃO aparece na prévia: ambos são aplicados
 * SOMENTE no processamento final (template → FFmpeg/worker).
 *
 * LIXEIRA: a lista (ListaVideos) e o card do VÍDEO BASE (AreaCentral) têm uma
 * lixeira discreta que remove o vídeo da LISTA do Editor — remoção LOCAL
 * (estado + localStorage, feita por `aoRemoverVideo`), sem apagar o arquivo
 * original da Biblioteca/Oracle, sem tocar na fila/worker e sem afetar os
 * demais vídeos nem a config compartilhada (logo/texto/template).
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
 * pois File/blob: não sobrevivem).
 *
 * REGRA DEFINITIVA anti-herança (sessão/lote): a config pertence a um lote
 * (`config.loteId`). A marca do lote atual vive no sessionStorage — morre
 * quando a aba fecha, sobrevive a F5/reload na MESMA aba:
 *   · MESMA sessão (marca === loteId salvo)  → restaura TUDO como estava
 *     (inclui a logo adicionada explicitamente naquele lote);
 *   · NOVA sessão (aba fechada/nova/1º acesso) → config ZERADA: logo, textos,
 *     identidade, cortes (global e overridesPorVideo) NÃO herdam nada do lote
 *     anterior; os VÍDEOS seguem restaurados (são conteúdo, não edição).
 * Lote vazio (último vídeo removido) encerra o lote: o próximo import começa
 * limpo. O template só é reutilizado quando o usuário processa de novo com a
 * MESMA config (assinatura) — reutilização nunca é automática entre lotes.
 * A restauração também VALIDA cada `bibliotecaId` contra GET /api/biblioteca:
 * referências órfãs (vídeo que não existe mais no servidor) são limpas na
 * entrada — itens válidos ficam intactos; consulta falhando, nada é removido
 * (fail-open). Sem isso, um id antigo no localStorage faz o /api/lote rejeitar
 * o lote inteiro com "Vídeo ... não encontrado na biblioteca do servidor."
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

/** Sanitiza os vídeos para persistência (SÓ metadados serializáveis).
 * filaId/status/percentual/erro NUNCA são persistidos: o estado de fila é
 * sempre revalidado contra o backend (retomada de polling no mount). Isso
 * também garante que um vídeo removido após concluir NÃO reaparece no reload
 * (não há como "ressuscitar" sem filaId salvo). */
function itensParaSalvar(itens) {
  return (Array.isArray(itens) ? itens : [])
    .filter(
      (it) =>
        it &&
        it.id &&
        (it.urlFonte || it.thumbnail) &&
        !(it.filaId && it.status === 'concluido' && Number(it.percentual) === 100)
    )
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

/** Chave do lote no localStorage (sessão atual). */
export const CHAVE_LOTE_ATUAL = 'autopost:editorlote:lote_atual_v1';

/** Gera o id de um NOVO lote (nova sessão de edição). */
export function novoIdDeLote() {
  return `lote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sanitiza a config para persistência. File e `blob:` NUNCA vão pro
 * localStorage (não sobrevivem a reload) — a logo persiste como dataURL em
 * `logo.logoDataUrl` (convertida pelo effect de conversão).
 *
 * Anti-herança: `loteId`/`loteCriadoEm` viajam junto para que a restauração
 * saiba a qual lote a config pertence; `overridesPorVideo` pertence ao lote.
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
    loteId: base.loteId || null,
    loteCriadoEm: base.loteCriadoEm || null,
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
    overridesPorVideo: { ...(base.overridesPorVideo || {}) },
  };
}

/** Junta a config salva sobre a padrão (tolerante a versões antigas).
 * FASE 1: delega para `normalizarConfigEditor` (opt-in estrito) e preserva a
 * migração da marcação da área (v2). */
function mesclarConfig(salva) {
  const base = criarConfigPadrao();
  if (!salva || typeof salva !== 'object') return base;
  // Configs salvas ANTES da renomeação usavam a chave `corte` — migra para o
  // nome unificado `corteBordas` (front + back).
  const { corte, ...salvaSemLegado } = salva;
  const comCorteLegado = corte && !salva.corteBordas
    ? { ...salvaSemLegado, corteBordas: { ...(salvaSemLegado.corteBordas || {}), ...corte } }
    : salvaSemLegado;
  const cfg = normalizarConfigEditor(comCorteLegado);
  // MIGRAÇÃO marcação da área: o default antigo era `mostrarMarcacao: true`,
  // então configs salvas trazem `true` mesmo sem o usuário ter ligado. Força
  // `false` UMA vez (flag `marcacaoMigradaV2`); depois disso o toggle do
  // usuário volta a persistir normalmente.
  const areaSalva = salva.areaVideo || {};
  const jaMigrada = areaSalva.marcacaoMigradaV2 === true;
  cfg.areaVideo = {
    ...cfg.areaVideo,
    mostrarMarcacao: jaMigrada ? (areaSalva.mostrarMarcacao ?? false) : false,
    marcacaoMigradaV2: true,
  };
  return cfg;
}

// ---------------------------------------------------------------------------
// REFERÊNCIAS ÓRFÃS — itens restaurados do localStorage podem carregar um
// `bibliotecaId` que não existe mais no servidor (vídeo excluído, servidor
// reiniciado etc.). Nesse caso o /api/lote rejeita o lote INTEIRO ("Vídeo ...
// não encontrado na biblioteca do servidor."). A validação acontece na
// RESTAURAÇÃO, contra GET /api/biblioteca (fonte da verdade), item a item:
//   - bibliotecaId existe no servidor  → item mantido EXATAMENTE como está;
//   - bibliotecaId órfão:
//       · bibliotecaId === id (caso real do editor) → SÓ esse item sai do lote;
//       · bibliotecaId !== id                       → item fica, bibliotecaId vira null.
// `id` NUNCA é validado contra o servidor (identidade LOCAL do item — pool,
// seleção e canvas). `config`/`templateId`/`assinatura` não participam da
// limpeza. FAIL-OPEN: consulta falhando (rede/servidor fora), NADA é removido
// — remover sem confirmação do servidor poderia apagar vídeo válido.
// ---------------------------------------------------------------------------

// >>> LOGICA-ORFAS-INICIO (marcadores usados por teste_referencias_orfas.js)

/**
 * Decide, item a item, o que fazer com as referências restauradas:
 * `remover` — ids de itens ÓRFÃOS (bibliotecaId === id, arquivo original não
 *             existe mais no servidor → nada a exibir nem a processar);
 * `anular`  — id → item com `bibliotecaId: null` (bibliotecaId !== id: item
 *             tem identidade própria e fica, só perde a referência servidora).
 * Itens sem `bibliotecaId` ou com referência válida NÃO entram em nenhum Map/Set.
 */
function limparReferenciasOrfas(itens, idsValidos) {
  const remover = new Set();
  const anular = new Map();
  for (const it of Array.isArray(itens) ? itens : []) {
    if (!it?.bibliotecaId || idsValidos.has(it.bibliotecaId)) continue;
    if (it.bibliotecaId !== it.id) anular.set(it.id, { ...it, bibliotecaId: null });
    else remover.add(it.id);
  }
  return { remover, anular };
}

/**
 * Valida o lote restaurado contra a biblioteca REAL do servidor.
 * Devolve `{ itens, idSelecionado, remover, anular }` quando há algo a limpar —
 * `itens` já é a lista LIMPA (órfãos fora, itens válidos intocados, inclusive
 * os adicionados DEPOIS da restauração) — ou `null` quando NADA muda: lote sem
 * órfãos OU consulta falhou (fail-open, estado preservado como estava).
 */
async function validarLoteRestaurado({ itensRestaurados, itensAtuais, idSelecionado, buscarBibliotecaFn }) {
  let biblioteca;
  try {
    biblioteca = await buscarBibliotecaFn();
  } catch (erro) {
    console.warn(
      '[EditorLote] GET /api/biblioteca falhou — referências do lote restaurado mantidas sem validação (fail-open).',
      erro
    );
    return null;
  }
  const idsValidos = new Set(
    (Array.isArray(biblioteca) ? biblioteca : []).map((v) => v?.id).filter(Boolean)
  );
  const { remover, anular } = limparReferenciasOrfas(itensRestaurados, idsValidos);
  if (remover.size === 0 && anular.size === 0) return null;
  // Aplica sobre o estado ATUAL (não sobre o snapshot do mount): a decisão de
  // órfão vem de `itensRestaurados`, mas a lista final preserva tudo que existe
  // hoje — nada além dos itens decididos acima é tocado.
  const itens = [];
  for (const it of Array.isArray(itensAtuais) ? itensAtuais : []) {
    if (remover.has(it.id)) continue;
    const anulado = anular.get(it.id);
    itens.push(anulado || it);
  }
  return {
    itens,
    idSelecionado: idSelecionado && remover.has(idSelecionado) ? null : idSelecionado,
    remover,
    anular,
  };
}

// >>> LOGICA-ORFAS-FIM

function carregarLoteSalvo() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOTE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || !Array.isArray(dados.itens)) return null;
    // REGRA DEFINITIVA — NOVA SESSÃO/LOTE começa LIMPA. A marca do lote vive
    // no sessionStorage (sobrevive a F5/reload na MESMA aba; morre quando a
    // aba fecha):
    //   · marca existe E === loteId salvo → continuação do MESMO lote: restaura
    //     TUDO exatamente como estava;
    //   · marca ausente (aba fechada/aba nova/1º acesso) OU lote salvo sem
    //     loteId (config antiga) → todo lote salvo vira lote ANTERIOR: config
    //     ZERADA (logo/textos/identidade/cortes/overrides não herdam NADA);
    //     os VÍDEOS seguem restaurados (conteúdo, não edição minha).
    const loteIdSalvo = dados.config?.loteId || null;
    let marcaSessao = null;
    try {
      marcaSessao =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CHAVE_LOTE_ATUAL) : null;
    } catch {
      marcaSessao = null;
    }
    const mesmaSessao = !!loteIdSalvo && marcaSessao === loteIdSalvo;
    const config = mesmaSessao ? mesclarConfig(dados.config) : criarConfigLimpaDeLote();
    // LOGO — SOMENTE em continuação de sessão: `blob:`/File não sobrevivem a
    // sair/voltar; a logo persistida como dataURL volta como url + File
    // reconstruído (o "Processar" reenvia sem re-escolher o arquivo). Em
    // sessão NOVA este bloco é pulado: logo.url/logoDataUrl/visivel NÃO
    // ressuscitam (a config limpa já nasce com tudo nulo).
    if (mesmaSessao) {
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
    }
    // VÍDEOS: só metadados serializáveis (id + URLs ABSOLUTAS do servidor —
    // continuam válidas após sair/voltar). filaId NÃO é restaurado (o
    // itensParaSalvar não o persiste): todo item volta 'pronto' e o
    // acompanhamento recomeça do zero no próximo "Processar vídeos". Itens
    // concluídos que porventura estejam no estado no momento do save são
    // filtrados na escrita — nunca reaparecem após reload.
    const itens = dados.itens
      .filter(
        (v) =>
          v &&
          v.id &&
          (v.urlFonte || v.url || v.thumbnail) &&
          !(v.filaId && v.status === 'concluido' && Number(v.percentual) === 100)
      )
      .map((v) => ({
        id: v.id,
        bibliotecaId: v.bibliotecaId || v.id || null,
        nome: v.nome ?? null,
        thumbnail: v.thumbnail ?? null,
        urlFonte: v.urlFonte || v.url || null,
        duracao: v.duracao ?? null,
        filaId: null,
        status: 'pronto',
        percentual: 0,
        erroMensagem: null,
      }));
    // Seleção consistente: o id restaurado tem prioridade; se sumiu, null
    // (o efeito abaixo abre o primeiro da lista).
    const idSelecionado = itens.some((it) => it.id === dados.idSelecionado)
      ? dados.idSelecionado
      : null;
    // templateId/assinatura pertencem ao LOTE: só voltam em continuação da
    // mesma sessão. Sessão nova começa sem template — o próximo "Processar"
    // salva um template NOVO com a config limpa (reutilização nunca automática).
    return {
      itens,
      config,
      idSelecionado,
      templateId: mesmaSessao ? dados.templateId || null : null,
      assinatura: mesmaSessao ? dados.assinatura || null : null,
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
  const [config, setConfig] = useState(() => loteSalvo?.config || criarConfigLimpaDeLote());
  // Vídeo aberto no editor — TAMBÉM persistido (voltar = exatamente como estava).
  const [idSelecionado, setIdSelecionado] = useState(() => loteSalvo?.idSelecionado || null);
  const [salvando, setSalvando] = useState(false);
  const [enfileirando, setEnfileirando] = useState(false);
  const [templateIdSalvo, setTemplateIdSalvo] = useState(() => loteSalvo?.templateId || null);
  const [assinaturaSalva, setAssinaturaSalva] = useState(() => loteSalvo?.assinatura || null);
  const [toast, setToast] = useState(null);
  // ELEMENTO SELECIONADO no Preview (Camadas ⇄ Preview ⇄ configuração à
  // esquerda): 'logo' | 'textoSuperior' | 'textoInferior' | 'identidadeNome' |
  // 'identidadeUsuario' | 'selo' | 'area' | 'corte' | 'video' | 'fundo' |
  // `imagem:<id>`. Clicar fora no canvas → null (deseleção).
  const [elementoSelecionado, setElementoSelecionado] = useState(null);
  const timerToast = useRef(null);
  const pollRef = useRef(null);
  const inicioFilaRef = useRef(0);
  const avisoWorkerRef = useRef(false);
  // LIXEIRA: quando o usuário remove o VÍDEO BASE pela lixeira, o editor fica
  // no estado "sem vídeo base" — este flag impede o auto-select (effect abaixo)
  // de ressuscitar outro vídeo no lugar; ele volta a valer quando o usuário
  // escolhe outro vídeo (ou quando o lote fica vazio).
  const preservarSemBaseRef = useRef(false);

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
  // EXCEÇÃO (lixeira): se o usuário acabou de remover o VÍDEO BASE, o editor
  // fica no estado "sem vídeo base" (`preservarSemBaseRef`) até ele escolher
  // outro — o auto-select não pega nenhum vídeo no lugar.
  useEffect(() => {
    if (itens.length === 0) {
      if (idSelecionado) setIdSelecionado(null);
      preservarSemBaseRef.current = false;
      return;
    }
    if (preservarSemBaseRef.current) {
      if (!idSelecionado) return; // continua SEM base (o usuário escolhe outro)
      preservarSemBaseRef.current = false; // já escolheu outro → fluxo normal
    }
    if (!idSelecionado || !itens.some((it) => it.id === idSelecionado)) {
      setIdSelecionado(itens[0].id);
    }
  }, [itens, idSelecionado]);

  // REGRA DEFINITIVA — marca o lote atual na SESSÃO (sessionStorage). A partir
  // daqui, F5/reload NA MESMA ABA é continuação do MESMO lote (o editor
  // restaura exatamente como estava, incluindo logo/texto adicionados à mão).
  // Fechar a aba encerra a sessão: o próximo acesso é um NOVO lote, que
  // começa LIMPO (nada herda do lote anterior).
  useEffect(() => {
    if (!config.loteId) return;
    try {
      sessionStorage.setItem(CHAVE_LOTE_ATUAL, config.loteId);
    } catch {
      /* storage bloqueado — editor segue; apenas não há continuação marcada */
    }
  }, [config.loteId]);

  // LOTE VAZIO = lote encerrado. Quando o usuário remove o último vídeo (ou o
  // lote restaurado veio sem vídeos), a config de edição é ZERADA para que o
  // PRÓXIMO import comece um lote novo e limpo — sem herdar logo/texto/
  // identidade/cortes/overrides. A config compartilhada dos vídeos que JÁ
  // estão no lote atual NUNCA é tocada aqui (o efeito só roda com a lista
  // vazia). Importar vídeo NÃO limpa nada (config compartilhada preservada).
  useEffect(() => {
    if (itens.length > 0) return;
    setConfig((atual) => (loteTemEdicoesAtivas(atual) ? criarConfigLimpaDeLote() : atual));
  }, [itens.length]);

  // REMOÇÃO AUTOMÁTICA DE CONCLUÍDOS — vídeos do Editor em Lote saem da lista
  // de importados SOMENTE após confirmação real do backend (GET /api/fila com
  // status === 'concluido' E percentual === 100, refletidos no item pelo
  // polling). Remoção individual (cada vídeo sai assim que termina, mesmo em
  // lote). NÃO toca na Biblioteca, no Oracle nem nos finais gerados — apenas
  // filtra o estado local `itens`; o AUTOSAVE (effect, 350ms) + flush de
  // unmount/pagehide regravam `autopost:editorlote:v1` sem o item, então ele
  // não reaparece após reload. Itens 'aguardando'/'processando'/'erro' nunca
  // são removidos. A seleção (effect acima) e o pool (usePoolDeVideos) se
  // ajustam sozinhos quando um item sai.
  const concluidosAvisadosRef = useRef(new Set());
  const concluidosRemovidosRef = useRef(0);
  useEffect(() => {
    const prontos = itens.filter(
      (it) => it && it.filaId && it.status === 'concluido' && Number(it.percentual) === 100
    );
    if (prontos.length === 0) return;
    const novos = prontos.filter((it) => !concluidosAvisadosRef.current.has(it.filaId));
    novos.forEach((it) => concluidosAvisadosRef.current.add(it.filaId));
    concluidosRemovidosRef.current += prontos.length;
    // Restam itens ativos (aguardando/processando)? Se sim, avisa a remoção
    // agora; se não, o effect "Fila vazia" (abaixo) mostra a mensagem final
    // combinada ao parar o polling — sem toast duplicado.
    const restamAtivos = itens.some(
      (it) =>
        !(it && it.filaId && it.status === 'concluido' && Number(it.percentual) === 100) &&
        (it.status === 'aguardando' || it.status === 'processando')
    );
    setItens((atual) =>
      (Array.isArray(atual) ? atual : []).filter(
        (it) => !(it && it.filaId && it.status === 'concluido' && Number(it.percentual) === 100)
      )
    );
    if (restamAtivos && novos.length > 0) {
      mostrarToast(
        novos.length === 1
          ? 'Vídeo concluído removido da lista do Editor (final salvo na Biblioteca).'
          : `${novos.length} vídeos concluídos removidos da lista do Editor (finais salvos na Biblioteca).`
      );
    }
  }, [itens, mostrarToast]);

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

  // VALIDAÇÃO DA RESTAURAÇÃO (1× por mount): confere o `bibliotecaId` de cada
  // item vindo do localStorage contra a biblioteca REAL do servidor e limpa
  // SOMENTE as referências confirmadas como órfãs — antes de qualquer
  // "Processar" (o /api/lote rejeitaria o lote inteiro: "Vídeo ... não
  // encontrado na biblioteca do servidor."). Falha de rede = fail-open (nada
  // é removido, só registra). O estado limpo é regravado pelo AUTOSAVE já
  // existente (o `setItens` abaixo dispara o effect de autosave de 350ms) —
  // formato da chave `autopost:editorlote:v1` inalterado.
  const itensRestauradosRef = useRef(loteSalvo?.itens || []);
  const referenciasValidadasRef = useRef(false);
  useEffect(() => {
    if (referenciasValidadasRef.current) return; // roda 1× (StrictMode remonta o effect)
    referenciasValidadasRef.current = true;
    if (!itensRestauradosRef.current.length) return; // lote vazio: nada a validar
    const atual = estadoAtualRef.current;
    validarLoteRestaurado({
      itensRestaurados: itensRestauradosRef.current,
      itensAtuais: atual?.itens || [],
      idSelecionado: atual?.idSelecionado || null,
      buscarBibliotecaFn: buscarBiblioteca,
    })
      .then((limpo) => {
        if (!limpo) return; // nada órfão — ou consulta falhou (fail-open)
        setItens(limpo.itens);
        // Seleção apontando pra item órfão removido → null: o efeito de seleção
        // (acima) recai no primeiro item válido automaticamente.
        if (limpo.idSelecionado === null) setIdSelecionado(null);
        // Feedback discreto — nunca bloqueia o editor; itens válidos intactos.
        const partes = [];
        if (limpo.remover.size > 0) {
          partes.push(`${limpo.remover.size} vídeo(s) do lote não existe(m) mais na biblioteca do servidor e foram removidos`);
        }
        if (limpo.anular.size > 0) partes.push(`${limpo.anular.size} referência(s) inválida(s) limpa(s)`);
        mostrarToast(`Editor ajustado: ${partes.join(' · ')}.`);
      })
      .catch((erro) => {
        // Belt-and-braces: qualquer falha inesperada NÃO derruba o editor nem
        // remove nada — o estado restaurado segue como estava.
        console.warn('[EditorLote] Validação das referências restauradas falhou — estado mantido (fail-open).', erro);
      });
  }, [mostrarToast]);

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
    // Importou vídeo novo: o fluxo normal de auto-select volta a valer (não faz
    // sentido manter o editor "sem vídeo base" depois de uma importação).
    preservarSemBaseRef.current = false;
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

  // ACAO "Corte automatico de bordas" — ÚNICO momento de detecção (regra
  // definitiva): analisa cada vídeo importado individualmente (20 frames
  // amostrados 16–24 pelo detector ESTRUTURAL, sem MP4, sem tocar o original),
  // guarda o resultado em `overridesPorVideo` e o preview mostra na hora via
  // clip. "Processar vídeos" NÃO detecta nada: apenas materializa o que está
  // salvo aqui. Fail-open por vídeo: sem confiança, fica 0/0 (vídeo NORMAL).
  const [detectandoBordas, setDetectandoBordas] = useState(false);
  const [progressoBordas, setProgressoBordas] = useState(null);
  const aoDetectarBordas = useCallback(async () => {
    if (detectandoBordas) return;
    const alvos = (itens || []).filter((it) => it && (it.urlFonte || it.url));
    if (alvos.length === 0) { mostrarToast('Importe videos antes do corte automatico.', 'erro'); return; }
    setDetectandoBordas(true);
    try {
      const saidas = {};
      for (let i = 0; i < alvos.length; i++) {
        const it = alvos[i];
        setProgressoBordas({ atual: i + 1, total: alvos.length, nome: it.nome || `video ${i + 1}` });
        const src = it.urlFonte || it.url;
        const r = await detectarBordasDoVideo(src, () => {});
        if (r && r.confiavel && ((Number(r.superior) || 0) > 0 || (Number(r.inferior) || 0) > 0)) {
          saidas[it.id] = { superior: r.superior, inferior: r.inferior, origem: 'auto', em: Date.now() };
        }
      }
      const n = Object.keys(saidas).length;
      if (n > 0) {
        setConfig((cfg) => ({ ...cfg, overridesPorVideo: { ...(cfg.overridesPorVideo || {}), ...saidas } }));
        mostrarToast(`${n} video(s) com bordas detectadas — preview atualizado.`);
      } else {
        mostrarToast('Nenhuma borda relevante encontrada — videos seguem normais.');
      }
    } catch (erro) {
      mostrarToast(erro?.message || 'Falha na deteccao de bordas.', 'erro');
    } finally {
      setDetectandoBordas(false);
      setProgressoBordas(null);
    }
  }, [itens, detectandoBordas, mostrarToast]);
  const aoFocar = useCallback((item) => pool.solicitar(item.id), [pool.solicitar]);

  /**
   * LIXEIRA DO EDITOR — remove UM vídeo da lista do Editor em Lote (tanto o
   * VÍDEO BASE quanto qualquer item da lista). É remoção LOCAL e INDIVIDUAL:
   * - NÃO apaga o arquivo original (Biblioteca/Oracle intactos), NÃO mexe na
   *   fila do servidor, no worker, no template nem nos finais já concluídos —
   *   nenhuma chamada destrutiva (nada de exclusão duplicada);
   * - reusa a MESMA mecânica da remoção automática dos concluídos: filtra
   *   `itens` (o pool `usePoolDeVideos` se ajusta sozinho, sem referência
   *   pendente) e o localStorage é regravado (aqui NA HORA, sem esperar o
   *   debounce do autosave) — o vídeo removido NÃO volta no reload;
   * - se o removido era o VÍDEO BASE, a seleção vai a `null` e o auto-select
   *   não ressuscita outro: o editor fica no estado "sem vídeo base" até o
   *   usuário escolher outro vídeo.
   */
  const aoRemoverVideo = useCallback(
    (item) => {
      if (!item || !item.id) return;
      const atual = estadoAtualRef.current || {};
      const lista = Array.isArray(atual.itens) ? atual.itens : [];
      if (!lista.some((it) => it.id === item.id)) return;
      const proximos = lista.filter((it) => it.id !== item.id);
      const eraBase = atual.idSelecionado === item.id;
      if (eraBase) {
        preservarSemBaseRef.current = true; // mantém o editor SEM vídeo base
        setIdSelecionado(null);
      }
      setItens(proximos);
      // localStorage IMEDIATO: a referência do vídeo removido sai na hora (o
      // autosave de 350ms continua valendo para o resto).
      salvarEstadoNoDisco({
        itens: proximos,
        config: atual.config,
        idSelecionado: eraBase ? null : atual.idSelecionado,
        templateId: atual.templateId,
        assinatura: atual.assinatura,
        logoDataUrl: logoDataUrlRef.current?.dataUrl || null,
      });
      mostrarToast(
        eraBase
          ? 'Vídeo base removido do Editor — escolha outro na lista (o arquivo original continua na Biblioteca).'
          : 'Vídeo removido do Editor (o arquivo original continua na Biblioteca).'
      );
    },
    [mostrarToast]
  );

  const itemSelecionado = useMemo(
    () => itens.find((v) => v.id === idSelecionado) || null,
    [itens, idSelecionado]
  );
  const urlVideoAtiva = idSelecionado ? pool.ativos[idSelecionado] || null : null;

  // -----------------------------------------------------------------------
  // FLUXO REAL — template no servidor + fila (Supabase) + worker local
  // -----------------------------------------------------------------------

  /** Salva/atualiza o TEMPLATE no servidor a partir da config compartilhada.
   * CORREÇÃO (templates por corte): cada ASSINATURA de config tem SEU PRÓPRIO
   * template. O template BASE (sem override) continua atualizado in-place
   * (id estável entre sessões); qualquer override (corte automático salvo ou
   * ajuste manual por vídeo) cria um template NOVO — nunca reutiliza nem
   * sobrescreve o id de outra configuração. Cache por assinatura evita
   * duplicar templates dentro do mesmo processamento. */
  const templatesPorAssinaturaRef = useRef(new Map());
  const garantirTemplate = useCallback(async (overrideVideo = null) => {
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

    const assinatura = assinarConfig(configAtual, overrideVideo);
    const emCache = templatesPorAssinaturaRef.current.get(assinatura);
    if (emCache) return { templateId: emCache, assinatura };
    // Template BASE já salvo (nesta sessão ou restaurado do disco): reuso
    // direto — a config não mudou, nada a re-salvar.
    if (!overrideVideo && templateIdSalvo && assinatura === assinaturaSalva) {
      templatesPorAssinaturaRef.current.set(assinatura, templateIdSalvo);
      return { templateId: templateIdSalvo, assinatura };
    }

    // CORREÇÃO DO BUG: override NUNCA reutiliza `templateIdSalvo` (antes, o
    // payload do override sobrescrevia o template base e os vídeos sem corte
    // recebiam o corte do último override). Configs diferentes => templates
    // diferentes; cada vídeo recebe exatamente o template do seu corte.
    const template = await salvarTemplateDoEditor({
      payload: configParaTemplatePayload(configAtual, overrideVideo),
      arquivoLogo: configAtual.logo.visivel && configAtual.logo.url ? configAtual.logo.arquivo || null : null,
      templateId: overrideVideo ? null : templateIdSalvo || null,
    });

    // URL estável da logo no servidor (a mesma que o worker baixa depois) —
    // substitui o blob: local na config compartilhada.
    const urlLogoServidor = urlLogoDoTemplate(template);
    if (urlLogoServidor) {
      configAtual = { ...configAtual, logo: { ...configAtual.logo, url: urlLogoServidor } };
      setConfig(configAtual);
    }
    const assinaturaFinal = assinarConfig(configAtual, overrideVideo);
    templatesPorAssinaturaRef.current.set(assinaturaFinal, template.id);
    // Apenas o template BASE atualiza o estado persistido de sessão.
    if (!overrideVideo) {
      setTemplateIdSalvo(template.id);
      setAssinaturaSalva(assinaturaFinal);
    }
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

  // Ao VOLTAR pro editor: o estado de fila NÃO é restaurado do localStorage
  // (filaId não é persistido — ver itensParaSalvar). Se o usuário saiu no
  // meio de um processamento e voltou, os itens voltam 'pronto' e o
  // acompanhamento recomeça no próximo "Processar vídeos" (a fila REAL
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
      const n = concluidosRemovidosRef.current;
      concluidosRemovidosRef.current = 0;
      mostrarToast(
        n > 0
          ? n === 1
            ? 'Processamento concluído — vídeo removido da lista do Editor (final salvo na Biblioteca).'
            : `Processamento concluído — ${n} vídeos removidos da lista do Editor (finais salvos na Biblioteca).`
          : 'Processamento concluído.'
      );
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
    // Cache LOCAL da sessão de processamento: UMA chamada por assinatura
    // distinta (garantirTemplate já tem o seu próprio cache por assinatura —
    // cada corte diferente recebe um template NOVO e próprio, CORREÇÃO).
    const cacheTemplates = new Map();
    const templateDoVideo = async (it) => {
      const over = config?.overridesPorVideo?.[it.id] || null;
      const chave = over ? assinarConfig(config, over) : '__base__';
      if (cacheTemplates.has(chave)) return cacheTemplates.get(chave);
      const { templateId: tid } = await garantirTemplate(over);
      cacheTemplates.set(chave, tid);
      return tid;
    };
    try {
      // 1) Config vira template REAL no servidor. Sem overrides: 1 template
      //    compartilhado (como antes). Com overrides: 1 template por corte
      //    distinto (mesmo formato, single-pass, sem mudar worker/FFmpeg).
      const comOverride = enfileiraveis.filter((it) => config?.overridesPorVideo?.[it.id]);
      const semOverride = enfileiraveis.filter((it) => !config?.overridesPorVideo?.[it.id]);
      let templateBase = null;
      if (semOverride.length > 0 || comOverride.length === 0) {
        const r = await garantirTemplate(null);
        templateBase = r.templateId;
        cacheTemplates.set('__base__', templateBase);
      }
      const templatePorVideo = new Map();
      for (const it of comOverride) {
        const tid = await templateDoVideo(it);
        templatePorVideo.set(it.id, tid);
      }

      // 2) Enfileira na fila REAL (Supabase) — a Oracle e o worker local
      //    consomem com reserva atômica. O texto SUPERIOR do lote vai como
      //    tituloIA (DOIS textos: superior + inferior, independentes).
      const textoSup = config.textos?.superior || config.texto;
      const videos = enfileiraveis.map((it) => ({
        _itemId: it.id,
        bibliotecaId: it.bibliotecaId,
        tituloIA:
          textoSup.visivel && String(textoSup.conteudo || '').trim() !== ''
            ? String(textoSup.conteudo).trim()
            : '',
      }));
      // Agrupa INDICES por template (1 chamada por template distinto) e
      // remonta `ids` na ordem de `enfileiraveis` (mapa filaId correto).
      const grupos = new Map();
      videos.forEach((v, idx) => {
        const tid = templatePorVideo.get(v._itemId) || templateBase;
        if (!grupos.has(tid)) grupos.set(tid, []);
        const { _itemId, ...semInterno } = v;
        grupos.get(tid).push({ idx, corpo: semInterno });
      });
      const ids = new Array(videos.length).fill(null);
      for (const [tid, lista] of grupos) {
        const resposta = await processarLote(tid, lista.map((e) => e.corpo));
        (resposta.ids || []).forEach((id, k) => { ids[lista[k].idx] = id; });
      }

      const mapaFila = new Map();
      enfileiraveis.forEach((it, i) => {
        // Chave = it.id (ÚNICO por item). Antes era it.bibliotecaId: se dois
        // itens da sessão apontarem para o MESMO original (re-import), ambos
        // recebiam o mesmo filaId e um final parecia "pertencer" ao outro.
        if (ids[i]) mapaFila.set(it.id, ids[i]);
      });

      inicioFilaRef.current = Date.now();
      avisoWorkerRef.current = false;
      setItens((atual) =>
        atual.map((it) => {
          const filaId = mapaFila.get(it.id);
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
    <div className="edl-root w-full min-h-screen flex flex-col">
      <HeaderEditor
        total={itens.length}
        status={statusTexto}
        aoSalvar={aoSalvar}
        aoProcessar={aoProcessar}
        salvando={salvando}
        processando={enfileirando}
      />

      <div className="edl-layout flex-1 grid items-start" onPointerDown={(e) => { if (e.target === e.currentTarget) setElementoSelecionado(null); }}>
        {/* ESQUERDA — VÍDEOS IMPORTADOS */}
        <aside className="edl-painel-esquerdo min-w-0 flex flex-col border-r border-[color:var(--edl-borda)] h-full" aria-label="Vídeos Importados">
          <div className="shrink-0 px-3 py-3 border-b border-[color:var(--edl-borda)]">
            <h2 className="font-display text-xs font-extrabold text-white uppercase tracking-wider">Vídeos Importados</h2>
          </div>
          <div className="p-3">
             <PainelDownloads aoAdicionarVideo={aoAdicionarVideo} />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <ListaVideos
              itens={itens}
              idSelecionado={idSelecionado}
              aoSelecionar={aoSelecionar}
              aoFocar={aoFocar}
              aoRemover={aoRemoverVideo}
            />
          </div>
        </aside>

        {/* CENTRO — PREVIEW SEMPRE VISÍVEL */}
        <section className="edl-preview-central min-w-0 flex flex-col h-full" aria-label="Preview da composição">
          <AreaCentral
            itens={itens}
            idSelecionado={idSelecionado}
            urlVideoAtiva={urlVideoAtiva}
            ativosNoPool={pool.ativos}
            config={config}
            aoAtualizarConfig={setConfig}
            aoSelecionar={aoSelecionar}
            aoFocar={aoFocar}
            aoRemoverItem={aoRemoverVideo}
            elementoSelecionado={elementoSelecionado}
            aoSelecionarElemento={setElementoSelecionado}
          />
        </section>

        {/* DIREITA — CAMADAS */}
        <aside className="edl-painel-direita min-w-0 grid grid-cols-2 border-l border-[color:var(--edl-borda)] h-full" aria-label="Painéis da direita">
          <div className="edl-painel-ferramentas min-w-0 flex flex-col border-r border-[color:var(--edl-borda)] h-full">
            <PainelEditor
              config={config}
              aoAtualizarConfig={setConfig}
              elementoSelecionado={elementoSelecionado}
              aoSelecionarElemento={setElementoSelecionado}
              itensLote={itens}
              aoDetectarBordas={aoDetectarBordas}
              detectandoBordas={detectandoBordas}
              progressoBordas={progressoBordas}
              itens={itens}
              idSelecionado={idSelecionado}
              aoSelecionarVideo={aoSelecionar}
              aoFocarVideo={aoFocar}
              aoRemoverVideo={aoRemoverVideo}
              aoAdicionarVideo={aoAdicionarVideo}
            />
          </div>
          <div className="edl-painel-camadas min-w-0 flex flex-col h-full">
            <PainelCamadas
              config={config}
              aoAtualizarConfig={setConfig}
              elementoSelecionado={elementoSelecionado}
              aoSelecionarElemento={setElementoSelecionado}
              idSelecionado={idSelecionado}
            />
          </div>
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

