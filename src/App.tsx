import React, { useEffect, useRef, useState } from 'react';

// --- Icons (SVG) ---
const ActivityIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);
const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
);
const SquareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
);

// --- Custom Canvas Chart Component ---
const CandlestickChart = ({ data, levels }: { data: any[], levels: any[] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useState({ offset: 0, zoom: 1, followLatest: true });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, active: false });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0 || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const paddingRight = 60;
    const paddingTop = 20;
    const paddingBottom = 30;
    const chartWidth = width - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const baseCandleWidth = 10;
    const candleWidth = baseCandleWidth * viewState.zoom;
    const totalContentWidth = data.length * candleWidth;
    
    let currentOffset = viewState.offset;
    if (viewState.followLatest) {
      currentOffset = chartWidth - totalContentWidth;
    }

    // Determine visible range
    const startIdx = Math.max(0, Math.floor(-currentOffset / candleWidth));
    const endIdx = Math.min(data.length, Math.ceil((chartWidth - currentOffset) / candleWidth));
    const visibleData = data.slice(startIdx, endIdx);

    if (visibleData.length === 0) return;

    // Scale Y based on visible data
    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = (maxPrice - minPrice) || 1;
    const yBuffer = priceRange * 0.1;
    const displayMin = minPrice - yBuffer;
    const displayMax = maxPrice + yBuffer;
    const displayRange = displayMax - displayMin;

    const getX = (index: number) => currentOffset + (index * candleWidth);
    const getY = (price: number) => {
      const y = paddingTop + chartHeight - ((price - displayMin) / displayRange) * chartHeight;
      return Number.isNaN(y) ? 0 : y;
    };

    // Clear background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid & Labels
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px JetBrains Mono';

    const gridLines = 6;
    for (let i = 0; i <= gridLines; i++) {
      const y = paddingTop + (i / gridLines) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      const price = displayMax - (i / gridLines) * displayRange;
      ctx.fillText(Math.round(price).toLocaleString(), chartWidth + 5, y + 4);
    }
    ctx.setLineDash([]);

    // Draw Levels
    levels.forEach(level => {
      if (level.price >= displayMin && level.price <= displayMax) {
        const y = getY(level.price);
        ctx.strokeStyle = level.type === 'RESISTANCE' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        
        ctx.fillStyle = level.type === 'RESISTANCE' ? '#ef4444' : '#10b981';
        ctx.fillText(level.type === 'RESISTANCE' ? 'Saghf' : 'Kaf', 5, y - 5);
      }
    });

    // Draw Candles
    visibleData.forEach((d, i) => {
      const actualIdx = startIdx + i;
      const x = getX(actualIdx);
      const openY = getY(d.open);
      const closeY = getY(d.close);
      const highY = getY(d.high);
      const lowY = getY(d.low);

      const isUp = d.close >= d.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
      ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
      
      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bWidth = candleWidth * 0.7;
      const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
      ctx.fillRect(x - bWidth / 2, Math.min(openY, closeY), bWidth, bodyHeight);
    });

    // Current Price Label on Axis
    const lastCandle = data[data.length - 1];
    if (lastCandle && lastCandle.close >= displayMin && lastCandle.close <= displayMax) {
      const y = getY(lastCandle.close);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(chartWidth, y - 10, 60, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px JetBrains Mono';
      ctx.fillText(lastCandle.close.toLocaleString(undefined, { minimumFractionDigits: 1 }), chartWidth + 5, y + 4);
    }

  }, [data, levels, viewState, dimensions]);

  return (
    <div 
      ref={containerRef} 
      className="chart-container"
      onMouseDown={(e) => { isDragging.current = true; lastMouseX.current = e.clientX; setViewState(p => ({ ...p, followLatest: false })); }}
      onMouseMove={(e) => { if (isDragging.current) { setViewState(p => ({ ...p, offset: p.offset + (e.clientX - lastMouseX.current) })); lastMouseX.current = e.clientX; } }}
      onMouseUp={() => { isDragging.current = false; }}
      onWheel={(e) => setViewState(p => ({ ...p, zoom: Math.max(0.1, Math.min(5, p.zoom * (e.deltaY > 0 ? 0.9 : 1.1))) }))}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {!viewState.followLatest && (
        <button onClick={() => setViewState(v => ({ ...v, followLatest: true }))} className="btn-latest">بازه زنده</button>
      )}
    </div>
  );
};

