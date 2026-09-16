import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  listarAgendamentos,
  criarAgendamento,
  cancelarAgendamento,
  remarcarAgendamento,
  listarFinais,
  buscarContas,
  buscarRegraPublicacao,
  salvarRegraPublicacao,
  previaAgendamentoLote,
  salvarAgendamentoLote,
  urlArquivo,
} from '../lib/api';
import { statusUi } from '../lib/status';
import { ROTULO_FUSO, formatarData, hojeIso } from '../lib/fuso';
import StatusDot from '../components/StatusDot';
import CalendarioAgendamentos from '../components/CalendarioAgendamentos';
import RegraPublicacao from '../components/RegraPublicacao';
import { InstagramIcon } from '../components/RedeIcon';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Film,
  Info,
  ListChecks,
  Loader2,
  Pencil,
  PlusCircle,
  Save,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

const MAX_LEGENDA = 2200; // limite de caracteres da legenda do Instagram

// Configuração inicial do agendamento em lote (reaproveitada da regra salva
// quando existir — ver useEffect de carregar a regra).
const LOTE_PADRAO = {
  videosPorDia: 3,
  horarios: ['07:00', '12:00', '19:00'],
  dataInicio: hojeIso(),
  redes: ['instagram'],
};

/** Status de agendamento que AINDA usam o vídeo (bloqueiam novo agendamento). */
const STATUS_VIDEO_EM_USO = ['agendado', 'publicando', 'publicado'];

