import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import toast from 'react-hot-toast';

const STATUS_STEPS = [
  { key:'pendiente',            label:'Pendiente' },
  { key:'en-progreso',          label:'En progreso' },
  { key:'entregada-revision',   label:'Entregada' },
  { key:'revision-1',           label:'Rev. 1' },
  { key:'ajuste-1',             label:'Ajuste 1' },
  { key:'entregada-revision-2', label:'Entregada v2' },
  { key:'revision-2',           label:'Rev. 2' },
  { key:'ajuste-2',             label:'Ajuste 2' },
  { key:'concluida',            label:'Concluida' },
];

export default function ProposalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [pct, setPct]             = useState(null);
  const [deliverLink, setDeliverLink] = useState('');
  const [revNote, setRevNote]     = useState('');
  const [adjDate, setAdjDate]     = useState('');
  const [adjNote, setAdjNote]     = useState('');
  const [assignTo, setAssignTo]   = useState('');
  const [editEndDate, setEditEndDate] = useState(false);
  const [newEndDate, setNewEndDate]   = useState('');

  // Proposal data
  const { data: p, isLoading } = useQuery({
    queryKey: ['proposal', id],
    queryFn: () => api.get(`/proposals/${id}`).then(r => r.data),
    onSuccess: d => {
      if (pct === null) setPct(Number(d.progress_pct));
      setAssignTo(d.assigned_to || '');
    },
  });

  // Preventa workload list (only for admin)
  const { data: preventaList = [] } = useQuery({
    queryKey: ['preventa-workload'],
    queryFn: () => api.get('/users/preventa/workload').then(r => r.data),
    enabled: user?.role === 'admin',
  });

  const invalidate = () => {
    qc.invalidateQueries(['proposal', id]);
    qc.invalidateQueries(['proposals']);
  };

  const deliverMut  = useMutation({ mutationFn: () => api.post(`/proposals/${id}/deliver`),
    onSuccess: () => { invalidate(); toast.success('Propuesta marcada como entregada'); },
    onError: e => toast.error(e.response?.data?.error || 'Error') });

  const progressMut = useMutation({ mutationFn: v => api.patch(`/proposals/${id}/progress`, { progressPct: v }),
    onSuccess: () => { invalidate(); toast.success('Avance actualizado'); },
    onError: e => toast.error(e.response?.data?.error || 'Error') });

  const revMut      = useMutation({ mutationFn: () => api.post(`/proposals/${id}/request-revision`, { note: revNote }),
    onSuccess: () => { invalidate(); setRevNote(''); toast.success('Revisión solicitada'); },
    onError: e => toast.error(e.response?.data?.error || 'Error') });

  const acceptMut   = useMutation({ mutationFn: () => api.post(`/proposals/${id}/accept-revision`, { adjustDeadline: adjDate, adjustNote: adjNote }),
    onSuccess: () => { invalidate(); toast.success('Fecha comprometida'); },
    onError: e => toast.error(e.response?.data?.error || 'Error') });

  const concludeMut = useMutation({ mutationFn: () => api.post(`/proposals/${id}/conclude`),
    onSuccess: () => { invalidate(); toast.success('Propuesta concluida'); },
    onError: e => toast.error(e.response?.data?.error || 'Error') });

  const endDateMut  = useMutation({
    mutationFn: () => api.patch(`/proposals/${id}/end-date`, { endDate: newEndDate }),
    onSuccess: () => { invalidate(); setEditEndDate(false); toast.success('Fecha de cierre actualizada'); },
    onError: e => toast.error(e.response?.data?.error || 'Error al actualizar fecha'),
  });

  const assignMut   = useMutation({ mutationFn: () => api.patch(`/proposals/${id}/assign`, { assignedTo: assignTo || null }),
    onSuccess: () => { invalidate(); toast.success('Propuesta asignada correctamente'); },
    onError: e => toast.error(e.response?.data?.error || 'Error al asignar') });

  const addLinkMut  = useMutation({
    mutationFn: () => api.post(`/documents/link/${id}`, {
      externalUrl: deliverLink, description: 'Entregable final', isFinal: true,
    }),
    onSuccess: () => deliverMut.mutate(),
    onError: e => toast.error(e.response?.data?.error || 'Error al registrar enlace'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400">Cargando…</div>
  );
  if (!p) return (
    <div className="flex items-center justify-center h-64 text-sm text-red-500">Propuesta no encontrada.</div>
  );

  const isAdmin     = user?.role === 'admin';
  const isPreventa  = user?.role === 'preventa';
  const isComercial = user?.role === 'comercial';
  const canEdit     = isAdmin || isPreventa;
  const curIdx      = STATUS_STEPS.findIndex(s => s.key === p.status);

  const handleDeliver = () => {
    if (deliverLink.trim()) addLinkMut.mutate();
    else deliverMut.mutate();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => navigate(-1)}
        className="text-xs text-gray-400 hover:text-gray-700 mb-4 flex items-center gap-1">
        ← Volver
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-medium text-gray-900">{p.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{p.client_name} · {p.code}</p>
        </div>
        <span className={`badge text-xs px-2.5 py-1 ${{
          critica:'bg-red-100 text-red-800', alta:'bg-amber-100 text-amber-800',
          media:'bg-blue-100 text-blue-800',  baja:'bg-green-100 text-green-800',
        }[p.priority]}`}>
          {p.priority}
        </span>
      </div>

      {/* Lifecycle stepper */}
      <div className="card p-4 mb-4 overflow-x-auto">
        <div className="flex items-center">
          {STATUS_STEPS.map((s, i) => {
            const done   = i < curIdx;
            const active = i === curIdx;
            return (
              <div key={s.key} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2
                    ${done   ? 'bg-green-100 border-green-600 text-green-700'
                    : active ? 'bg-bt-blue border-bt-blue text-white'
                    :          'bg-white border-gray-200 text-gray-400'}`}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span className={`text-xs whitespace-nowrap
                    ${active ? 'text-bt-blue font-medium' : done ? 'text-green-700' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={`h-0.5 w-6 mx-1 mb-4 flex-shrink-0 ${done ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info + Avance */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Información</h2>
          {[
            ['Comercial',    p.commercial_name],
            ['Asignado a',   p.assigned_name || 'Sin asignar'],
            ['Fecha inicio', p.start_date?.slice(0,10)],
            ['Score BANT',   p.bant_score ? `${p.bant_score}/100` : '—'],
            ['Revisiones',   `${p.iteration_count}/2`],
            ['Tipo',         p.proposal_type || '—'],
            ['Valor est.',   p.estimated_value || '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-xs">
              <span className="text-gray-500">{k}</span>
              <span className="font-medium text-gray-800">{v}</span>
            </div>
          ))}

          {/* Fecha cierre — editable para admin y comercial */}
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100 text-xs">
            <span className="text-gray-500">Fecha cierre</span>
            {editEndDate ? (
              <div className="flex items-center gap-1.5">
                <input type="date" className="input text-xs py-0.5 w-32"
                  value={newEndDate}
                  onChange={e => setNewEndDate(e.target.value)} />
                <button onClick={() => endDateMut.mutate()}
                  disabled={!newEndDate || endDateMut.isLoading}
                  className="text-xs text-green-700 font-medium hover:underline">
                  Guardar
                </button>
                <button onClick={() => setEditEndDate(false)}
                  className="text-xs text-gray-400 hover:underline">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{p.end_date?.slice(0,10)}</span>
                {(isAdmin || isComercial) && p.status !== 'concluida' && (
                  <button
                    onClick={() => { setNewEndDate(p.end_date?.slice(0,10) || ''); setEditEndDate(true); }}
                    className="text-xs text-bt-blue hover:underline">
                    Editar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">Avance</h2>
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl font-medium"
              style={{ color: (pct ?? p.progress_pct) >= 80 ? '#1D9E75' : (pct ?? p.progress_pct) >= 50 ? '#185FA5' : '#EF9F27' }}>
              {pct ?? p.progress_pct}%
            </div>
          </div>
          {canEdit && p.status === 'en-progreso' && (
            <>
              <input type="range" min={0} max={100} step={5}
                value={pct ?? p.progress_pct}
                onChange={e => setPct(Number(e.target.value))}
                className="w-full mb-2" />
              <button onClick={() => progressMut.mutate(pct ?? p.progress_pct)}
                disabled={progressMut.isLoading}
                className="btn btn-primary text-xs w-full justify-center">
                Actualizar avance
              </button>
            </>
          )}

          {/* Documents */}
          {p.documents?.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-gray-500 mb-2">Documentos</h3>
              {p.documents.map(d => (
                <div key={d.id} className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-xs">📎</span>
                  <span className="text-xs text-gray-700 flex-1 truncate">
                    {d.file_name || d.description || 'Documento'}
                  </span>
                  {d.external_url && (
                    <a href={d.external_url} target="_blank" rel="noreferrer"
                      className="text-xs text-bt-blue hover:underline">Abrir</a>
                  )}
                  {d.is_final && <span className="badge bg-green-100 text-green-700 text-xs">Final</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revision history */}
      {p.revisions?.length > 0 && (
        <div className="card p-4 mb-4">
          <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide">
            Historial de revisiones
          </h2>
          {p.revisions.map(r => (
            <div key={r.id} className={`p-3 rounded-lg border mb-2
              ${r.status === 'cerrada' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`badge ${r.status === 'cerrada' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  Revisión #{r.iteration}
                </span>
                <span className="text-xs text-gray-500">
                  {r.requested_by_name} · {r.request_date?.slice(0,10)}
                </span>
                <span className={`ml-auto badge ${r.status === 'cerrada' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  {r.status}
                </span>
              </div>
              <p className="text-xs text-gray-700">{r.request_note}</p>
              {r.adjust_deadline && (
                <p className="text-xs text-gray-500 mt-1">Plazo ajuste: {r.adjust_deadline}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ACTIONS ─────────────────────────────────────────────── */}
      <div className="card p-4 space-y-5">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones disponibles</h2>

        {/* ── ADMIN: Asignar a preventa (siempre visible para admin) ── */}
        {isAdmin && p.status !== 'concluida' && (
          <div className="pb-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-purple-100 flex items-center justify-center text-purple-700 text-xs">A</span>
              Asignar propuesta a preventa
            </p>
            {preventaList.length === 0 ? (
              <p className="text-xs text-gray-400">Cargando equipo preventa…</p>
            ) : (
              <>
                <div className="space-y-1.5 mb-3">
                  {/* Opción sin asignar */}
                  <label className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all
                    ${!assignTo ? 'border-gray-400 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input type="radio" name="assignTo" value=""
                      checked={!assignTo}
                      onChange={() => setAssignTo('')}
                      className="flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-xs font-medium text-gray-600">Sin asignar</span>
                    </div>
                  </label>
                  {/* Opciones de preventa con carga */}
                  {preventaList.map(u => (
                    <label key={u.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all
                      ${assignTo === u.id ? 'border-bt-blue bg-bt-blue-light' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="assignTo" value={u.id}
                        checked={assignTo === u.id}
                        onChange={() => setAssignTo(u.id)}
                        className="flex-shrink-0" />
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                        style={{ background: u.avatar_bg || '#E6F1FB', color: u.avatar_color || '#0C447C' }}>
                        {u.avatar_initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{u.full_name}</div>
                        <div className="text-xs text-gray-400">{u.active_count} propuesta{u.active_count !== 1 ? 's' : ''} activa{u.active_count !== 1 ? 's' : ''}</div>
                      </div>
                      {/* Ocupación */}
                      <div className="flex-shrink-0 w-20">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Number(u.active_count) * 33)}%`,
                              background: Number(u.active_count) >= 3 ? '#E24B4A' : Number(u.active_count) >= 2 ? '#EF9F27' : '#1D9E75'
                            }} />
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 text-right">
                          {Math.min(100, Number(u.active_count) * 33)}% carga
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={() => assignMut.mutate()}
                  disabled={assignMut.isLoading}
                  className="btn btn-primary text-xs">
                  {assignMut.isLoading ? 'Asignando…' : '✓ Confirmar asignación'}
                </button>
                {p.assigned_name && (
                  <span className="text-xs text-gray-400 ml-3">
                    Actualmente: {p.assigned_name}
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* ── PREVENTA: Actualizar avance y marcar como entregada ── */}
        {canEdit && p.status === 'en-progreso' && (
          <div className="pb-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-700 mb-2">Marcar como entregada</p>
            <input className="input text-xs mb-2" value={deliverLink}
              onChange={e => setDeliverLink(e.target.value)}
              placeholder="Enlace Drive / SharePoint del entregable final (opcional)" />
            <button onClick={handleDeliver}
              disabled={deliverMut.isLoading || addLinkMut.isLoading}
              className="btn btn-success text-xs">
              ✓ Marcar como entregada
            </button>
          </div>
        )}

        {/* ── PREVENTA: Aceptar revisión ── */}
        {canEdit && (p.status === 'revision-1' || p.status === 'revision-2') && (
          <div className="pb-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-700 mb-2">Comprometer fecha de ajuste</p>
            <input type="date" className="input text-xs mb-2"
              value={adjDate} onChange={e => setAdjDate(e.target.value)} />
            <textarea className="input text-xs mb-2 h-16" value={adjNote}
              onChange={e => setAdjNote(e.target.value)}
              placeholder="Describe qué ajustes realizarás…" />
            <button onClick={() => acceptMut.mutate()}
              disabled={acceptMut.isLoading || !adjDate}
              className="btn btn-warn text-xs">
              📅 Comprometer fecha
            </button>
          </div>
        )}

        {/* ── COMERCIAL: Solicitar revisión ── */}
        {(isComercial || isAdmin) &&
          ['entregada-revision', 'entregada-revision-2'].includes(p.status) &&
          p.iteration_count < 2 && (
          <div className="pb-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-700 mb-1">
              Solicitar revisión #{Number(p.iteration_count) + 1} de 2
            </p>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">
              ⚠️ Máximo 2 revisiones. Esta sería la #{Number(p.iteration_count) + 1}.
            </div>
            <textarea className="input text-xs mb-2 h-16" value={revNote}
              onChange={e => setRevNote(e.target.value)}
              placeholder="Describe qué debe corregirse o ajustarse…" />
            <div className="flex gap-2">
              <button onClick={() => revMut.mutate()}
                disabled={revMut.isLoading || !revNote.trim()}
                className="btn btn-warn text-xs">
                🔄 Solicitar revisión
              </button>
              <button onClick={() => concludeMut.mutate()}
                disabled={concludeMut.isLoading}
                className="btn btn-success text-xs">
                ✓ Aprobar y concluir
              </button>
            </div>
          </div>
        )}

        {/* ── COMERCIAL: Concluir (2 revisiones agotadas) ── */}
        {(isComercial || isAdmin) &&
          p.status === 'entregada-revision-2' &&
          Number(p.iteration_count) >= 2 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">
              Máximo de revisiones alcanzado. La propuesta debe concluirse.
            </p>
            <button onClick={() => concludeMut.mutate()}
              disabled={concludeMut.isLoading}
              className="btn btn-success text-xs">
              🏁 Concluir propuesta
            </button>
          </div>
        )}

        {/* ── Concluida ── */}
        {p.status === 'concluida' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800">
            ✅ Propuesta concluida exitosamente. {p.final_note}
          </div>
        )}

        {/* ── Pendiente sin acciones de rol ── */}
        {p.status === 'pendiente' && !isAdmin && (
          <p className="text-xs text-gray-400">
            Esta propuesta está pendiente de asignación por el administrador.
          </p>
        )}
      </div>
    </div>
  );
}
