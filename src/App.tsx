import React, { useEffect, useRef, useState } from 'react';

// --- Icons (SVG) ---
const ActivityIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
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

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Calculate ranges
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const prices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices) * 0.999;
    const maxPrice = Math.max(...prices) * 1.001;
    const priceRange = maxPrice - minPrice;

    const getX = (index: number) => padding + (index / (data.length - 1)) * chartWidth;
    const getY = (price: number) => padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight;

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    for (let i = 0; i <= 5; i++) {
      const y = padding + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      // Price labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px JetBrains Mono';
      const price = maxPrice - (i / 5) * priceRange;
      ctx.fillText(Math.round(price).toLocaleString(), width - padding + 5, y + 4);
    }
    ctx.setLineDash([]);

    // Draw Levels
    levels.forEach(level => {
      const y = getY(level.price);
      ctx.strokeStyle = level.type === 'RESISTANCE' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    });

    // Draw Candles
    const candleWidth = (chartWidth / data.length) * 0.8;
    data.forEach((d, i) => {
      const x = getX(i);
      const openY = getY(d.open);
      const closeY = getY(d.close);
      const highY = getY(d.high);
      const lowY = getY(d.low);

      const isUp = d.close >= d.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
      ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
      ctx.lineWidth = 1;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
      ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, bodyHeight);
    });

  }, [data, levels]);

  return (
    <div ref={containerRef} className="chart-container">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default function App() {
  const [data, setData] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [accountType, setAccountType] = useState('demo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'STATE' || msg.type === 'INIT' || msg.type === 'UPDATE') {
          setData(msg.data);
        }
      };
      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

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
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '1h', value: '60' },
  ];

  return (
    <div className="rtl">
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
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="ltr" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>قیمت لحظه‌ای</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                {data?.price?.toLocaleString() || '0'}
              </div>
            </div>
            <button onClick={() => setShowAuth(true)} className="btn btn-secondary">احراز هویت</button>
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
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>وضعیت ضبط</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: data?.isRecording ? '#10b981' : '#475569' }} />
              {data?.isRecording ? 'در حال ضبط' : 'غیرفعال'}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 'bold', color: '#94a3b8' }}>مظنه طلا ({data?.timeframe}m)</div>
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
          <CandlestickChart data={data?.candles || []} levels={data?.levels || []} />
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