export default function App() {
  const [activeBroker, setActiveBroker] = useState<'faraz' | 'alpha'>(() => {
    const saved = localStorage.getItem('activeBroker');
    return (saved === 'faraz' || saved === 'alpha') ? saved : 'faraz';
  });
  
  const [data, setData] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    localStorage.setItem('activeBroker', activeBroker);
  }, [activeBroker]);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'SET_BROKER', broker: activeBroker }));
      };
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'STATE' || msg.type === 'INIT' || msg.type === 'UPDATE') {
            if (msg.broker === activeBroker) {
              setData(msg.data);
            }
          }
        } catch (err) {
          console.error("WS Parse Error", err);
        }
      };
      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, [activeBroker]);

  const switchBroker = (broker: 'faraz' | 'alpha') => {
    setActiveBroker(broker);
    setData(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_BROKER', broker }));
    }
  };

  const formatPrice = (price: number) => {
    return price ? price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '---';
  };

  return (
    <div className="rtl container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ActivityIcon />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>پنل مانیتورینگ هوشمند نوسان</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn-broker ${activeBroker === 'faraz' ? 'active' : ''}`} onClick={() => switchBroker('faraz')}>فراز گلد</button>
          <button className={`btn-broker ${activeBroker === 'alpha' ? 'active' : ''}`} onClick={() => switchBroker('alpha')}>آلفا گلد</button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">قیمت زنده</div>
          <div className="value green">{formatPrice(data?.price)}</div>
        </div>
        <div className="stat-card">
          <div className="label">آخرین سقف (Saghf)</div>
          <div className="value red">
            {formatPrice(data?.levels?.filter((l: any) => l.type === 'RESISTANCE').pop()?.price)}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">آخرین کف (Kaf)</div>
          <div className="value green">
            {formatPrice(data?.levels?.filter((l: any) => l.type === 'SUPPORT').pop()?.price)}
          </div>
        </div>
      </div>

      <div className="main-layout">
        <div className="chart-wrapper card">
          <div className="chart-header">
             <span>چارت زنده ({data?.timeframe}m)</span>
             <span className={`status ${wsConnected ? 'online' : 'offline'}`}>{wsConnected ? 'آنلاین' : 'درحال اتصال...'}</span>
          </div>
          <CandlestickChart data={data?.candles || []} levels={data?.levels || []} />
        </div>

        <div className="sidebar card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📜 سیگنال‌های N-Pattern (3%)
          </h3>
          <div className="signals-list">
            {data?.signals?.length > 0 ? (
              data.signals.map((sig: any, i: number) => (
                <div key={i} className={`signal-box ${sig.type}`}>
                  <div className="sig-header">
                    <span className="sig-type">{sig.type === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'}</span>
                    <span className="sig-time">{new Date(sig.time).toLocaleTimeString()}</span>
                  </div>
                  <div className="sig-body">
                    <div className="sig-row"><span>ورود (Entry):</span> <strong>{formatPrice(sig.entry)}</strong></div>
                    <div className="sig-row"><span>حد ضرر (SL):</span> <strong className="red">{formatPrice(sig.sl)}</strong></div>
                    <div className="sig-row"><span>تارگت ۱:</span> <strong className="green">{formatPrice(sig.tp1)}</strong></div>
                    <div className="sig-row"><span>تارگت ۳:</span> <strong className="green">{formatPrice(sig.tp3)}</strong></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-data">درحال اسکن بازار...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
