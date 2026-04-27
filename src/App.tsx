import React, { useEffect, useRef, useState } from 'react';

// --- Icons (SVG) ---
const ActivityIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);
const SettingsIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
);
const CheckIcon = ({ size = 14, stroke = "currentColor" }: { size?: number, stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);
const CandlestickChart = ({ data, levels, nPattern, originalCandlesCount, activeStrategy }: { data: any[], levels: any[], nPattern?: any, originalCandlesCount: number, activeStrategy?: string }) => {
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
        
        ctx.fillStyle = level.type === 'RESISTANCE' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(16, 185, 129, 0.8)';
        ctx.font = '8px JetBrains Mono'; // Smaller font
        ctx.fillText(level.type === 'RESISTANCE' ? 'RES' : 'SUP', 2, y - 2);
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
      
      // Draw labels A, B, C, D with high visibility (Only if N-Pattern strategy is active)
      if (nPattern && data && data.length > 0 && nPattern.points && (activeStrategy === 'N-PATTERN' || !activeStrategy)) {
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
            ctx.arc(x, y, 3, 0, Math.PI * 2); 
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            const label = p.label || '';
            const isConfirmed = nPattern.isConfirmed;
            const isUpper = label === 'B' || label === 'D';
            const labelY = isUpper ? y - 18 : y + 18; // Smaller offset
            
            ctx.fillStyle = isConfirmed ? (nPattern.type === 'BUY' ? '#10b981' : '#ef4444') : 'rgba(15, 23, 42, 0.95)';
            ctx.fillRect(x - 7, labelY - 7, 14, 14); // Smaller boxes
            ctx.strokeStyle = nPattern.type === 'BUY' ? '#10b981' : '#ef4444';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x - 7, labelY - 7, 14, 14);
            
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = 'bold 9px Inter';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, labelY);
        });
      }
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
  const [activeBroker, setActiveBroker] = useState<'faraz' | 'alpha' | 'btc'>(() => {
    const saved = localStorage.getItem('activeBroker');
    return (saved === 'faraz' || saved === 'alpha' || saved === 'btc') ? saved as any : 'faraz';
  });
  
  const activeBrokerRef = useRef(activeBroker);
  const [engineStatuses, setEngineStatuses] = useState<Record<string, boolean>>({ faraz: true, alpha: true, btc: true });
  const [data, setData] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('activeBroker', activeBroker);
    activeBrokerRef.current = activeBroker;
  }, [activeBroker]);
  
  const [showAuth, setShowAuth] = useState(false);
  const [showBaleSettings, setShowBaleSettings] = useState(false);
  const [showStrategySettings, setShowStrategySettings] = useState(false);
  const [baleToken, setBaleToken] = useState('');
  const [baleChatId, setBaleChatId] = useState('');
  const [farazToken, setFarazToken] = useState('');
  const [farazSession, setFarazSession] = useState('');
  const [candleConfirmations, setCandleConfirmations] = useState({
    legacy: true,
    salvation: true,
    nameless: true,
    engulfing: true,
    darkCloud: true
  });
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
            if (msg.engineStatuses) setEngineStatuses(msg.engineStatuses);
            // CRITICAL FIX: Ensure broker name is part of the data so the loading check passes
            if (msg.broker === activeBrokerRef.current) {
              setData({ ...msg.data, broker: msg.broker });
              // Sync Bale settings from engine
              if (msg.data.baleToken) setBaleToken(msg.data.baleToken);
              if (msg.data.baleChatId) setBaleChatId(msg.data.baleChatId);
              if (msg.data.currentToken) setFarazToken(msg.data.currentToken);
              if (msg.data.farazSession) setFarazSession(msg.data.farazSession);
              if (msg.data.candleConfirmations) setCandleConfirmations(msg.data.candleConfirmations);
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

  const updateStrategyConfig = (config: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_STRATEGY_CONFIG', config }));
    }
  };

  const switchBroker = (broker: 'faraz' | 'alpha' | 'btc') => {
    if (broker === activeBroker) return;
    
    setActiveBroker(broker);
    setData(null); // Instant clear for UX
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'SET_BROKER', broker }));
    }
  };

  const setTimeframe = (tf: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'SET_TIMEFRAME', timeframe: tf }));
  };

  const toggleEngine = (broker: string, enabled: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'TOGGLE_ENGINE', broker, enabled }));
  };

  const updateSettings = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'UPDATE_SETTINGS',
        baleToken: baleToken,
        baleChatId: baleChatId,
        farazToken: farazToken,
        farazSession: farazSession,
        candleConfirmations: candleConfirmations
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
            <div style={{ display: 'flex', gap: '8px', padding: '4px', background: '#020617', borderRadius: '12px', border: '1px solid #1e293b' }}>
              {[
                { id: 'faraz', label: 'فراز گلد' },
                { id: 'alpha', label: 'آلفا گلد' },
                { id: 'btc', label: 'بیت‌کوین' }
              ].map(b => {
                const isActiveMarket = activeBroker === b.id;
                const isMarketEnabled = engineStatuses[b.id];
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', background: isActiveMarket ? 'rgba(16, 185, 129, 0.1)' : 'transparent', borderRadius: '8px', padding: '2px 4px' }}>
                    <button 
                      onClick={() => switchBroker(b.id as any)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        border: 'none',
                        cursor: 'pointer',
                        background: isActiveMarket ? '#10b981' : 'transparent',
                        color: isActiveMarket ? 'white' : (isMarketEnabled ? '#e2e8f0' : '#475569'),
                        fontWeight: isActiveMarket ? '600' : 'normal',
                        whiteSpace: 'nowrap',
                        transition: '0.2s',
                        opacity: isMarketEnabled ? 1 : 0.6
                      }}
                    >
                      {b.label}
                    </button>
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEngine(b.id, !isMarketEnabled);
                      }}
                      title={isMarketEnabled ? 'خاموش کردن بازار' : 'روشن کردن بازار'}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        marginLeft: '4px',
                        background: isMarketEnabled ? '#10b981' : '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '10px',
                        color: 'white',
                        boxShadow: isMarketEnabled ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
                        transition: '0.3s'
                      }}
                    >
                      {isMarketEnabled ? <CheckIcon size={10} stroke="white" /> : <div style={{width: 6, height: 6, borderRadius: '50%', background: '#64748b'}} />}
                    </div>
                  </div>
                );
              })}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <select 
                  value={data?.liveStrategy || 'N-PATTERN'} 
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
                  <option value="N-PATTERN">الگوی N (N-Pattern)</option>
                  <option value="FIB-38">فیبوناچی ۳۸٪ (FIB-38)</option>
                  <option value="STRATEGY_3">استراتژی فراز (Fib+CRSI)</option>
                  <option value="STRATEGY_4">استراتژی چهارم (ساده)</option>
                </select>
                <button 
                  onClick={() => setShowStrategySettings(true)}
                  style={{ background: '#1e293b', border: 'none', color: '#94a3b8', padding: '2px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="تنظیمات تخصصی"
                >
                  <SettingsIcon size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {data?.liveStrategy === 'FIB-38' && (
          <div style={{ 
            background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)', 
            padding: '10px 1.2rem', 
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: '#3b82f6', 
              fontSize: '0.75rem', 
              fontWeight: 'bold',
              background: 'rgba(59, 130, 246, 0.1)',
              padding: '4px 10px',
              borderRadius: '20px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <CheckIcon size={12} />
              تاییدیه کندلی
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'legacy', label: 'یادگاری' },
                { id: 'salvation', label: 'رستگاری' },
                { id: 'nameless', label: 'بی‌نام' },
                { id: 'engulfing', label: 'پوششی' },
                { id: 'darkCloud', label: 'ابر سیاه' }
              ].map(conf => {
                const isActive = (candleConfirmations as any)[conf.id];
                return (
                  <button
                    key={conf.id}
                    onClick={() => {
                      const newConfs = { ...candleConfirmations, [conf.id]: !isActive };
                      setCandleConfirmations(newConfs);
                      wsRef.current?.send(JSON.stringify({
                        type: 'UPDATE_SETTINGS',
                        baleToken,
                        baleChatId,
                        farazToken,
                        farazSession,
                        candleConfirmations: newConfs
                      }));
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                      color: isActive ? '#10b981' : '#94a3b8',
                      border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(51, 65, 85, 0.5)'}`,
                      fontWeight: isActive ? '600' : 'normal'
                    }}
                  >
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '3px', 
                      background: isActive ? '#10b981' : '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}>
                      {isActive && <CheckIcon size={10} stroke="white" />}
                    </div>
                    {conf.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
            {!engineStatuses[activeBroker] ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#ef4444', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '8px' }}>این بازار غیرفعال است</div>
                <button 
                  onClick={() => toggleEngine(activeBroker, true)}
                  className="btn-primary" 
                  style={{ padding: '8px 20px', borderRadius: '8px' }}
                >
                  فعال‌سازی بازار
                </button>
              </div>
            ) : (
              <>
                <div className="animate-spin" style={{ 
                  width: '40px', 
                  height: '40px', 
                  border: '4px solid #10b981', 
                  borderTopColor: 'transparent', 
                  borderRadius: '50%',
                  marginBottom: '1rem'
                }}></div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>درحال فراخوانی دیتای {activeBroker === 'faraz' ? 'فراز گلد' : (activeBroker === 'alpha' ? 'آلفا گلد' : 'بیت‌کوین')}...</div>
              </>
            )}
          </div>
        )}

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '8px' }}>
          <div className="stat-card" style={{ borderLeft: '2px solid #ef4444', background: 'rgba(239,68,68,0.02)', padding: '0.4rem 0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.6rem' }}>مقاومت ماژور</div>
              <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#ef4444' }}></div>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
              {data?.levels?.filter((l: any) => l.type === 'RESISTANCE').slice(-1)[0]?.price.toLocaleString() || '---'}
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '2px solid #10b981', background: 'rgba(16,185,129,0.02)', padding: '0.4rem 0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.6rem' }}>حمایت ماژور</div>
              <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#10b981' }}></div>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: '#10b981' }}>
              {data?.levels?.filter((l: any) => l.type === 'SUPPORT').slice(-1)[0]?.price.toLocaleString() || '---'}
            </div>
          </div>
          <div className="stat-card" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '0.4rem 0.6rem' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.6rem', marginBottom: '1px' }}>وضعیت</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', color: '#3b82f6', fontSize: '0.75rem' }}>
               <div className="pulse" style={{ width: '4px', height: '4px' }} />
               {data?.liveStrategy === 'N-PATTERN' 
                 ? `${data?.nPattern?.type || 'Searching'}` 
                 : 'Momentum'}
            </div>
            <div style={{ fontSize: '0.5rem', color: '#44516d', marginTop: '1px' }}>
               Live Sync ({data?.nPattern?.totalCount || 0})
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
              activeStrategy={data?.liveStrategy}
            />
          </div>

          {/* Backtest Terminal - Moved up for better visibility */}
          <div className="card" style={{ border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 'bold', color: '#10b981', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ActivityIcon size={16} />
                ترمینال بک‌تست (شنیه‌سازی روی ۱۰۰۰ کندل اخیر)
              </div>
              <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 'normal' }}>
                دقت آنالیز: ۱۰/۱۰
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: '#020617', padding: '1.2rem', borderRadius: '16px', border: '1px solid #1e293b' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>انتخاب استراتژی معاملاتی:</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    value={selectedStrategy} 
                    onChange={e => setSelectedStrategy(e.target.value)}
                    style={{ flex: 2, padding: '12px', borderRadius: '10px', background: '#1e293b', color: 'white', border: '1px solid #334155', cursor: 'pointer', fontSize: '0.9rem' }}
                  >
                    <option value="N-PATTERN">الگوی N کلاسیک (N-Pattern)</option>
                    <option value="FIB-38">فیبوناچی ۳۸٪ (Fibonacci)</option>
                    <option value="STRATEGY_3">استراتژی فراز (Fib+CRSI)</option>
                    <option value="STRATEGY_4">استراتژی چهارم (ساید)</option>
                  </select>
                  
                  {selectedStrategy === 'STRATEGY_3' && (
                    <select 
                      value={data?.strategyConfig?.strategy3Strictness || 'medium'} 
                      onChange={(e) => updateStrategyConfig({ strategy3Strictness: e.target.value })}
                      style={{ flex: 1, padding: '12px', borderRadius: '10px', background: '#0f172a', border: '1px solid #f59e0b', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                      <option value="low">سخت‌گیری کم</option>
                      <option value="medium">متوسط</option>
                      <option value="high">سخت‌گیرانه</option>
                    </select>
                  )}
                </div>
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

      {showStrategySettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '20px' }}>
          <div className="card" style={{ maxWidth: '450px', width: '100%', border: '1px solid #1e293b', animation: 'scaleUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>تنظیمات تخصصی استراتژی ⚙️</h2>
              <button onClick={() => setShowStrategySettings(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ borderBottom: '1px solid #1e293b', pb: '12px', mb: '4px' } as any}>
                <h3 style={{ fontSize: '0.85rem', color: '#10b981', marginBottom: '10px' }}>میانگین روند (Trend SMA)</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '80px' }}>دوره SMA:</span>
                  <input 
                    type="range" min="20" max="300" step="10"
                    value={data?.strategyConfig?.smaPeriod || 100}
                    onChange={(e) => updateStrategyConfig({ smaPeriod: parseInt(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: '0.8rem', width: '30px' }}>{data?.strategyConfig?.smaPeriod || 100}</span>
                </div>
              </div>

              <div style={{ borderBottom: '1px solid #1e293b', pb: '12px', mb: '4px' } as any}>
                <h3 style={{ fontSize: '0.85rem', color: '#3b82f6', marginBottom: '10px' }}>پارامترهای الگوی N</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '80px' }}>اصلاح (C):</span>
                    <input 
                      type="range" min="0.1" max="0.6" step="0.05"
                      value={data?.strategyConfig?.nMinPullback || 0.30}
                      onChange={(e) => updateStrategyConfig({ nMinPullback: parseFloat(e.target.value) })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '0.8rem', width: '40px' }}>{(data?.strategyConfig?.nMinPullback * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '80px' }}>تایید برگشت:</span>
                    <input 
                      type="range" min="0.005" max="0.05" step="0.005"
                      value={data?.strategyConfig?.nReversalThreshold || 0.02}
                      onChange={(e) => updateStrategyConfig({ nReversalThreshold: parseFloat(e.target.value) })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '0.8rem', width: '40px' }}>{(data?.strategyConfig?.nReversalThreshold * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div style={{ pb: '12px', mb: '4px' } as any}>
                <h3 style={{ fontSize: '0.85rem', color: '#f59e0b', marginBottom: '10px' }}>پارامترهای استراتژی فراز (Fib + CRSI)</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '120px' }}>سخت‌گیری (Strictness):</span>
                    <select 
                      value={data?.strategyConfig?.strategy3Strictness || 'medium'} 
                      onChange={(e) => updateStrategyConfig({ strategy3Strictness: e.target.value })}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '6px', background: '#1e293b', border: '1px solid #10b981', color: 'white', fontSize: '0.8rem' }}
                    >
                      <option value="low">کم (بدون فیلتر شداید)</option>
                      <option value="medium">متوسط (استاندارد)</option>
                      <option value="high">زیاد (نقاط فوق‌اشباع)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '100px' }}>Lookback:</span>
                    <input 
                      type="range" min="30" max="150" step="10"
                      value={data?.strategyConfig?.fibLookback || 60}
                      onChange={(e) => updateStrategyConfig({ fibLookback: parseInt(e.target.value) })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '0.8rem', width: '30px' }}>{data?.strategyConfig?.fibLookback || 60}</span>
                  </div>
                </div>
              </div>

              <button className="btn btn-primary" onClick={() => setShowStrategySettings(false)} style={{ marginTop: '10px' }}>
                ذخیره و بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {showBaleSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>⚙️ تنظیمات ربات</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '5px' }}>
                <h3 style={{ fontSize: '0.9rem', color: '#10b981', marginBottom: '10px' }}>🔔 تنظیمات بله</h3>
                <div style={{ marginBottom: '10px' }}>
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
                <h3 style={{ fontSize: '0.85rem', color: '#3b82f6', marginBottom: '8px' }}>📡 تنظیمات API بیت‌کوین (BTC)</h3>
                <div style={{ marginBottom: '8px' }}>
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
