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


/** Roda `operacao` numa transação e resolve com o resultado (ou `null`).
 *
 * BUG CORRIGIDO (FASE 4): `operacao` era tratada como SÍNCRONA e o IndexedDB
 * lia `IDBRequest.result` dentro dela. Isso é IMPOSSÍVEL: `.result` só existe
 * depois do `onsuccess`, e accessing-lo antes lança
 * `InvalidStateError: The request has not finished`. O `try/catch` engolia a
 * exceção e resolvia `null` — ou seja, `gravar()` devolvia `false` e o
 * `objectStore.put()` NUNCA era alcançado: o cofre ficava permanentemente
 * vazio. Como o `configParaSalvar` já zera a `url` do template para fora do
 * localStorage, a arte era DESCARTADA antes de ser guardada — e o template
 * voltava ao padrão a cada navegação.
 *
 * AGORA as operações encadeiam TUDO por `onsuccess` (o padrão oficial do
 * IndexedDB) e chamam `concluir(valor)` quando terminam. `emTransacao` resolve
 * com esse valor assim que a transação COMMITA.
 *
 * POR QUE CALLBACKS E NÃO `await`: uma transação do IndexedDB fica INATIVA
 * assim que o controle volta para o event loop. Um `await` no meio da operação
 * (entre um `get` e o próximo) deixa a transação inativa e o request seguinte
 * lança `TransactionInactiveError` — a leitura voltaria vazia e a gravação
 * perderia bytes. Encadear por `onsuccess` mantém cada request dentro do mesmo
 * tick da transação, que é a única forma garantida pela especificação.
 *
 * Continua FAIL-OPEN e nunca rejeita: qualquer erro resolve `null`.
 */
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
        // Registrado UMA VEZ, nunca reatribuído: evita a corrida de o
        // `oncomplete` já ter disparado antes de o valor ficar pronto.
        let valor = null;
        let pronto = false;
        transacao.oncomplete = () => resolve(pronto ? valor : null);
        transacao.onerror = () => resolve(null);
        transacao.onabort = () => resolve(null);
        // `concluir` é idempotente: só o primeiro registro vale, e ele só é
        // considerado depois do commit.
        const concluir = (v) => { valor = v; pronto = true; };
        let pedido;
        try {
          pedido = operacao(
            () => transacao.objectStore(LOJA),
            concluir
          );
        } catch {
          try { transacao.abort(); } catch { /* ja encerrada */ }
          resolve(null);
          return;
        }
        // Operação que devolveu valor imediatamente (não usa callbacks).
        if (pedido !== undefined) concluir(pedido);
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
  const escrito = await emTransacao((loja, concluir) => {
    const prefixo = prefixoDoLote(loteId);
    // `getAllKeys` é ASSÍNCRONO: a lista de chaves existentes só chega no
    // `onsuccess`. Ler `.result` antes disso lançava InvalidStateError e
    // abortava toda a gravação (ver `emTransacao`). O passo seguinte roda
    // DENTRO desse `onsuccess`, com a transação ainda ativa.
    loja().getAllKeys().onsuccess = (evento) => {
      const existentes = evento.target.result;
      const lojaAtual = loja();
      for (const chave of Array.isArray(existentes) ? existentes : []) {
        if (typeof chave !== 'string' || !chave.startsWith(prefixo)) continue;
        const slot = chave.slice(prefixo.length);
        if (!Object.prototype.hasOwnProperty.call(dados, slot)) lojaAtual.delete(chave);
      }
      for (const slot of slots) loja().put(dados[slot], chaveDoSlot(loteId, slot));
      concluir(true);
    };
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
  // Cada `get` é ASSÍNCRONO: o valor só existe no `onsuccess`. Ler `.result`
  // síncrono devolvia sempre `undefined` e a mídia nunca voltava. Os pedidos
  // são encadeados por callback (nunca `await`) para não deixar a transação
  // inativa entre um request e o seguinte.
  const achados = await emTransacao((loja, concluir) => {
    const resultados = {};
    let restantes = pedidos.length;
    for (const slot of pedidos) {
      loja().get(chaveDoSlot(loteId, slot)).onsuccess = (evento) => {
        const valor = evento.target.result;
        if (typeof valor === 'string' && valor) resultados[slot] = valor;
        restantes -= 1;
        if (restantes === 0) concluir(resultados);
      };
    }
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
  const apagado = await emTransacao((loja, concluir) => {
    const prefixo = prefixoDoLote(loteId);
    // Mesma correcao de `gravar`: a lista de chaves e assincrona.
    loja().getAllKeys().onsuccess = (evento) => {
      const existentes = evento.target.result;
      for (const chave of Array.isArray(existentes) ? existentes : []) {
        if (typeof chave === 'string' && chave.startsWith(prefixo)) loja().delete(chave);
      }
      concluir(true);
    };
  });
  return apagado === true;
}
