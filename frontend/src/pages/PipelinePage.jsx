import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const QUARTERS = [
  { key: 'Q1', months: [1,2,3],  label: 'Q1',  period: 'Ene – Mar' },
  { key: 'Q2', months: [4,5,6],  label: 'Q2',  period: 'Abr – Jun' },
  { key: 'Q3', months: [7,8,9],  label: 'Q3',  period: 'Jul – Sep' },
  { key: 'Q4', months: [10,11,12],label: 'Q4', period: 'Oct – Dic' },
];

const STATUS_CLS = {
  'pendiente':            'bg-gray-100 text-gray-600',
  'en-progreso':          'bg-blue-100 text-blue-800',
  'entregada-revision':   'bg-emerald-100 text-emerald-800',
  'revision-1':           'bg-amber-100 text-amber-800',
  'ajuste-1':             'bg-amber-100 text-amber-800',
  'entregada-revision-2': 'bg-emerald-100 text-emerald-800',
  'revision-2':           'bg-amber-100 text-amber-800',
  'ajuste-2':             'bg-amber-100 text-amber-800',
  'concluida':            'bg-green-100 text-green-800',
};
const STATUS_LABEL = {
  'pendiente':'Pendiente','en-progreso':'En progreso',
  'entregada-revision':'Entregada','revision-1':'Rev. 1',
  'ajuste-1':'Ajuste 1','entregada-revision-2':'Entregada v2',
  'revision-2':'Rev. 2','ajuste-2':'Ajuste 2','concluida':'Concluida',
};
const PRIO_CLS = {
  critica:'bg-red-100 text-red-700', alta:'bg-amber-100 text-amber-700',
  media:'bg-blue-100 text-blue-700', baja:'bg-green-100 text-green-700',
};

function getQuarter(dateStr) {
  if (!dateStr) return null;
  const month = new Date(dateStr).getMonth() + 1;
  return QUARTERS.find(q => q.months.includes(month))?.key || null;
}

function getYear(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).getFullYear();
}

// La propuesta se asigna al Q de su fecha de conclusión.
// Si no está concluida, se asigna al Q de su fecha límite (end_date).
function assignQuarter(p) {
  if (p.status === 'concluida' && p.concluded_at) return getQuarter(p.concluded_at);
  return getQuarter(p.end_date);
}

function assignYear(p) {
  if (p.status === 'concluida' && p.concluded_at) return getYear(p.concluded_at);
  return getYear(p.end_date);
}

