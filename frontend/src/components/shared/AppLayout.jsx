import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import toast from 'react-hot-toast';

const NAV = {
  admin:    [
    { to: '/dashboard', label: 'Dashboard',    icon: '▤' },
    { to: '/proposals', label: 'Propuestas',   icon: '◧' },
    { to: '/kanban',    label: 'Kanban',        icon: '⊞' },
    { to: '/pipeline',  label: 'Pipeline Q',    icon: '◫' },
    { to: '/users',     label: 'Usuarios',      icon: '◉' },
  ],
  preventa: [
    { to: '/dashboard', label: 'Dashboard',    icon: '▤' },
    { to: '/proposals', label: 'Mis propuestas', icon: '◧' },
    { to: '/kanban',    label: 'Kanban',        icon: '⊞' },
    { to: '/pipeline',  label: 'Pipeline Q',    icon: '◫' },
  ],
  comercial: [
    { to: '/dashboard',           label: 'Dashboard',   icon: '▤' },
    { to: '/proposals',           label: 'Propuestas',  icon: '◧' },
    { to: '/pipeline',            label: 'Pipeline Q',  icon: '◫' },
    { to: '/nueva-oportunidad',   label: 'Nueva',       icon: '+' },
  ],
};

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30_000,
  });

  const unread = notifs.filter(n => !n.is_read).length;
  const navItems = NAV[user?.role] || [];

  async function handleLogout() {
    try {
      const { refreshToken } = useAuthStore.getState();
      await api.post('/auth/logout', { refreshToken });
    } catch {}
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="flex items-center h-11 px-4 gap-1">
          <div className="flex items-center gap-2 mr-5 font-medium text-sm">
            <span className="w-2 h-2 rounded-full bg-bt-blue"></span>
            Bluetab Preventa
          </div>
          <nav className="flex flex-1 overflow-x-auto">
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-3 text-xs border-b-2 transition-colors whitespace-nowrap
                  ${isActive
                    ? 'border-bt-blue text-gray-900 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-900'}`
                }>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 ml-auto">
            <button className="relative text-gray-500 hover:text-gray-900"
              onClick={() => toast('Notificaciones — ver panel')}>
              🔔
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-xs rounded-full flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                style={{ background: user?.avatarBg || '#E6F1FB', color: user?.avatarColor || '#0C447C' }}>
                {user?.avatarInitials || '?'}
              </div>
              <span className="text-xs text-gray-600 hidden sm:block">{user?.fullName?.split(' ')[0]}</span>
              <button onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-700 ml-1">
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="p-5">
        <Outlet />
      </main>
    </div>
  );
}
