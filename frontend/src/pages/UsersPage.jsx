import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const ROLE_CLS = {
  admin:     'bg-purple-100 text-purple-800',
  preventa:  'bg-blue-100 text-blue-800',
  comercial: 'bg-green-100 text-green-800',
};

const PERMISOS = [
  ['Ver todas las propuestas',  '✓', 'Solo asignadas', 'Solo propias'],
  ['Inscribir oportunidades',   '✓', '—',              '✓'],
  ['Actualizar % avance',       '✓', '✓',              '—'],
  ['Gestionar usuarios',        '✓', '—',              '—'],
  ['Asignar propuestas',        '✓', '—',              '—'],
  ['Dashboard completo',        '✓', 'Parcial',        'Parcial'],
];

const EMPTY_FORM = { full_name:'', email:'', role:'comercial', password:'', is_active:true };

export default function UsersPage() {
  const qc = useQueryClient();
  const [modal, setModal]   = useState(null); // null | 'create' | 'edit'
  const [form, setForm]     = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // user id to confirm delete

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setModal('create');
  }

  function openEdit(u) {
    setForm({ full_name: u.full_name, email: u.email, role: u.role, password: '', is_active: u.is_active });
    setEditId(u.id);
    setModal('edit');
  }

  const createMut = useMutation({
    mutationFn: () => api.post('/users/admin/create', {
      fullName: form.full_name, email: form.email,
      role: form.role, password: form.password,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      setModal(null);
      toast.success('Usuario creado correctamente');
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al crear usuario'),
  });

  const editMut = useMutation({
    mutationFn: () => api.patch(`/users/${editId}`, {
      fullName:  form.full_name,
      role:      form.role,
      isActive:  form.is_active,
      ...(form.password ? { password: form.password } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      setModal(null);
      toast.success('Usuario actualizado');
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['users']);
      setConfirmDel(null);
      toast.success('Usuario eliminado');
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al eliminar'),
  });

  function handleSave() {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error('Nombre y correo son obligatorios'); return;
    }
    if (!form.email.toLowerCase().endsWith('@bluetab.net')) {
      toast.error('Solo se permiten correos @bluetab.net'); return;
    }
    if (modal === 'create' && !form.password) {
      toast.error('La contraseña es obligatoria al crear'); return;
    }
    if (modal === 'create') createMut.mutate();
    else editMut.mutate();
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400">Cargando…</div>
  );

  const userToDelete = confirmDel ? users.find(u => u.id === confirmDel) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Gestión de usuarios</h1>
        <button onClick={openCreate} className="btn btn-primary text-xs">
          + Agregar usuario
        </button>
      </div>

      {/* Users table */}
      <div className="card overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Usuario</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Correo</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Rol</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Estado</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Último acceso</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                      style={{ background: u.avatar_bg || '#E6F1FB', color: u.avatar_color || '#0C447C' }}>
                      {u.avatar_initials || u.full_name?.charAt(0)}
                    </div>
                    <span className="text-xs font-medium text-gray-900">{u.full_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{u.email}</td>
                <td className="px-3 py-2.5">
                  <span className={`badge ${ROLE_CLS[u.role]}`}>{u.role}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`badge ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-400">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleDateString('es-CO')
                    : 'Nunca'}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-3">
                    <button onClick={() => openEdit(u)}
                      className="text-xs text-bt-blue hover:underline">
                      Editar
                    </button>
                    <button onClick={() => setConfirmDel(u.id)}
                      className="text-xs text-red-500 hover:underline">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permissions table */}
      <h2 className="text-sm font-medium mb-2">Permisos por rol</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-gray-500 font-medium">Función</th>
              <th className="px-3 py-2 text-center"><span className={`badge ${ROLE_CLS.admin}`}>Admin</span></th>
              <th className="px-3 py-2 text-center"><span className={`badge ${ROLE_CLS.preventa}`}>Preventa</span></th>
              <th className="px-3 py-2 text-center"><span className={`badge ${ROLE_CLS.comercial}`}>Comercial</span></th>
            </tr>
          </thead>
          <tbody>
            {PERMISOS.map(([fn, a, p, c]) => (
              <tr key={fn} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2 text-gray-600">{fn}</td>
                {[a, p, c].map((v, i) => (
                  <td key={i} className="px-3 py-2 text-center font-medium"
                    style={{ color: v==='✓'?'#3B6D11':v==='—'?'#D1D5DB':'#854F0B' }}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── MODAL: Create / Edit ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-medium mb-4">
              {modal === 'create' ? 'Agregar usuario' : 'Editar usuario'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="label">Nombre completo <span className="text-red-500">*</span></label>
                <input className="input" placeholder="Nombre Apellido"
                  value={form.full_name}
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">
                  Correo corporativo <span className="text-red-500">*</span>
                  {modal === 'edit' && <span className="text-gray-400 font-normal ml-1">(no editable)</span>}
                </label>
                <input className="input" type="email" placeholder="nombre@bluetab.net"
                  value={form.email}
                  disabled={modal === 'edit'}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Rol <span className="text-red-500">*</span></label>
                <select className="input" value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="comercial">Comercial</option>
                  <option value="preventa">Preventa</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">
                  {modal === 'create' ? 'Contraseña' : 'Nueva contraseña'}
                  {modal === 'create' && <span className="text-red-500"> *</span>}
                  {modal === 'edit' && <span className="text-gray-400 font-normal ml-1">(dejar vacío para no cambiar)</span>}
                </label>
                <input className="input" type="password" placeholder="Mínimo 8 caracteres"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
              </div>
              {modal === 'edit' && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_active" checked={form.is_active}
                    onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
                  <label htmlFor="is_active" className="text-xs text-gray-700 cursor-pointer">
                    Usuario activo
                  </label>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)}
                className="btn btn-secondary flex-1 justify-center text-xs">
                Cancelar
              </button>
              <button onClick={handleSave}
                disabled={createMut.isLoading || editMut.isLoading}
                className="btn btn-primary flex-1 justify-center text-xs">
                {createMut.isLoading || editMut.isLoading ? 'Guardando…'
                  : modal === 'create' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Confirm delete ── */}
      {confirmDel && userToDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl text-center"
            onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-3">⚠️</div>
            <h2 className="text-base font-medium mb-1">¿Eliminar usuario?</h2>
            <p className="text-xs text-gray-500 mb-4">
              Se eliminará <strong>{userToDelete.full_name}</strong> ({userToDelete.email}).
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)}
                className="btn btn-secondary flex-1 justify-center text-xs">
                Cancelar
              </button>
              <button onClick={() => deleteMut.mutate(confirmDel)}
                disabled={deleteMut.isLoading}
                className="btn btn-danger flex-1 justify-center text-xs">
                {deleteMut.isLoading ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
