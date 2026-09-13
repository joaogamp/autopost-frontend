import { useCallback, useEffect, useRef, useState } from 'react';
import { LIMITE_VIDEOS_COMPLETOS } from '../lib/configEditorLote';

/**
 * EDITOR EM LOTE — pool de vídeos completos com LIMITE DE 3.
 *
 * A grade de até 100 vídeos NUNCA monta 100 elementos <video>. Este hook mantém
 * ATÉ 3 VÍDEOS COMPLETOS CARREGANDO SIMULTANEAMENTE:
 *   1. o vídeo selecionado (prioridade máxima — nunca é evictado);
 *   2. depois os vídeos "desejados" (hover/preview), na ordem de solicitação.
 *
 * Comportamento:
 * - `solicitar(id)` marca um id como desejado e RECOMPUTA o pool na hora
 *   (o hover dispara o carregamento imediatamente, sem esperar outro render);
 * - qualquer id fora dos 3 ativos é EVICTADO (o <video> sai da árvore e o
 *   navegador aborta o carregamento), liberando memória e banda;
 * - ids que saem do lote são removidos da fila de desejados;
 * - itens sem URL de fonte não consomem slots do pool.
 */

export function usePoolDeVideos(itens, idSelecionado) {
  const [ativos, setAtivos] = useState({}); // { id: url }
  const desejadosRef = useRef(new Set());

  const recomputar = useCallback(() => {
    const lista = itens || [];
    const existentes = new Set(lista.map((v) => v.id));

    // Limpa desejados que não estão mais no lote (deletar durante a
    // iteração de um Set é seguro em JS).
    for (const id of desejadosRef.current) {
      if (!existentes.has(id)) desejadosRef.current.delete(id);
    }

    // 1. Prioridade máxima: o vídeo selecionado no editor.
    // 2. Depois os desejados (hover/preview), na ordem de solicitação.
    const ordem = [];
    if (idSelecionado && existentes.has(idSelecionado)) ordem.push(idSelecionado);
    for (const id of desejadosRef.current) {
      if (!ordem.includes(id)) ordem.push(id);
    }

    // 3. Respeita o LIMITE (3 vídeos completos simultâneos).
    const proximos = {};
    for (const id of ordem.slice(0, LIMITE_VIDEOS_COMPLETOS)) {
      const item = lista.find((v) => v.id === id);
      const fonte = item?.urlFonte || item?.url || null;
      if (fonte) proximos[id] = fonte;
    }

    setAtivos((atuais) => {
      // Eviction: urls que saem do pool deixam de existir — o <video> some
      // e o carregamento é abortado (preload inteligente / cache do pool).
      const idsAtuais = Object.keys(atuais);
      const idsProximos = Object.keys(proximos);
      const mudou =
        idsAtuais.length !== idsProximos.length ||
        idsProximos.some((id) => atuais[id] !== proximos[id]);
      return mudou ? proximos : atuais;
    });
  }, [itens, idSelecionado]);

  useEffect(() => {
    recomputar();
  }, [recomputar]);

  const solicitar = useCallback(
    (id) => {
      if (!id) return;
      if (desejadosRef.current.has(id)) return;
      desejadosRef.current.add(id);
      // Histórico pequeno: mantém só os últimos pedidos (com lote de 100).
      if (desejadosRef.current.size > 30) {
        desejadosRef.current = new Set([...desejadosRef.current].slice(-15));
      }
      recomputar();
    },
    [recomputar]
  );

  return { ativos, solicitar, limite: LIMITE_VIDEOS_COMPLETOS };
}