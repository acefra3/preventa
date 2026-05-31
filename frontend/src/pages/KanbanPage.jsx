import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import toast from 'react-hot-toast';

const COLUMNS = [
  { status: 'pendiente',             label: 'Pendiente',         color: '#6B7280', bg: '#F3F4F6' },
  { status: 'en-progreso',           label: 'En progreso',       color: '#185FA5', bg: '#EFF6FF' },
  { status: 'entregada-revision',    label: 'Entregada',         color: '#1D9E75', bg: '#ECFDF5' },
  { status: 'revision-1',            label: 'Revisión / Ajuste', color: '#854F0B', bg: '#FFFBEB' },
  { status: 'concluida',             label: 'Concluida',         color: '#3B6D11', bg: '#F0FDF4' },
];

// Qué transiciones están permitidas por rol
const ALLOWED_TRANSITIONS = {
  admin: {
    // Admin puede mover en cualquier dirección, incluyendo retroceder estados
    'pendiente':          ['en-progreso'],
    'en-progreso':        ['pendiente', 'entregada-revision'],
    'entregada-revision': ['pendiente', 'en-progreso', 'revision-1', 'concluida'],
    'revision-1':         ['en-progreso', 'entregada-revision'],
    'concluida':          ['entregada-revision'],
  },
  preventa: {
    // Preventa solo puede: pendiente→en-progreso y en-progreso→pendiente
    'pendiente':   ['en-progreso'],
    'en-progreso': ['pendiente'],
    'revision-1':  [],
    'concluida':   [],
  },
  comercial: {
    // Comercial solo actúa sobre propuestas entregadas
    'entregada-revision': ['revision-1', 'concluida'],
    'concluida':          [],
  },
};

const PRIO_CLS = {
  critica: 'bg-red-100 text-red-700',
  alta:    'bg-amber-100 text-amber-700',
  media:   'bg-blue-100 text-blue-700',
  baja:    'bg-green-100 text-green-700',
};

// Mapear status de columna kanban (agrupado) al status real de la propuesta
function resolveDropStatus(targetColStatus, proposal, role) {
  // Para revisión, preventa solo puede volver a en-progreso
  if (targetColStatus === 'revision-1') {
    if (role === 'comercial') return 'revision-1';
    return null; // preventa no puede mover a revisión
  }
  return targetColStatus;
}

// Qué columna kanban muestra una propuesta
function getColStatus(propStatus) {
  if (['revision-1','ajuste-1','revision-2','ajuste-2'].includes(propStatus)) return 'revision-1';
  if (['entregada-revision','entregada-revision-2'].includes(propStatus)) return 'entregada-revision';
  return propStatus;
}

