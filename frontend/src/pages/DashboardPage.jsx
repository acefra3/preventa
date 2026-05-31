import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { Link } from 'react-router-dom';

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-medium" style={{ color: color || 'inherit' }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct }) {
  const color = pct >= 80 ? '#1D9E75' : pct >= 50 ? '#185FA5' : '#EF9F27';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

const STATUS_LABEL = {
  'pendiente':            { label: 'Pendiente',     cls: 'bg-gray-100 text-gray-600' },
  'en-progreso':          { label: 'En progreso',   cls: 'bg-blue-100 text-blue-800' },
  'entregada-revision':   { label: 'Entregada',     cls: 'bg-green-100 text-green-800' },
  'revision-1':           { label: 'Revisión 1',    cls: 'bg-amber-100 text-amber-800' },
  'ajuste-1':             { label: 'Ajuste 1',      cls: 'bg-amber-100 text-amber-800' },
  'entregada-revision-2': { label: 'Entregada v2',  cls: 'bg-green-100 text-green-800' },
  'revision-2':           { label: 'Revisión 2',    cls: 'bg-amber-100 text-amber-800' },
  'ajuste-2':             { label: 'Ajuste 2',      cls: 'bg-amber-100 text-amber-800' },
  'concluida':            { label: 'Concluida',     cls: 'bg-emerald-100 text-emerald-800' },
};

const PRIO_LABEL = {
  critica: 'bg-red-100 text-red-800',
  alta:    'bg-amber-100 text-amber-800',
  media:   'bg-blue-100 text-blue-800',
  baja:    'bg-green-100 text-green-800',
};

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['proposals', 'dashboard'],
    queryFn: () => api.get('/proposals?limit=100').then(r => r.data),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      Cargando dashboard…
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500 text-sm">
      Error al cargar datos. Verifica que el backend esté corriendo.
    </div>
  );

  const proposals = data?.proposals || [];
  const active    = proposals.filter(p => p.status !== 'concluida').length;
  const avgPct    = proposals.length
    ? Math.round(proposals.reduce((a, p) => a + Number(p.progress_pct), 0) / proposals.length)
    : 0;
  const inRevision = proposals.filter(p => ['revision-1','revision-2'].includes(p.status)).length;
  const concluded  = proposals.filter(p => p.status === 'concluida').length;

  const pipelineGroups = [
    { label: 'En progreso',   color: '#185FA5', count: proposals.filter(p => p.status === 'en-progreso').length },
    { label: 'Entregadas',    color: '#1D9E75', count: proposals.filter(p => ['entregada-revision','entregada-revision-2'].includes(p.status)).length },
    { label: 'En revisión',   color: '#EF9F27', count: proposals.filter(p => ['revision-1','ajuste-1','revision-2','ajuste-2'].includes(p.status)).length },
    { label: 'Concluidas',    color: '#3B6D11', count: concluded },
    { label: 'Pendientes',    color: '#888780', count: proposals.filter(p => p.status === 'pendiente').length },
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-medium text-gray-900">
          Bienvenido, {user?.fullName?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="Propuestas activas"  value={active}   sub={`de ${proposals.length} total`} />
        <StatCard label="Avance promedio"      value={`${avgPct}%`} sub="todas las propuestas"
          color={avgPct >= 70 ? '#1D9E75' : avgPct >= 40 ? '#185FA5' : '#EF9F27'} />
        <StatCard label="En revisión"          value={inRevision} sub="requieren atención"
          color={inRevision > 0 ? '#854F0B' : undefined} />
        <StatCard label="Concluidas"           value={concluded}  sub="cerradas con éxito"
          color={concluded > 0 ? '#3B6D11' : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Línea de tiempo */}
        <div className="card p-4">
          <h2 className="text-sm font-medium mb-3">Línea de tiempo — avance por propuesta</h2>
          {proposals.length === 0 ? (
            <p className="text-xs text-gray-400">Sin propuestas registradas aún.</p>
          ) : (
            <div className="space-y-3">
              {proposals.slice(0, 7).map(p => (
                <div key={p.id}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-gray-600 truncate max-w-[180px]">{p.client_name}</span>
                    <span className="text-xs text-gray-400">{p.end_date?.slice(0,10)}</span>
                  </div>
                  <ProgressBar pct={Number(p.progress_pct)} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado del pipeline */}
        <div className="card p-4">
          <h2 className="text-sm font-medium mb-3">Estado del pipeline</h2>
          <div className="space-y-2.5">
            {pipelineGroups.map(g => (
              <div key={g.label} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-28 flex-shrink-0">{g.label}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: proposals.length ? `${Math.round(g.count/proposals.length*100)}%` : '0%', background: g.color }} />
                </div>
                <span className="text-xs font-medium w-4 text-right">{g.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de propuestas recientes */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">Propuestas recientes</h2>
        <Link to="/proposals" className="text-xs text-bt-blue hover:underline">Ver todas →</Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Propuesta</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Prioridad</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Estado</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Avance</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Asignado a</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Rev.</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Cierre</th>
            </tr>
          </thead>
          <tbody>
            {proposals.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-xs text-gray-400">
                Sin propuestas. Los comerciales pueden crear oportunidades desde "Nueva oportunidad".
              </td></tr>
            ) : proposals.slice(0, 8).map(p => {
              const st = STATUS_LABEL[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' };
              const pr = PRIO_LABEL[p.priority] || 'bg-gray-100 text-gray-600';
              return (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => window.location.href = `/proposals/${p.id}`}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900 text-xs truncate max-w-[180px]">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.client_name}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`badge ${pr}`}>{p.priority}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2.5 min-w-[100px]">
                    <ProgressBar pct={Number(p.progress_pct)} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-600">
                    {p.assigned_name || <span className="text-gray-400">Sin asignar</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-center">
                    <span className={`font-medium ${Number(p.revision_count) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                      {p.revision_count}/2
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{p.end_date?.slice(0,10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
