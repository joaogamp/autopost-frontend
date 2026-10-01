/**
 * FASE 4 — COFRE DE MÍDIAS DO EDITOR EM LOTE (IndexedDB).
 *
 * POR QUE EXISTE: o estado do Editor era gravado inteiro em UMA chave de
 * localStorage, incluindo as mídias em base64 (`templateFundo.url`,
 * `imagens[].url`, `identidade.selo.urlImagem`). O Chrome/Edge tem limite
 * PRÁTICO de ~5 MB por origem, e um template de 4 MB já vira ~5,4 MB no
 * payload (6 MB → ~8 MB) — ou seja, configurações VÁLIDAS do produto estouravam
 * a cota e o `setItem` lançava. O `catch` engolia a exceção e o usuário perdia o
 * lote INTEIRO (vídeos, seleção, cortes) sem nenhum aviso.
 *
 * REGRA DA FASE 4 (não negociável): o que é LEVE (itens, seleção, cortes,
 * área, escopo) continua no localStorage — ele é pequeno e SEMPRE cabe; o que é
 * PESADO (as mídias) sai do localStorage e vem para cá, onde o navegador dá
 * uma ordem de grandeza a mais de espaço e não existe o teto de 5 MB.
 *
 * O cofre é FAIL-OPEN por construção: `disponivel()` devolve `false` quando o
 * IndexedDB não existe (navegador sem suporte, modo restrito) e, nesse caso, o
 * Editor volta a gravar as mídias no localStorage — exatamente o comportamento
 * anterior, sem piorar nada.
 *
 * Chave por LOTE + SLOT (`<loteId>::<slot>`): cada gravação substitui o
 * conjunto de slots daquele lote, então trocar ou remover o template não deixa
 * resíduo acumulado.
 *
 * Isolado de propósito: este módulo não importa nada e não conhece a config —
 * ele só guarda/recupera strings. A lógica de SEPARAR as mídias da config mora
 * no EditorLote (junto da chave e das funções de gravação), como as demais
 * funções de persistência.
 */

const BANCO = 'autopost-editorlote';
const LOJA = 'midias';
const VERSAO = 1;

/** Monta a chave de um slot. `loteId`/`slot` vazios ⇒ operação ignorada. */
function chaveDoSlot(loteId, slot) {
  if (typeof loteId !== 'string' || !loteId) return null;
  if (typeof slot !== 'string' || !slot) return null;
  return `${loteId}::${slot}`;
}

/** Prefixo de todos os slots de um lote (para apagar o lote inteiro). */
function prefixoDoLote(loteId) {
  return typeof loteId === 'string' && loteId ? `${loteId}::` : null;
}

/** O IndexedDB existe e pode ser usado? (fail-open: `false` = não) */
export function disponivel() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Ambiente sem DOM (SSR/teste em Node) ou acesso negado: sem cofre.
    return false;
  }
}

/** Conexão única e reutilizada. `null` = indisponível (nunca lança). */
let conexaoPendente = null;

function abrirBanco() {
  if (conexaoPendente) return conexaoPendente;
  conexaoPendente = new Promise((resolve) => {
    let requisicao;
    try {
      requisicao = indexedDB.open(BANCO, VERSAO);
    } catch {
      resolve(null);
      return;
    }
    requisicao.onupgradeneeded = () => {
      try {
        if (!requisicao.result.objectStoreNames.contains(LOJA)) {
          requisicao.result.createObjectStore(LOJA);
        }
      } catch {
        /* upgrade inconsistente — resolve como indisponível abaixo */
      }
    };
    requisicao.onsuccess = () => resolve(requisicao.result);
    requisicao.onerror = () => resolve(null);
    requisicao.onblocked = () => resolve(null);
  }).then((banco) => {
    if (!banco) conexaoPendente = null; // permite nova tentativa depois
    return banco;
  });
  return conexaoPendente;
}


