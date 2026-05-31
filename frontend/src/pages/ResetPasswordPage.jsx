import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = params.get('token');

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return; }
    if (password.length < 8)  { toast.error('Mínimo 8 caracteres'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Token inválido o expirado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-sm">
        <h1 className="text-xl font-medium mb-1">Nueva contraseña</h1>
        <p className="text-xs text-gray-500 mb-6">Mínimo 8 caracteres.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Nueva contraseña</label>
            <input className="input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirmar contraseña</label>
            <input className="input" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading}
            className="btn btn-primary w-full justify-center">
            {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
