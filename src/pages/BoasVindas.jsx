import './BoasVindas.css';
import { ArrowRight, CalendarClock, Clapperboard, Film, Layers, Music2, Play, Scissors, Sparkles, Type } from 'lucide-react';

const ITENS = [
  { id: 'v1', tipo: 'video' }, { id: 'p1', tipo: 'dot' }, { id: 't1', tipo: 'timeline' },
  { id: 'b1', tipo: 'bloco' }, { id: 'c1', tipo: 'icone', Icone: Scissors, rotulo: 'CORTE' },
  { id: 'p2', tipo: 'dotroxo' }, { id: 'l1', tipo: 'legenda' },
  { id: 'c2', tipo: 'icone', Icone: Clapperboard, rotulo: 'CENA 04' }, { id: 'b2', tipo: 'blocoroxo' },
  { id: 'a1', tipo: 'audio' }, { id: 'p3', tipo: 'dot' },
  { id: 'c3', tipo: 'icone', Icone: Type, rotulo: 'TITULO' },
  { id: 'c4', tipo: 'icone', Icone: CalendarClock, rotulo: '09:30' }, { id: 'p4', tipo: 'dotroxo' },
  { id: 'c5', tipo: 'icone', Icone: Layers, rotulo: '1080x1920' }, { id: 'b3', tipo: 'bloco' },
  { id: 'c6', tipo: 'icone', Icone: Film, rotulo: 'FINAL' }, { id: 'p5', tipo: 'dot' },
  { id: 'c7', tipo: 'icone', Icone: Music2, rotulo: 'AUDIO' },
  { id: 'c8', tipo: 'icone', Icone: Sparkles, rotulo: 'EFEITO' },
];

function Peca({ item }) {
  if (item.tipo === 'dot') return <span className="bv-particula" aria-hidden="true" />;
  if (item.tipo === 'dotroxo') return <span className="bv-particula bv-particula-roxa" aria-hidden="true" />;
  if (item.tipo === 'bloco') return <span className="bv-bloco" aria-hidden="true" />;
  if (item.tipo === 'blocoroxo') return <span className="bv-bloco bv-bloco-roxo" aria-hidden="true" />;
  if (item.tipo === 'video') {
    return (
      <span className="bv-card bv-card-video" aria-hidden="true">
        <span className="bv-video-tela"><span className="bv-play"><Play className="bv-play-icone" /></span></span>
        <span className="bv-linha bv-linha-curta" /><span className="bv-linha bv-linha-media" />
      </span>
    );
  }
  if (item.tipo === 'timeline') {
    return (
      <span className="bv-card bv-card-largo" aria-hidden="true">
        <span className="bv-timeline"><span className="bv-timeline-cheia" /><span className="bv-timeline-cursor" /></span>
        <span className="bv-mini-barras"><span style={{ width: '82%' }} /><span style={{ width: '64%' }} /><span style={{ width: '74%' }} /></span>
      </span>
    );
  }
  if (item.tipo === 'legenda') {
    return (
      <span className="bv-card bv-card-largo" aria-hidden="true">
        <span className="bv-legenda-titulo" />
        <span className="bv-mini-barras"><span style={{ width: '92%' }} /><span style={{ width: '70%' }} /></span>
      </span>
    );
  }
  if (item.tipo === 'audio') {
    return (
      <span className="bv-card bv-card-audio" aria-hidden="true">
        {[10, 18, 26, 15, 22, 12, 20].map((h, i) => (<span key={i} className="bv-eq" style={{ height: `${h}px` }} />))}
      </span>
    );
  }
  const { Icone, rotulo } = item;
  return (
    <span className="bv-card bv-card-icone" aria-hidden="true">
      <span className="bv-icone-caixa"><Icone className="bv-icone" /></span>
      <span className="bv-rotulo">{rotulo}</span>
    </span>
  );
}

// Boas-vindas: textos centrais + palco da onda + botao de entrada.
export default function BoasVindas({ aoEntrar }) {
  const copias = [0, 1];
  return (
    <div className="bv-raiz">
      <div className="bv-conteudo">
        <span className="bv-selo"><span className="bv-selo-ponto" />AUTOPOST</span>
        <h1 className="bv-titulo">Bem-vindo ao <span className="bv-titulo-grad">AutoPost</span></h1>
        <p className="bv-sub">Sua ferramenta para editar e agendar publicações para o seu Instagram.</p>
        <div className="bv-palco" role="img" aria-label="Onda animada com elementos de video">
          <svg className="bv-linha-fundo bv-linha-a" height="70" preserveAspectRatio="none" viewBox="0 0 1200 70" aria-hidden="true">
            <defs><linearGradient id="bvGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ec4899" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
            <path d="M0,35 C100,5 200,5 300,35 C400,65 500,65 600,35 C700,5 800,5 900,35 C1000,65 1100,65 1200,35" />
          </svg>
          <svg className="bv-linha-fundo bv-linha-b" height="70" preserveAspectRatio="none" viewBox="0 0 1200 70" aria-hidden="true">
            <path d="M0,35 C100,65 200,65 300,35 C400,5 500,5 600,35 C700,65 800,65 900,35 C1000,5 1100,5 1200,35" />
          </svg>
          <svg className="bv-linha-fundo bv-linha-c" height="70" preserveAspectRatio="none" viewBox="0 0 1200 70" aria-hidden="true">
            <path d="M0,35 C100,5 200,5 300,35 C400,65 500,65 600,35 C700,5 800,5 900,35 C1000,65 1100,65 1200,35" />
          </svg>
          <div className="bv-brilho" aria-hidden="true" />
          <div className="bv-trilho-viewport">
            <div className="bv-trilho">
              {copias.map((c) => (
                <div key={c} style={{ display: 'contents' }} aria-hidden={c === 1}>
                  {ITENS.map((item, i) => (
                    <span key={`${c}-${item.id}`} className="bv-no" style={{ '--d': `${(-i * 0.32).toFixed(2)}s` }}>
                      <Peca item={item} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <button type="button" className="bv-botao" onClick={aoEntrar}>
          <span className="bv-botao-icone"><ArrowRight className="bv-seta" /></span>
          ENTRAR NO MEU EDITOR DE VÍDEO
        </button>
        <p className="bv-dica">Leva poucos segundos — seu editor abre com tudo pronto.</p>
      </div>
    </div>
  );
}