export default function KanbanPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [dragging, setDragging] = useState(null);      // { id, status }
  const [overCol, setOverCol]   = useState(null);      // column status being hovered
  const [overCard, setOverCard] = useState(null);      // card id being hovered
  const dragCounter             = useRef({});           // per-column enter counter

  // Modal de avance
  const [progressModal, setProgressModal] = useState(null); // proposal
  const [pctValue, setPctValue]           = useState(0);
  const [phaseNote, setPhaseNote]         = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', 'kanban'],
    queryFn: () => api.get('/proposals?limit=100').then(r => r.data),
  });

  const moveMut = useMutation({
    mutationFn: ({ id, status, progressPct }) =>
      api.patch(`/proposals/${id}/progress`, { status, progressPct }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['proposals']);
      toast.success('Propuesta movida a: ' + COLUMNS.find(c => c.status === vars.status)?.label);
    },
    onError: e => toast.error(e.response?.data?.error || 'Movimiento no permitido'),
  });

  const progressMut = useMutation({
    mutationFn: ({ id, progressPct }) =>
      api.patch(`/proposals/${id}/progress`, { progressPct }),
    onSuccess: () => {
      qc.invalidateQueries(['proposals']);
      setProgressModal(null);
      toast.success('Avance actualizado');
    },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const proposals = data?.proposals || [];
  const role = user?.role || 'comercial';
  const allowed = ALLOWED_TRANSITIONS[role] || {};

  // ── Drag handlers ────────────────────────────────────────────
  function onDragStart(e, proposal) {
    setDragging({ id: proposal.id, status: proposal.status });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', proposal.id);
  }

  function onDragEnd() {
    setDragging(null);
    setOverCol(null);
    setOverCard(null);
    dragCounter.current = {};
  }

  function onDragEnterCol(e, colStatus) {
    e.preventDefault();
    dragCounter.current[colStatus] = (dragCounter.current[colStatus] || 0) + 1;
    setOverCol(colStatus);
  }

  function onDragLeaveCol(e, colStatus) {
    dragCounter.current[colStatus] = (dragCounter.current[colStatus] || 0) - 1;
    if (dragCounter.current[colStatus] <= 0) {
      dragCounter.current[colStatus] = 0;
      if (overCol === colStatus) setOverCol(null);
    }
  }

  function onDragOverCol(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e, targetColStatus) {
    e.preventDefault();
    setOverCol(null);
    dragCounter.current = {};

    if (!dragging) return;

    const srcColStatus = getColStatus(dragging.status);
    if (srcColStatus === targetColStatus) return;

    const allowedTargets = allowed[srcColStatus] || [];
    if (!allowedTargets.includes(targetColStatus)) {
      toast.error('No puedes mover a ese estado desde aquí');
      return;
    }

    const proposal = proposals.find(p => p.id === dragging.id);
    if (!proposal) return;

    // Si se mueve a "en-progreso" o "entregada", ajustar pct automáticamente
    let autoPct = Number(proposal.progress_pct);
    if (targetColStatus === 'entregada-revision') autoPct = 100;
    if (targetColStatus === 'concluida')          autoPct = 100;

    moveMut.mutate({ id: dragging.id, status: targetColStatus, progressPct: autoPct });
    setDragging(null);
  }

  function openProgress(proposal) {
    setPctValue(Number(proposal.progress_pct));
    setPhaseNote('');
    setProgressModal(proposal);
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400">Cargando…</div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Kanban — ciclo de vida</h1>
        <p className="text-xs text-gray-400">
          Arrastra las tarjetas entre columnas para cambiar el estado
        </p>
      </div>

      {/* KANBAN BOARD */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const cards = proposals.filter(p => getColStatus(p.status) === col.status);
          const isOver = overCol === col.status && dragging;
          const srcAllowed = dragging
            ? (allowed[getColStatus(dragging.status)] || []).includes(col.status)
            : false;
          const isDragSource = dragging
            ? getColStatus(dragging.status) === col.status
            : false;

          return (
            <div
              key={col.status}
              className="flex-shrink-0 w-56 flex flex-col"
              onDragEnter={e => onDragEnterCol(e, col.status)}
              onDragLeave={e => onDragLeaveCol(e, col.status)}
              onDragOver={onDragOverCol}
              onDrop={e => onDrop(e, col.status)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: col.color }} />
                  <span className="text-xs font-medium text-gray-700">{col.label}</span>
                </div>
                <span className="text-xs bg-white border border-gray-200 rounded-full px-1.5 py-0.5 text-gray-500">
                  {cards.length}
                </span>
              </div>

              {/* Drop zone */}
              <div
                className="flex-1 rounded-xl p-2 min-h-[400px] transition-all duration-150"
                style={{
                  background: isOver && srcAllowed
                    ? col.bg
                    : dragging && !isDragSource && !srcAllowed
                      ? '#FEF2F2'
                      : col.bg,
                  border: isOver && srcAllowed
                    ? `2px dashed ${col.color}`
                    : '2px dashed transparent',
                }}
              >
                {/* Drop hint */}
                {isOver && srcAllowed && (
                  <div className="mb-2 text-center py-2 rounded-lg text-xs font-medium"
                    style={{ color: col.color, background: col.bg }}>
                    Soltar aquí →
                  </div>
                )}
                {isOver && !srcAllowed && dragging && (
                  <div className="mb-2 text-center py-2 rounded-lg text-xs text-red-600 bg-red-50">
                    No permitido
                  </div>
                )}

                {cards.length === 0 && !dragging && (
                  <div className="text-center py-8 text-xs text-gray-300">Sin propuestas</div>
                )}

                {/* Cards */}
                {cards.map(p => {
                  const pct     = Number(p.progress_pct);
                  const barColor = pct >= 80 ? '#1D9E75' : pct >= 50 ? '#185FA5' : '#EF9F27';
                  const isDraggingThis = dragging?.id === p.id;

                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={e => onDragStart(e, p)}
                      onDragEnd={onDragEnd}
                      className="bg-white border border-gray-200 rounded-lg p-2.5 mb-2 select-none transition-all"
                      style={{
                        opacity:   isDraggingThis ? 0.4 : 1,
                        cursor:    'grab',
                        boxShadow: isDraggingThis ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      {/* Card content */}
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <div className="text-xs font-medium text-gray-900 leading-tight line-clamp-2 flex-1">
                          {p.name}
                        </div>
                        <span className={`badge text-xs flex-shrink-0 ${PRIO_CLS[p.priority]}`}>
                          {p.priority}
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 font-medium mb-1 truncate">{p.client_name}</div>

                      {/* Comercial y Preventa */}
                      <div className="flex flex-col gap-0.5 mb-2 pb-2 border-b border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 w-14 flex-shrink-0">Comercial</span>
                          <span className="text-xs text-gray-600 truncate font-medium">
                            {p.commercial_name
                              ? p.commercial_name.split(' ').slice(0,2).join(' ')
                              : <span className="text-gray-300">—</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 w-14 flex-shrink-0">Preventa</span>
                          {p.assigned_name ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                                style={{ background:'#E6F1FB', color:'#0C447C', fontSize:'9px' }}>
                                {p.assigned_initials || p.assigned_name.charAt(0)}
                              </div>
                              <span className="text-xs text-gray-600 truncate font-medium">
                                {p.assigned_name.split(' ').slice(0,2).join(' ')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-red-400 font-medium">Sin asignar</span>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: barColor }}>{pct}%</span>
                        <span className="text-xs text-gray-400">{p.end_date?.slice(0,10)}</span>
                      </div>

                      {/* Footer actions */}
                      <div className="flex items-center gap-1 pt-1.5 border-t border-gray-100">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/proposals/${p.id}`); }}
                          className="flex-1 text-xs text-bt-blue hover:underline text-left">
                          Ver detalle
                        </button>
                        {(role === 'preventa' || role === 'admin') &&
                          p.status === 'en-progreso' && (
                          <button
                            onClick={e => { e.stopPropagation(); openProgress(p); }}
                            className="text-xs bg-bt-blue-light text-bt-blue px-2 py-0.5 rounded hover:bg-blue-200 transition-colors">
                            % Avance
                          </button>
                        )}
                        {p.iteration_count > 0 && (
                          <span className="text-xs text-amber-600 font-medium">
                            {p.iteration_count}/2 rev
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda de transiciones */}
      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs font-medium text-gray-500 mb-1">
          Movimientos permitidos para tu rol ({role}):
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(allowed).map(([from, tos]) =>
            tos.map(to => (
              <span key={from+to} className="text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-full text-gray-500">
                {COLUMNS.find(c=>c.status===from)?.label} → {COLUMNS.find(c=>c.status===to)?.label}
              </span>
            ))
          )}
        </div>
      </div>

      {/* MODAL: Actualizar % avance */}
      {progressModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setProgressModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-medium mb-1">Actualizar avance</h2>
            <p className="text-xs text-gray-500 mb-4">
              {progressModal.name} — {progressModal.client_name}
            </p>

            {/* Fases sugeridas */}
            <p className="text-xs font-medium text-gray-600 mb-2">Fases de referencia:</p>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {[
                { pct: 10, label: 'Kickoff / Inicio' },
                { pct: 25, label: 'Diagnóstico' },
                { pct: 40, label: 'Propuesta borrador' },
                { pct: 60, label: 'Revisión interna' },
                { pct: 75, label: 'Ajustes finales' },
                { pct: 90, label: 'Revisión cliente' },
                { pct: 100, label: 'Listo para entregar' },
              ].map(phase => (
                <button key={phase.pct}
                  onClick={() => setPctValue(phase.pct)}
                  className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-all
                    ${pctValue === phase.pct
                      ? 'border-bt-blue bg-bt-blue-light text-bt-blue font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                  <span className="font-semibold">{phase.pct}%</span>
                  <span className="ml-1.5 text-gray-400">{phase.label}</span>
                </button>
              ))}
            </div>

            {/* Slider manual */}
            <p className="text-xs font-medium text-gray-600 mb-1">O ajusta manualmente:</p>
            <div className="flex items-center gap-3 mb-4">
              <input type="range" min={0} max={100} step={5}
                value={pctValue}
                onChange={e => setPctValue(Number(e.target.value))}
                className="flex-1" />
              <span className="text-lg font-medium w-12 text-right"
                style={{ color: pctValue>=80?'#1D9E75':pctValue>=50?'#185FA5':'#EF9F27' }}>
                {pctValue}%
              </span>
            </div>

            {/* Barra de preview */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${pctValue}%`,
                  background: pctValue>=80?'#1D9E75':pctValue>=50?'#185FA5':'#EF9F27'
                }} />
            </div>

            <textarea className="input text-xs mb-4 h-16"
              placeholder="Nota opcional sobre el avance…"
              value={phaseNote}
              onChange={e => setPhaseNote(e.target.value)} />

            <div className="flex gap-2">
              <button onClick={() => setProgressModal(null)}
                className="btn btn-secondary flex-1 justify-center text-xs">
                Cancelar
              </button>
              <button
                onClick={() => progressMut.mutate({ id: progressModal.id, progressPct: pctValue })}
                disabled={progressMut.isLoading}
                className="btn btn-primary flex-1 justify-center text-xs">
                {progressMut.isLoading ? 'Guardando…' : 'Guardar avance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
