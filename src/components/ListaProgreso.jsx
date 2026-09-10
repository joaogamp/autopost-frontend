import { useEffect, useRef, useState } from 'react';
import { buscarFila, buscarBiblioteca, listarFinais } from '../lib/api';

/**
 * Progresso REAL por vídeo (sem barra de progresso). Lê GET /api/fila cada 1s
 * e mostra uma linha por vídeo no formato pedido:
 *   ✓ 100%  Concluido
 *   ◉ 73%   Processando...   (bolinha girando)
 *   ⏳ 0%    Aguardando
 *   ✗ Erro
 * O nome exibido é o nomeORIGINAL do vídeo (via GET /api/biblioteca), não o
 * tituloIA, que se usa só para legendas/descripções.
 */
export default function ListaProgreso({ ids, onTerminado }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const avisado = useRef(false);

  useEffect(() => {
    let activo = true;
    const clave = Array.isArray(ids) ? ids.join(',') : '';

    async function tick() {
      try {
        const [fila, bib, fins] = await Promise.all([buscarFila(), buscarBiblioteca(), listarFinais()]);
        if (!activo) return;
        const mapaNomes = {};
        (bib || []).forEach((v) => { mapaNomes[v.id] = v.nomeOriginal; });
        const mapaFinais = {};
        (fins || []).forEach((f) => {
          if (f.status === 'concluido' || f.status === 'processando') {
            mapaFinais[f.id] = f.templateNome;
          }
        });
        const delLote = (fila || [])
          .filter((it) => clave.split(',').includes(it.id))
          .map((it) => {
            const templateNome = mapaFinais[it.id];
            const nomeBase = mapaNomes[it.bibliotecaId] || it.tituloIA || 'Vídeo';
            return {
              ...it,
              nome: templateNome ? `${nomeBase} · ${templateNome}` : nomeBase,
            };
          });
        setItems(delLote);
        setCargando(false);

        const terminados = delLote.filter((it) => it.status === 'concluido' || it.status === 'erro');
        if (delLote.length > 0 && terminados.length === delLote.length && !avisado.current) {
          avisado.current = true;
          onTerminado?.(delLote);
        }
      } catch {
        // Errores temporales de rede: ignorar e reintentar no próximo tick
      }
    }

    tick();
    const intervalo = setInterval(tick, 1000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(ids) ? ids.join(',') : '']);

  const total = items.length;
  const conteo = { aguardando: 0, processando: 0, concluido: 0, erro: 0 };
  items.forEach((it) => { if (conteo[it.status] !== undefined) conteo[it.status]++; });
  const procesados = conteo.concluido + conteo.erro;
  const promedio = total > 0
    ? Math.round(
        items.reduce((acc, it) => {
          if (it.status === 'concluido') return acc + 100;
          if (it.status === 'erro') return acc;
          return acc + (it.percentual || 0);
        }, 0) / total
      )
    : 0;

  if (cargando) {
    return (
      <p className="text-xs text-slate-500 font-medium flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        Consultando fila...
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
      <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700">Progresso real por vídeo</p>
        {total > 0 && (
          <span className="text-[11px] font-mono font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
            Lote: {procesados}/{total} · {promedio}%
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-xs text-slate-500 py-4 px-3.5 font-medium">
          Buscando os vídeos do lote na fila...
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
              <span className="min-w-0 flex-1 font-mono text-[11px] font-semibold text-slate-800 truncate">
                {it.nome}
              </span>

              {it.status === 'aguardando' && (
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                  ⏳ 0% &nbsp;Aguardando
                </span>
              )}

              {it.status === 'processando' && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 whitespace-nowrap">
                  <span
                    className="inline-block w-3 h-3 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin"
                    title="Processando"
                  />
                  <span>{it.percentual || 0}% Processando...</span>
                </span>
              )}

              {it.status === 'concluido' && (
                <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">
                  ✓ 100% &nbsp;Concluido
                </span>
              )}

              {it.status === 'erro' && (
                <span
                  className="text-xs font-bold text-rose-700 whitespace-nowrap truncate max-w-[65%]"
                  title={it.erroMensaje || ''}
                >
                  ✗ Erro{it.erroMensaje ? ` — ${it.erroMensaje}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}