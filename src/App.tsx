import React, { useEffect, useRef, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Simple SVG Icons to avoid heavy lucide-react dependency
const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);
const PlayIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
);
const SquareIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
);
const TrendingUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
);
const TrendingDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
);
const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

declare global {
  interface Window {
    LightweightCharts: any;
  }
}

export default function App() {
  const [data, setData] = useState<any>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [refreshToken, setRefreshToken] = useState('');
  const [accountType, setAccountType] = useState('demo');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleSetToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refreshToken) return;
    
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/auth/set-refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, type: accountType })
      });
      const result = await res.json();
      if (result.success) {
        setShowAuth(false);
        setRefreshToken('');
        setStatusMsg({ text: 'Authentication successful! Connection restarting...', type: 'success' });
      } else {
        setStatusMsg({ text: result.error || 'Failed to authenticate', type: 'error' });
      }
    } catch (e) {
      setStatusMsg({ text: 'Error connecting to server', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'INIT' || msg.type === 'UPDATE') {
            setData(msg.data);
          }
        } catch (e) {
          console.error("WS Parse Error:", e);
        }
      };
    } catch (e) {
      console.error("WS Connection Error:", e);
    }

    return () => ws?.close();
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const { createChart, ColorType } = window.LightweightCharts;
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#0f172a' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: '#1e293b' },
          horzLines: { color: '#1e293b' },
        },
        width: chartContainerRef.current.clientWidth,
        height: window.innerWidth < 768 ? 350 : 500,
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      const handleResize = () => {
        chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    } catch (e) {
      console.error("Chart Init Error:", e);
    }
  }, []);

  useEffect(() => {
    if (data?.candles && candleSeriesRef.current) {
      try {
        // Ensure data is sorted and has no duplicate times
        const sortedCandles = [...data.candles].sort((a, b) => a.time - b.time);
        const uniqueCandles = sortedCandles.filter((c, i, arr) => i === 0 || c.time > arr[i-1].time);
        
        candleSeriesRef.current.setData(uniqueCandles);
        
        // Add markers for levels
        if (data.levels) {
          const markers = data.levels
            .filter((l: any) => l.time / 1000 <= uniqueCandles[uniqueCandles.length - 1]?.time)
            .map((l: any) => ({
              time: l.time / 1000,
              position: l.type === 'RESISTANCE' ? 'aboveBar' : 'belowBar',
              color: l.type === 'RESISTANCE' ? '#f43f5e' : '#3b82f6',
              shape: l.type === 'RESISTANCE' ? 'arrowDown' : 'arrowUp',
              text: l.type === 'RESISTANCE' ? 'Sقف' : 'Kف',
            }));
          candleSeriesRef.current.setMarkers(markers);
        }
      } catch (e) {
        console.error("Chart Data Update Error:", e);
      }
    }
  }, [data]);

  const toggleRecording = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: data?.isRecording ? 'STOP_RECORDING' : 'START_RECORDING'
      }));
    }
  };

  const setTimeframe = (tf: string) => {
    console.log(`[Client] Requesting timeframe change to: ${tf}`);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SET_TIMEFRAME',
        timeframe: tf
      }));
    } else {
      console.warn("[Client] WS not connected, cannot change timeframe");
    }
  };

  const timeframes = [
    { label: '1m', value: '1' },
    { label: '2m', value: '2' },
    { label: '3m', value: '3' },
    { label: '4m', value: '4' },
    { label: '5m', value: '5' },
    { label: '10m', value: '10' },
    { label: '15m', value: '15' },
    { label: '1h', value: '60' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30" dir="rtl">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-auto py-4 md:h-16 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <ActivityIcon className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight">فرازگلد لایو</h1>
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full animate-pulse", wsConnected ? "bg-emerald-500" : "bg-rose-500")} />
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    {wsConnected ? "متصل" : "قطع شده"}
                  </span>
                </div>
              </div>
            </div>

            <div className="md:hidden flex flex-col items-end">
              <span className="text-[10px] text-slate-500 font-medium uppercase">قیمت</span>
              <span className="text-lg font-mono font-bold text-emerald-400">
                {data?.price?.toLocaleString() || '0'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <div className="hidden md:flex flex-col items-start ml-4">
              <span className="text-xs text-slate-500 font-medium">قیمت لحظه‌ای</span>
              <span className="text-xl font-mono font-bold text-emerald-400">
                {data?.price?.toLocaleString() || '0'}
              </span>
            </div>
            
            <button
              onClick={() => setShowAuth(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-all active:scale-95 text-sm whitespace-nowrap"
            >
              احراز هویت
            </button>

            <button
              onClick={toggleRecording}
              className={cn(
                "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all active:scale-95 text-sm whitespace-nowrap",
                data?.isRecording 
                  ? "bg-rose-500 text-white shadow-rose-500/20" 
                  : "bg-emerald-500 text-white shadow-emerald-500/20"
              )}
            >
              {data?.isRecording ? <SquareIcon className="w-3 h-3 fill-current" /> : <PlayIcon className="w-3 h-3 fill-current" />}
              {data?.isRecording ? "توقف" : "ضبط"}
            </button>
          </div>
        </div>
      </header>

      {/* Auth Modal */}
      {showAuth && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">احراز هویت</h2>
              <button onClick={() => setShowAuth(false)} className="text-slate-500 hover:text-white">
                <SquareIcon className="w-6 h-6 rotate-45" />
              </button>
            </div>

            {statusMsg && (
              <div className={cn(
                "p-4 rounded-xl text-sm font-medium",
                statusMsg.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              )}>
                {statusMsg.text}
              </div>
            )}

            <form onSubmit={handleSetToken} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">نوع حساب</label>
                <select 
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  <option value="demo">حساب دمو (آزمایشی)</option>
                  <option value="real">حساب واقعی</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">توکن رفرش (Refresh Token)</label>
                <textarea 
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none min-h-[120px] font-mono text-xs text-left"
                  dir="ltr"
                  placeholder="توکن رفرش خود را اینجا وارد کنید..."
                  required
                />
                <p className="text-[10px] text-slate-500 mt-2">
                  سیستم به طور خودکار از این توکن برای دسترسی و زنده نگه داشتن اتصال استفاده می‌کند.
                </p>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                {isSubmitting ? "در حال احراز هویت..." : "اتصال"}
              </button>
            </form>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {statusMsg && !showAuth && (
          <div className={cn(
            "p-4 rounded-2xl text-sm font-medium flex items-center justify-between",
            statusMsg.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          )}>
            {statusMsg.text}
            <button onClick={() => setStatusMsg(null)} className="text-slate-500 hover:text-white">
              <Square className="w-4 h-4 rotate-45 fill-current" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-slate-900/50 border border-slate-800 p-4 md:p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
              <div className="p-1.5 md:p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <TrendingUpIcon className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <h3 className="text-[10px] md:text-sm font-medium text-slate-400 uppercase tracking-wider">مقاومت (سقف)</h3>
            </div>
            <p className="text-lg md:text-2xl font-mono font-bold">
              {data?.levels?.filter((l:any) => l.type === 'RESISTANCE').pop()?.price.toLocaleString() || '---'}
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-4 md:p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
              <div className="p-1.5 md:p-2 bg-rose-500/10 rounded-lg text-rose-400">
                <TrendingDownIcon className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <h3 className="text-[10px] md:text-sm font-medium text-slate-400 uppercase tracking-wider">حمایت (کف)</h3>
            </div>
            <p className="text-lg md:text-2xl font-mono font-bold">
              {data?.levels?.filter((l:any) => l.type === 'SUPPORT').pop()?.price.toLocaleString() || '---'}
            </p>
          </div>

          <div className="col-span-2 md:col-span-1 bg-slate-900/50 border border-slate-800 p-4 md:p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
              <div className="p-1.5 md:p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <ClockIcon className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <h3 className="text-[10px] md:text-sm font-medium text-slate-400 uppercase tracking-wider">وضعیت ضبط</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", data?.isRecording ? "bg-emerald-500 animate-pulse" : "bg-slate-600")} />
              <p className="text-sm md:text-lg font-semibold">
                {data?.isRecording ? "در حال ضبط" : "غیرفعال"}
              </p>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between bg-slate-900/80 gap-4">
            <span className="text-sm font-bold text-slate-400 flex items-center gap-2">
              <ActivityIcon className="w-4 h-4" /> مظنه طلا ({data?.timeframe ? (data.timeframe === '60' ? '1h' : `${data.timeframe}m`) : '1m'})
            </span>
            
            <div className="flex overflow-x-auto no-scrollbar gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto" dir="ltr">
              {timeframes.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                    data?.timeframe === tf.value 
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-slate-900"
                  )}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <span className="px-2 py-1 bg-slate-800 rounded text-[10px] font-bold uppercase tracking-tighter">پخش زنده</span>
              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-tighter">لحظه‌ای</span>
            </div>
          </div>
          <div ref={chartContainerRef} className="w-full" />
        </div>

        {/* Info Section */}
        <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-2xl">
          <h2 className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
            💡 نحوه عملکرد
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            این برنامه مستقیماً به فید قیمت لحظه‌ای فرازگلد متصل می‌شود. به طور خودکار کندل‌استیک‌های زمانی را می‌سازد و سطوح کلیدی حمایت و مقاومت را با استفاده از الگوریتم تشخیص اوج و فرود شناسایی می‌کند. برای شروع ذخیره داده‌ها در سرور جهت تحلیل‌های بعدی، روی «ضبط» کلیک کنید.
          </p>
        </div>
      </main>
      
      <footer className="py-8 text-center text-slate-600 text-xs border-t border-slate-900">
        &copy; ۲۰۲۴ موتور چارت فرازگلد &bull; توسعه یافته با دقت بالا
      </footer>
    </div>
  );
}
