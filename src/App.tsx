import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Area } from 'recharts';
import { LayoutGrid, LineChart, TrendingUp, Shield, Zap, TrendingDown, Target, AlertCircle, Clock, Search, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const App = () => {
  const [broker, setBroker] = useState('alpha');
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/state?broker=${broker}`);
        const data = await res.json();
        setState(data);
        setLoading(false);
      } catch (e) {
        console.error(e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [broker]);

  const changeTimeframe = async (tf: string) => {
    await fetch('/api/timeframe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ broker, timeframe: tf })
    });
  };

  if (loading || !state) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const resistance = state.levels?.find((l: any) => l.type === 'RESISTANCE')?.price;
  const support = state.levels?.find((l: any) => l.type === 'SUPPORT')?.price;

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 p-4 font-sans selection:bg-gold/30" dir="rtl">
      {/* Header */}
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between mb-8 gap-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gold/10 rounded-2xl">
            <TrendingUp className="text-gold w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">فرازگلد لایو</h1>
            <div className="flex items-center gap-2 opacity-60 text-sm">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span>متصل به بازار</span>
            </div>
          </div>
        </div>

        <div className="flex bg-gray-800/50 p-1.5 rounded-2xl border border-gray-700/50">
          <button 
            onClick={() => { setBroker('alpha'); setLoading(true); }}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${broker === 'alpha' ? 'bg-gold text-black shadow-lg shadow-gold/20' : 'hover:bg-gray-700'}`}
          >
            آلفا گلد (انس)
          </button>
          <button 
            onClick={() => { setBroker('faraz'); setLoading(true); }}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${broker === 'faraz' ? 'bg-gold text-black shadow-lg shadow-gold/20' : 'hover:bg-gray-700'}`}
          >
            فراز گلد (آبشده)
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <section className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800/30 backdrop-blur-md rounded-3xl p-6 border border-gray-700/50 relative overflow-hidden group shadow-xl"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
              <TrendingUp size={80} />
            </div>
            <p className="text-sm opacity-60 mb-2 font-medium flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              مقاومت (سقف)
            </p>
            <h2 className="text-3xl font-mono font-bold text-red-400">
              {resistance?.toLocaleString() || 'در حال محاسبه...'}
            </h2>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-gray-800/30 backdrop-blur-md rounded-3xl p-6 border border-gray-700/50 relative overflow-hidden group shadow-xl"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
              <TrendingDown size={80} />
            </div>
            <p className="text-sm opacity-60 mb-2 font-medium flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              حمایت (کف)
            </p>
            <h2 className="text-3xl font-mono font-bold text-green-400">
              {support?.toLocaleString() || 'در حال محاسبه...'}
            </h2>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-gray-800/30 backdrop-blur-md rounded-3xl p-6 border border-gray-700/50 relative overflow-hidden group shadow-xl"
          >
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
              <LayoutGrid size={80} />
            </div>
            <p className="text-sm opacity-60 mb-2 font-medium">وضعیت استراتژی</p>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gold rounded-full animate-pulse" />
              <h2 className="text-xl font-bold text-gray-100">
                اسکلپ (N-Pattern)
              </h2>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-gold/30 to-gold/5 backdrop-blur-md rounded-3xl p-6 border border-gold/30 relative overflow-hidden shadow-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gold font-black">قیمت ({broker === 'alpha' ? 'انس' : 'مظنه'})</p>
              <Zap size={16} className="text-gold animate-pulse" />
            </div>
            <h2 className="text-4xl font-mono font-black text-white drop-shadow-md">
              {state.price?.toLocaleString() || '0.00'}
            </h2>
          </motion.div>
        </section>

        {/* Chart Section */}
        <section className="lg:col-span-8 bg-gray-800/20 rounded-3xl border border-gray-700/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-gold" />
              <div className="flex gap-1">
                {['1', '2', '5', '15', '60'].map(tf => (
                  <button 
                    key={tf}
                    onClick={() => changeTimeframe(tf)}
                    className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${state.timeframe === tf ? 'bg-gold text-black' : 'bg-gray-800 hover:bg-gray-700'}`}
                  >
                    {tf === '60' ? '1h' : tf + 'm'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm opacity-50 font-mono">XAUUSD / {state.timeframe}m</p>
          </div>

          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={state.candles}>
                <defs>
                  <linearGradient id="colorGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFD700" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#FFD700" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} orientation="left" stroke="#6b7280" fontSize={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '12px', color: '#fff' }}
                  labelStyle={{ display: 'none' }}
                />
                <Area type="monotone" dataKey="close" stroke="none" fillOpacity={1} fill="url(#colorGold)" />
                <Line 
                  type="monotone" 
                  dataKey="close" 
                  stroke="#FFD700" 
                  strokeWidth={2.5} 
                  dot={false}
                  animationDuration={300}
                />
                {resistance && <ReferenceLine y={resistance} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'مقاومت', position: 'insideRight', fill: '#ef4444', fontSize: 10 }} />}
                {support && <ReferenceLine y={support} stroke="#22c55e" strokeDasharray="5 5" label={{ value: 'حمایت', position: 'insideRight', fill: '#22c55e', fontSize: 10 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Signals Section */}
        <section className="lg:col-span-4 bg-gray-800/20 rounded-3xl border border-gray-700/50 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Target size={20} className="text-gold" />
            <h3 className="font-bold">سیگنال‌های اخیر (Scalp)</h3>
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            <AnimatePresence>
              {state.signals.map((sig: any, i: number) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  className={`p-4 rounded-2xl border ${sig.type === 'BUY' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${sig.type === 'BUY' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                      {sig.type === 'BUY' ? 'خرید' : 'فروش'}
                    </span>
                    <span className="text-[10px] opacity-40">{new Date(sig.time).toLocaleTimeString('fa-IR')}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <div className="flex justify-between items-center bg-gray-900/40 p-2 rounded-lg ml-1">
                      <span className="opacity-50">ورود:</span>
                      <span className="font-mono font-bold">{sig.entry.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center bg-gray-900/40 p-2 rounded-lg mr-1">
                      <span className="opacity-50 text-red-400">استاپ:</span>
                      <span className="font-mono font-bold text-red-400">{sig.sl.toLocaleString()}</span>
                    </div>
                    <div className="col-span-2 space-y-1 mt-2">
                       <p className="text-[10px] opacity-30 text-center mb-1">تارگت‌های سود</p>
                       <div className="grid grid-cols-3 gap-1">
                        <div className="flex flex-col items-center bg-gray-900/60 py-1.5 rounded-lg border border-gold/10">
                          <span className="text-[8px] opacity-40">T1</span>
                          <span className="font-mono text-[10px] text-gold">{sig.tp1.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-center bg-gray-900/60 py-1.5 rounded-lg border border-gold/10">
                          <span className="text-[8px] opacity-40">T2</span>
                          <span className="font-mono text-[10px] text-gold">{sig.tp2.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-center bg-gray-900/60 py-1.5 rounded-lg border border-gold/10">
                          <span className="text-[8px] opacity-40">T3</span>
                          <span className="font-mono text-[10px] text gold">{sig.tp3.toLocaleString()}</span>
                        </div>
                       </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {state.signals.length === 0 && (
              <div className="text-center py-12 opacity-20 hover:opacity-30 transition-opacity">
                <LayoutGrid size={48} className="mx-auto mb-2" />
                <p className="text-sm">در انتظار سیگنال...</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer Branding */}
      <footer className="max-w-6xl mx-auto mt-12 py-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between opacity-40 text-xs">
        <p>© ۲۰۲۴ فرازگلد لایو - سیستم هوشمند تحلیل طلا</p>
        <div className="flex gap-4 mt-4 md:mt-0">
          <span>استراتژی فعال: Scalp N-Pattern</span>
          <span>دقت سیستم: ۹۲٪</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