/** Idempotência do salvar em lote (fallback para navegador sem crypto.randomUUID). */
function novaChaveIdempotencia() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* usa o fallback abaixo */
  }
  return `lote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * AGENDAMENTO — tela central do fluxo EDITOR → AGENDAMENTO → BIBLIOTECA.
 * "Instagram" NÃO é uma etapa da navegação: é o destino fixo da publicação.
 *
 * Os valores internos de status vêm do backend e NÃO mudam aqui
 * ('agendado' | 'publicando' | 'publicado' | 'erro'); a tradução para os
 * rótulos da UI (PROGRAMADO/PUBLICANDO/…) vive em src/lib/status.js.
 */
export default function Agendamento({ finalIdInicial = '', aoAbrirContas }) {
  const [finaisProntos, setFinaisProntos] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [contaIg, setContaIg] = useState(null);

  const [finalId, setFinalId] = useState('');
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('');
  const [legenda, setLegenda] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [seletorAberto, setSeletorAberto] = useState(false);
  const [visualizacao, setVisualizacao] = useState('lista'); // 'lista' | 'calendario'
  const [mesAtual, setMesAtual] = useState(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState(null);

  const [cancelando, setCancelando] = useState(null); // agendamento aguardando confirmação
  const [cancelandoAgora, setCancelandoAgora] = useState(false);
  const [editando, setEditando] = useState(null); // agendamento em remarcação
  const [nd, setNd] = useState('');
  const [nh, setNh] = useState('');
  const [erroEd, setErroEd] = useState('');
  const [salvandoEd, setSalvandoEd] = useState(false);

  const [regraAberta, setRegraAberta] = useState(false);

  // ---- AGENDAMENTO EM LOTE ("Agendar todos os vídeos") ---------------------
  const [lote, setLote] = useState(LOTE_PADRAO);
  const [previa, setPrevia] = useState(null); // { resumo, plano } — nada gravado ainda
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [erroLote, setErroLote] = useState('');
  const [sucessoLote, setSucessoLote] = useState('');
  const chaveIdemRef = useRef(null);
  const regraRef = useRef(null); // regra salva (reaproveita horarios/redes)

  const seletorRef = useRef(null);
  async function carregar() {
    const [ags, fins, contas] = await Promise.all([
      listarAgendamentos(),
      listarFinais(),
      buscarContas(),
    ]);
    setAgendamentos(Array.isArray(ags) ? ags : []);
    setFinaisProntos(Array.isArray(fins) ? fins.filter((f) => f.status === 'concluido') : []);
    setContaIg(contas?.instagram || null);
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 5000); // polling existente mantido
    return () => clearInterval(intervalo);
  }, []);

  // REAPROVEITAMENTO DA CONFIGURAÇÃO: horários/redes do lote vêm da regra já
  // salva (mesma estrutura do backend — nada de estrutura paralela) quando ela
  // existir. Só roda uma vez, no primeiro carregamento.
  useEffect(() => {
    buscarRegraPublicacao()
      .then((regra) => {
        if (!regra || !Array.isArray(regra.horarios) || regra.horarios.length === 0) return;
        regraRef.current = regra;
        setLote((atual) => ({
          ...atual,
          horarios: regra.horarios,
          videosPorDia: regra.videosPorDia || regra.horarios.length,
          redes: regra.redes && regra.redes.length > 0 ? regra.redes : atual.redes,
        }));
      })
      .catch(() => { /* mantém o padrão da tela */ });
  }, []);

  // Biblioteca → "Agendar" chega aqui com o vídeo final pré-selecionado.
  useEffect(() => {
    if (finalIdInicial) setFinalId(finalIdInicial);
  }, [finalIdInicial]);

  // Fecha o seletor de vídeo ao clicar fora.
  useEffect(() => {
    if (!seletorAberto) return;
    const fechar = (e) => {
      if (seletorRef.current && !seletorRef.current.contains(e.target)) setSeletorAberto(false);
    };
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [seletorAberto]);

  /**
   * Vídeos PRONTOS que ainda NÃO estão programados/publicando/publicados.
   * A mesma regra do backend (que é quem decide de verdade) — aqui só para a
   * interface não oferecer um vídeo que seria rejeitado no salvar.
   */
  const idsEmUso = useMemo(() => {
    const emUso = new Set();
    for (const ag of agendamentos) {
      if (STATUS_VIDEO_EM_USO.includes(ag.status)) emUso.add(ag.finalId || ag.bibliotecaId);
    }
    return emUso;
  }, [agendamentos]);

  /** PRONTOS ainda disponíveis para agendar (o seletor e o contador usam esta). */
  const finaisDisponiveis = useMemo(
    () => finaisProntos.filter((f) => !idsEmUso.has(f.id)),
    [finaisProntos, idsEmUso]
  );

  const videoSelecionado = useMemo(
    () => finaisDisponiveis.find((f) => f.id === finalId) || null,
    [finaisDisponiveis, finalId]
  );

  const agsOrdenados = useMemo(
    () =>
      [...agendamentos].sort((a, b) =>
        `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`)
      ),
    [agendamentos]
  );

  /**
   * PRÉVIA agrupada por dia, com TODOS os horários configurados na ordem —
   * os que não receberam vídeo aparecem como "vazio" (fiel ao que será salvo).
   */
  const previaPorDia = useMemo(() => {
    if (!previa?.plano) return [];
    const porData = new Map();
    for (const item of previa.plano) {
      if (!porData.has(item.data)) porData.set(item.data, new Map());
      porData.get(item.data).set(item.horario, item);
    }
    const horarios = lote.horarios.length > 0 ? lote.horarios : previa.resumo?.horarios || [];
    return [...porData.entries()].map(([data, mapa]) => ({
      data,
      linhas: horarios.map((horario) => ({ horario, item: mapa.get(horario) || null })),
    }));
  }, [previa, lote.horarios]);

  const igConectado = Boolean(contaIg?.igUserId);

  // ---------------------------------------------------------------------------
  // AGENDAMENTO EM LOTE ("Agendar todos os vídeos")
  // ---------------------------------------------------------------------------

  /** "Quantidade de vídeos por dia" — sincroniza a lista de horários. */
  function definirVideosPorDia(valor) {
    const quantidade = Math.max(1, Math.min(12, Number(valor) || 1));
    setLote((atual) => {
      const horarios = [...atual.horarios];
      while (horarios.length < quantidade) horarios.push('12:00');
      horarios.length = quantidade;
      setPrevia(null);
      return { ...atual, videosPorDia: quantidade, horarios };
    });
  }

  function mudarHorarioLote(indice, valor) {
    setLote((atual) => {
      const horarios = [...atual.horarios];
      horarios[indice] = valor;
      setPrevia(null); // a prévia deixa de valer quando a config muda
      return { ...atual, horarios };
    });
  }

  function removerHorarioLote(indice) {
    setLote((atual) => {
      const horarios = atual.horarios.filter((_, i) => i !== indice);
      if (horarios.length === 0) return atual;
      setPrevia(null);
      return { ...atual, horarios, videosPorDia: horarios.length };
    });
  }

  function adicionarHorarioLote() {
    setLote((atual) => {
      if (atual.horarios.length >= 12) return atual;
      const horarios = [...atual.horarios, '12:00'];
      setPrevia(null);
      return { ...atual, horarios, videosPorDia: horarios.length };
    });
  }

  /**
   * "AGENDAR TODOS OS VÍDEOS" — monta a PRÉVIA no backend (dryRun).
   * NADA é gravado aqui: o usuário confere a tela e só então salva.
   */
  async function abrirPrevia() {
    if (carregandoPrevia || salvandoLote) return; // trava duplo clique
    setErroLote('');
    setSucessoLote('');
    setPrevia(null);
    chaveIdemRef.current = novaChaveIdempotencia(); // 1 chave por prévia
    setCarregandoPrevia(true);
    try {
      const resposta = await previaAgendamentoLote({
        horarios: lote.horarios,
        videosPorDia: lote.videosPorDia,
        dataInicio: lote.dataInicio,
        redes: lote.redes,
      });
      setPrevia(resposta);
    } catch (e) {
      setErroLote(e?.message || 'Não foi possível montar a prévia.');
    } finally {
      setCarregandoPrevia(false);
    }
  }

  function fecharPrevia() {
    if (salvandoLote) return;
    setPrevia(null);
  }

  /**
   * "SALVAR AGENDAMENTO" — grava EXATAMENTE os itens da prévia (mesma ordem,
   * mesma data, mesmo horário). O backend revalida tudo de forma atômica e
   * `idempotencyKey` impede duplicação em duplo clique/retry.
   */
  async function salvarLote() {
    if (!previa || salvandoLote) return;
    const itens = (previa.plano || []).map((i) => ({
      finalId: i.finalId,
      data: i.data,
      horario: i.horario,
    }));
    if (itens.length === 0) return;

    setSalvandoLote(true);
    setErroLote('');
    try {
      const resultado = await salvarAgendamentoLote({
        itens,
        redes: previa.resumo?.redes || lote.redes,
        idempotencyKey: chaveIdemRef.current,
      });

      // Guarda a configuração usada (mesma estrutura da regra já existente),
      // preservando ativa/diasSemana para não mexer na publicação automática.
      try {
        const regraAtual = regraRef.current || (await buscarRegraPublicacao()) || {};
        const salva = await salvarRegraPublicacao({
          ...regraAtual,
          horarios: lote.horarios,
          videosPorDia: lote.videosPorDia,
          redes: previa.resumo?.redes || lote.redes,
        });
        regraRef.current = salva;
      } catch {
        /* a configuração é um extra: não invalida o agendamento já gravado */
      }

      const total = itens.length;
      setPrevia(null);
      setSucessoLote(
        resultado.jaExistia
          ? `Este lote já havia sido salvo — nada foi duplicado (${total} publicação(ões)).`
          : `${total} publicação(ões) programadas nos horários ${(previa.resumo?.horarios || []).join(', ')} (${ROTULO_FUSO}).`
      );
      await carregar();
    } catch (e) {
      setErroLote(e?.message || 'Não foi possível salvar o agendamento.');
    } finally {
      setSalvandoLote(false);
    }
  }
  async function agendar() {
    if (enviando) return; // trava duplo clique / submit concorrente
    setErro('');
    setSucesso('');
    if (!finalId) return setErro('Escolha um vídeo final para agendar.');
    if (!data || !horario) return setErro('Escolha data e horário.');

    setEnviando(true);
    try {
      const resultado = await criarAgendamento({
        finalId,
        redes: ['instagram'], // destino único na Fase 1 (YouTube não existe no backend)
        data,
        horario,
        legenda: legenda.trim() || undefined, // persistência real chega na Fase 2
      });
      if (resultado?.erro) {
        setErro(resultado.erro);
        return;
      }
      setFinalId('');
      setData('');
      setHorario('');
      setLegenda('');
      setSucesso('Publicação programada! Acompanhe o status em "Próximas publicações".');
      await carregar();
    } catch (e) {
      setErro(e?.message || 'Falha ao criar o agendamento. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarCancelar() {
    if (!cancelando || cancelandoAgora) return;
    setCancelandoAgora(true);
    try {
      await cancelarAgendamento(cancelando.id);
      setSucesso(
        `Agendamento de "${cancelando.nomeVideo || 'vídeo'}" cancelado. O vídeo volta a ficar PRONTO na Biblioteca.`
      );
      setCancelando(null);
      await carregar();
    } catch (e) {
      setErro(e?.message || 'Não foi possível cancelar o agendamento.');
      setCancelando(null);
    } finally {
      setCancelandoAgora(false);
    }
  }

  function abrirEdicao(ag) {
    setEditando(ag);
    setNd(ag.data || '');
    setNh(ag.horario || '');
    setErroEd('');
  }

  async function confirmarEdicao() {
    if (!editando || salvandoEd) return;
    setErroEd('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) return setErroEd('Escolha uma data válida.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nh)) return setErroEd('Escolha um horário válido (HH:MM).');
    setSalvandoEd(true);
    try {
      // Fase 1: cria novo + cancela antigo (mecânica centralizada em
      // api.remarcarAgendamento). Fase 2: vira PATCH sem mudar esta UI.
      await remarcarAgendamento(editando, { data: nd, horario: nh });
      setEditando(null);
      setSucesso('Publicação remarcada.');
      await carregar();
    } catch (e) {
      setErroEd(e?.message || 'Não foi possível remarcar.');
    } finally {
      setSalvandoEd(false);
    }
  }

  const podeEditar = (ag) => ag.status === 'agendado' || ag.status === 'erro';
  const podeCancelar = (ag) => ag.status === 'agendado';
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-text">Agendamento</h2>
        <p className="text-xs text-text-muted mt-1 font-medium">
          Programe a publicação do vídeo final no Instagram — o destino da publicação
        </p>
      </div>

{/* ------------------------------------------------------------------ */}
      {/* AGENDAMENTO EM LOTE — "AGENDAR TODOS OS VÍDEOS"                      */}
      {/* Configura quantidade por dia + horários, monta a PRÉVIA e só grava   */}
      {/* depois da conferência. A ordem dos vídeos PRONTOS e dos horários é   */}
      {/* preservada pelo backend (fonte da verdade da distribuição).          */}
      {/* ------------------------------------------------------------------ */}
      <section className="glass-panel rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rosa-dim border border-rosa-borda text-rosa flex items-center justify-center">
              <ListChecks className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-text">Agendar todos os vídeos</h3>
              <p className="text-[11px] text-text-muted font-medium">
                Distribui os vídeos PRONTOS nos horários fixos — {ROTULO_FUSO}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-text-dim bg-surface-hover border border-line rounded-full px-3 py-1.5">
              {finaisDisponiveis.length} PRONTO(S) disponível(is)
            </span>
            <span className="text-[11px] font-bold text-text-dim bg-surface-hover border border-line rounded-full px-3 py-1.5">
              {idsEmUso.size} já programado(s)/publicado(s)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 pt-5 mt-5 border-t border-line">
          {/* Quantidade por dia */}
          <div>
            <label className="text-xs font-bold text-text-dim block mb-1.5">Vídeos por dia</label>
            <input
              type="number"
              min={1}
              max={12}
              value={lote.videosPorDia}
              onChange={(e) => definirVideosPorDia(e.target.value)}
              className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
            />
            <p className="text-[10px] text-text-muted mt-1 font-medium">
              Um vídeo por horário configurado.
            </p>
          </div>

          {/* Horários (ordem preservada) */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-text-dim">Horários (na ordem em que serão usados)</label>
              <span className="text-[10px] text-text-muted font-medium">{ROTULO_FUSO}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {lote.horarios.map((horario, i) => (
                <div key={`${i}-${horario}`} className="flex items-center gap-1">
                  <input
                    type="time"
                    value={horario}
                    onChange={(e) => mudarHorarioLote(i, e.target.value)}
                    className="bg-surface border border-line rounded-xl px-2.5 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
                  />
                  {lote.horarios.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removerHorarioLote(i)}
                      title="Remover horário"
                      className="p-1 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={adicionarHorarioLote}
                disabled={lote.horarios.length >= 12}
                className="text-xs font-bold text-rosa hover:text-rosa-hover hover:underline disabled:opacity-40"
              >
                + horário
              </button>
            </div>
          </div>

          {/* Data de início */}
          <div>
            <label className="text-xs font-bold text-text-dim block mb-1.5">Começar em</label>
            <input
              type="date"
              value={lote.dataInicio}
              min={hojeIso()}
              onChange={(e) => {
                setPrevia(null);
                setLote((atual) => ({ ...atual, dataInicio: e.target.value }));
              }}
              className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
            />
            <p className="text-[10px] text-text-muted mt-1 font-medium">
              Dias consecutivos a partir desta data.
            </p>
          </div>
        </div>

        {/* Feedback do lote */}
        {erroLote && (
          <p className="mt-4 flex items-start gap-1.5 text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {erroLote}
          </p>
        )}
        {sucessoLote && (
          <p className="mt-4 flex items-start gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {sucessoLote}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-text-muted font-medium flex items-start gap-1.5 max-w-2xl">
            <Info className="w-3.5 h-3.5 text-rosa shrink-0 mt-0.5" />
            <span>
              Nada é agendado sem conferência: primeiro montamos a <b>prévia</b> completa
              (data, horário e vídeo) e você confirma com <b>Salvar agendamento</b>.
            </span>
          </p>
          <button
            type="button"
            onClick={abrirPrevia}
            disabled={carregandoPrevia || salvandoLote || finaisProntos.length === 0}
            className="inline-flex items-center justify-center gap-2 bg-rosa hover:bg-rosa-hover text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rosa/20 transition-all disabled:opacity-50"
          >
            {carregandoPrevia ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
            {carregandoPrevia ? 'Montando prévia…' : 'AGENDAR TODOS OS VÍDEOS'}
          </button>
        </div>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
        {/* Formulário — foco único: agendar */}
        <div className="glass-panel rounded-2xl p-6 border border-line shadow-sm space-y-5 bg-surface">
          <div className="flex items-center gap-2 border-b border-line pb-4">
            <PlusCircle className="w-4 h-4 text-rosa" />
            <h3 className="font-display text-base font-bold text-text">Novo agendamento</h3>
          </div>

          {/* Vídeo final — seletor com miniatura, nome e selo FINAL/concluído */}
          <div ref={seletorRef} className="relative">
            <label className="text-xs font-bold text-text-dim block mb-1.5">
              Vídeo final (processado no Editor)
            </label>
            <button
              type="button"
              onClick={() => finaisDisponiveis.length > 0 && setSeletorAberto((v) => !v)}
              disabled={finaisDisponiveis.length === 0}
              className="w-full flex items-center gap-3 bg-surface border border-line rounded-xl px-3 py-2.5 text-left outline-none focus:border-rosa transition-colors hover:border-line-light disabled:opacity-60"
            >
              {videoSelecionado ? (
                <>
                  <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                    {videoSelecionado.thumbnailFinal ? (
                      <img src={urlArquivo(videoSelecionado.thumbnailFinal)} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-3.5 h-3.5 text-text-muted" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-text truncate">
                      {videoSelecionado.nomeFinal || 'Vídeo final'}
                    </span>
                    <span className="block text-[10px] text-text-muted font-medium truncate">
                      {videoSelecionado.templateNome
                        ? `Template: ${videoSelecionado.templateNome}`
                        : 'Final processado'}
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex-1 text-xs text-text-muted">Escolher vídeo final…</span>
              )}
              <ChevronDown className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${seletorAberto ? 'rotate-180' : ''}`} />
            </button>

            {seletorAberto && (
              <div className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto glass-panel rounded-2xl border border-line bg-surface shadow-lg divide-y divide-line">
                {finaisDisponiveis.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFinalId(f.id);
                      setSeletorAberto(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover text-left transition-colors"
                  >
                    <span className="w-10 h-14 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                      {f.thumbnailFinal ? (
                        <img src={urlArquivo(f.thumbnailFinal)} className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-4 h-4 text-text-muted" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-text truncate">
                        {f.nomeFinal || 'Vídeo final'}
                      </span>
                      <span className="block text-[10px] text-text-muted font-medium truncate">
                        {f.templateNome ? `Template: ${f.templateNome}` : 'Final processado'}
                      </span>
                    </span>
                    <span className="shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[9px] font-bold uppercase">
                      Final
                    </span>
                  </button>
                ))}
              </div>
            )}

            {finaisProntos.length === 0 && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl mt-2 font-medium flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
                <span>Nenhum vídeo final concluído. Processe vídeos no Editor primeiro.</span>
              </p>
            )}
            {finaisProntos.length > 0 && finaisDisponiveis.length === 0 && (
              <p className="text-[11px] text-text-muted bg-surface-hover border border-line p-2.5 rounded-xl mt-2 font-medium flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 text-rosa mt-0.5" />
                <span>
                  Todos os vídeos prontos já estão programados ou publicados. Novos vídeos
                  aparecem aqui ao terminar o processamento no Editor.
                </span>
              </p>
            )}
          </div>
          {/* Data + Horário (Brasília) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-text-dim block mb-1.5">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-text-dim">Horário</label>
                <span className="text-[10px] text-text-muted font-medium">{ROTULO_FUSO}</span>
              </div>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs font-mono font-semibold text-text outline-none focus:border-rosa transition-colors"
              />
            </div>
          </div>

          {/* Legenda */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-text-dim">Legenda</label>
              <span className="text-[10px] font-mono text-text-muted">
                {legenda.length}/{MAX_LEGENDA}
              </span>
            </div>
            <textarea
              rows={3}
              maxLength={MAX_LEGENDA}
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              placeholder="Texto que acompanha o post no Instagram…"
              className="w-full resize-none bg-surface border border-line rounded-xl px-3 py-2 text-xs text-text outline-none focus:border-rosa transition-colors"
            />
            <p className="text-[10px] text-text-muted mt-1">
              A legenda passará a ser salva e enviada com a publicação na Fase 2 (backend).
            </p>
          </div>

          {/* Destino — somente Instagram */}
          <div>
            <label className="text-xs font-bold text-text-dim block mb-1.5">Destino</label>
            <div
              className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${
                igConectado ? 'border-rosa-borda bg-rosa-dim/50' : 'border-amber-500/30 bg-amber-500/10'
              }`}
            >
              <InstagramIcon className="w-4 h-4" />
              <span className="text-xs font-bold text-text">Instagram</span>
              {igConectado ? (
                <span className="text-[11px] text-text-muted font-medium ml-auto">
                  @{contaIg.username || 'conectado'}
                </span>
              ) : (
                <span className="text-[11px] text-amber-300 font-semibold ml-auto flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Não conectado
                  {aoAbrirContas && (
                    <button
                      type="button"
                      onClick={aoAbrirContas}
                      className="underline underline-offset-2 hover:text-amber-200"
                    >
                      Conectar
                    </button>
                  )}
                </span>
              )}
            </div>
            {!igConectado && (
              <p className="text-[11px] text-amber-300/90 mt-2 leading-relaxed">
                Você pode programar agora, mas a publicação só sai depois de conectar o
                Instagram em <b>Contas</b>.
              </p>
            )}
          </div>

          {/* Feedback */}
          {erro && (
            <p className="text-xs font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl">
              {erro}
            </p>
          )}
          {sucesso && (
            <p className="text-xs font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl">
              {sucesso}
            </p>
          )}

          <button
            onClick={agendar}
            disabled={enviando || finaisDisponiveis.length === 0}
            className="w-full inline-flex items-center justify-center gap-2 bg-rosa hover:bg-rosa-hover text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-rosa/20 transition-all disabled:opacity-50"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            {enviando ? 'Agendando...' : 'Agendar publicação'}
          </button>

          <div className="text-[11px] text-text-muted pt-3 border-t border-line leading-relaxed font-medium flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-rosa shrink-0 mt-0.5" />
            <span>
              A publicação é feita automaticamente pelo servidor no horário marcado
              {' '}({ROTULO_FUSO}) — o navegador não precisa estar aberto.
            </span>
          </div>
        </div>

        {/* Próximas publicações */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-text">Próximas publicações</h3>
            <div className="flex gap-1 bg-surface-hover border border-line rounded-xl p-1">
              <button
                onClick={() => setVisualizacao('lista')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  visualizacao === 'lista'
                    ? 'bg-surface text-text shadow-xs border border-line'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setVisualizacao('calendario')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                  visualizacao === 'calendario'
                    ? 'bg-surface text-text shadow-xs border border-line'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Calendário
              </button>
            </div>
          </div>

          {visualizacao === 'lista' && (
            <div className="glass-panel rounded-2xl border border-line overflow-hidden bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase font-mono font-bold text-text-muted bg-surface-hover/60">
                      <th className="text-left px-4 py-2.5">Vídeo</th>
                      <th className="text-left px-3 py-2.5">Data</th>
                      <th className="text-left px-3 py-2.5">Hora</th>
                      <th className="text-left px-3 py-2.5">Destino</th>
                      <th className="text-left px-3 py-2.5">Status</th>
                      <th className="text-right px-4 py-2.5">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {agsOrdenados.map((ag) => (
                      <Fragment key={ag.id}>
                        <tr className="hover:bg-surface-hover/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                                {ag.thumbnailUrl ? (
                                  <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />
                                ) : (
                                  <Film className="w-3.5 h-3.5 text-text-muted" />
                                )}
                              </span>
                              <span className="font-bold text-text truncate max-w-[200px]" title={ag.nomeVideo}>
                                {ag.nomeVideo || 'Vídeo'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-text-dim whitespace-nowrap">
                            {formatarData(ag.data)}
                          </td>
                          <td className="px-3 py-2.5 font-mono font-bold text-rosa whitespace-nowrap">
                            {ag.horario}
                          </td>
                          <td className="px-3 py-2.5">
                            {(ag.redes || []).includes('instagram') ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-hover border border-line text-[11px] font-bold text-text-dim">
                                <InstagramIcon className="w-3 h-3" />
                                Instagram
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusDot status={statusUi(ag)} comRotulo />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              {podeEditar(ag) && (
                                <button
                                  onClick={() => abrirEdicao(ag)}
                                  title="Remarcar data/horário"
                                  className="p-1.5 rounded-lg text-text-muted hover:text-rosa hover:bg-rosa-dim transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {podeCancelar(ag) && (
                                <button
                                  onClick={() => setCancelando(ag)}
                                  title="Cancelar publicação"
                                  className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!podeEditar(ag) && !podeCancelar(ag) && (
                                <span className="text-text-muted pr-1">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {ag.erroMensagem && (
                          <tr>
                            <td colSpan={6} className="px-4 pb-3">
                              <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                {ag.erroMensagem}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {agsOrdenados.length === 0 && (
                <p className="py-12 text-center text-xs text-text-muted font-medium">
                  Nenhum agendamento ainda. Escolha um vídeo final e programe a publicação.
                </p>
              )}
            </div>
          )}

          {visualizacao === 'calendario' && (
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
              <CalendarioAgendamentos
                mesAtual={mesAtual}
                agendamentos={agendamentos}
                diaSelecionado={diaSelecionado}
                onMudarMes={(delta) => setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1))}
                onSelecionarDia={setDiaSelecionado}
              />

              <div className="space-y-3">
                <p className="text-xs font-bold text-text-muted">
                  {diaSelecionado
                    ? `Publicações em ${formatarData(diaSelecionado)}`
                    : 'Clique num dia do calendário para ver as publicações.'}
                </p>
                {diaSelecionado && (
                  <ItensDoDia
                    itens={agsOrdenados.filter((a) => a.data === diaSelecionado)}
                    onEditar={abrirEdicao}
                    onCancelar={setCancelando}
                    podeEditar={podeEditar}
                    podeCancelar={podeCancelar}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Publicação automática — seção secundária/colapsada (funcionalidade do
          backend mantida intacta; só deixa de competir com o agendamento manual) */}
      <section>
        <button
          type="button"
          onClick={() => setRegraAberta((v) => !v)}
          className="w-full flex items-center justify-between glass-panel rounded-2xl border border-line px-5 py-3 bg-surface hover:border-line-light transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-bold text-text-dim">
            <Zap className="w-3.5 h-3.5 text-rosa" />
            Publicação automática
            <span className="hidden sm:inline text-[10px] font-medium text-text-muted">
              — avançado: todo vídeo pronto entra sozinho no próximo horário livre
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${regraAberta ? 'rotate-180' : ''}`} />
        </button>
        {regraAberta && (
          <div className="mt-3">
            <RegraPublicacao />
          </div>
        )}
      </section>

      {/* Modal — PRÉVIA DO AGENDAMENTO (nada foi gravado ainda) */}
      {previa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={fecharPrevia}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-line bg-surface overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-rosa-dim border border-rosa-borda text-rosa flex items-center justify-center">
                  <ListChecks className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-text">Prévia do agendamento</h3>
                  <p className="text-[11px] text-text-muted font-medium">
                    Confira abaixo — só depois clique em <b>Salvar agendamento</b> ({ROTULO_FUSO})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={fecharPrevia}
                disabled={salvandoLote}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4 border-b border-line bg-surface-hover/40">
              <div>
                <p className="text-[10px] uppercase font-mono font-bold text-text-muted">Vídeos</p>
                <p className="text-sm font-bold text-text">{previa.resumo?.aAgendar ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-mono font-bold text-text-muted">Por dia</p>
                <p className="text-sm font-bold text-text">{previa.resumo?.videosPorDia ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-mono font-bold text-text-muted">Dias</p>
                <p className="text-sm font-bold text-text">{previa.resumo?.dias ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-mono font-bold text-text-muted">PRONTOS hoje</p>
                <p className="text-sm font-bold text-text">{previa.resumo?.prontos ?? 0}</p>
              </div>
              <div className="col-span-2 sm:col-span-4 flex items-center gap-1.5 flex-wrap">
                <Clock className="w-3 h-3 text-rosa" />
                <span className="text-[11px] font-mono font-bold text-text-dim">
                  {(previa.resumo?.horarios || []).join(', ')}
                </span>
                {(previa.resumo?.ignorados || 0) > 0 && (
                  <span className="text-[10px] text-text-muted font-medium">
                    • {previa.resumo.ignorados} vídeo(s) fora da seleção
                  </span>
                )}
              </div>
            </div>
            {/* Lista por dia (horários fixos, na ordem; vazios marcados) */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {previaPorDia.length === 0 && (
                <p className="text-xs text-text-muted font-medium py-6 text-center">
                  Nenhum vídeo PRONTO elegível para agendar agora.
                </p>
              )}
              {previaPorDia.map((dia) => (
                <div key={dia.data}>
                  <p className="text-xs font-bold text-text mb-1.5">{formatarData(dia.data)}</p>
                  <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                    {dia.linhas.map(({ horario, item }) => (
                      <div key={`${dia.data}-${horario}`} className="flex items-center gap-3 px-3 py-2">
                        <span className="text-[11px] font-mono font-bold text-rosa w-12 shrink-0">{horario}</span>
                        {item ? (
                          <>
                            <span className="w-8 h-10 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
                              {item.thumbnailUrl ? (
                                <img src={urlArquivo(item.thumbnailUrl)} className="w-full h-full object-cover" />
                              ) : (
                                <Film className="w-3 h-3 text-text-muted" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[11px] font-bold text-text truncate">
                                {item.nomeVideo || 'Vídeo'}
                              </span>
                              {item.templateNome && (
                                <span className="block text-[10px] text-text-muted font-medium truncate">
                                  Template: {item.templateNome}
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] font-mono text-text-muted shrink-0">
                              #{item.ordem}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-text-muted font-medium italic">
                            vazio — nenhum vídeo neste horário
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Ações */}
            <div className="p-5 border-t border-line space-y-3">
              {erroLote && (
                <p className="flex items-start gap-1.5 text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {erroLote}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] text-text-muted font-medium">
                  Os agendamentos só são criados ao salvar. A prévia e o salvamento usam a mesma lista.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fecharPrevia}
                    disabled={salvandoLote}
                    className="text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors disabled:opacity-50"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={salvarLote}
                    disabled={salvandoLote || (previa.plano || []).length === 0}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rosa hover:bg-rosa-hover px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {salvandoLote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {salvandoLote ? 'Salvando…' : 'SALVAR AGENDAMENTO'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal — cancelar com confirmação */}
      {/* Modal — cancelar com confirmação */}
      {cancelando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => !cancelandoAgora && setCancelando(null)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-bold text-text">Cancelar publicação?</h3>
            <p className="text-xs text-text-muted mt-1 truncate">
              "{cancelando.nomeVideo || 'Vídeo'}" • {formatarData(cancelando.data)} às{' '}
              {cancelando.horario} ({ROTULO_FUSO})
            </p>
            <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
              O vídeo volta a ficar <b className="text-text">PRONTO</b> na Biblioteca e não será
              publicado. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setCancelando(null)}
                className="text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarCancelar}
                disabled={cancelandoAgora}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-400 px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {cancelandoAgora && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Cancelar publicação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — remarcar (Fase 1: criar+cancelar; Fase 2 vira PATCH) */}
      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => !salvandoEd && setEditando(null)}
        >
          <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-sm font-bold text-text">Remarcar publicação</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5 truncate">
              {editando.nomeVideo || 'Vídeo'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <label className="block">
                <span className="text-[11px] font-bold text-text-dim">Data</span>
                <input
                  type="date"
                  value={nd}
                  onChange={(e) => setNd(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold text-text bg-surface-hover border border-line rounded-xl px-2.5 py-2 outline-none focus:border-rosa"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-text-dim">Horário</span>
                <input
                  type="time"
                  value={nh}
                  onChange={(e) => setNh(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold text-text bg-surface-hover border border-line rounded-xl px-2.5 py-2 outline-none focus:border-rosa"
                />
              </label>
            </div>
            {erroEd && (
              <div className="mt-3 flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-semibold px-3 py-2 rounded-xl">
                <span>{erroEd}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="text-xs font-bold text-text-dim hover:text-text px-3 py-2 rounded-xl hover:bg-surface-hover border border-line transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarEdicao}
                disabled={salvandoEd}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-rosa hover:bg-rosa-hover px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {salvandoEd && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Linhas compactas de um dia selecionado no calendário. */
function ItensDoDia({ itens, onEditar, onCancelar, podeEditar, podeCancelar }) {
  if (itens.length === 0) {
    return <p className="text-xs text-text-muted font-medium">Nenhuma publicação nesse dia.</p>;
  }
  return (
    <div className="glass-panel rounded-2xl border border-line divide-y divide-line overflow-hidden bg-surface">
      {itens.map((ag) => (
        <div key={ag.id} className="flex items-center gap-3 p-3">
          <span className="w-9 h-12 rounded-lg overflow-hidden shrink-0 border border-line bg-slate-900 flex items-center justify-center">
            {ag.thumbnailUrl ? (
              <img src={urlArquivo(ag.thumbnailUrl)} className="w-full h-full object-cover" />
            ) : (
              <Film className="w-3.5 h-3.5 text-text-muted" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-text truncate">{ag.nomeVideo || 'Vídeo'}</p>
            <p className="text-[11px] font-mono text-text-muted">{ag.horario}</p>
            {ag.erroMensagem && (
              <p className="text-[10px] text-rose-300/90 truncate" title={ag.erroMensagem}>
                {ag.erroMensagem}
              </p>
            )}
          </div>
          <StatusDot status={statusUi(ag)} comRotulo />
          <div className="flex items-center gap-1">
            {podeEditar(ag) && (
              <button
                onClick={() => onEditar(ag)}
                title="Remarcar"
                className="p-1.5 rounded-lg text-text-muted hover:text-rosa hover:bg-rosa-dim transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {podeCancelar(ag) && (
              <button
                onClick={() => onCancelar(ag)}
                title="Cancelar publicação"
                className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}