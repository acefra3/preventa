import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function RecoveryPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/recovery', { email });
      setSent(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar el correo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-2.5 h-2.5 rounded-full bg-bt-blue"></span>
          <span className="font-medium text-sm">Bluetab Preventa</span>
        </div>
        <h1 className="text-xl font-medium mb-1">Recuperar contraseña</h1>
        <p className="text-xs text-gray-500 mb-6">
          Ingresa tu correo corporativo y te enviaremos un enlace de restablecimiento.
        </p>

        {sent ? (
          <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-sm text-green-800">
            ✓ Si el correo existe en el sistema, recibirás el enlace en unos minutos. Revisa tu bandeja.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Correo corporativo</label>
              <input className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nombre@bluetab.net" required />
            </div>
            <button type="submit" disabled={loading}
              className="btn btn-primary w-full justify-center">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-500 mt-4">
          <Link to="/login" className="text-bt-blue hover:underline">Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
