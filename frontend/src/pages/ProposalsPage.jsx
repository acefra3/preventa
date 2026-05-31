import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';

const STATUS_LABEL = {
  'pendiente':            { label: 'Pendiente',     cls: 'bg-gray-100 text-gray-600' },
  'en-progreso':          { label: 'En progreso',   cls: 'bg-blue-100 text-blue-800' },
  'entregada-revision':   { label: 'Entregada',     cls: 'bg-green-100 text-green-800' },
  'revision-1':           { label: 'Revisión 1',    cls: 'bg-amber-100 text-amber-800' },
  'ajuste-1':             { label: 'Ajuste 1',      cls: 'bg-amber-100 text-amber-800' },
  'entregada-revision-2': { label: 'Entregada v2',  cls: 'bg-green-100 text-green-800' },
  'revision-2':           { label: 'Revisión 2',    cls: 'bg-orange-100 text-orange-800' },
  'ajuste-2':             { label: 'Ajuste 2',      cls: 'bg-orange-100 text-orange-800' },
  'concluida':            { label: 'Concluida',     cls: 'bg-emerald-100 text-emerald-800' },
};
const PRIO_CLS = { critica:'bg-red-100 text-red-800', alta:'bg-amber-100 text-amber-800', media:'bg-blue-100 text-blue-800', baja:'bg-green-100 text-green-800' };

const FILTERS = [
  { key: 'todas',             label: 'Todas' },
  { key: 'pendiente',         label: 'Pendientes' },
  { key: 'en-progreso',       label: 'En progreso' },
  { key: 'entregada-revision',label: 'Entregadas' },
  { key: 'revision-1',        label: 'En revisión' },
  { key: 'concluida',         label: 'Concluidas' },
];

export default function ProposalsPage() {
  const { user } = useAuthStore();
  const [filter, setFilter] = useState('todas');
  const [search, setSearch] = useState('');

  const params = new URLSearchParams({ limit: '100' });
  if (filter !== 'todas') params.set('status', filter);
  if (search) params.set('search', search);

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', filter, search],
    queryFn: () => api.get(`/proposals?${params}`).then(r => r.data),
  });

  const proposals = data?.proposals || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">
          {user?.role === 'preventa' ? 'Mis propuestas' : 'Propuestas'}
        </h1>
        {(user?.role === 'admin' || user?.role === 'comercial') && (
          <Link to="/nueva-oportunidad" className="btn btn-primary text-xs">
            + Nueva oportunidad
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors
              ${filter === f.key
                ? 'bg-bt-blue-light text-bt-blue border-blue-300 font-medium'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
            {f.label}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente o propuesta…"
          className="ml-auto input text-xs w-48" />
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[22%]">Propuesta</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[10%]">Prioridad</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[14%]">Estado</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[14%]">Avance</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[12%]">Asignado</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[9%]">Inicio</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[9%]">Cierre</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[6%]">Rev.</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[6%]">BANT</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-10 text-xs text-gray-400">Cargando…</td></tr>
            ) : proposals.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-xs text-gray-400">
                No hay propuestas que coincidan con el filtro.
              </td></tr>
            ) : proposals.map(p => {
              const st = STATUS_LABEL[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' };
              const pr = PRIO_CLS[p.priority] || 'bg-gray-100 text-gray-600';
              const pct = Number(p.progress_pct);
              const barColor = pct >= 80 ? '#1D9E75' : pct >= 50 ? '#185FA5' : '#EF9F27';
              return (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => window.location.href = `/proposals/${p.id}`}>
                  <td className="px-3 py-2.5 overflow-hidden">
                    <div className="font-medium text-xs text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 truncate">{p.client_name}</div>
                  </td>
                  <td className="px-3 py-2.5"><span className={`badge ${pr}`}>{p.priority}</span></td>
                  <td className="px-3 py-2.5"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width:`${pct}%`, background: barColor }} />
                      </div>
                      <span className="text-xs text-gray-500">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600 truncate">{p.assigned_name || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{p.start_date?.slice(0,10)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{p.end_date?.slice(0,10)}</td>
                  <td className="px-3 py-2.5 text-xs text-center font-medium
                    ${Number(p.revision_count)>0?'text-amber-700':'text-gray-400'}">
                    {p.revision_count}/2
                  </td>
                  <td className="px-3 py-2.5 text-xs font-medium"
                    style={{ color: p.bant_score>=70?'#3B6D11':p.bant_score>=50?'#854F0B':'#A32D2D' }}>
                    {p.bant_score ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
