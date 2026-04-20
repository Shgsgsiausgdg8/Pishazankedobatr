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
        ctx.fillText(level.type === 'RESISTANCE' ? 'RES' : 'SUP', 5, y - 5);
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

    // Crosshair
    if (mousePos.active && mousePos.x < chartWidth) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.setLineDash([2, 2]);
      
      // Vertical
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height);
      ctx.stroke();

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(width, mousePos.y);
      ctx.stroke();
      
      ctx.setLineDash([]);
      
      // Price tag
      const priceAtMouse = displayMax - ((mousePos.y - paddingTop) / chartHeight) * displayRange;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(chartWidth, mousePos.y - 10, 60, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.round(priceAtMouse).toLocaleString(), chartWidth + 5, mousePos.y + 4);
    }

    // Current Price Label on Axis
    const lastCandle = data[data.length - 1];
    if (lastCandle && lastCandle.close >= displayMin && lastCandle.close <= displayMax) {
      const y = getY(lastCandle.close);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(chartWidth, y - 10, 60, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px JetBrains Mono';
      ctx.fillText(Math.round(lastCandle.close).toLocaleString(), chartWidth + 5, y + 4);
    }

  }, [data, levels, viewState, mousePos, dimensions]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouseX.current = e.clientX;
    setViewState(prev => ({ ...prev, followLatest: false }));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y, active: true });

    if (isDragging.current) {
      const deltaX = e.clientX - lastMouseX.current;
      setViewState(prev => ({ ...prev, offset: prev.offset + deltaX }));
      lastMouseX.current = e.clientX;
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewState(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom * zoomFactor))
    }));
  };

  return (
    <div 
      ref={containerRef} 
      className="chart-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { isDragging.current = false; setMousePos(p => ({ ...p, active: false })); }}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', cursor: isDragging.current ? 'grabbing' : 'crosshair' }} />
      
      {!viewState.followLatest && (
        <button 
          onClick={() => setViewState(v => ({ ...v, followLatest: true }))}
          style={{
            position: 'absolute',
            bottom: '40px',
            right: '70px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '20px',
            padding: '4px 12px',
            fontSize: '0.7rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        >
          بازگشت به قیمت زنده
        </button>
      )}
    </div>
  );
};

export default function App() {
  const [data, setData] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeBroker, setActiveBroker] = useState<'faraz' | 'alpha'>('faraz');
  const [showAuth, setShowAuth] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [accountType, setAccountType] = useState('demo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        setWsConnected(true);
        // Sync broker on reconnect
        ws.send(JSON.stringify({ type: 'SET_BROKER', broker: activeBroker }));
      };
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'STATE' || msg.type === 'INIT' || msg.type === 'UPDATE') {
          // IMPORTANT: Only update data if the message matches our active broker
          // This prevents the "jumping" bug when switching brokers
          if (msg.broker === activeBroker) {
            setData(msg.data);
          }
        }
      };
      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const switchBroker = (broker: 'faraz' | 'alpha') => {
    setActiveBroker(broker);
    setData(null); // Clear data to show loading
    wsRef.current?.send(JSON.stringify({ type: 'SET_BROKER', broker }));
  };

  const toggleRecording = () => {
    wsRef.current?.send(JSON.stringify({ type: data?.isRecording ? 'STOP_RECORDING' : 'START_RECORDING' }));
  };

  const setTimeframe = (tf: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'SET_TIMEFRAME', timeframe: tf }));
  };

  const handleSetToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await fetch('/api/auth/set-refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, type: accountType })
      });
      setShowAuth(false);
      setRefreshToken('');
    } catch (e) {
      alert('خطا در اتصال');
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeframes = [
    { label: '1m', value: '1' },
    { label: '2m', value: '2' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '1h', value: '60' },
  ];

  return (
    <div className="rtl">
      {!data && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: 'white', zIndex: 9999 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="btn-primary" style={{ padding: '20px', borderRadius: '50%', marginBottom: '10px', display: 'inline-block' }}>
              <ActivityIcon />
            </div>
            <p>در حال دریافت اطلاعات از سرور...</p>
          </div>
        </div>
      )}
      <header className="header">
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ background: '#10b981', padding: '8px', borderRadius: '12px' }}>
              <ActivityIcon />
            </div>
            <div>
              <h1 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>فرازگلد لایو</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: wsConnected ? '#10b981' : '#ef4444' }} />
                {wsConnected ? 'متصل' : 'قطع شده'}
              </div>
            </div>
            
            {/* Broker Selector */}
            <div style={{ display: 'flex', gap: '4px', background: '#020617', padding: '4px', borderRadius: '12px', marginRight: '1rem' }}>
              <button 
                onClick={() => switchBroker('faraz')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeBroker === 'faraz' ? '#10b981' : 'transparent',
                  color: activeBroker === 'faraz' ? 'white' : '#94a3b8',
                  transition: '0.2s'
                }}
              >
                فراز گلد (آبشده)
              </button>
              <button 
                onClick={() => switchBroker('alpha')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeBroker === 'alpha' ? '#10b981' : 'transparent',
                  color: activeBroker === 'alpha' ? 'white' : '#94a3b8',
                  transition: '0.2s'
                }}
              >
                آلفا گلد (انس)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="ltr" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>قیمت لحظه‌ای {activeBroker === 'faraz' ? '(مظنه)' : '(انس)'}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                {activeBroker === 'alpha' 
                  ? data?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'
                  : data?.price?.toLocaleString() || '0'
                }
              </div>
            </div>
            {activeBroker === 'faraz' && (
              <button onClick={() => setShowAuth(true)} className="btn btn-secondary">احراز هویت</button>
            )}
            <button onClick={toggleRecording} className={`btn ${data?.isRecording ? 'btn-secondary' : 'btn-primary'}`}>
              {data?.isRecording ? <SquareIcon /> : <PlayIcon />}
              {data?.isRecording ? 'توقف' : 'ضبط'}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="stats-grid">
          <div className="stat-card">
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>مقاومت (سقف)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {data?.levels?.filter((l: any) => l.type === 'RESISTANCE').pop()?.price.toLocaleString() || '---'}
            </div>
          </div>
          <div className="stat-card">
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>حمایت (کف)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
              {data?.levels?.filter((l: any) => l.type === 'SUPPORT').pop()?.price.toLocaleString() || '---'}
            </div>
          </div>
          <div className="stat-card">
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>وضعیت استراتژی</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              {data?.timeframe === '5' ? 'روند (Trend)' : 'اسکلپ (Scalp)'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 'bold', color: '#94a3b8' }}>
                {activeBroker === 'faraz' ? 'مظنه طلا' : 'انس جهانی (XAUUSD)'} ({data?.timeframe}m)
              </div>
              <div style={{ display: 'flex', gap: '4px', background: '#020617', padding: '4px', borderRadius: '8px' }} className="ltr">
                {timeframes.map(tf => (
                  <button 
                    key={tf.value} 
                    onClick={() => setTimeframe(tf.value)}
                    style={{ 
                      padding: '4px 12px', 
                      borderRadius: '6px', 
                      fontSize: '0.7rem', 
                      border: 'none',
                      cursor: 'pointer',
                      background: data?.timeframe === tf.value ? '#10b981' : 'transparent',
                      color: data?.timeframe === tf.value ? 'white' : '#94a3b8'
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
            <CandlestickChart 
              key={activeBroker} 
              data={data?.candles || []} 
              levels={data?.levels || []} 
            />
            {!data && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2, 6, 23, 0.7)', backdropFilter: 'blur(4px)', borderRadius: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="animate-spin" style={{ width: '30px', height: '30px', border: '3px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 10px' }}></div>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>درحال بارگذاری دیتای {activeBroker === 'faraz' ? 'فراز گلد' : 'آلفا گلد'}...</p>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ fontWeight: 'bold', color: '#94a3b8', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ActivityIcon size={16} />
              سیگنال‌های اخیر
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
              gap: '1rem',
              padding: '4px'
            }}>
              {(!data?.signals || data.signals.length === 0) && (
                <div style={{ textAlign: 'center', color: '#475569', gridColumn: '1 / -1', padding: '2rem', fontSize: '0.8rem' }}>
                  در انتظار سیگنال...
                </div>
              )}
              {data?.signals?.map((sig: any, idx: number) => (
                <div key={idx} style={{ 
                  background: '#020617', 
                  borderRadius: '12px', 
                  padding: '12px', 
                  border: `1px solid ${sig.type === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ 
                      color: sig.type === 'BUY' ? '#10b981' : '#ef4444', 
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}>
                      {sig.type === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'}
                    </span>
                    <span style={{ color: '#475569', fontSize: '0.7rem' }}>
                      {new Date(sig.time).toLocaleTimeString('fa-IR')}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem' }}>
                    <div style={{ color: '#94a3b8' }}>ورود: <span style={{ color: '#fff' }}>{sig.entry.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>استاپ: <span style={{ color: '#ef4444' }}>{sig.sl.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تارگت ۱: <span style={{ color: '#10b981' }}>{sig.tp1.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تارگت ۲: <span style={{ color: '#10b981' }}>{sig.tp2.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تارگت ۳: <span style={{ color: '#10b981' }}>{sig.tp3.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تایم: <span style={{ color: '#fff' }}>{sig.timeframe}m</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {showAuth && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '1rem' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>احراز هویت</h2>
            <form onSubmit={handleSetToken} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <select value={accountType} onChange={e => setAccountType(e.target.value)} style={{ padding: '12px', borderRadius: '8px', background: '#1e293b', color: 'white', border: 'none' }}>
                <option value="demo">حساب دمو</option>
                <option value="real">حساب واقعی</option>
              </select>
              <textarea 
                placeholder="توکن رفرش را وارد کنید..." 
                value={refreshToken} 
                onChange={e => setRefreshToken(e.target.value)}
                style={{ padding: '12px', borderRadius: '8px', background: '#1e293b', color: 'white', border: 'none', minHeight: '100px', fontFamily: 'monospace' }}
              />
              <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                {isSubmitting ? 'در حال اتصال...' : 'اتصال'}
              </button>
              <button type="button" onClick={() => setShowAuth(false)} className="btn btn-secondary" style={{ justifyContent: 'center' }}>انصراف</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
