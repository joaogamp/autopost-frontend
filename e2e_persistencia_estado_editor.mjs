/**
 * E2E â€” PERSISTENCIA DO ESTADO DO EDITOR EM LOTE ENTRE AS ABAS.
 *
 * O QUE ESTE TESTE TRAVA (regressoes reais, encontradas no navegador):
 *   CAUSA 1 â€” `cofreMidias.js` lia `IDBRequest.result` de forma SINCRONA.
 *             Lancava InvalidStateError, o `catch` engolia e `gravar()` devolvia
 *             `false`: o cofre NUNCA gravava. Como o localStorage ja zera a
 *             `url` do template, a arte era descartada antes de ser guardada e
 *             o TEMPLATE voltava ao padrao a cada navegacao.
 *   CAUSA 2 â€” a quantidade (1X/2X/3X/6X) era `useState` LOCAL do
 *             `AreaCentral`, sem persistencia: voltava sozinha para 6X.
 *
 * METODO: Chrome real via CDP (sem dependencia externa). Para CADA cenario o
 * teste tira um RETRATO do estado (DOM + localStorage + IndexedDB), navega
 * pelas abas e compara ANTES x DEPOIS â€” nunca aceita "deu sem erro".
 *
 * Uso:  node e2e_persistencia_estado_editor.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORTA = 5217;
const BASE = `http://127.0.0.1:${PORTA}`;
const PORTA_CDP = 9343;
const BASE_CDP = `http://127.0.0.1:${PORTA_CDP}`;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RAIZ = 'C:\\Users\\Pichau\\Downloads\\autopost-completo\\autopost-frontend';

const VIDEOS = [
  { id: 'vid-A', nome: 'A_barra30.mp4' },
  { id: 'vid-B', nome: 'B_barra20.mp4' },
  { id: 'vid-C', nome: 'C_barra40.mp4' },
];
const CHAVE_LOTE = 'autopost:editorlote:v1';
const CHAVE_SESSAO = 'autopost:editorlote:lote_atual_v1';

// PNG 1x1 valido: e arte suficiente para provar que o TEMPLATE voltou.
const TEMPLATE_A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TEMPLATE_B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP8z8DAwMDAxMDAwMAAAAwAAwMAwP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let falhas = 0;
let total = 0;
const ok = (cond, msg, extra = '') => {
  total += 1;
  if (cond) console.log(`  [OK]    ${msg}${extra ? '  ' + extra : ''}`);
  else { falhas += 1; console.log(`  [FALHA] ${msg}${extra ? '  ' + extra : ''}`); }
};

/* ------------------------------ Chrome via CDP ----------------------------- */
async function abrirChrome(dir) {
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${dir}`,
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1600,1000', 'about:blank'],
    { windowsHide: true });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try { if ((await fetch(`${BASE_CDP}/json/version`)).ok) return proc; } catch { /* subindo */ }
  }
  throw new Error('Chrome nao subiu');
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); }
  static async conectar(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws falhou')); });
    const c = new Cdp(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pend.has(msg.id)) { c.pend.get(msg.id)(msg); c.pend.delete(msg.id); }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pend.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async avaliar(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}


/**
 * Estado do lote semeado no localStorage (o que o Editor restaura na entrada).
 * A config carrega template, enquadramento, escopo, area por video e cortes
 * INDIVIDUAIS diferentes â€” e a QUANTIDADE ja gravada em `visualizacao`.
 */
function estadoSemeado({ loteId, template = TEMPLATE_A, colunas = 6, areaPorVideo = null, cortes = null } = {}) {
  return {
    itens: VIDEOS.map((v) => ({
      id: v.id, bibliotecaId: v.id, nome: v.nome, thumbnail: null,
      urlFonte: `${BASE}/e2e/${v.nome}`, duracao: 3, filaId: null,
      status: 'pronto', percentual: 0,
    })),
    config: {
      loteId, loteCriadoEm: Date.now(),
      templateFundo: { url: template, nome: 'TEMPLATE_TESTE.png', larguraNatural: 1, alturaNatural: 1, visivel: true },
      areaVideo: { x: 0, y: 0, largura: 1080, altura: 1920, fit: 'cobrir', zoom: 2, deslocamentoX: 30, deslocamentoY: 70 },
      editarTodos: false,
      visualizacao: { colunas },
      areaPorVideo: areaPorVideo || {
        'vid-B': { x: 40, y: 300, largura: 900, altura: 1100, fit: 'cobrir', zoom: 1.4, deslocamentoX: 22, deslocamentoY: 61 },
      },
      overridesPorVideo: cortes || {
        'vid-A': { manual: { superior: 12, inferior: 8, em: 1 }, origem: 'manual' },
        'vid-C': { manual: { superior: 5, inferior: 25, em: 1 }, origem: 'manual' },
      },
    },
    idSelecionado: 'vid-B',
    templateId: null,
    assinatura: null,
  };
}

/**
 * RETRATO do estado REAL: o que a TELA mostra (DOM), o que foi GRAVADO
 * (localStorage) e o que esta no COFRE (IndexedDB). E esta comparacao
 * antes/depois que prova a persistencia â€” nao "a pagina nao quebrou".
 */
const RETRATO = `(() => {
  const bruto = localStorage.getItem('autopost:editorlote:v1') || '{}';
  let dados = {}; try { dados = JSON.parse(bruto); } catch { dados = {}; }
  const cfg = dados.config || {};
  const botoes = [...document.querySelectorAll('button[aria-pressed]')]
    .filter(b => /^[1236]X$/.test((b.textContent || '').trim()));
  const ativo = botoes.find(b => b.getAttribute('aria-pressed') === 'true');
  const canvas = document.querySelector('.edl-canvas-branco');
  return new Promise((resolve) => {
    let pronto = false;
    const fim = (cofre) => { if (pronto) return; pronto = true; resolve({
      tela: {
        quantidade: ativo ? (ativo.textContent || '').trim() : null,
        templateVisivel: !!document.querySelector('img[alt*="emplate" i]'),
        videosNaTela: document.querySelectorAll('.edl-canvas-branco').length,
        temEditor: !!canvas,
      },
      salvo: {
        loteId: cfg.loteId || null,
        templateNome: (cfg.templateFundo && cfg.templateFundo.nome) || null,
        templateTemUrl: !!(cfg.templateFundo && typeof cfg.templateFundo.url === 'string'
          && cfg.templateFundo.url.startsWith('data:image/')),
        colunas: (cfg.visualizacao && cfg.visualizacao.colunas) || null,
        zoom: cfg.areaVideo ? cfg.areaVideo.zoom : null,
        desX: cfg.areaVideo ? cfg.areaVideo.deslocamentoX : null,
        desY: cfg.areaVideo ? cfg.areaVideo.deslocamentoY : null,
        editarTodos: cfg.editarTodos,
        areaPorVideo: cfg.areaPorVideo || {},
        cortes: Object.fromEntries(Object.entries(cfg.overridesPorVideo || {})
          .filter(([, v]) => v && v.manual)
          .map(([k, v]) => [k, [v.manual.superior, v.manual.inferior]])),
        idSelecionado: dados.idSelecionado || null,
        videos: (dados.itens || []).map((i) => i.id).sort(),
      },
      indice: dados.indiceMidias || null,
      cofre,
    }); };
    try {
      const req = indexedDB.open('autopost-editorlote', 1);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('midias')) { db.close(); return fim([]); }
        try {
          const all = db.transaction('midias', 'readonly').objectStore('midias').getAllKeys();
          all.onsuccess = () => { const k = all.result.map(String).sort(); db.close(); fim(k); };
          all.onerror = () => { db.close(); fim(['<erro>']); };
        } catch { fim(['<erro sync>']); }
      };
      req.onerror = () => fim(['<erro abrir>']);
    } catch { fim(['<sem idb>']); }
    setTimeout(() => fim(['<timeout>']), 2000);
  });
})()`;

const perfil = mkdtempSync(path.join(tmpdir(), 'autopost-persistencia-'));
let chrome, cdp, vite;

try {
  vite = spawn('npx', ['vite', '--port', String(PORTA), '--strictPort'], { cwd: RAIZ, windowsHide: true, shell: true });
  for (let i = 0; i < 80; i++) { await sleep(500); try { if ((await fetch(BASE)).ok) break; } catch { /* subindo */ } }
  console.log('dev server:', BASE, '| videos:', VIDEOS.map((v) => v.nome).join(', '));

  chrome = await abrirChrome(perfil);
  const res = await fetch(`${BASE_CDP}/json/new?about:blank`, { method: 'PUT' });
  const aba = await res.json();
  cdp = await Cdp.conectar(aba.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const entrarNoEditor = async () => cdp.avaliar(
    `(() => { const b=[...document.querySelectorAll('button')].find(x=>/ENTRAR NO MEU EDITOR/i.test(x.textContent||'')); if(b)b.click(); return 'ok'; })()`);

  /** Zera storage + cofre, semeia o lote, marca a sessao e abre o Editor. */
  const preparar = async (loteId, extras = {}) => {
    // A pagina PRECISA estar na origem do app antes de tocar no localStorage:
    // em `about:blank` o acesso é bloqueado (SecurityError).
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await sleep(2500);
    await cdp.avaliar(`(async () => {
      localStorage.clear(); sessionStorage.clear();
      await new Promise((res) => { const r = indexedDB.deleteDatabase('autopost-editorlote'); r.onsuccess = r.onerror = r.onblocked = () => res(null); });
      return 'limpo';
    })()`);
    await cdp.avaliar(`
      localStorage.setItem(${JSON.stringify(CHAVE_LOTE)}, ${JSON.stringify(JSON.stringify(estadoSemeado({ loteId, ...extras })))});
      sessionStorage.setItem(${JSON.stringify(CHAVE_SESSAO)}, ${JSON.stringify(loteId)}); 'ok'`);
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(3500);
    await entrarNoEditor();
    await sleep(5000);
  };
  const clicarAba = async (rotulo) => {
    await cdp.avaliar(`(() => { const b=[...document.querySelectorAll('button')].find(x=>new RegExp('^${rotulo}$','i').test((x.textContent||'').trim())); if(b){b.click(); return 'ok';} return 'sem botao'; })()`);
    await sleep(2200);
  };
  const clicarQuantidade = async (rotulo) => {
    const r = await cdp.avaliar(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='${rotulo}'); if(!b) return 'sem botao'; b.click(); return 'clicou'; })()`);
    await sleep(1200);
    return r;
  };
  const retrato = () => cdp.avaliar(RETRATO);
  const paraTexto = (r) => JSON.stringify(r);

  /* ===== TESTE 1: template + 1X -> Painel -> voltar ====================== */
  console.log('\n=== TESTE 1: template + 1X -> Painel -> voltar ===');
  await preparar('lote_t1', { colunas: 1 });
  const t1a = await retrato();
  ok(t1a.tela.quantidade === '1X', '1) abre na quantidade 1X', `-> ${t1a.tela.quantidade}`);
  ok(t1a.tela.templateVisivel, '1) o template esta visivel na tela');
  await clicarAba('Painel');
  await clicarAba('Editor');
  const t1b = await retrato();
  ok(t1b.tela.quantidade === '1X', '1) VOLTOU do Painel mantendo 1X', `-> ${t1b.tela.quantidade}`);
  ok(t1b.tela.templateVisivel, '1) VOLTOU do Painel com o template na tela');
  ok(paraTexto(t1a.tela) === paraTexto(t1b.tela), '1) o estado da tela e IDENTICO antes/depois');

  /* ===== TESTE 2: template + 2X -> Agendamento -> voltar ================= */
  console.log('\n=== TESTE 2: template + 2X -> Agendamento -> voltar ===');
  await preparar('lote_t2', { colunas: 2 });
  const t2a = await retrato();
  ok(t2a.tela.quantidade === '2X', '2) abre na quantidade 2X', `-> ${t2a.tela.quantidade}`);
  await clicarAba('Agendamento');
  await clicarAba('Editor');
  const t2b = await retrato();
  ok(t2b.tela.quantidade === '2X', '2) VOLTOU do Agendamento mantendo 2X', `-> ${t2b.tela.quantidade}`);
  ok(t2b.tela.templateVisivel, '2) VOLTOU do Agendamento com o template na tela');
  ok(paraTexto(t2a.tela) === paraTexto(t2b.tela), '2) o estado da tela e IDENTICO antes/depois');

  /* ===== TESTE 3: template + 3X -> Biblioteca -> voltar =================== */
  console.log('\n=== TESTE 3: template + 3X -> Biblioteca -> voltar ===');
  await preparar('lote_t3', { colunas: 3 });
  const t3a = await retrato();
  ok(t3a.tela.quantidade === '3X', '3) abre na quantidade 3X', `-> ${t3a.tela.quantidade}`);
  await clicarAba('Biblioteca');
  await clicarAba('Editor');
  const t3b = await retrato();
  ok(t3b.tela.quantidade === '3X', '3) VOLTOU da Biblioteca mantendo 3X', `-> ${t3b.tela.quantidade}`);
  ok(t3b.tela.templateVisivel, '3) VOLTOU da Biblioteca com o template na tela');
  ok(paraTexto(t3a.tela) === paraTexto(t3b.tela), '3) o estado da tela e IDENTICO antes/depois');

  /* ===== TESTE 4: 6X + zoom/posicao/area/corte -> outra aba -> voltar ====== */
  console.log('\n=== TESTE 4: 6X + zoom/posicao/area/corte -> outra aba -> voltar ===');
  await preparar('lote_t4', { colunas: 6 });
  const t4a = await retrato();
  ok(t4a.salvo.zoom === 2 && t4a.salvo.desX === 30 && t4a.salvo.desY === 70,
    '4) o enquadramento (zoom 2x, posicao 30/70) foi carregado', `-> zoom=${t4a.salvo.zoom} ${t4a.salvo.desX}/${t4a.salvo.desY}`);
  await clicarAba('Contas');
  await clicarAba('Editor');
  const t4b = await retrato();
  ok(t4b.salvo.zoom === 2, '4) zoom 2x sobreviveu', `-> ${t4b.salvo.zoom}`);
  ok(t4b.salvo.desX === 30 && t4b.salvo.desY === 70, '4) posicao X/Y sobreviveu', `-> ${t4b.salvo.desX}/${t4b.salvo.desY}`);
  ok(Object.keys(t4b.salvo.areaPorVideo).join(',') === 'vid-B' && t4b.salvo.areaPorVideo['vid-B'].largura === 900,
    '4) area individual do vid-B sobreviveu', `-> ${JSON.stringify(t4b.salvo.areaPorVideo)}`);
  ok(paraTexto(t4a.salvo.cortes) === paraTexto(t4b.salvo.cortes), '4) cortes sobreviveram', `-> ${JSON.stringify(t4b.salvo.cortes)}`);
  ok(t4b.salvo.editarTodos === false, '4) escopo ("Apenas este video") sobreviveu');
  ok(t4b.tela.quantidade === '6X', '4) quantidade 6X sobreviveu', `-> ${t4b.tela.quantidade}`);
  ok(t4b.tela.templateVisivel, '4) template sobreviveu na tela');
  ok(paraTexto(t4a.salvo) === paraTexto(t4b.salvo), '4) a config salva e IDENTICA antes/depois');

  /* ===== TESTE 5: ajustes DIFERENTES em varios videos ==================== */
  console.log('\n=== TESTE 5: ajustes DIFERENTES em varios videos -> sair e voltar ===');
  await preparar('lote_t5', {
    colunas: 2,
    cortes: {
      'vid-A': { manual: { superior: 11, inferior: 22, em: 1 }, origem: 'manual' },
      'vid-B': { manual: { superior: 33, inferior: 3, em: 1 }, origem: 'manual' },
      'vid-C': { manual: { superior: 4, inferior: 41, em: 1 }, origem: 'manual' },
    },
    areaPorVideo: {
      'vid-A': { x: 10, y: 20, largura: 800, altura: 900, fit: 'cobrir', zoom: 1.1, deslocamentoX: 10, deslocamentoY: 10 },
      'vid-B': { x: 40, y: 300, largura: 900, altura: 1100, fit: 'cobrir', zoom: 1.4, deslocamentoX: 22, deslocamentoY: 61 },
      'vid-C': { x: 90, y: 700, largura: 500, altura: 600, fit: 'cobrir', zoom: 3.2, deslocamentoX: 88, deslocamentoY: 12 },
    },
  });
  const t5a = await retrato();
  ok(Object.keys(t5a.salvo.cortes).length === 3, '5) os 3 videos tem corte individual', `-> ${JSON.stringify(t5a.salvo.cortes)}`);
  await clicarAba('Painel');
  await clicarAba('Editor');
  const t5b = await retrato();
  ok(paraTexto(t5a.salvo.cortes) === paraTexto(t5b.salvo.cortes),
    '5) o corte INDIVIDUAL de cada video sobreviveu (A=11/22, B=33/3, C=4/41)', `-> ${JSON.stringify(t5b.salvo.cortes)}`);
  ok(paraTexto(t5a.salvo.areaPorVideo) === paraTexto(t5b.salvo.areaPorVideo),
    '5) a AREA INDIVIDUAL de cada video sobreviveu', `-> ${JSON.stringify(t5b.salvo.areaPorVideo)}`);
  ok(t5b.salvo.idSelecionado === 'vid-B', '5) o video selecionado sobreviveu', `-> ${t5b.salvo.idSelecionado}`);
  ok(t5b.tela.quantidade === '2X', '5) a quantidade sobreviveu', `-> ${t5b.tela.quantidade}`);

  /* ===== TESTE 6: RECARREGAR a pagina (F5) ============================== */
  console.log('\n=== TESTE 6: RECARREGAR a pagina (F5) mantem o estado ===');
  await clicarQuantidade('3X');
  const t6a = await retrato();
  ok(t6a.tela.quantidade === '3X', '6) o usuario trocou para 3X na tela', `-> ${t6a.tela.quantidade}`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await sleep(4000);
  await entrarNoEditor();
  await sleep(5000);
  const t6b = await retrato();
  ok(t6b.tela.quantidade === '3X', '6) apos o F5 a quantidade continua 3X', `-> ${t6b.tela.quantidade}`);
  ok(t6b.tela.templateVisivel, '6) apos o F5 o template continua na tela');
  ok(paraTexto(t6a.salvo) === paraTexto(t6b.salvo), '6) apos o F5 a config e IDENTICA');

  /* ===== TESTE 7: TODAS as abas ========================================= */
  console.log('\n=== TESTE 7: navegar por TODAS as abas e voltar ===');
  const t7a = await retrato();
  for (const destino of ['Painel', 'Agendamento', 'Biblioteca', 'Contas', 'Painel', 'Biblioteca', 'Agendamento']) {
    await clicarAba(destino);
  }
  await clicarAba('Editor');
  const t7b = await retrato();
  ok(paraTexto(t7a.tela) === paraTexto(t7b.tela),
    '7) apos passar por TODAS as abas a tela esta identica', `-> ${JSON.stringify(t7b.tela)}`);
  ok(paraTexto(t7a.salvo) === paraTexto(t7b.salvo), '7) a config salva esta identica apos todas as abas');
  ok(t7b.tela.quantidade === '3X', '7) a quantidade nao foi resetada por nenhuma aba', `-> ${t7b.tela.quantidade}`);
  ok(t7b.tela.templateVisivel, '7) o template nao foi perdido por nenhuma aba');

  /* ===== COFRE: a midia esta DE FATO no IndexedDB ======================= */
  console.log('\n=== COFRE: a midia do template esta de fato no IndexedDB ===');
  ok(paraTexto(t7b.cofre).includes('template'),
    'COFRE: o slot do template existe no IndexedDB (a gravacao assincrona rodou)', `-> ${JSON.stringify(t7b.cofre)}`);
  ok(!!t7b.indice && t7b.indice.template > 0,
    'COFRE: o indice no localStorage declara os bytes do template', `-> ${JSON.stringify(t7b.indice)}`);
  const midia = await cdp.avaliar(`(async () => {
    const c = await import('/src/lib/cofreMidias.js');
    const m = await c.lerDoIndice('lote_t5', { template: 1 });
    return { temTemplate: typeof m.template === 'string' && m.template.startsWith('data:image/'),
             tamanho: (m.template || '').length };
  })()`);
  ok(midia.temTemplate, 'COFRE: `lerDoIndice` recupera a midia do template', `-> ${midia.tamanho} chars`);
  ok(!t7b.salvo.templateTemUrl,
    'PERSISTENCIA: o localStorage guarda so o indice (a midia pesada fica fora)');

  /* ===== PADRAO so entra quando nao existe valor salvo =================== */
  console.log('\n=== VALOR PADRAO so entra quando nao existe valor salvo ===');
  await preparar('lote_t8', { colunas: 3 });
  await clicarQuantidade('6X');
  const t8a = await retrato();
  ok(t8a.tela.quantidade === '6X', 'PADRAO: o usuario trocou 3X -> 6X', `-> ${t8a.tela.quantidade}`);
  await clicarAba('Painel');
  await clicarAba('Editor');
  const t8b = await retrato();
  ok(t8b.tela.quantidade === '6X', 'PADRAO: o 6X escolhido NAO foi substituido apos navegar', `-> ${t8b.tela.quantidade}`);
  await cdp.avaliar(`(() => { const d = JSON.parse(localStorage.getItem('${CHAVE_LOTE}')); delete d.config.visualizacao; localStorage.setItem('${CHAVE_LOTE}', JSON.stringify(d)); return 'ok'; })()`);
  await clicarAba('Painel');
  await clicarAba('Editor');
  const t8c = await retrato();
  ok(t8c.tela.quantidade === '6X', 'PADRAO: sem valor salvo, abre no 6X (fail-open)', `-> ${t8c.tela.quantidade}`);

} catch (e) {
  console.error('ERRO:', e.message, e.stack);
  falhas += 1;
} finally {
  try { cdp?.ws?.close(); } catch { /* ok */ }
  try { chrome?.kill(); } catch { /* ok */ }
  try { vite?.kill(); } catch { /* ok */ }
  try { rmSync(perfil, { recursive: true, force: true }); } catch { /* ok */ }
}

console.log(`\n${'='.repeat(62)}`);
if (falhas === 0) console.log(`PERSISTENCIA DO ESTADO DO EDITOR: TODOS OS ${total} TESTES PASSARAM`);
else console.log(`PERSISTENCIA DO ESTADO DO EDITOR: ${falhas} FALHA(S) de ${total}`);
process.exitCode = falhas === 0 ? 0 : 1;
