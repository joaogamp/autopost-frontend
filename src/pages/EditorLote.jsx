import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderEditor from '../components/editorlote/HeaderEditor';
import AreaCentral from '../components/editorlote/AreaCentral';
import PainelFluxo from '../components/editorlote/PainelFluxo';
import PainelDownloads from '../components/editorlote/PainelDownloads';
import ListaVideos from '../components/editorlote/ListaVideos';
import { usePoolDeVideos } from '../hooks/usePoolDeVideos';
import {
  criarConfigPadrao,
  criarConfigLimpaDeLote,
  loteTemEdicoesAtivas,
  normalizarConfigEditor,
  corteEfetivoDoVideo,
  temAjusteIndividualDeCorte,
  cortesIndividuaisAfetados,
  areaIndividualDoVideo,
  limitarCorte,
  definirCorteAutomaticoDoVideo,
} from '../lib/configEditorLote';
import { detectarBordasDoVideo } from '../lib/detectorBordas';
import * as cofre from '../lib/cofreMidias';
import { processarLote, buscarFila, buscarBiblioteca, listarFinais, urlArquivo } from '../lib/api';
import {
  configParaTemplatePayload,
  assinarConfig,
} from '../lib/mapearEditorLote';

/**
 * EDITOR EM LOTE — página (header + 3 colunas) com o FLUXO SIMPLIFICADO:
 *
 *   1) IMPORTAR VÍDEOS       (esquerda) — PainelDownloads: seletor múltiplo de
 *      arquivos do computador → upload REAL (POST /api/upload: ffprobe +
 *      thumbnail + biblioteca) → os vídeos entram NA HORA na lista (ListaVideos)
 *      e no CENTRO (AreaCentral → EditorCanvas), SEM template, SEM moldura.
 *
 *   2) IMPORTAR TEMPLATE     (direita / PainelFluxo) — seletor de imagem
 *      (PNG/JPG/WebP) → vira `config.templateFundo` (TEMPLATE BASE do lote).
 *      O template passa a compor o CENTRO NA HORA, com um BURACO em
 *      `areaVideo` (o mesmo `dest-out` do engine): o vídeo aparece dentro
 *      do retângulo e a arte do template fica em volta. NÃO substitui os
 *      vídeos; NÃO é convertido em vídeo.
 *
 *   3) VÍDEO = PRÉVIA SIMPLES. Não existe nenhum editor visual do objeto de
 *      vídeo: sem "Marcar espaço do vídeo", sem gaveta "Área do vídeo", sem
 *      guia tracejado, sem arraste, sem zoom, sem alças, sem caixa de seleção
 *      e sem congelamento de geometria. A `areaVideo` CONTINUA existindo como
 *      DADO interno (posiciona o vídeo no canvas e abre o buraco do template) e
 *      é calculada pelo sistema — nunca ajustada pelo usuário. O que o usuário
 *      edita no preview são os overlays (textos/identidade/imagens) e o CORTE
 *      DE BORDAS, que é uma ferramenta independente.
 *
 *   CENTRO    AreaCentral — os MESMOS vídeos da lista (sem lista duplicada),
 *   em grade: 6X (padrão do lote: 6 por fileira, o resto nas linhas seguintes),
 *   além de 1X/2X/3X. Cada célula usa o MESMO EditorCanvas (config
 *   COMPARTILHADA); clicar seleciona o vídeo principal.
 *
 *   DIREITA   PainelFluxo — o painel do template: importar template · escopo da
 *   edição (todos / apenas este vídeo) · corte de bordas. O
 *   template JÁ contém a arte final (fundo, textos, formas, logo): o AutoPost
 *   NÃO reconstrói elementos do template — apenas compõe o template por cima
 *   do vídeo, com o buraco em `areaVideo`.
 *
 * PRÉVIA x PROCESSAMENTO: a prévia e o render usam a MESMA geometria —
 * `config.areaVideo` (x/y/largura/altura) é a única fonte da posição do vídeo
 * e viaja para o template do servidor exatamente como está na tela.
 *
 * LIXEIRA: a lista (ListaVideos) e o card do VÍDEO BASE (AreaCentral) têm uma
 * lixeira discreta que remove o vídeo da LISTA do Editor — remoção LOCAL
 * (estado + localStorage, feita por `aoRemoverVideo`), sem apagar o arquivo
 * original da Biblioteca/Oracle, sem tocar na fila/worker e sem afetar os
 * demais vídeos nem a config compartilhada (texto/template).
 *
 * "IMPLEMENTAR VÍDEO" (REAL): envia a config compartilhada JUNTO com a fila
 * (POST /api/lote, campo `configTemplate`). A Oracle cria os jobs, obtém o
 * filaId REAL de cada um e guarda a config daquele job em
 * `output/jobs/<filaId>.json` (NÃO é template, NÃO vai para o Supabase) → o
 * WORKER LOCAL (node worker-local.js, reserva atômica) busca a config em
 * GET /api/fila/:filaId/config, renderiza e entrega o MP4 → a UI acompanha o
 * progresso REAL via GET /api/fila (percentual por card, thumbnail e MP4 do
 * final quando concluído).
 *
 * A configuração é EFÊMERA: ela NÃO é salva como template no servidor (nada
 * entra em templates-store.json, nada é criado em /api/templates) e fica
 * associada só ao job que vai renderizá-la. Ela existe só enquanto for
 * necessária para produzir o MP4.
 *
 * O lote continua agrupado por CORTE: cada grupo de corte (incluindo o corte
 * automático salvo por vídeo) recebe a SUA configuração, exatamente como antes
 * — só mudou o transporte (config na fila em vez de template salvo).
 *
 * "PROCESSAR VÍDEOS" foi REMOVIDO: sem encaminhamento — o Agendar lista
 * os finais por conta própria.
 *
 * Pool (usePoolDeVideos): no máximo 3 vídeos completos carregando ao mesmo
 * tempo; os demais cards ficam só na thumbnail.
 *
 * Persistência (localStorage `autopost:editorlote:v1`): autosave 350ms +
 * flush no unmount + `pagehide` (reload/fechar aba) + retomada do polling.
 * Persiste vídeos importados (metadados + URLs absolutas), vídeo selecionado,
 * templateId e TODA a config compartilhada. Os VÍDEOS PRONTOS também são persistidos
 * com filaId + status 'concluido' + percentual 100 (estado ESTÁVEL: o MP4
 * final já existe no servidor) — o PRONTO sobrevive a F5/reload. Estado
 * transitório (aguardando/processando) não é persistido.
 *
 * REGRA DEFINITIVA anti-herança (sessão/lote): a config pertence a um lote
 * (`config.loteId`). A marca do lote atual vive no sessionStorage — morre
 * quando a aba fecha, sobrevive a F5/reload na MESMA aba:
 *   · MESMA sessão (marca === loteId salvo)  → restaura TUDO como estava;
 *   · NOVA sessão (aba fechada/nova/1º acesso) → config ZERADA: textos,
 *     identidade, cortes NÃO herdam nada do lote
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

/** RE-HIDRATAÇÃO DE THUMBNAILS (pool do Editor): o POST /api/upload responde
 * `thumbnailUrl: null` (ffprobe/thumbnail rodam em BACKGROUND no servidor) e o
 * item nasce `thumbnail: null` — os cards não selecionados ficariam para
 * sempre no placeholder "VÍDEO ORIGINAL". Enquanto houver item pendente, o
 * Editor re-consulta GET /api/biblioteca neste intervalo e preenche a URL
 * assim que o servidor publicar o dado. Mesmo padrão do polling da fila
 * (setInterval + fail-open); NÃO toca fila/worker/Supabase. */
const INTERVALO_THUMB_PENDENTE_MS = 4000;
/** Teto de tentativas sem sucesso (~2 min): evita polling eterno para um
 * vídeo cujo enriquecimento falhou de vez (melhor esforço no servidor). Um
 * novo vídeo importado remonta o efeito e o teto recomeça. */
const TETO_TENTATIVAS_THUMB_PENDENTE = 30;


/** Sanitiza os vídeos para persistência (SÓ metadados serializáveis).
 * Estado de fila TRANSITÓRIO (aguardando/processando/erro) NUNCA é persistido:
 * é sempre revalidado contra o backend (retomada de polling no mount).
 * EXCEÇÃO — VÍDEO PRONTO (filaId + status 'concluido' + 100%): esse estado é
 * ESTÁVEL (o MP4 final já existe em /arquivos/publicados/{filaId}.mp4, a
 * thumbnail em /arquivos/thumbnails/{filaId}.jpg) e é exatamente o que o card
 * "✓ Pronto" lê. Por isso
 * o PRONTO é persistido com filaId + status + percentual e SOBREVIVE a
 * F5/reload — o usuário confere o final no Editor. */
function itensParaSalvar(itens) {
  return (Array.isArray(itens) ? itens : [])
    .filter((it) => it && it.id && (it.urlFonte || it.thumbnail))
    .map((it) => {
      // PRONTO = concluído DE VERDADE (mesmo predicado do polling/contador).
      const pronto = ehVideoPronto(it);
      const dados = {
        id: it.id,
        bibliotecaId: it.bibliotecaId || it.id,
        nome: it.nome ?? null,
        thumbnail: it.thumbnail ?? null,
        urlFonte: it.urlFonte ?? null,
        duracao: it.duracao ?? null,
        // DIMENSÕES NATURAIS (ffprobe do upload): persistem para o preview
        // recalcular a geometria certa logo no primeiro render após um F5, sem
        // depender de o servidor já ter enriquecido o item. `null` = ainda não
        // enrichecido (a re-hidratação preenche depois).
        largura: it.largura ?? null,
        altura: it.altura ?? null,
        filaId: it.filaId ?? null,
      };
      return pronto ? { ...dados, status: 'concluido', percentual: 100 } : dados;
    });
}

/**
 * PREDICADO ÚNICO DE "PRONTO" — concluído DE VERDADE.
 *
 * Um item só é considerado PRONTO quando tem `filaId` (não veio de um
 * restauro avulso), o polling trouxe `status === 'concluido'` E o percentual é
 * exatamente 100. Tudo que estiver fora disso — importado, aguardando,
 * processando ou erro — NUNCA entra neste caminho.
 *
 * É a MESMA função usada pelo polling, pela persistência, pela reidratação e
 * pela remoção automática: um único lugar decide o que é "terminado".
 */
