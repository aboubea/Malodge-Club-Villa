import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';

export function TopBar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 flex items-center justify-between px-5 bg-[#0A0A0B] border-b border-[#242428] shrink-0">
      {/* Search */}
      <div className="relative max-w-xs w-full">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6F]"
        />
        <input
          type="text"
          placeholder="Rechercher..."
          className={cn(
            'w-full h-8 pl-8 pr-3 rounded-lg text-sm',
            'bg-[#111113] border border-[#242428]',
            'text-[#F5F0EB] placeholder:text-[#6B6B6F]',
            'focus:outline-none focus:border-[#C9A96E]/40 focus:ring-1 focus:ring-[#C9A96E]/20',
            'transition-all duration-150',
          )}
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={cn(
              'relative w-8 h-8 rounded-lg flex items-center justify-center',
              'text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#111113]',
              'transition-colors duration-150',
              notificationsOpen && 'text-[#F5F0EB] bg-[#111113]',
            )}
          >
            <Bell size={15} />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#C9A96E]" />
          </button>

          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute right-0 top-10 w-80',
                  'bg-[#111113] border border-[#242428] rounded-xl',
                  'shadow-xl shadow-black/40 z-50',
                )}
              >
                <div className="px-4 py-3 border-b border-[#242428]">
                  <p className="text-sm font-light text-[#F5F0EB]">Notifications</p>
                </div>
                <div className="py-2">
                  {[
                    { title: 'Nouvelle réservation', time: 'il y a 5 min', color: 'bg-[#C9A96E]' },
                    { title: 'Service confirmé', time: 'il y a 1h', color: 'bg-green-500' },
                    { title: 'Paiement reçu', time: 'il y a 3h', color: 'bg-blue-500' },
                  ].map((n, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-[#1A1A1D] transition-colors cursor-pointer"
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', n.color)} />
                      <div>
                        <p className="text-sm text-[#F5F0EB]">{n.title}</p>
                        <p className="text-xs text-[#6B6B6F] mt-0.5">{n.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg',
              'hover:bg-[#111113] transition-colors duration-150',
              userMenuOpen && 'bg-[#111113]',
            )}
          >
            <Avatar
              src={user?.avatar}
              firstName={user?.firstName}
              lastName={user?.lastName}
              size="sm"
            />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-[#F5F0EB] leading-none">
                {user?.firstName}
              </p>
              <p className="text-[10px] text-[#6B6B6F] leading-none mt-0.5">{user?.role}</p>
            </div>
            <ChevronDown
              size={12}
              className={cn(
                'text-[#6B6B6F] transition-transform duration-150',
                userMenuOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute right-0 top-12 w-52',
                  'bg-[#111113] border border-[#242428] rounded-xl',
                  'shadow-xl shadow-black/40 z-50',
                  'py-1.5',
                )}
              >
                <div className="px-4 py-2.5 border-b border-[#242428]">
                  <p className="text-sm text-[#F5F0EB]">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-[#6B6B6F] truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/parametres'); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                  >
                    <User size={14} /> Mon profil
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/parametres'); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                  >
                    <Settings size={14} /> Paramètres
                  </button>
                </div>
                <div className="pt-1 border-t border-[#242428]">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={14} /> Se déconnecter
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