/** Roda `operacao` numa transação e resolve com o resultado (ou `null`). */
function emTransacao(operacao, modo = 'readwrite') {
  return abrirBanco().then(
    (banco) =>
      new Promise((resolve) => {
        if (!banco) {
          resolve(null);
          return;
        }
        let transacao;
        try {
          transacao = banco.transaction(LOJA, modo);
        } catch {
          resolve(null);
          return;
        }
        let pedido;
        try {
          pedido = operacao(() => transacao.objectStore(LOJA));
        } catch {
          resolve(null);
          return;
        }
        transacao.oncomplete = () => resolve(pedido);
        transacao.onerror = () => resolve(null);
        transacao.onabort = () => resolve(null);
      })
  );
}

/** Slots válidos declarados no índice gravado junto com o lote. */
export function slotsDoIndice(indice) {
  if (!indice || typeof indice !== 'object') return [];
  return Object.keys(indice).filter((slot) => typeof indice[slot] === 'number' && indice[slot] > 0);
}
/**
 * GRAVA o conjunto de mídias do lote, SUBSTITUINDO o que já existia.
 *
 * `midias` = `{ [slot]: dataUrl }`. Slots ausentes do objeto são apagados —
 * é o que faz "remover/trocar o template" parar de ressuscitar no reload sem
 * deixar bytes órfãos no banco.
 *
 * Devolve `true` quando o cofre assumiu as mídias. NUNCA rejeita: qualquer
 * falha resolve `false` e o Editor cai no caminho antigo (localStorage).
 */
export async function gravar(loteId, midias) {
  if (!disponivel() || !prefixoDoLote(loteId)) return false;
  const dados = midias && typeof midias === 'object' ? midias : {};
  const slots = Object.keys(dados).filter((slot) => typeof dados[slot] === 'string' && dados[slot]);
  const escrito = await emTransacao((loja) => {
    const prefixo = prefixoDoLote(loteId);
    const existentes = loja.getAllKeys();
    for (const chave of existentes.result || []) {
      if (typeof chave !== 'string' || !chave.startsWith(prefixo)) continue;
      const slot = chave.slice(prefixo.length);
      if (!Object.prototype.hasOwnProperty.call(dados, slot)) loja.delete(chave);
    }
    for (const slot of slots) loja.put(dados[slot], chaveDoSlot(loteId, slot));
    return true;
  });
  return escrito === true;
}

/**
 * LÊ as mídias dos slots pedidos: `{ [slot]: dataUrl }` (só os que existirem).
 * Nunca rejeita — devolve `{}` quando o cofre está indisponível.
 */
export async function ler(loteId, slots) {
  if (!disponivel() || !prefixoDoLote(loteId)) return {};
  const pedidos = (Array.isArray(slots) ? slots : []).filter(
    (slot) => typeof slot === 'string' && !!chaveDoSlot(loteId, slot)
  );
  if (pedidos.length === 0) return {};
  const achados = await emTransacao((loja) => {
    const resultados = {};
    for (const slot of pedidos) {
      const pedido = loja.get(chaveDoSlot(loteId, slot));
      pedido.onsuccess = () => {
        if (typeof pedido.result === 'string' && pedido.result) resultados[slot] = pedido.result;
      };
    }
    return resultados;
  }, 'readonly');
  return achados && typeof achados === 'object' ? achados : {};
}

/** Lê exatamente os slots declarados no índice salvo com o lote. */
export async function lerDoIndice(loteId, indice) {
  return ler(loteId, slotsDoIndice(indice));
}

/** Apaga TODAS as mídias de um lote (lote encerrado/limpo). */
export async function apagarLote(loteId) {
  if (!disponivel() || !prefixoDoLote(loteId)) return false;
  const apagado = await emTransacao((loja) => {
    const prefixo = prefixoDoLote(loteId);
    const existentes = loja.getAllKeys();
    for (const chave of existentes.result || []) {
      if (typeof chave === 'string' && chave.startsWith(prefixo)) loja.delete(chave);
    }
    return true;
  });
  return apagado === true;
}