function ProgressBar({ pct }) {
  const color = pct >= 80 ? '#1D9E75' : pct >= 50 ? '#185FA5' : '#EF9F27';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width:`${pct}%`, background:color }} />
      </div>
      <span className="text-xs text-gray-500 w-7 text-right">{pct}%</span>
    </div>
  );
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQ, setSelectedQ]       = useState(null); // null = todos

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', 'pipeline'],
    queryFn: () => api.get('/proposals?limit=200').then(r => r.data),
  });

  const all = data?.proposals || [];

  // Available years from proposals
  const years = [...new Set(all.map(p => assignYear(p)).filter(Boolean))].sort((a,b)=>b-a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  // Filter by selected year
  const byYear = all.filter(p => assignYear(p) === selectedYear);

  // Group by Q
  const grouped = {};
  QUARTERS.forEach(q => { grouped[q.key] = []; });
  byYear.forEach(p => {
    const q = assignQuarter(p);
    if (q && grouped[q]) grouped[q].push(p);
  });

  // Stats per Q
  function qStats(proposals) {
    const total     = proposals.length;
    const concluidas = proposals.filter(p => p.status === 'concluida').length;
    const avgPct    = total ? Math.round(proposals.reduce((a,p)=>a+Number(p.progress_pct),0)/total) : 0;
    const criticas  = proposals.filter(p => p.priority === 'critica').length;
    return { total, concluidas, avgPct, criticas };
  }

  const displayQ = selectedQ ? [QUARTERS.find(q=>q.key===selectedQ)] : QUARTERS;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400">Cargando…</div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-medium">Pipeline por trimestre</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Las propuestas concluidas se asignan al Q de su fecha de cierre. Las activas, al Q de su fecha límite.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Year selector */}
          <select className="input text-xs py-1.5 w-24"
            value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Q filter pills */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => setSelectedQ(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
            ${!selectedQ ? 'bg-bt-blue text-white border-bt-blue' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
          Todos los trimestres
        </button>
        {QUARTERS.map(q => {
          const cnt = grouped[q.key]?.length || 0;
          return (
            <button key={q.key} onClick={() => setSelectedQ(q.key === selectedQ ? null : q.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5
                ${selectedQ === q.key ? 'bg-bt-blue text-white border-bt-blue'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
              {q.key}
              {cnt > 0 && (
                <span className={`rounded-full w-4 h-4 flex items-center justify-center text-xs
                  ${selectedQ === q.key ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary row — 4 Q cards */}
      {!selectedQ && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {QUARTERS.map(q => {
            const props = grouped[q.key] || [];
            const s = qStats(props);
            const pct = s.total > 0 ? Math.round(s.concluidas/s.total*100) : 0;
            return (
              <button key={q.key} onClick={() => setSelectedQ(q.key)}
                className="card p-4 text-left hover:border-bt-blue transition-colors cursor-pointer group">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900">{q.key}</div>
                    <div className="text-xs text-gray-400">{q.period} {selectedYear}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-medium text-gray-900">{s.total}</div>
                    <div className="text-xs text-gray-400">propuestas</div>
                  </div>
                </div>
                {/* Completion bar */}
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full transition-all"
                    style={{ width:`${pct}%`, background: pct===100?'#1D9E75':pct>50?'#185FA5':'#EF9F27' }} />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{s.concluidas}/{s.total} concluidas</span>
                  {s.criticas > 0 && (
                    <span className="badge bg-red-100 text-red-700">{s.criticas} crítica{s.criticas!==1?'s':''}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail view */}
      {displayQ.map(q => {
        const props = grouped[q.key] || [];
        const s = qStats(props);

        return (
          <div key={q.key} className="mb-6">
            {/* Q Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-bt-blue flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">{q.key}</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {q.key} {selectedYear} — {q.period}
                  </div>
                  <div className="text-xs text-gray-400">
                    {s.total} propuesta{s.total!==1?'s':''} ·{' '}
                    {s.concluidas} concluida{s.concluidas!==1?'s':''} ·{' '}
                    avance promedio {s.avgPct}%
                  </div>
                </div>
              </div>
              {selectedQ && (
                <button onClick={() => setSelectedQ(null)}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-700">
                  ← Ver todos
                </button>
              )}
            </div>

            {props.length === 0 ? (
              <div className="card p-8 text-center text-xs text-gray-400">
                Sin propuestas asignadas a este trimestre para {selectedYear}.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[22%]">Propuesta</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[10%]">Prioridad</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[13%]">Estado</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[13%]">Avance</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[13%]">Comercial</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[13%]">Preventa</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[8%]">
                        {q.key === assignQuarter({end_date: new Date().toISOString()}) ? 'Cierre' : 'Fecha cierre'}
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-[8%]">Concluida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.map(p => {
                      const pct = Number(p.progress_pct);
                      const barColor = pct>=80?'#1D9E75':pct>=50?'#185FA5':'#EF9F27';
                      const isConcluida = p.status === 'concluida';
                      return (
                        <tr key={p.id}
                          className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/proposals/${p.id}`)}>
                          <td className="px-3 py-2.5 overflow-hidden">
                            <div className="font-medium text-xs text-gray-900 truncate">{p.name}</div>
                            <div className="text-xs text-gray-400 truncate">{p.client_name}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`badge ${PRIO_CLS[p.priority]}`}>{p.priority}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`badge ${STATUS_CLS[p.status]||'bg-gray-100 text-gray-600'}`}>
                              {STATUS_LABEL[p.status]||p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <ProgressBar pct={pct} />
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-600 truncate">
                            {p.commercial_name?.split(' ').slice(0,2).join(' ') || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            {p.assigned_name ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                                  style={{ background:'#E6F1FB', color:'#0C447C', fontSize:'9px' }}>
                                  {p.assigned_initials || p.assigned_name.charAt(0)}
                                </div>
                                <span className="text-xs text-gray-600 truncate">
                                  {p.assigned_name.split(' ')[0]}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-red-400">Sin asignar</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-400">
                            {p.end_date?.slice(0,10)}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {isConcluida ? (
                              <span className="text-green-700 font-medium">
                                {p.concluded_at?.slice(0,10)}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Q totals footer */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={3} className="px-3 py-2 text-xs font-medium text-gray-600">
                        Total {q.key}: {s.total} propuesta{s.total!==1?'s':''}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full"
                              style={{ width:`${s.avgPct}%`,
                                background: s.avgPct>=80?'#1D9E75':s.avgPct>=50?'#185FA5':'#EF9F27' }} />
                          </div>
                          <span className="text-xs text-gray-500 font-medium">{s.avgPct}%</span>
                        </div>
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-xs text-gray-500">
                        {s.concluidas}/{s.total} concluidas
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-xs text-gray-400">
                        {s.criticas > 0 && (
                          <span className="badge bg-red-100 text-red-700">
                            {s.criticas} crítica{s.criticas!==1?'s':''}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
