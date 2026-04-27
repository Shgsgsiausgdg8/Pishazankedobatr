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
const SettingsIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
);

// --- Custom Canvas Chart Component ---
const CandlestickChart = ({ data, levels, nPattern, originalCandlesCount }: { data: any[], levels: any[], nPattern?: any, originalCandlesCount: number }) => {
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

    // Draw N-Pattern ZigZag Visualization
    if (nPattern && nPattern.points && nPattern.points.length >= 2) {
      const isConfirmed = nPattern.isConfirmed;
      ctx.strokeStyle = nPattern.type === 'BUY' ? '#10b981' : '#ef4444';
      ctx.lineWidth = isConfirmed ? 5 : 2.5; // ضخیم‌تر برای سیگنال تایید شده
      
      // اگر سیگنال تایید شده است، خط توپر بکش، در غیر این صورت خط‌چین (Pending)
      if (!isConfirmed) {
        ctx.setLineDash([8, 4]);
      } else {
        ctx.setLineDash([]);
        // افکت درخشش برای دید بهتر (Glow)
        ctx.shadowBlur = 15;
        ctx.shadowColor = nPattern.type === 'BUY' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      }
      
      ctx.beginPath();
      let drewFirst = false;
      const lastCandleIdx = data.length - 1;
      const candleInterval = data.length > 1 ? data[1].time - data[0].time : 60000;

      // محاسبه ایندکس شروع برای همگام‌سازی با ایندکس‌های مطلق سرور
      const sliceStart = Math.max(0, originalCandlesCount - data.length);

      nPattern.points.forEach((p: any) => {
        let x = 0;
        
        // همگام‌سازی ایندکس با کسر کردن آفستِ اسلایس ۴۰۰ تایی
        if (p.index !== undefined) {
          x = getX(p.index - sliceStart);
        } else {
          // فال‌بک زمانی (برای اطمینان)
          const cIdx = data.findIndex(c => c.time === p.time);
          if (cIdx !== -1) {
            x = getX(cIdx);
          } else {
            const lastCandleTime = data[lastCandleIdx].time;
            let offset = (p.time - lastCandleTime) / candleInterval;
            x = getX(lastCandleIdx + Math.min(Math.max(offset, -50), 50));
          }
        }
        
        const y = getY(p.price);
        if (Number.isNaN(x) || Number.isNaN(y)) return;

        if (!drewFirst) {
          ctx.moveTo(x, y);
          drewFirst = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      // Reset Shadow
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      
      // Draw labels A, B, C, D with high visibility
      nPattern.points.forEach((p: any) => {
          let x = 0;
          if (p.index !== undefined) {
              x = getX(p.index - sliceStart);
          } else {
              const cIdx = data.findIndex(c => c.time === p.time);
              if (cIdx !== -1) {
                  x = getX(cIdx);
              } else {
                  let offset = (p.time - data[lastCandleIdx].time) / candleInterval;
                  x = getX(lastCandleIdx + Math.min(Math.max(offset, -50), 50));
              }
          }
          const y = getY(p.price);
          if (Number.isNaN(x) || Number.isNaN(y)) return;
          
          ctx.fillStyle = nPattern.type === 'BUY' ? '#10b981' : '#ef4444';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2); 
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          const label = p.label || '';
          const isUpper = label === 'B' || label === 'D';
          const labelY = isUpper ? y - 32 : y + 32;
          
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(x - 12, labelY - 10, 24, 20);
          ctx.strokeStyle = nPattern.type === 'BUY' ? '#10b981' : '#ef4444';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 12, labelY - 10, 24, 20);
          
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.font = 'bold 12px Inter';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, labelY);
      });
    }

  }, [data, levels, nPattern, viewState, mousePos, dimensions]);

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
  // Persistent broker selection
  const [activeBroker, setActiveBroker] = useState<'faraz' | 'alpha'>(() => {
    const saved = localStorage.getItem('activeBroker');
    return (saved === 'faraz' || saved === 'alpha') ? saved : 'faraz';
  });
  
  const activeBrokerRef = useRef(activeBroker);
  const [data, setData] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('activeBroker', activeBroker);
    activeBrokerRef.current = activeBroker;
  }, [activeBroker]);
  
  const [showAuth, setShowAuth] = useState(false);
  const [showBaleSettings, setShowBaleSettings] = useState(false);
  const [baleToken, setBaleToken] = useState('');
  const [baleChatId, setBaleChatId] = useState('');
  const [farazToken, setFarazToken] = useState('');
  const [farazSession, setFarazSession] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [accountType, setAccountType] = useState('demo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);

  const [backtestResults, setBacktestResults] = useState<any>(null);
  const [globalResults, setGlobalResults] = useState<any[] | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState('N-PATTERN');
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [isGlobalTesting, setIsGlobalTesting] = useState(false);

  useEffect(() => {
    activeBrokerRef.current = activeBroker;
  }, [activeBroker]);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      
      ws.onopen = () => {
        setWsConnected(true);
        // Sync broker on reconnect
        ws.send(JSON.stringify({ type: 'SET_BROKER', broker: activeBrokerRef.current }));
      };
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'STATE' || msg.type === 'INIT' || msg.type === 'UPDATE') {
            // CRITICAL FIX: Ensure broker name is part of the data so the loading check passes
            if (msg.broker === activeBrokerRef.current) {
              setData({ ...msg.data, broker: msg.broker });
              // Sync Bale settings from engine
              if (msg.data.baleToken) setBaleToken(msg.data.baleToken);
              if (msg.data.baleChatId) setBaleChatId(msg.data.baleChatId);
              if (msg.data.currentToken) setFarazToken(msg.data.currentToken);
              if (msg.data.farazSession) setFarazSession(msg.data.farazSession);
            }
          } else if (msg.type === 'BACKTEST_RESULTS') {
            setBacktestResults(msg.data);
            setGlobalResults(null);
            setIsBacktesting(false);
          } else if (msg.type === 'GLOBAL_BACKTEST_RESULTS') {
            setGlobalResults(msg.data);
            setBacktestResults(null);
            setIsGlobalTesting(false);
          }
        } catch (err) {
          console.error("WS Parse Error", err);
        }
      };
      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const runBacktest = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setIsBacktesting(true);
    setBacktestResults(null);
    wsRef.current.send(JSON.stringify({ 
      type: 'RUN_BACKTEST', 
      strategyType: selectedStrategy 
    }));
  };

  const runGlobalBacktest = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setIsGlobalTesting(true);
    setGlobalResults(null);
    setBacktestResults(null);
    wsRef.current.send(JSON.stringify({ type: 'RUN_GLOBAL_BACKTEST' }));
  };

  const setLiveStrategy = (strat: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_LIVE_STRATEGY', strategy: strat }));
    }
  };

  const switchBroker = (broker: 'faraz' | 'alpha') => {
    if (broker === activeBroker) return;
    
    setActiveBroker(broker);
    setData(null); // Instant clear for UX
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_BROKER', broker }));
    }
  };

  const toggleRecording = () => {
    wsRef.current?.send(JSON.stringify({ type: data?.isRecording ? 'STOP_RECORDING' : 'START_RECORDING' }));
  };

  const setTimeframe = (tf: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'SET_TIMEFRAME', timeframe: tf }));
  };

  const updateSettings = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'UPDATE_SETTINGS',
        baleToken: baleToken,
        baleChatId: baleChatId,
        farazToken: farazToken,
        farazSession: farazSession
      }));
      setShowBaleSettings(false);
    }
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
        <div className="header-content" style={{ flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: '#10b981', padding: '6px', borderRadius: '10px' }}>
                <ActivityIcon />
              </div>
              <div>
                <h1 style={{ fontSize: '1rem', fontWeight: 'bold' }}>فرازگلد لایو</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: wsConnected ? '#10b981' : '#ef4444' }} />
                  {wsConnected ? 'متصل' : 'قطع شده'}
                </div>
              </div>
            </div>
            
            {/* Broker Selector */}
            <div style={{ display: 'flex', gap: '2px', background: '#020617', padding: '2px', borderRadius: '8px', marginLeft: '0.5rem' }}>
              <button 
                onClick={() => switchBroker('faraz')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeBroker === 'faraz' ? '#10b981' : 'transparent',
                  color: activeBroker === 'faraz' ? 'white' : '#94a3b8',
                  whiteSpace: 'nowrap',
                  transition: '0.2s'
                }}
              >
                فراز گلد
              </button>
              <button 
                onClick={() => switchBroker('alpha')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeBroker === 'alpha' ? '#10b981' : 'transparent',
                  color: activeBroker === 'alpha' ? 'white' : '#94a3b8',
                  whiteSpace: 'nowrap',
                  transition: '0.2s'
                }}
              >
                آلفا گلد
              </button>
              <button 
                onClick={() => switchBroker('btc')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: activeBroker === 'btc' ? '#10b981' : 'transparent',
                  color: activeBroker === 'btc' ? 'white' : '#94a3b8',
                  whiteSpace: 'nowrap',
                  transition: '0.2s'
                }}
              >
                بیت‌کوین
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
            <button 
              onClick={() => setShowBaleSettings(true)}
              style={{
                background: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '6px 8px',
                fontSize: '0.65rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                whiteSpace: 'nowrap'
              }}
            >
              <SettingsIcon size={14} />
              <span style={{ display: 'none' }} className="md:inline">تنظیمات</span>
            </button>
            <div className="ltr" style={{ textAlign: 'right', minWidth: '70px' }}>
              <div style={{ fontSize: '0.55rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                قیمت {activeBroker === 'faraz' ? '(مظنه)' : (activeBroker === 'alpha' ? '(انس)' : '(BTC)')}
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                {activeBroker === 'alpha' || activeBroker === 'btc'
                  ? data?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'
                  : data?.price?.toLocaleString() || '0'
                }
              </div>
            </div>
            {activeBroker === 'faraz' && (
              <button onClick={() => setShowAuth(true)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.7rem' }}>احراز هویت</button>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.5rem', color: '#94a3b8' }}>استراتژی:</span>
              <select 
                value={data?.liveStrategy || 'HYBRID'} 
                onChange={(e) => setLiveStrategy(e.target.value)}
                style={{ 
                  background: '#020617', 
                  color: '#10b981', 
                  border: '1px solid #1e293b', 
                  borderRadius: '6px', 
                  padding: '1px 4px',
                  fontSize: '0.7rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="HYBRID">Smart N</option>
                <option value="SCALP-ADV">اسکلپ</option>
                <option value="PINBAR">پین‌بار</option>
                <option value="N-PATTERN">الگوی N</option>
                <option value="TREND-MT">روندی</option>
              </select>
            </div>

            <button 
              onClick={toggleRecording} 
              className={`btn ${data?.isRecording ? 'btn-secondary' : 'btn-primary'}`}
              style={{ padding: '6px 12px', fontSize: '0.7rem', borderRadius: '8px' }}
            >
              {data?.isRecording ? <SquareIcon /> : <PlayIcon />}
              <span>{data?.isRecording ? 'توقف' : 'ضبط'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ position: 'relative', minHeight: '400px' }}>
        {(!data || data.broker !== activeBroker) && (
          <div style={{ 
            position: 'absolute', 
            inset: 0, 
            zIndex: 50, 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(2, 6, 23, 0.85)', 
            backdropFilter: 'blur(8px)',
            borderRadius: '16px'
          }}>
            <div className="animate-spin" style={{ 
              width: '40px', 
              height: '40px', 
              border: '4px solid #10b981', 
              borderTopColor: 'transparent', 
              borderRadius: '50%',
              marginBottom: '1rem'
            }}></div>
            <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>درحال فراخوانی دیتای {activeBroker === 'faraz' ? 'فراز گلد' : 'آلفا گلد'}...</div>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>مقاومت (سقف آخر)</div>
              <span style={{ fontSize: '0.6rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>Major/Minor</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
              {data?.levels?.filter((l: any) => l.type === 'RESISTANCE').slice(-1)[0]?.price.toLocaleString() || '---'}
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>حمایت (کف آخر)</div>
              <span style={{ fontSize: '0.6rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>Major/Minor</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: '#10b981' }}>
              {data?.levels?.filter((l: any) => l.type === 'SUPPORT').slice(-1)[0]?.price.toLocaleString() || '---'}
            </div>
          </div>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px' }}>وضعیت ساختار بازار</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: '#3b82f6' }}>
               <div className="pulse" />
               {data?.liveStrategy === 'N-PATTERN' 
                 ? `پایش ${data?.nPattern?.type === 'BUY' ? 'خرید' : 'فروش'} (الگوها: ${data?.nPattern?.totalCount || 0})` 
                 : 'اسکلپ لحظه‌ای'}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '4px' }}>
               آپدیت خودکار (مانور و میژور)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 'bold', color: '#94a3b8' }}>
                {activeBroker === 'faraz' ? 'مظنه طلا' : (activeBroker === 'alpha' ? 'انس جهانی (XAUUSD)' : 'بیتکوین (BTCUSDT)')} ({data?.timeframe}m)
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
              nPattern={data?.nPattern}
              originalCandlesCount={data?.totalCandles || 0}
            />
          </div>

          {/* Backtest Terminal - Moved up for better visibility */}
          <div className="card" style={{ border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 'bold', color: '#10b981', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ActivityIcon size={16} />
              ترمینال بک‌تست (شنیه‌سازی استراتژی)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: '#020617', padding: '1.2rem', borderRadius: '16px', border: '1px solid #1e293b' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>انتخاب استراتژی معاملاتی:</label>
                <select 
                  value={selectedStrategy} 
                  onChange={e => setSelectedStrategy(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: '#1e293b', color: 'white', border: '1px solid #334155', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  <option value="N-PATTERN">الگوی N (N-Pattern)</option>
                  <option value="RSI">شاخص RSI (Oversold/Overbought)</option>
                  <option value="EMA-CROSS">کراس میانگین متحرک (EMA 9/21)</option>
                  <option value="SCALP-ADV">اسکلپ پیشرفته (Adv Scalp)</option>
                  <option value="QUANT">استراتژی کوانت (Patterns)</option>
                  <option value="TREND-MT">روند میان‌مدت (Trend MT)</option>
                  <option value="HST">استراتژی HST (SuperTrend)</option>
                  <option value="PINBAR">پین بار (PinBar Reversal)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', width: '100%', sm: 'auto' } as any}>
                <button 
                  onClick={runBacktest} 
                  disabled={isBacktesting || isGlobalTesting}
                  className="btn btn-primary" 
                  style={{ flex: 1, minWidth: '140px', justifyContent: 'center', height: '48px', fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
                >
                  {isBacktesting ? '...' : 'تست تکی'}
                </button>
                <button 
                  onClick={runGlobalBacktest} 
                  disabled={isBacktesting || isGlobalTesting}
                  className="btn btn-secondary" 
                  style={{ flex: 1, minWidth: '140px', justifyContent: 'center', height: '48px', fontSize: '0.9rem', background: '#1e293b' }}
                >
                  {isGlobalTesting ? 'در حال آنالیز...' : 'آنالیز کلی (کدام بهتر است؟)'}
                </button>
              </div>
            </div>

            {globalResults && (
              <div style={{ animation: 'fadeIn 0.5s ease', background: 'rgba(2, 6, 23, 0.5)', borderRadius: '16px', padding: '1rem', border: '1px solid #1e293b' }}>
                <div style={{ fontWeight: 'bold', color: '#fff', marginBottom: '1rem', textAlign: 'center' }}>
                  🏆 مقایسه عملکرد استراتژی‌ها (به ترتیب سودآوری)
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #1e293b', textAlign: 'right' }}>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>نام استراتژی</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>وین ریت</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>سود خالص</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>بهترین ساعت</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>بهترین روز</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>معاملات</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>امتیاز</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalResults.map((res: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1e293b', background: i === 0 ? 'rgba(16, 185, 129, 0.1)' : 'transparent' }}>
                          <td style={{ padding: '12px', color: i === 0 ? '#10b981' : '#fff', fontWeight: i === 0 ? 'bold' : 'normal' }}>
                            {i === 0 && '⭐ '}{res.strategy}
                          </td>
                          <td style={{ padding: '12px', color: res.results.winRate >= 50 ? '#10b981' : '#ef4444' }}>
                            {res.results.winRate.toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: res.results.totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
                            {res.results.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                          <td style={{ padding: '12px', color: '#3b82f6' }}>{res.results.bestHour !== -1 ? `${res.results.bestHour}:00` : '---'}</td>
                          <td style={{ padding: '12px', color: '#a855f7' }}>{res.results.bestDay}</td>
                          <td style={{ padding: '12px' }}>{res.results.totalTrades}</td>
                          <td style={{ padding: '12px' }}>
                             <div style={{ width: '60px', height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, (res.results.totalProfit / globalResults[0].results.totalProfit) * 100)}%`, height: '100%', background: '#10b981' }} />
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {backtestResults?.error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid #ef4444', color: '#ef4444', marginBottom: '1rem', textAlign: 'center' }}>
                {backtestResults.error}
              </div>
            )}

            {backtestResults && !backtestResults.error && (
              <div style={{ animation: 'fadeIn 0.5s ease' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>وین ریت</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: backtestResults.winRate >= 50 ? '#10b981' : '#ef4444' }}>
                      {backtestResults.winRate.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ background: '#020617', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>مجموع الگوها</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{backtestResults.totalTrades}</div>
                    <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '4px' }}>
                      N: {backtestResults.buyTrades || 0} | Inv N: {backtestResults.sellTrades || 0}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>سود خالص</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: backtestResults.totalProfit >= 0 ? '#10b981' : '#ef4444' }}>
                      {backtestResults.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>افت (DD)</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#ef4444' }}>
                      {backtestResults.maxDrawdown.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>بهترین ساعت معامله</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                      {backtestResults.bestHour !== -1 ? `${backtestResults.bestHour}:00` : '---'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(168, 85, 247, 0.05)', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>بهترین روز هفته</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#a855f7' }}>
                      {backtestResults.bestDay || '---'}
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', background: '#020617', borderRadius: '12px', padding: '0.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'right' }}>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>نوع</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>ورود</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>خروج</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>سود</th>
                        <th style={{ padding: '12px', color: '#94a3b8' }}>نتیجه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtestResults.trades.slice(-5).reverse().map((trade: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '12px', color: trade.type === 'BUY' ? '#10b981' : '#ef4444', fontWeight: '600' }}>{trade.type}</td>
                          <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{trade.entry.toLocaleString()}</td>
                          <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{trade.exit.toLocaleString()}</td>
                          <td style={{ padding: '12px', color: trade.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{trade.profit > 0 ? '+' : ''}{trade.profit.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              background: trade.result === 'WIN' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                              color: trade.result === 'WIN' ? '#10b981' : '#ef4444'
                            }}>
                              {trade.result === 'WIN' ? 'WIN' : 'LOSS'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {backtestResults.trades.length > 5 && (
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#475569', marginTop: '12px' }}>
                      نمایش ۵ معامله اخیر از مجموع {backtestResults.totalTrades} معامله
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Recent Signals Section */}
          <div className="card">
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
                  padding: '16px', 
                  border: `1px solid ${sig.type === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Confidence Indicator */}
                  {sig.confidence && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '3px',
                      background: '#1e293b'
                    }}>
                      <div style={{
                        width: `${sig.confidence}%`,
                        height: '100%',
                        background: sig.confidence > 85 ? '#10b981' : sig.confidence > 75 ? '#3b82f6' : '#f59e0b',
                        boxShadow: `0 0 8px ${sig.confidence > 85 ? '#10b981' : '#3b82f6'}`
                      }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        color: sig.type === 'BUY' ? '#10b981' : '#ef4444', 
                        fontWeight: 'bold',
                        fontSize: '1rem'
                      }}>
                        {sig.type === 'BUY' ? 'خرید (BUY)' : 'فروش (SELL)'}
                      </span>
                      {sig.confidence && (
                        <span style={{ 
                          fontSize: '0.65rem', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          background: 'rgba(59, 130, 246, 0.1)', 
                          color: '#3b82f6',
                          border: '1px solid rgba(59, 130, 246, 0.2)'
                        }}>
                          اطمینان: {sig.confidence}%
                        </span>
                      )}
                    </div>
                    <span style={{ color: '#475569', fontSize: '0.7rem' }}>
                      {new Date(sig.time).toLocaleTimeString('fa-IR')}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                    <div style={{ color: '#94a3b8' }}>ورود: <span style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{sig.entry.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>استاپ: <span style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{sig.sl.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تارگت ۱: <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>{sig.tp1.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تارگت ۲: <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>{sig.tp2.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تارگت ۳: <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>{sig.tp3.toLocaleString()}</span></div>
                    <div style={{ color: '#94a3b8' }}>تایم: <span style={{ color: '#fff' }}>{sig.timeframe}m</span></div>
                    {sig.saghf && <div style={{ color: '#94a3b8' }}>سقف: <span style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{sig.saghf.toLocaleString()}</span></div>}
                    {sig.kaf && <div style={{ color: '#94a3b8' }}>کف: <span style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{sig.kaf.toLocaleString()}</span></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* N-Pattern Checklist / Market Info */}
          <div className="card" style={{ padding: '15px', border: '1px solid #1e293b' }}>
             <h3 style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ActivityIcon size={14} />
                چک‌لیست تایید ساختار N
             </h3>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                   <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: (data?.levels?.length || 0) > 2 ? '#10b981' : '#475569' }} />
                   ۱. شناسایی سقف و کف اصلی (Maneuver)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                   <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                   ۲. محاسبه عمق اصلاح (Measure 3%)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                   <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: data?.liveStrategy === 'N-PATTERN' ? '#10b981' : '#475569' }} />
                   ۳. پایش نقطه ورود بهینه‌ (Target Entry)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                   <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }} />
                   ۴. تایید حد سود و ضرر (0.2% - 0.38%)
                </div>
             </div>
          </div>
        </div>
      </main>

      {showBaleSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>⚙️ تنظیمات ربات</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ borderBottom: '1px solid #334155', pb: '10px', mb: '5px' }}>
                <h3 style={{ fontSize: '0.9rem', color: '#10b981', mb: '10px' }}>🔔 تنظیمات بله</h3>
                <div style={{ mb: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>توکن ربات بله:</label>
                  <input 
                    type="text" 
                    value={baleToken} 
                    onChange={e => setBaleToken(e.target.value)}
                    placeholder="1892918835:dxRd..."
                    className="ltr"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: 'none', color: 'white', fontSize: '0.8rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>آیدی چت:</label>
                  <input 
                    type="text" 
                    value={baleChatId} 
                    onChange={e => setBaleChatId(e.target.value)}
                    placeholder="6211548865"
                    className="ltr"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: 'none', color: 'white', fontSize: '0.8rem' }}
                  />
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.85rem', color: '#3b82f6', mb: '8px' }}>📡 تنظیمات API بیت‌کوین (BTC)</h3>
                <div style={{ mb: '8px' }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>x-access-token:</label>
                  <input 
                    type="text" 
                    value={farazToken} 
                    onChange={e => setFarazToken(e.target.value)}
                    className="ltr"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: 'none', color: 'white', fontSize: '0.7rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>farazSession:</label>
                  <input 
                    type="text" 
                    value={farazSession} 
                    onChange={e => setFarazSession(e.target.value)}
                    className="ltr"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: 'none', color: 'white', fontSize: '0.7rem' }}
                  />
                </div>
              </div>

              <button 
                onClick={updateSettings}
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}
              >
                ذخیره و اعمال تنظیمات
              </button>
              <button onClick={() => setShowBaleSettings(false)} className="btn btn-secondary" style={{ justifyContent: 'center' }}>انصراف</button>
            </div>
          </div>
        </div>
      )}

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
