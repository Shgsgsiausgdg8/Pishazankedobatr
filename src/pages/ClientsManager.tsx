import React, { useState, useEffect } from 'react';
import { Users, CheckCircle, XCircle } from 'lucide-react';

export default function ClientsManager() {
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = () => {
    fetch('/api/admin/clients', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
    })
      .then(res => res.json())
      .then(data => setClients(data || []))
      .catch(console.error);
  };

  const approveClient = (id: number) => {
    fetch(`/api/admin/clients/${id}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) fetchClients();
      })
      .catch(console.error);
  };

  return (
    <div className="mt-8 border-t border-slate-700 pt-6">
      <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
        <Users className="w-5 h-5" /> کاربران پنل مانیتور
      </h3>
      
      {clients.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-4 bg-slate-800/50 rounded-lg">کابری یافت نشد</div>
      ) : (
        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
              <div className="flex flex-col">
                <span className="text-sm text-slate-200 font-mono text-left" dir="ltr">{c.username}</span>
                <span className={`text-[10px] mt-1 pr-1 border-r-2 ${c.status === 'active' ? 'text-emerald-400 border-emerald-400' : 'text-amber-400 border-amber-400'}`}>
                  {c.status === 'active' ? 'فعال' : 'در انتظار تایید'}
                </span>
              </div>
              
              {c.status === 'pending' && (
                <button 
                  onClick={() => approveClient(c.id)}
                  className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> تایید 
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