export function ehVideoPronto(it) {
  return !!(it && it.filaId && it.status === 'concluido' && Number(it.percentual) === 100);
}

/**
 * SEPARADOR DE ARQUIVADOS (ids que já saíram da lista do Editor por conclusão).
 *
 * A remoção de concluídos é LOCAL, mas precisa sobreviver ao F5/reload: sem
 * este registro, `carregarLoteSalvo` restauraria do localStorage o item que o
 * usuário acabou de ver sumir e ele "ressuscitaria" na próxima montagem. O
 * conjunto fica no próprio estado persistido do lote (chave `arquivados`) e é
 * consultado tanto na gravação quanto na restauração.
 */
function arquivadosDoLote(dados) {
  const brutos = dados && Array.isArray(dados.arquivados) ? dados.arquivados : [];
  return new Set(brutos.filter((x) => typeof x === 'string' && x));
}

/** Chave do lote no localStorage (sessão atual). */
export const CHAVE_LOTE_ATUAL = 'autopost:editorlote:lote_atual_v1';

/** Gera o id de um NOVO lote (nova sessão de edição). */
export function novoIdDeLote() {
  return `lote_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// FASE 4 — SEPARAÇÃO ENTRE O QUE É LEVE E O QUE É PESADO.
//
// A config do lote carrega as mídias como dataURL (base64): o TEMPLATE
// (`templateFundo.url`), as IMAGENS (`imagens[].url`) e o SELO
// (`identidade.selo.urlImagem`). Só isso. O resto — itens, seleção, cortes,
// área, escopo, textos, identidade, posição — é leve.
//
// O localStorage do Chrome/Edge tem limite PRÁTICO de ~5 MB por origem, e o
// base64 infla o arquivo em ~33%: o template de 4 MB já vira ~5,4 MB e o de
// 6 MB vira ~8 MB. Como `PainelFluxo.jsx` ACEITA template de até 6 MB, uma
// configuração perfeitamente válida do produto estourava a cota — e o
// `setItem` lançava dentro de um `catch` vazio. Resultado: o usuário perdia o
// LOTE INTEIRO (vídeos, seleção e todos os cortes) sem nenhuma pista.
//
// REGRA DA FASE 4: o localStorage guarda SÓ o estado leve + um ÍNDICE das
// mídias; os bytes das mídias vão para o cofre (IndexedDB), que não tem esse
// teto. Se o cofre não existir, cai no caminho antigo (tudo no localStorage),
// que é exatamente o comportamento de antes — nunca pior, só não melhorado.
// ---------------------------------------------------------------------------

/** Slots de mídia — um por posição na config. Estáveis (viram chave no cofre). */
const SLOT_TEMPLATE = 'template';
const slotDaImagem = (id) => `imagem:${id}`;
const SLOT_SELO = 'selo';

/** `blob:` (File/URL.createObjectURL) NUNCA sobrevive a reload — só dataURL. */
function ehMidiaPersistivel(valor) {
  return typeof valor === 'string' && valor.startsWith('data:image/') && valor.length > 0;
}

/** Tamanho aproximado da mídia em bytes (base64 → 3 bytes por 4 caracteres). */
function bytesDaMidia(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const virgula = dataUrl.indexOf(',');
  const corpo = virgula >= 0 ? dataUrl.slice(virgula + 1) : dataUrl;
  const marca = corpo.indexOf(';base64,');
  const base64 = marca >= 0 ? corpo.slice(marca + 1) : corpo;
  return Math.round((base64.length * 3) / 4);
}

/** Id sintético para imagem sem id (config antiga/corrompida) — só o slot. */
let contadorDeMidia = 0;
function idTemporarioDeMidia() {
  contadorDeMidia += 1;
  return `sem_id_${contadorDeMidia}`;
}

/**
 * SEPARA as mídias da config: devolve a config SEM nenhum byte de imagem
 * (guardando a forma/metadados) e o mapa `{ slot: dataUrl }` das mídias.
 *
 * A config devolvida é uma CÓPIA — o objeto de estado do React nunca é tocado.
 * A forma é preservada inteira (o template continua com `nome`/dimensões, a
 * imagem continua com posição/proporção, o selo continua com visibilidade),
 * então a config volta a ser exatamente a que o usuário montou.
 */
function separarMidias(config) {
  const base = config && typeof config === 'object' ? config : {};
  const midias = {};
  const semMidias = { ...base };

  // 1) TEMPLATE de fundo — a mídia pesada que estourava a cota.
  if (base.templateFundo && typeof base.templateFundo === 'object') {
    if (ehMidiaPersistivel(base.templateFundo.url)) midias[SLOT_TEMPLATE] = base.templateFundo.url;
    semMidias.templateFundo = { ...base.templateFundo, url: null };
  }

  // 2) IMAGENS independentes do lote (chave estável pelo `id` do elemento).
  if (Array.isArray(base.imagens)) {
    semMidias.imagens = base.imagens.map((imagem) => {
      if (!imagem || typeof imagem !== 'object') return imagem;
      const chave = imagem.id ? imagem.id : idTemporarioDeMidia();
      if (ehMidiaPersistivel(imagem.url)) midias[slotDaImagem(chave)] = imagem.url;
      return { ...imagem, url: null };
    });
  }

  // 3) SELO de verificado (PNG importado no painel de identidade).
  if (base.identidade?.selo && typeof base.identidade.selo === 'object') {
    if (ehMidiaPersistivel(base.identidade.selo.urlImagem)) {
      midias[SLOT_SELO] = base.identidade.selo.urlImagem;
    }
    semMidias.identidade = {
      ...base.identidade,
      selo: { ...base.identidade.selo, urlImagem: null },
    };
  }

  return { config: semMidias, midias };
}

/** Índice leve gravado no localStorage: `{ slot: bytes }` (nada de imagem). */
function indiceDeMidias(midias) {
  const indice = {};
  for (const [slot, dataUrl] of Object.entries(midias || {})) indice[slot] = bytesDaMidia(dataUrl);
  return indice;
}

/**
 * REIDRATA: devolve a config com as mídias do cofre recolocadas nos mesmos
 * lugares. Slot sem contraparte na config é ignorado (fail-open) e uma mídia
 * que JÁ está na config nunca é sobrescrita.
 */
function aplicarMidias(config, midias) {
  if (!config || typeof config !== 'object' || !midias || typeof midias !== 'object') return config;
  let saida = config;
  const trocar = (novo) => { saida = novo; };

  if (ehMidiaPersistivel(midias[SLOT_TEMPLATE]) && !ehMidiaPersistivel(saida.templateFundo?.url)) {
    trocar({ ...saida, templateFundo: { ...saida.templateFundo, url: midias[SLOT_TEMPLATE] } });
  }
  if (ehMidiaPersistivel(midias[SLOT_SELO]) && !ehMidiaPersistivel(saida.identidade?.selo?.urlImagem)) {
    trocar({
      ...saida,
      identidade: {
        ...saida.identidade,
        selo: { ...saida.identidade?.selo, urlImagem: midias[SLOT_SELO] },
      },
    });
  }
  if (Array.isArray(saida.imagens)) {
    trocar({
      ...saida,
      imagens: saida.imagens.map((imagem) => {
        if (!imagem || typeof imagem !== 'object' || ehMidiaPersistivel(imagem.url)) return imagem;
        const url = midias[slotDaImagem(imagem.id)];
        return ehMidiaPersistivel(url) ? { ...imagem, url } : imagem;
      }),
    });
  }
  return saida;
}

/**
 * Sanitiza a config para persistência. File e `blob:` NUNCA vão pro
 * localStorage (não sobrevivem a reload).
 *
 * Anti-herança: `loteId`/`loteCriadoEm` viajam junto para que a restauração
 * saiba a qual lote a config pertence.
 */
function configParaSalvar(config) {
  const base = config && typeof config === 'object' ? config : criarConfigPadrao();
  return {
    ...base,
    loteId: base.loteId || null,
    loteCriadoEm: base.loteCriadoEm || null,
    canvas: { ...base.canvas },
    areaVideo: { ...base.areaVideo },
    // LOGO REMOVIDA do fluxo: o campo segue inerte (visivel:false, sem url) —
    // mantido só por compatibilidade do formato salvo/payload do template.
    logo: {
      ...base.logo,
      url: null,
      arquivo: null,
      logoDataUrl: null,
      alturaProporcao: base.logo?.alturaProporcao ?? null,
      visivel: false,
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
    // ESCOPO DE EDIÇÃO + overrides individuais de ÁREA: persistem juntos, senão
    // um F5 perderia o modo "Apenas este vídeo" e os ajustes por vídeo.
    editarTodos: base.editarTodos !== false,
    areaPorVideo: { ...(base.areaPorVideo || {}) },
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
    //     ZERADA (textos/identidade/cortes/overrides não herdam NADA);
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
    // ARQUIVADOS — itens que já concluíram e saíram da lista do Editor. É um
    // dado INDEPENDENTE da sessão: vale tanto na continuação do mesmo lote
    // quanto numa sessão nova, porque não é config de edição, é o registro de
    // "este vídeo já foi entregue" (o arquivo final segue no servidor).
    const arquivados = arquivadosDoLote(dados);
    // LOGO REMOVIDA do fluxo: nenhuma restauração de logo — a config limpa já
    // nasce com logo inerte e configs antigas são neutralizadas em
    // configParaSalvar/mesclarConfig.
    // VÍDEOS: só metadados serializáveis (id + URLs ABSOLUTAS do servidor —
    // continuam válidas após sair/voltar). Estado de fila TRANSITÓRIO
    // (aguardando/processando/erro) continua voltando como 'pronto' — o
    // acompanhamento recomeça do zero no próximo "Implementar vídeo". EXCEÇÃO:
    // VÍDEO PRONTO (filaId + 'concluido' + 100%) volta EXATAMENTE como estava —
    // filaId preservado, status 'concluido' e percentual 100 — para o card
    // "✓ Pronto" (com o MP4 final) continuarem
    // válidos depois de um F5/reload.
    const itens = dados.itens
      .filter((v) => v && v.id && (v.urlFonte || v.url || v.thumbnail))
      // REMOÇÃO AUTOMÁTICA DE CONCLUÍDOS — o item que já saiu da lista por ter
      // concluir NÃO volta, mesmo que uma gravação antiga ainda o traga no
      // `dados.itens`. A lista `arquivados` é a fonte da verdade e é escrita
      // no MESMO instante da remoção (ver o effect de concluídos), então um
      // F5, uma navegação para outra aba ou um reload durante o processamento
      // devolvem exatamente a lista que o usuário está vendo.
      .filter((v) => !arquivados.has(v.id))
      .map((v) => {
        // PRONTO = concluído DE VERDADE (mesmo predicado do polling/contador).
        const pronto = ehVideoPronto({ filaId: v.filaId, status: v.status, percentual: v.percentual });
        return {
          id: v.id,
          bibliotecaId: v.bibliotecaId || v.id || null,
          nome: v.nome ?? null,
          thumbnail: v.thumbnail ?? null,
          urlFonte: v.urlFonte || v.url || null,
          duracao: v.duracao ?? null,
          // Dimensões naturais salvas no lote (ffprobe do upload). Restaurá-las
          // garante que o card já nasce com a geometria do render, antes de
          // qualquer re-hidratação.
          largura: v.largura ?? null,
          altura: v.altura ?? null,
          filaId: pronto ? v.filaId : null,
          status: pronto ? 'concluido' : 'pronto',
          percentual: pronto ? 100 : 0,
          erroMensagem: null,
        };
      });
    // Seleção consistente: o id restaurado tem prioridade; se sumiu, null
    // (o efeito abaixo abre o primeiro da lista).
    const idSelecionado = itens.some((it) => it.id === dados.idSelecionado)
      ? dados.idSelecionado
      : null;
    // templateId/assinatura pertencem ao LOTE: só voltam em continuação da
    // mesma sessão. Sessão nova começa sem template — o próximo
    // "Implementar vídeo" salva um template NOVO com a config limpa.
    return {
      itens,
      config,
      idSelecionado,
      templateId: mesmaSessao ? dados.templateId || null : null,
      assinatura: mesmaSessao ? dados.assinatura || null : null,
      // FASE 4: as mídias (template/imagens/selo) NÃO moram no localStorage —
      // só o índice `{ slot: bytes }`. O cofre é lido DEPOIS, pelo effect de
      // reidratação, e nunca numa sessão nova (lote novo = config zerada).
      indiceMidias: mesmaSessao ? dados.indiceMidias || null : null,
      // A config CRUA do disco, com as mídias já removidas. A reidratação a
      // reaplica os bytes do cofre e só ENTÃO normaliza — normalizar antes
      // faria `normalizarConfigEditor` descartar template/imagens/selo (ele só
      // aceita `data:image/`), e a arte do lote voltaria vazia.
      configCrua: mesmaSessao ? dados.config : null,
      // Marca da carga reduzida (persistência degradada por cota) para a
      // interface poder explicar o que o usuário vai ver.
      persistenciaReduzida: mesmaSessao ? dados.persistenciaReduzida === true : false,
      // ARQUIVADOS — repassados adiante para que a gravação seguinte não
      // perca o registro e o item removido não ressuscite.
      arquivados: [...arquivados],
    };
  } catch {
    return null;
  }
}

/**
 * GRAVA o estado atual do editor (autosave + botão Salvar) — FASE 4.
 *
 * O que é gravado e ONDE:
 *   · localStorage (`CHAVE_LOTE`) → itens, seleção, config SEM as mídias e o
 *     ÍNDICE `{ slot: bytes }` das mídias. É o estado LEVE: cabe sempre.
 *   · cofre (IndexedDB)          → os bytes das mídias (template/imagens/selo).
 *
 * DEGRADAÇÃO (nunca perde o lote): se o `setItem` falhar — cota estourada,
 * storage bloqueado, aba anônima — o estado leve é regravado SEM as mídias
 * (o que já é o formato gravado) e, se MESMO ASSIM falhar, numa última
 * tentativa só com o essencial do lote. O que é LEVE é sempre o último a ser
 * sacrificado, porque é ele que o usuário não consegue refazer.
 *
 * Devolve `{ gravado, midiasNoCofre, midiasPerdidas }` para que a interface
 * possa avisar o usuário quando algo realmente não coube — o `catch` vazio do
 * código anterior era justamente o que escondia a perda de dados.
 */
function salvarEstadoNoDisco({ itens, config, idSelecionado, templateId, assinatura, arquivados }) {
  const resultado = { gravado: false, midiasNoCofre: false, midiasPerdidas: false };
  try {
    const configCompleta = configParaSalvar(config);
    const loteId = configCompleta?.loteId || null;
    // COFRE (fail-safe e AUTOCONTIDO): o `?.` não protege um identificador não
    // declarado (ainda lançaria ReferenceError), e esta função é exercitada
    // isoladamente por testes que extraem do fonte só os blocos de
    // persistência. Qualquer ausência/falha aqui devolve `false` e o Editor
    // cai no caminho de ANTES da Fase 4: tudo no localStorage.
    let temCofre = false;
    try {
      temCofre = typeof cofre !== 'undefined'
        && typeof cofre.disponivel === 'function'
        && cofre.disponivel()
        && !!loteId;
    } catch {
      temCofre = false;
    }
    // A separação só entra quando o cofre existe E a função está no escopo (o
    // mesmo `typeof` dos testes que extraem blocos isolados do fonte).
    let configLeve = configCompleta;
    let midias = {};
    if (temCofre && typeof separarMidias === 'function') {
      const separada = separarMidias(configCompleta);
      configLeve = separada.config;
      midias = separada.midias;
    }
    const temMidias = Object.keys(midias).length > 0;
    const configGravar = temCofre ? configLeve : configCompleta;
    const indice = temCofre && typeof indiceDeMidias === 'function' ? indiceDeMidias(midias) : null;
    // ÍNDICE JÁ GRAVADO no disco, se houver. Lê direto do localStorage (fonte
    // do que a última gravação-promessa deixou): é ele que diz "o cofre ainda
    // tem mídias que eu não consegui ver AGORA". Ver `indiceExistente` abaixo.
    const indiceExistente = (() => {
      if (!temCofre || !loteId) return null;
      try {
        const bruto = localStorage.getItem(CHAVE_LOTE);
        if (!bruto) return null;
        const dados = JSON.parse(bruto);
        if (!dados || dados.config?.loteId !== loteId) return null; // outro lote
        const gravado = dados.indiceMidias;
        return gravado && typeof gravado === 'object' && Object.keys(gravado).length > 0 ? gravado : null;
      } catch {
        return null;
      }
    })();
    // Se o disco declara mídias e esta gravação ainda não tem os bytes, o índice
    // gravado ANTES é preservado: a config leve continua sendo gravada (o
    // estado leve nunca é sacrificado), mas o índice não vira `{}` — senão a
    // próxima abertura já não saberia buscar nada no cofre.
    const indiceGravado = (temCofre && !temMidias && indiceExistente) ? indiceExistente : indice;
    const itensSalvos = itensParaSalvar(itens);

    const montarCarga = (cfg) => JSON.stringify({
      itens: itensSalvos,
      config: cfg,
      idSelecionado: idSelecionado || null,
      templateId: templateId || null,
      assinatura: assinatura || null,
      // Índice das mídias que vivem no cofre (FASE 4). Ausente em cargas
      // antigas e quando não há cofre — a leitura trata os dois casos.
      indiceMidias: indiceGravado,
      // ARQUIVADOS (remoção automática de concluídos): ids dos itens que já
      // saíram da lista do Editor e NÃO podem ressuscitar num F5/reload.
      // Os PRONTOS que ainda estão na lista continuam sendo gravados acima —
      // só saem do disco depois da confirmação do final (ver `carregarLoteSalvo`).
      arquivados: Array.isArray(arquivados) ? arquivados : [],
    });

    try {
      localStorage.setItem(CHAVE_LOTE, montarCarga(configGravar));
      resultado.gravado = true;
    } catch {
      // COTA/BLOQUEIO: 1ª degradação — grava o estado leve (sem as imagens).
      if (temCofre) {
        try {
          localStorage.setItem(CHAVE_LOTE, montarCarga(configLeve));
          resultado.gravado = true;
        } catch {
          // 2ª degradação — só o essencial do lote (mesmo sem o resto da config).
          try {
            localStorage.setItem(CHAVE_LOTE, JSON.stringify({
              itens: itensSalvos,
              config: { loteId, loteCriadoEm: configCompleta.loteCriadoEm || null },
              idSelecionado: idSelecionado || null,
              templateId: null,
              assinatura: null,
              indiceMidias: null,
              arquivados: Array.isArray(arquivados) ? arquivados : [],
              persistenciaReduzida: true,
            }));
            resultado.gravado = true;
          } catch {
            resultado.gravado = false; // nada coube — não há o que fazer
          }
        }
      } else {
        resultado.gravado = false;
      }
    }

    // Mídias no cofre (assíncrono, fora do caminho crítico da UI).
    if (temCofre) {
      resultado.midiasNoCofre = true;
      if (temMidias) {
        resultado.midiasPerdidas = true; // até o cofre confirmar
        cofre.gravar(loteId, midias)
          .then((ok) => { if (ok) resultado.midiasPerdidas = false; })
          .catch(() => { resultado.midiasPerdidas = true; });
      } else if (!indiceExistente) {
        // Lote GENUINAMENTE sem mídias: limpa o que sobrou (template
        // removido/trocado).
        //
        // A checagem do índice é o que impede a DESTRUIÇÃO do cofre na janela
        // de restauração. Se o localStorage declara um índice (`{template:N}`)
        // mas a config ainda NÃO tem os bytes — o que acontece logo depois de
        // abrir o Editor, antes de a reidratação terminar — gravar `{}` aqui
        // apagaria de vez o template que ainda estava no IndexedDB. O
        // `descarregar` do StrictMode (monta/desmonta/remonta) torna essa
        // janela real, não teórica.
        cofre.gravar(loteId, {}).catch(() => {});
      }
    }

    return resultado;
  } catch {
    // Estado não-serializável — nunca quebra a UI.
    return resultado;
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
  // CONFIG BASE já montada nesta sessão (string JSON) + a assinatura dela.
  // ANTES estes dois campos guardavam o `templateId` de um template SALVO no
  // servidor. Agora guardam a CONFIG em si: nada é criado no servidor, a config
  // simplesmente viaja com a fila no POST /api/lote.
  // As chaves no localStorage (`templateId`/`assinatura`) são mantidas para
  // preservar o formato já gravado — `templateId` fica sempre null daqui em
  // diante e é simplesmente ignorado.
  const [configBaseAtual, setConfigBaseAtual] = useState(() => null);
  const [assinaturaBaseSalva, setAssinaturaBaseSalva] = useState(() => loteSalvo?.assinatura || null);
  // CORTE MANUAL POR LINHAS — mostra/oculta as duas linhas arrastáveis na
  // célula do vídeo selecionado. É uma FERRAMENTA de interface: não altera
  // nenhum valor, não dispara detecção e não afeta o render. Desligada, o
  // vídeo continua mostrando o resultado do corte (automático ou manual).
  const [linhasCorteAtivas, setLinhasCorteAtivas] = useState(false);
  const [toast, setToast] = useState(null);
  // ARQUIVADOS — ids dos vídeos que JÁ concluíram e saíram da lista do Editor
  // em Lote. É o registro persistente da remoção automática: enquanto um id
  // estiver aqui, ele não volta para a lista em nenhum F5/reload/navegação.
  // Vive no estado (e não num ref) porque o autosave precisa gravá-lo.
  const [arquivados, setArquivados] = useState(() => loteSalvo?.arquivados || []);
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
  // Lista vazia CAUSADA por remoção automática de concluídos (o último vídeo
  // do lote terminou). Distingue "o usuário limpou a lista" de "o lote foi
  // processado por completo" — só no segundo caso a config do lote é preservada.
  const vazioPorConclusaoRef = useRef(false);

  const pool = usePoolDeVideos(itens, idSelecionado);

  const mostrarToast = useCallback((mensagem, tipo = 'ok', opcoes = null) => {
    setToast({ mensagem, tipo, acao: opcoes?.acao || null });
    clearTimeout(timerToast.current);
    timerToast.current = setTimeout(() => setToast(null), opcoes?.duracaoMs || 4000);
  }, []);

  useEffect(() => () => clearTimeout(timerToast.current), []);

  /* ---------------------------------------------------------------------------
   * FASE 2 — "TODOS OS VÍDEOS" É LITERAL (auditoria + desfazer).
   *
   * Com "Todos os vídeos" ligado, gravar o corte global SUBSTITUI os ajustes
   * individuais de corte dos vídeos (sem eles o `manual.corte` continuaria
   * vencendo o global e o escopo não seria literal). Como a operação remove
   * edições que o usuário fez, ela precisa ser AUDITÁVEL e DESFAZÍVEL.
   *
   * A auditoria acontece AQUI — num efeito que compara a config anterior com
   * a atual — e não dentro da escrita: assim ela é independente de ONDE veio
   * a mudança (slider do painel, linha arrastada no preview, botão do painel) e
   * o updater do React continua puro. Reaproveita a infraestrutura de toast que
   * JÁ EXISTE (nada de biblioteca nova, nada de sistema de histórico): uma única
   * posição de desfazer, o suficiente para reverter esta substituição.
   * ------------------------------------------------------------------------ */
  const configAnteriorRef = useRef(config);
  const desfazerCorteRef = useRef(null);
  useEffect(() => {
    const antes = configAnteriorRef.current;
    configAnteriorRef.current = config;
    if (!antes || antes === config) return;
    const tinhaIndividuais = cortesIndividuaisAfetados(antes);
    if (!tinhaIndividuais.length) return;
    const agoraTem = new Set(cortesIndividuaisAfetados(config));
    const substituidos = tinhaIndividuais.filter((id) => !agoraTem.has(id));
    if (substituidos.length === 0) return;
    desfazerCorteRef.current = antes;
    const n = substituidos.length;
    mostrarToast(
      `Ajuste${n > 1 ? 's' : ''} individual${n > 1 ? 'is' : ''} de corte substituído${n > 1 ? 's' : ''}`
      + ` — o corte do lote vale para ${n > 1 ? 'todos os vídeos' : 'o vídeo inteiro'}.`,
      'ok',
      {
        duracaoMs: 8000,
        acao: {
          rotulo: 'Desfazer',
          aoClicar: () => {
            const voltar = desfazerCorteRef.current;
            desfazerCorteRef.current = null;
            if (!voltar) return;
            setConfig(voltar);
            mostrarToast('Ajustes individuais de corte restaurados.');
          },
        },
      },
    );
  }, [config, mostrarToast]);

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
  //
  // EXCEÇÃO — REMOÇÃO AUTOMÁTICA DE CONCLUÍDOS: quando a lista esvazia porque
  // o ÚLTIMO vídeo terminou e foi arquivado, o usuário NÃO pediu um lote
  // novo — ele acabou de processar um lote inteiro. Zerar a config aqui
  // destruiria o trabalho de composição (template/textos/cortes) que ele
  // provavelmente quer reaproveitar no próximo lote importado. Nesse caso a
  // lista vazia é um resultado do PROCESSAMENTO, não uma decisão do usuário:
  // a config é preservada e o próximo import continua com a mesma arte.
  useEffect(() => {
    if (itens.length > 0) {
      vazioPorConclusaoRef.current = false;
      return;
    }
    if (vazioPorConclusaoRef.current) return; // esvaziou por conclusão — não encerra o lote
    setConfig((atual) => (loteTemEdicoesAtivas(atual) ? criarConfigLimpaDeLote() : atual));
  }, [itens.length]);

  // REGISTRO DOS IDs QUE JÁ SAÍRAM DA LISTA (espelho síncrono do estado).
  // Declarado aqui porque `arquivarConcluidos` o usa; é reconciliado a cada
  // render logo abaixo (junto com o espelho completo do lote).
  const idsArquivadosRef = useRef(new Set());
  // ESPELHO DE ESTADO PRÉVIO AO ARQUIVAMENTO — declarado aqui (e não junto do
  // `estadoAtualRef` mais abaixo) porque `arquivarConcluidos` é declarado
  // ANTES dele: referenciar uma `const` ainda não inicializada dentro de um
  // `useCallback` só é seguro porque a leitura acontece na CHAMADA (depois do
  // render inteiro), mas manter a ordem evita depender dessa sutileza.
  const estadoPreArquivoRef = useRef(null);
  // Quantos concluídos foram arquivados desde o último encerramento de ciclo —
  // usado só para escolher a mensagem final do polling (sem toast duplicado).
  const arquivadosNoCicloRef = useRef(0);

  /**
   * ARQUIVA (remove da lista) os vídeos CONFIRMADOS pelo backend — e só eles.
   *
   * Reaproveita exatamente a mecânica já validada da lixeira
   * (`aoRemoverVideo`): filtra a lista, ajusta a seleção se o item removido era
   * o VÍDEO BASE e regrava o localStorage NA HORA. Não há nenhuma chamada de
   * rede aqui dentro — a confirmação já aconteceu antes, em
   * `verificarFinaisEArquivar` —, então esta função é PURAMENTE local e não
   * pode falhar por causa do servidor.
   *
   * Recebe a lista de itens CONFIRMADOS (pode ser mais de um: vários vídeos
   * terminam juntos) e trata todos numa única transação de estado — nada de
   * um `setItens` por vídeo (evita re-render intermediário e corrida entre
   * effects concorrentes).
   */
  const arquivarConcluidos = useCallback((confirmados) => {
    const ids = new Set(confirmados.map((it) => it.id));
    if (ids.size === 0) return;
    ids.forEach((id) => idsArquivadosRef.current.add(id));
    arquivadosNoCicloRef.current += ids.size;
    // Reflete o novo conjunto de arquivados ANTES do `setItens`: o próximo
    // render já enxerga a lista finalizada e o autosave grava o estado certo.
    setArquivados((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => novo.add(id));
      return [...novo];
    });
    setItens((atual) => {
      const proximos = atual.filter((it) => !ids.has(it.id));
      // Lista vazia por CONCLUSÃO (não por lixeira): sinaliza para o effect de
      // "lote vazio" não zerar a config de composição do usuário.
      if (proximos.length === 0) vazioPorConclusaoRef.current = true;
      return proximos;
    });
    // Seleção: se o VÍDEO BASE era um dos removidos, limpa (o auto-select
    // escolhe o próximo da lista, ou deixa o editor sem base se não sobrou
    // nenhum). Preserva a selection-effect já existente.
    setIdSelecionado((atual) => (ids.has(atual) ? null : atual));
    // PERSISTÊNCIA IMEDIATA — não espera o debounce de 350ms do autosave.
    // Motivo: um F5/navegação nesse intervalo recarregaria o item na lista. O
    // disco recebe a lista SEM os concluídos e COM os ids arquivados.
    const anterior = estadoPreArquivoRef.current || { itens, config, idSelecionado, arquivados };
    const listaSemConcluidos = (anterior.itens || []).filter((it) => !ids.has(it.id));
    salvarEstadoNoDisco({
      itens: listaSemConcluidos,
      config: anterior.config || config,
      idSelecionado: ids.has(anterior.idSelecionado) ? null : anterior.idSelecionado,
      templateId: null,
      assinatura: assinaturaBaseSalva,
      arquivados: [...new Set([...(anterior.arquivados || []), ...ids])],
    });
    mostrarToast(
      confirmados.length === 1
        ? 'Vídeo concluído — removido do Editor (final salvo na Biblioteca).'
        : `${confirmados.length} vídeos concluídos — removidos do Editor (finais salvos na Biblioteca).`
    );
  }, [mostrarToast, assinaturaBaseSalva, config, idSelecionado, itens, arquivados]);

  // REMOÇÃO AUTOMÁTICA DE VÍDEOS CONCLUÍDOS — o item PRONTO sai da lista do
  // Editor, mas NADA é apagado no servidor.
  //
  // O QUE É REMOVIDO (e só isso): o item no estado `itens` (a lista "Vídeos
  // Importados" e a grade do centro) e a referência correspondente no
  // localStorage. É a MESMA mecânica da lixeira (`aoRemoverVideo`) — nenhum
  // DELETE é enviado. Consequentemente permanecem intactos:
  //   · o MP4 final em /arquivos/publicados/{filaId}.mp4;
  //   · a thumbnail em /arquivos/thumbnails/{filaId}.jpg;
  //   · o registro do final (finais-store.json) → visível na BIBLIOTECA;
  //   · a linha da fila e o AGENDAMENTO (inclusive o automático da regra).
  //
  // POR QUE CONFIRMAR EM GET /api/finais (e não confiar só no status): o
  // servidor grava `status='concluido'` na fila ANTES de mover o MP4 para
  // publicados e ANTES de registrar o final (ver POST
  // /api/finais/receber-processado, passos 4 → 5 → 8). Remover no status
  // poderia tirar da tela um vídeo cujo arquivo ainda não existe. A consulta
  // só confirma o que já está gravado — por isso o item SAI da lista sempre
  // que o final estiver de fato disponível, e NUNCA antes disso.
  //
  // FAIL-OPEN (regra inegociável): se GET /api/finais falhar, vier vazio,
  // demorar ou o final ainda não existir, o vídeo PERMANECE no card e a
  // verificação é refeita no próximo ciclo. Perder o card é ruim; sumir com
  // um vídeo antes do final existir é pior.
  //
  // Itens 'aguardando'/'processando'/'erro' e os ainda não importados NUNCA
  // entram neste caminho — o único predicado é `ehVideoPronto`.
  const concluidosAvisadosRef = useRef(new Set());
  const verificandoRef = useRef(false);
  useEffect(() => {
    const prontos = itens.filter((it) => ehVideoPronto(it));
    if (prontos.length === 0) return undefined;
    // Reentrância: uma consulta em voo já cobre este ciclo (evita duas
    // chamadas concorrentes a /api/finais quando vários vídeos terminam juntos).
    if (verificandoRef.current) return undefined;
    // Já tratados neste ciclo de vida (o item saiu da lista) — não repete.
    const candidatos = prontos.filter((it) => !concluidosAvisadosRef.current.has(it.filaId));
    if (candidatos.length === 0) return undefined;

    let cancelado = false;
    verificarFinaisEArquivar();
    return () => { cancelado = true; };

    /** Confere no backend se os candidatos já têm final gravado e arquiva-os. */
    async function verificarFinaisEArquivar() {
      verificandoRef.current = true;
      try {
        const lista = await listarFinais();
        if (cancelado) return;
        // Resposta inesperada (não-array) = falha de consulta: nada é removido.
        if (!Array.isArray(lista)) return;
        // O id do FINAL é o próprio `filaId` do job (o servidor registra
        // `finais[filaId]`) — é por essa chave que o item casa com o seu
        // resultado. Só entram os finais CONCLUÍDOS, nunca um item em erro.
        const idsComFinal = new Set(
          lista.filter((f) => f && f.status === 'concluido' && f.id).map((f) => String(f.id))
        );
        const confirmados = candidatos.filter((it) => idsComFinal.has(String(it.filaId)));
        // Final ainda não gravado (ou consulta parcial): mantém os cards e
        // tenta de novo no próximo tick.
        if (confirmados.length === 0) return;
        // Marca ANTES de tocar no estado: se dois efeitos em sequência
        // enxergarem o mesmo PRONTO, o segundo já o ignora — um vídeo não é
        // arquivado duas vezes nem gera dois toasts.
        confirmados.forEach((it) => concluidosAvisadosRef.current.add(it.filaId));
        arquivarConcluidos(confirmados);
      } catch {
        // FAIL-OPEN: /api/finais indisponível (rede/servidor) → o vídeo
        // continua no Editor. Nada é removido e nada é gravado.
      } finally {
        verificandoRef.current = false;
      }
    }
  }, [itens, mostrarToast]);

  // LOGO REMOVIDA do fluxo: sem dataURL/restauração — o campo `logo` segue
  // inerte na config (compatibilidade do formato salvo/payload).

  // Espelho em ref (sempre fresco): o flush de unmount/pagehide usa este.
  const estadoAtualRef = useRef(null);
  estadoAtualRef.current = {
    itens,
    config,
    idSelecionado,
    // Não existe mais template salvo: nada de id para persistir.
    templateId: null,
    assinatura: assinaturaBaseSalva,
    // ARQUIVADOS — vai junto do flush de unmount/pagehide para que um item
    // removido por conclusão nunca ressuscite depois de recarregar a página.
    arquivados,
  };

  // IDs presentes no lote, em espelho SÍNCRONO do estado. O `estadoAtualRef`
  // acima só reflete `itens` DEPOIS do re-render, e a detecção automática
  // (fundo) pode resolver antes disso — sem este espelho, o vídeo que acabou
  // de ser importado pareceria "removido" e o corte seria descartado. É
  // atualizado na hora em `aoAdicionarVideo`/`aoRemoverVideo` e reconciliado
  // a cada render.
  const idsNoLoteRef = useRef(new Set());
  idsNoLoteRef.current = new Set(itens.map((it) => it.id));
  // O espelho de arquivados precisa conhecer os ids removidos ANTES do
  // re-render (mesma janela em que a detecção de bordas pode resolver), então
  // ele também é reconciliado por cima do estado, sem perder o que o
  // arquivamento acabou de acrescentar.
  idsArquivadosRef.current = new Set(arquivados);
  // Espelho usado pela gravação IMEDIATA do arquivamento (ver
  // `arquivarConcluidos`): sempre o estado do render ANTERIOR, ou seja, a lista
  // completa antes de os concluídos saírem.
  estadoPreArquivoRef.current = { itens, config, idSelecionado, arquivados };

  // VALIDAÇÃO DA RESTAURAÇÃO (1× por mount): confere o `bibliotecaId` de cada
  // item vindo do localStorage contra a biblioteca REAL do servidor e limpa
  // SOMENTE as referências confirmadas como órfãs — antes de implementar
  // (o /api/lote rejeitaria o lote inteiro: "Vídeo ... não
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

  // Flush no unmount: garante que o ÚLTIMO estado vá pro localStorage mesmo
  // que o usuário saia da aba dentro da janela do debounce (trocar de página
  // desmonta esta página). Reload/fechar a aba: o cleanup do React NÃO roda —
  // `pagehide` garante o save nesses casos.
  //
  // REGRA DA JANELA DE REIDRATAÇÃO: enquanto as mídias do cofre não voltaram
  // (`midiasProntas === false`), o `config` em memória AINDA NÃO tem o
  // template. Gravar esse estado aqui sobrescreveria o índice com `{}` e
  // apagaria o template do cofre — e o React em StrictMode monta/desmonta/
  // remonta, o que torna essa janela REAL (era exatamente o que fazia o
  // template sumir ao voltar para o Editor). Portanto, antes da reidratação o
  // flush grava o estado LEVE mas preserva o índice já existente; o AUTOSAVE,
  // que espera `midiasProntas`, é quem grava o estado completo em seguida.
  const descarregar = useCallback(() => {
    const atual = estadoAtualRef.current;
    if (!atual) return;
    salvarEstadoNoDisco({ ...atual });
  }, []);

  /* ---------------------------------------------------------------------------
   * FASE 4 — REIDRATAÇÃO DAS MÍDIAS (o template volta do cofre).
   *
   * A config salva no localStorage chega SEM as imagens (só o índice). Este
   * effect busca os bytes no cofre e devolve as mídias aos seus lugares, antes
   * de qualquer gravação — é o que impede que o AUTOSAVE, disparado logo depois
   * do mount, regrave a config ainda sem o template e apague o que estava no
   * cofre.
   *
   * · Só roda quando a sessão É a mesma do lote salvo (sessão nova = lote novo =
   *   config zerada, e nada de mídia pode ser herdado — a regra anti-herança
   *   continua valendo sem exceção);
   * · falha do cofre = fail-open (o editor abre sem as imagens, o restante do
   *   lote — vídeos, cortes, área, escopo — está intacto e é o que importa);
   * · o autosave abaixo espera este effect terminar (`midiasProntas`), então
   *   nunca existe janela em que uma config sem mídias sobrescreva o cofre.
   * ------------------------------------------------------------------------ */
  const indiceRestaurado = useRef(loteSalvo?.indiceMidias || null);
  const loteRestaurado = useRef(loteSalvo?.config?.loteId || null);
  const configCruaRestaurada = useRef(loteSalvo?.configCrua || null);
  // É STATE (não ref) de propósito: ao virar `true` o effect de autosave roda
  // de novo e grava a config JÁ com as mídias. Com ref, a gravação ficaria
  // pendurada até a próxima edição do usuário.
  const [midiasProntas, setMidiasProntas] = useState(false);
  // Promessa da leitura do cofre, MANTIDA ENTRE MONTAGENS.
  //
  // RACE CONDITION CORRIGIDA (era a 3ª causa do reset): o React em StrictMode
  // monta → desmonta → remonta. O cleanup antigo (`ativo = false`) cancelava a
  // PRIMEIRA leitura do cofre, e a segunda passava a competir com um
  // `setMidiasProntas(true)` que podia vencer — liberando o autosave com uma
  // config que ainda não tinha o template. Resultado: o índice virava `{}` e o
  // template sumia do cofre. Guardar a promessa faz a segunda montagem
  // REUTILIZAR a mesma leitura (o cofre é idempotente) em vez de refazê-la, e
  // a promessa nunca é rejeitada (o cofre é fail-open).
  const leituraDoCofreRef = useRef(null);
  useEffect(() => {
    const indice = indiceRestaurado.current;
    const loteId = loteRestaurado.current;
    if (!indice || !loteId || !cofre.disponivel()) {
      setMidiasProntas(true); // nada a reidratar — libera o autosave
      return undefined;
    }
    if (!leituraDoCofreRef.current) {
      leituraDoCofreRef.current = cofre
        .lerDoIndice(loteId, indice)
        .catch(() => ({}))
        .then((midias) => {
          // A config CRUA (ainda sem normalizar) é a base: só nela as imagens
          // ainda existem como elementos. Normalizar ANTES de reidratar faria o
          // `normalizarConfigEditor` descartá-las por não terem `data:image/`, e
          // o lote voltaria sem template/imagem/selo.
          if (!midias || Object.keys(midias).length === 0) return;
          setConfig(mesclarConfig(aplicarMidias(configCruaRestaurada.current || {}, midias)));
        })
        .finally(() => { setMidiasProntas(true); });
    } else {
      // Segunda montagem (StrictMode): a leitura JÁ está em curso — basta
      // esperar a mesma promessa.
      leituraDoCofreRef.current.finally(() => setMidiasProntas(true));
    }
    return undefined; // NADA é cancelado: a leitura precisa chegar ao fim
  }, []);

  // LOGO REMOVIDA do fluxo: sem conversão/persistência de dataURL.
  // AUTOSAVE — qualquer mudança (vídeos, seleção ou a config inteira:
  // identidade, textos, área do vídeo, fundo) é gravada no localStorage
  // com debounce curto. Sair da aba e voltar recupera TUDO. Os itens guardam
  // URLs do servidor (uploads/thumbnails) — os vídeos sobrevivem e o pool
  // (usePoolDeVideos) remonta o <video> a partir da urlFonte.
  useEffect(() => {
    // FASE 4: espera a reidratação das mídias. Gravar antes dela sobrescreveria
    // o cofre com uma config que ainda não tem as imagens.
    if (!midiasProntas) return undefined;
    const timer = setTimeout(
      () =>
        salvarEstadoNoDisco({
          itens,
          config,
          idSelecionado,
          templateId: null,
          assinatura: assinaturaBaseSalva,
          arquivados,
        }),
      350
    );
    return () => clearTimeout(timer);
  }, [itens, config, idSelecionado, assinaturaBaseSalva, midiasProntas, arquivados]);

  // Flush no unmount: garante que o ÚLTIMO estado vá pro localStorage mesmo
  // que o usuário saia da aba dentro da janela do debounce (trocar de página
  // desmonta esta página). Reload/fechar a aba: o cleanup do React NÃO roda —
  // `pagehide` garante o save nesses casos.
  useEffect(() => () => descarregar(), [descarregar]);
  useEffect(() => {
    window.addEventListener('pagehide', descarregar);
    return () => window.removeEventListener('pagehide', descarregar);
  }, [descarregar]);

  /**
   * DETECÇÃO AUTOMÁTICA DE BORDAS NO IMPORT (fundo, por vídeo) — DIAGNÓSTICO.
   *
   * Dispara `detectarBordasDoVideo` (a MESMA função de produção, sem
   * reimplementação: cria <video>, faz seek e desenha no <canvas>) assim que o
   * vídeo entra na lista e guarda o resultado em `config.overridesPorVideo` como
   * INFORMAÇÃO (`deteccao`).
   *
   * REGRA FUNDAMENTAL (FASE 0/FASE 1): um vídeo recém-importado NÃO pode nascer
   * com uma edição efetiva. A detecção NUNCA cria corte manual nem corte
   * efetivo: ela só informa. O corte efetivo do vídeo recién-importado é 0/0
   * (inativo) e o payload de produção não leva corte ativo. A detecção só vira
   * corte quando o usuário clica em "Usar detecção" (`usarCorteAutomaticoDoVideo`).
   *
   * REGRAS (todas deliberadas, nenhuma muda o que já foi validado):
   * · NUNCA bloqueia o import: roda fora do `setItens`, sem await no caminho
   *   da UI — o vídeo aparece na lista na hora e a informação chega depois.
   * · Só grava quando `aplicavel.superior` OU `aplicavel.inferior` é true.
   * · O lado com `aplicavel:false` entra com 0 (nunca com o número medido):
   *  _fail-open_ — dúvida em um lado não aplica corte nele.
   * · Percentuais passam por `limitarCorte` (MESMA função que o painel, o
   *   arraste e o render usam) → prévia e vídeo final nunca divergem.
   * · NUNCA sobrescreve a edição manual do usuário: a mão do usuário vence.
   * · Se o vídeo foi removido da lista enquanto detectava, o resultado é
   *   descartado (não deixa override órfão na config).
   * · Falha/ilegível/sem confiança → nada é gravado (fail-open).
   *
   * O `detectorBordas.js` NÃO foi tocado: esta é a ÚNICA chamada dele.
   */
  const detectarCorteAutomatico = useCallback(async (videoId, urlFonte) => {
    if (!videoId || !urlFonte) return;
    try {
      const r = await detectarBordasDoVideo(urlFonte);
      const aplicavel = r?.aplicavel;
      const algumAplicavel = aplicavel?.superior === true || aplicavel?.inferior === true;
      if (!algumAplicavel) return; // sem corte aplicável = não grava nada
      const bruto = {
        superior: aplicavel.superior ? Number(r.superior) || 0 : 0,
        inferior: aplicavel.inferior ? Number(r.inferior) || 0 : 0,
      };
      if (bruto.superior <= 0 && bruto.inferior <= 0) return;
      const limitado = limitarCorte(bruto.superior, bruto.inferior, 'superior');
      setConfig((cfg) => {
        // Vídeo removido do lote durante a detecção: descarta (fail-open).
        if (!idsNoLoteRef.current.has(videoId)) return cfg;
        // Escrita DA FONTE AUTOMÁTICA: grava SÓ a INFORMAÇÃO `deteccao`.
        // NÃO cria corte manual nem corte efetivo — o vídeo importado nasce
        // sem edição, e a detecção só vira corte por "Usar detecção".
        return definirCorteAutomaticoDoVideo(cfg, videoId, {
          ...limitado,
          aplicavel: { ...aplicavel },
          confiavel: r?.confiavel ?? null,
          em: Date.now(),
          detalhes: r?.detalhes ?? null,
        });
      });
    } catch {
      // FAIL-OPEN: qualquer falha na detecção não impede o import.
    }
  }, []);

  const aoAdicionarVideo = useCallback(
    (novo) => {
      // Importou vídeo novo: o fluxo normal de auto-select volta a valer (não faz
      // sentido manter o editor "sem vídeo base" depois de uma importação).
      preservarSemBaseRef.current = false;
      const urlFonte = novo.urlFonte || novo.url || null;
      const novoId = novo.id || novo.bibliotecaId || null;
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
            // Dimensões naturais do `ffprobe` do upload (podem vir `null` no
            // 201 — o enriquecimento é assíncrono; a re-hidratação preenche).
            // São elas que dão ao preview a mesma geometria do render.
            largura: novo.largura ?? null,
            altura: novo.altura ?? null,
            status: novo.status || 'pronto',
            percentual: 0,
            filaId: null,
            erroMensagem: null,
          },
        ];
      });
      // REGRA FUNDAMENTAL (FASE 0/FASE 1): o item é criado com id, bibliotecaId,
      // nome, thumbnail, urlFonte, duração e dimensões PRESERVADOS, e NADA mais:
      // NÃO é criado corte manual, NÃO é criado override efetivo, e o
      // `corteBordas` global, a área e a posição NÃO são tocados. A config
      // compartilhada do lote é preservada intacta (como sempre foi).
      //
      // DETECÇÃO AUTOMÁTICA: dispara em FUNDO e grava SÓ INFORMAÇÃO (`deteccao`).
      // Não é aguardada — o import nunca trava por causa da detecção — e ela
      // NUNCA cria corte efetivo: só informa, e vira corte se o usuário clicar
      // em "Usar detecção".
      if (novoId && urlFonte) {
        // Entra no espelho de ids ANTES de detectar: a detecção é assíncrona e
        // pode terminar antes do re-render que popula `itens`.
        idsNoLoteRef.current.add(novoId);
        detectarCorteAutomatico(novoId, urlFonte);
      }
    },
    [detectarCorteAutomatico]
  );

  const aoSelecionar = useCallback((item) => setIdSelecionado(item.id), []);

  // POOL: focar um vídeo (hover na lista/célula) pede o carregamento dele — o
  // pool mantém no máximo 3 vídeos completos e libera os que saem de foco.
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
      // Sai do espelho de ids NA HORA: se a detecção automática desse vídeo
      // ainda estiver rodando, o resultado é descartado (sem override órfão).
      idsNoLoteRef.current.delete(item.id);
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
        // A lixeira NÃO arquiva (é remoção do usuário, não de conclusão): o id
        // segue como reimportável. O que passa adiante é o conjunto já
        // existente, para não perder o registro dos concluídos anteriores.
        arquivados: atual.arquivados || [],
      });
      mostrarToast(
        eraBase
          ? 'Vídeo base removido do Editor — escolha outro na lista (o arquivo original continua na Biblioteca).'
          : 'Vídeo removido do Editor (o arquivo original continua na Biblioteca).'
      );
    },
    [mostrarToast]
  );

  const urlVideoAtiva = idSelecionado ? pool.ativos[idSelecionado] || null : null;

  // -----------------------------------------------------------------------
  // FLUXO REAL — template no servidor + fila (Supabase) + worker local
  // -----------------------------------------------------------------------

  /** Monta a CONFIG do lote para cada grupo de corte — SEM chamar o servidor.
   *
   * NOVA ARQUITETURA: a configuração não é mais salva como TEMPLATE. Ela é
   * apenas serializada e devolvida aqui, para viajar JUNTO com a fila no
   * POST /api/lote (o worker lê direto da linha). Nenhum registro é criado em
   * templates-store.json, nenhum id de template é guardado e nenhum
   * GET /api/templates/:id acontece.
   *
   * O agrupamento por CORTE (templates por corte) continua EXATAMENTE como
   * antes: cada ASSINATURA de config (inclusive o override de corte do vídeo)
   * tem a SUA configuração, e vídeos com cortes diferentes continuam indo para
   * grupos diferentes — cada vídeo recebe exatamente a config do seu corte.
   *
   * A logo segue inerte no fluxo (visivel:false), exatamente como antes: o
   * Editor em Lote não usa logo no render, e por isso ela nem entra no payload.
   */
  const configsPorAssinaturaRef = useRef(new Map());
  const garantirConfig = useCallback((overrideVideo = null) => {
    const configAtual = { ...config, logo: { ...config.logo, visivel: false, url: null, arquivo: null } };

    const assinatura = assinarConfig(configAtual, overrideVideo);
    const emCache = configsPorAssinaturaRef.current.get(assinatura);
    if (emCache) return { config: emCache, assinatura };

    // Config BASE (sem override): reaproveita a última config da sessão, sem
    // recalcular. Preserva o comportamento de "não reprocessa o que não mudou".
    if (!overrideVideo && configBaseAtual && assinatura === assinaturaBaseSalva) {
      configsPorAssinaturaRef.current.set(assinatura, configBaseAtual);
      return { config: configBaseAtual, assinatura };
    }

    // CORREÇÃO DO BUG (preservada): o override NUNCA reaproveita a config base
    // (antes, o payload do override sobrescrevia o template base e os vídeos sem
    // corte recebiam o corte do último override). Configs diferentes => grupos
    // diferentes; cada vídeo recebe exatamente a config do seu corte.
    // O resultado do mapeamento usa nome próprio (`configPayload`) para NÃO
    // sombrear o estado `config` do componente: um `const config` aqui colocaria
    // todo o corpo da função em TDZ e o uso de `config` acima (configAtual)
    // lançaria "Cannot access 'config' before initialization" no clique em
    // "Implementar vídeos".
    const configPayload = configParaTemplatePayload(configAtual, overrideVideo);
    const configJson = JSON.stringify(configPayload);

    configsPorAssinaturaRef.current.set(assinatura, configJson);
    // Apenas a config BASE atualiza o estado de sessão.
    if (!overrideVideo) {
      setConfigBaseAtual(configJson);
      setAssinaturaBaseSalva(assinatura);
    }
    return { config: configJson, assinatura };
  }, [config, configBaseAtual, assinaturaBaseSalva]);

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

  // Ao VOLTAR pro editor: o estado de fila TRANSITÓRIO (aguardando/processando)
  // não é restaurado do localStorage — apenas os itens PRONTOS (concluido +
  // 100%, URLs estáveis do MP4 final) voltam como PRONTO (ver itensParaSalvar).
  // Se o usuário saiu no meio de uma implementação e voltou, o acompanhamento
  // recomeça no próximo "Implementar vídeo" (a fila REAL continua na
  // Oracle/worker — só a UI tinha parado de olhar).

  // METADADOS DO POOL — RE-HIDRATAÇÃO (GET /api/biblioteca):
  // o item importado nasce `thumbnail: null` e `largura/altura: null` (o upload
  // responde na hora e o ffprobe/thumbnail rodam em BACKGROUND no servidor).
  // Enquanto existir item com `bibliotecaId` sem thumbnail OU sem as dimensões
  // naturais, este efeito re-consulta a biblioteca periodicamente (MESMO padrão
  // do polling da fila acima) e preenche o que o servidor já tiver publicado:
  // thumbnail, duração e — o mais importante para a prévia — `largura`/`altura`.
  //
  // POR QUE AS DIMENSÕES SÃO OBRIGATÓRIAS AQUI: elas são a FONTE OFICIAL da
  // geometria do preview (mesmo número que o `ffprobe` do render usa). Sem elas,
  // um card NÃO SELECIONADO cai no fallback e mostra geometria diferente da do
  // vídeo final. Por isso o gate considera `largura`/`altura`, e não só a
  // thumbnail: chegar na thumbnail não encerra mais a consulta.
  //  · 1ª consulta IMEDIATA ao ligar + tick de 4s;
  //  · a chave do efeito é a LISTA de ids pendentes: importar outro vídeo
  //    remonta o efeito (teto de tentativas recomeça) e cada progresso
  //    parcial (um item preenchido) renova o teto;
  //  · todos preenchidos → chave vazia → intervalo encerrado (zero polling
  //    quando nada está pendente).
  const itemSemMetadados = (it) =>
    !!(it && it.bibliotecaId && (!it.thumbnail || !(Number(it.largura) > 0 && Number(it.altura) > 0)));
  const chaveThumbsPendentes = useMemo(
    () => itens.filter(itemSemMetadados).map((it) => it.bibliotecaId).join(','),
    [itens]
  );
  useEffect(() => {
    if (!chaveThumbsPendentes) return undefined;
    let ativo = true;
    let emVoo = false;
    let tentativas = 0;
    const consultar = async () => {
      if (emVoo) return; // nunca sobrepõe uma consulta em andamento
      emVoo = true;
      tentativas += 1;
      try {
        const bib = await buscarBiblioteca();
        if (!ativo || !Array.isArray(bib)) return;
        const dadosPorId = new Map();
        for (const v of bib) {
          if (!v || !v.id) continue;
          const temThumb = !!v.thumbnailUrl;
          const temDim = Number(v.largura) > 0 && Number(v.altura) > 0;
          if (!temThumb && !temDim) continue;
          dadosPorId.set(v.id, {
            thumbnail: temThumb ? urlArquivo(v.thumbnailUrl) : null,
            duracao: Number.isFinite(Number(v.duracaoSegundos)) ? `${v.duracaoSegundos}s` : null,
            largura: temDim ? Math.round(Number(v.largura)) : null,
            altura: temDim ? Math.round(Number(v.altura)) : null,
          });
        }
        if (dadosPorId.size === 0) return; // enriquecimento ainda não rodou
        setItens((atual) => {
          let mudou = false;
          const proximo = atual.map((it) => {
            if (!it || !it.bibliotecaId) return it;
            // Só toca no que ainda falta: thumbnail e dims são independentes e
            // podem chegar em consultas diferentes.
            const precisaThumb = !it.thumbnail;
            const precisaDim = !(Number(it.largura) > 0 && Number(it.altura) > 0);
            if (!precisaThumb && !precisaDim) return it;
            const dado = dadosPorId.get(it.bibliotecaId);
            if (!dado) return it;
            if (!precisaThumb && !dado.thumbnail) return it;
            if (!precisaDim && !dado.largura) return it;
            mudou = true;
            return {
              ...it,
              thumbnail: it.thumbnail || dado.thumbnail || it.thumbnail,
              duracao: it.duracao || dado.duracao,
              largura: it.largura || dado.largura || it.largura || null,
              altura: it.altura || dado.altura || it.altura || null,
            };
          });
          return mudou ? proximo : atual;
        });
      } catch {
        /* rede instável — tenta de novo no próximo tick (fail-open) */
      } finally {
        emVoo = false;
      }
    };
    consultar();
    const id = setInterval(() => {
      if (tentativas >= TETO_TENTATIVAS_THUMB_PENDENTE) {
        clearInterval(id); // servidor não publicou a thumbnail a tempo — desiste
        return;
      }
      consultar();
    }, INTERVALO_THUMB_PENDENTE_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [chaveThumbsPendentes]);

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
      // Contador de concluídos ARQUIVADOS neste ciclo. A remoção já mostra o
      // seu próprio toast; este só encerra o ciclo quando nada foi arquivado
      // (fila só de erros, por exemplo) — sem mensagem duplicada.
      const n = arquivadosNoCicloRef.current;
      arquivadosNoCicloRef.current = 0;
      mostrarToast(n > 0 ? 'Implementação concluída — processo finalizado.' : 'Implementação concluída.');
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
    // Os concluídos saem da lista assim que o backend confirma o final, então
    // este contador cobre apenas a JANELA entre o status virar 'concluido' e a
    // confirmação em GET /api/finais — nunca o resultado final do lote.
    const concluidos = itens.filter((i) => i.status === 'concluido').length;
    const erros = itens.filter((i) => i.status === 'erro').length;
    if (enfileirando) return 'Enfileirando...';
    if (processando > 0) return `Processando: ${processando} em andamento`;
    if (aguardando > 0) return `Na fila: ${aguardando} aguardando`;
    if (erros > 0) return `Concluído com ${erros} erro(s)`;
    if (concluidos > 0) return `Finalizando: ${concluidos} concluído(s)`;
    return 'Pronto';
  }, [itens, enfileirando]);

  const aoSalvar = useCallback(async () => {
    setSalvando(true);
    try {
      // A config é montada em memória (sem chamada ao servidor): ela viaja com
      // a fila no POST /api/lote. O "Salvar" grava o estado do editor no
      // localStorage — vídeos importados + config de composição.
      const { assinatura } = garantirConfig();
      salvarEstadoNoDisco({ itens, config, idSelecionado, templateId: null, assinatura, arquivados });
      mostrarToast(`Salvo — ${itens.length} vídeo(s) importado(s) + configuração do Editor.`);
    } catch (erro) {
      mostrarToast(erro.message || 'Não foi possível salvar.', 'erro');
    } finally {
      setSalvando(false);
    }
  }, [config, itens, idSelecionado, garantirConfig, mostrarToast]);

  const aoProcessar = useCallback(async () => {
    if (enfileirando) return;
    // REGRA DO FLUXO: "Implementar vídeo" é a ÚNICA ação que renderiza. Itens
    // PRONTOS (concluido + 100%) NUNCA são reenfileirados — já têm MP4 final
    // em /arquivos/publicados/ e apenas esperam o encaminhamento.
    const enfileiraveis = itens.filter((it) => it.bibliotecaId && it.status !== 'concluido');
    if (enfileiraveis.length === 0) {
      mostrarToast(
        itens.length > 0
          ? 'Todos os vídeos deste lote já estão PRONTOS.'
          : 'Importe vídeos pela central de downloads antes de implementar.',
        'erro'
      );
      return;
    }
    if (itens.some((it) => it.status === 'aguardando' || it.status === 'processando')) {
      mostrarToast('Este lote já está na fila de processamento.', 'erro');
      return;
    }

    // VALIDAÇÃO EXPLÍCITA (contrato videos=[{ bibliotecaId, tituloIA }]):
    // nenhum vídeo sem bibliotecaId válido pode gerar POST /api/lote — sem
    // fallback para caminhoVideo, sem fila com biblioteca_id NULL.
    const semBiblioteca = enfileiraveis.filter(
      (it) => !it || typeof it.bibliotecaId !== 'string' || !it.bibliotecaId.trim()
    );
    if (semBiblioteca.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        '[EditorLote] Implementar bloqueado — vídeos sem bibliotecaId:',
        semBiblioteca.map((it) => ({ id: it?.id, nome: it?.nome, bibliotecaId: it?.bibliotecaId }))
      );
      mostrarToast(
        `Não foi possível implementar: ${semBiblioteca.length} vídeo(s) sem bibliotecaId válido. Reimporte os vídeos pela central de downloads. POST /api/lote não enviado.`,
        'erro'
      );
      return;
    }

    // mapaFila: `it.id` -> `filaId`. CHAVEADO POR ID, nunca por índice: com
    // vários POST /api/lote (um por grupo de corte), cada `ids[]` é alinhado
    // ao SEU grupo — achatá-los num array só e indexar por `enfileiraveis[i]`
    // trocaria o final entre os vídeos. Como o consumidor é um `get()` por
    // chave (abaixo), a ORDEM de inserção é irrelevante.
    const mapaFila = new Map();
    const publicarNaFila = () => {
      if (mapaFila.size === 0) return;
      setItens((atual) =>
        atual.map((it) => {
          const filaId = mapaFila.get(it.id);
          return filaId ? { ...it, filaId, status: 'aguardando', percentual: 0, erroMensagem: null } : it;
        })
      );
    };

    setEnfileirando(true);
    try {
      // 1) TEMPLATE POR GRUPO DE CORTE (não UM ÚNICO PARA O LOTE TODO).
      //    Cada ASSINATURA de corte tem o SEU template: o vídeo com corte
      //    próprio vai com o dele e os demais vão com o corte global —
      //    nunca mais o corte de um contaminando o outro.
      //    `cortePorVideo` devolve null quando o vídeo NÃO tem corte EDITADO
      //    pelo usuário: ele usa o corte global e NÃO gera assinatura/template
      //    novo. A `deteccao` (diagnóstico automático) NÃO conta como corte —
      //    é o que garante que um vídeo recém-importado não entre no render
      //    cortado. Passar o objeto de `corteEfetivoDoVideo` direto (que NUNCA
      //    é null) forçaria `corteBordas.ativo:true` no payload e criaria um
      //    template à toa para todo vídeo sem corte.
      const cortePorVideo = (videoId) => {
        if (!videoId || !temAjusteIndividualDeCorte(config, videoId)) return null;
        const { superior, inferior } = corteEfetivoDoVideo(config, videoId);
        return { superior, inferior };
      };
      // Chave estável do override (null = corte global), na ordem de 1ª
      // aparição da lista — só para não repetir o mesmo override N vezes.
      // A chave inclui a ÁREA efetiva do vídeo: dois vídeos com o MESMO corte
      // mas com enquadramento individual DIFERENTE (modo "Apenas este vídeo")
      // precisam de configs diferentes, senão o render entregaria a um deles a
      // área/zoom do outro. `assinarConfig` (payload inteiro) continua sendo a
      // chave FINAL do grupo, então grupos idênticos ainda viram UM POST.
      const cortesPorIndice = enfileiraveis.map((it) => cortePorVideo(it.id));
      const indicesPorChave = new Map();
      const overridePorChave = new Map();
      cortesPorIndice.forEach((override, i) => {
        const areaIndividual = areaIndividualDoVideo(config, enfileiraveis[i].id);
        const chaveCorte = override ? `corte:${override.superior}/${override.inferior}` : 'corte:global';
        // Sem override de área o vídeo usa o global — a chave fica estável e o
        // agrupamento por corte continua exatamente como era.
        const chaveArea = areaIndividual
          ? `area:${Math.round(areaIndividual.x)}:${Math.round(areaIndividual.y)}:${Math.round(areaIndividual.largura)}:${Math.round(areaIndividual.altura)}:${Math.round(Number(areaIndividual.zoom || 1) * 100)}:${Math.round(Number(areaIndividual.deslocamentoX ?? 50))}:${Math.round(Number(areaIndividual.deslocamentoY ?? 50))}`
          : 'area:global';
        // POSIÇÃO (px do quadro) — DIMENSÃO INDEPENDENTE DO CORTE na chave do
        // grupo. Sem isto, dois vídeos com o MESMO corte/área mas arrastados
        // para posições diferentes cairiam no MESMO grupo e receberiam a
        // posição do primeiro da lista — o render entregaria a um deles a
        // posição do outro. A chave lê o override INDIVIDUAL de posição
        // (`posicaoPorVideo[id]`), o mesmo que `posicaoEfetivaDoVideo` usa no
        // preview e no payload; `null`/`c` = centralizado (chave estável).
        const posicaoIndividual = config.posicaoPorVideo?.[enfileiraveis[i].id] || null;
        const chavePosicao = posicaoIndividual
          ? `pos:${posicaoIndividual.offsetX ?? 'c'}:${posicaoIndividual.offsetY ?? 'c'}`
          : 'pos:global';
        const chave = `${chaveCorte}|${chaveArea}|${chavePosicao}`;
        if (!indicesPorChave.has(chave)) {
          indicesPorChave.set(chave, []);
          // O override transportado carrega o `videoId` para o payload resolver
          // a ÁREA/POSIÇÃO EFETIVAS (global ⊕ override) daquele vídeo
          // específico. Um override SÓ DE POSIÇÃO não altera corte nem área:
          // `configParaTemplatePayload` só entra no caminho do corte quando o
          // próprio override traz `superior`/`inferior`.
          overridePorChave.set(chave, override || areaIndividual || posicaoIndividual
            ? { ...(override || {}), videoId: enfileiraveis[i].id }
            : null);
        }
        indicesPorChave.get(chave).push(i);
      });
      // Chave do grupo = a ASSINATURA devolvida por `garantirConfig` (a mesma
      // que ele usa como cache): overrides diferentes que rendem o MESMO
      // payload caem no MESMO grupo e gastam UM POST /api/lote.
      //
      // O AGRUPAMENTO POR CORTE É INTOCADO — só mudou o que o grupo carrega:
      // antes um `templateId` de um template já salvo no servidor; agora a
      // própria CONFIG (string JSON), que viaja junto da fila. A área efetiva
      // de cada vídeo entra na CHAVE do grupo (acima), então um enquadramento
      // individual nunca é entregue ao vídeo errado.
      const grupos = new Map();
      for (const [chave, indices] of indicesPorChave) {
        const { config: configJson, assinatura } = garantirConfig(overridePorChave.get(chave));
        const itens = indices.map((i) => enfileiraveis[i]);
        const jaExistente = grupos.get(assinatura);
        if (jaExistente) jaExistente.itens.push(...itens);
        else grupos.set(assinatura, { configJson, itens });
      }

      // 2) Enfileira na fila REAL (Supabase) — um POST /api/lote por grupo.
      //    A Oracle e o worker local consomem com reserva atômica. O texto
      //    SUPERIOR do lote vai como tituloIA (DOIS textos: superior +
      //    inferior, independentes).
      const textoSup = config.textos?.superior || config.texto;
      const tituloIA =
        textoSup.visivel && String(textoSup.conteudo || '').trim() !== ''
          ? String(textoSup.conteudo).trim()
          : '';

      let totalEnfileirado = 0;
      for (const grupo of grupos.values()) {
        // A CONFIG DO GRUPO viaja no corpo do POST — é gravada na própria linha
        // da fila (coluna config_template) e lida de lá pelo worker. Nenhum
        // template é criado no servidor.
        const resposta = await processarLote(
          grupo.configJson,
          grupo.itens.map((it) => ({ bibliotecaId: it.bibliotecaId, tituloIA }))
        );
        const ids = resposta.ids || [];
        // Zip DESTE grupo: `ids[i]` pertence a `grupo.itens[i]`, sempre.
        grupo.itens.forEach((it, i) => {
          if (ids[i]) mapaFila.set(it.id, ids[i]);
        });
        totalEnfileirado += ids.length;
        // Publica a CADA grupo: se um grupo seguinte falhar, os anteriores
        // JÁ estão na fila real e precisam ficar visíveis para o polling —
        // senão viram órfãos (na fila, sem card acompanhando).
        publicarNaFila();
      }

      inicioFilaRef.current = Date.now();
      avisoWorkerRef.current = false;
      publicarNaFila();
      if (mapaFila.size > 0) iniciarPolling();
      mostrarToast(`${totalEnfileirado} vídeo(s) na fila REAL de processamento.`);
    } catch (erro) {
      // FALHA PARCIAL: com vários grupos, os anteriores podem já estar na
      // fila real. Eles NÃO podem sumir da UI — publica o que entrou e
      // sobe o polling antes de avisar o erro.
      if (mapaFila.size > 0) {
        inicioFilaRef.current = Date.now();
        avisoWorkerRef.current = false;
        publicarNaFila();
        iniciarPolling();
        mostrarToast(
          `${mapaFila.size} vídeo(s) entraram na fila; o restante falhou — ${erro.message || 'erro ao enfileirar'}.`,
          'erro'
        );
      } else {
        mostrarToast(erro.message || 'Falha ao enfileirar o lote.', 'erro');
      }
    } finally {
      setEnfileirando(false);
    }
  }, [itens, config, enfileirando, garantirConfig, iniciarPolling, mostrarToast]);

  // FLUXO: "Implementar vídeo" é a ÚNICA ação do header — o botão
  // "Processar vídeos" foi REMOVIDO (sem encaminhamento nesta interface).

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

        {/* CENTRO — VÍDEOS (grade de 6 por fileira). Com o Preview ligado, cada
            célula mostra o MESMO template + a MESMA área marcada. */}
        <section className="edl-preview-central min-w-0 flex flex-col h-full" aria-label="Vídeos do lote">
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
            linhasCorteAtivas={linhasCorteAtivas}
          />
        </section>

        {/* DIREITA — FLUXO DO TEMPLATE (painel único e simples): importar
            template · corte de bordas */}
        <aside className="edl-painel-direita min-w-0 flex flex-col border-l border-[color:var(--edl-borda)] h-full" aria-label="Template do lote">
          <PainelFluxo
            config={config}
            itens={itens}
            aoAtualizarConfig={setConfig}
            /* CORTE MANUAL POR LINHAS — o painel controla a ferramenta e
               grava o ajuste INDIVIDUAL do vídeo selecionado. */
            idSelecionado={idSelecionado}
            linhasCorteAtivas={linhasCorteAtivas}
            aoAlternarLinhasCorte={setLinhasCorteAtivas}
          />
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
          {toast.acao ? (
            <button
              type="button"
              onClick={toast.acao.aoClicar}
              className="edl-ring-foco shrink-0 text-[11px] font-extrabold px-2 py-1 rounded-lg"
              style={{ background: 'rgba(236,72,153,0.22)', color: '#fff' }}
            >
              {toast.acao.rotulo}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

