import { useEffect, useRef, useState } from 'react';
import { Link } from './Link';
import { ClipboardList, LogOut, Menu, User, UserCog, X } from 'lucide-react';
import ProfileModal from './ProfileModal';
import { getSessionUser, logout } from '../utils/session';
import type { SessionUser } from '../utils/session';

type ActivePega = 'inicio' | 'documentos' | 'ayuda';
interface ToHeaderProps { active: ActivePega; showUser?: boolean }
const navItems: { id: ActivePega; label: string; href: string }[] = [
  { id: 'inicio', label: 'Inicio', href: '/inicio' },
  { id: 'documentos', label: 'Mis documentos', href: '/mis-documentos' },
  { id: 'ayuda', label: 'Ayuda', href: '/ayuda' },
];

const REPORTES_HREF = '/ayuda?tab=tickets';

export default function TopHeader({ active }: ToHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [usuario, setUsuario] = useState<SessionUser | null>(() => getSessionUser());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdownOpen]);

  function openProfile() {
    setUsuario(getSessionUser());
    setDropdownOpen(false);
    setMenuOpen(false);
    setProfileOpen(true);
  }

  function goReportes() {
    window.location.assign(REPORTES_HREF);
  }

  return <header className="relative z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-b-[20px] bg-gradient-to-b from-[#e6e6e6] to-[#d4d4d4] px-4 py-3 shadow-[0_2px_5px_rgba(0,0,0,0.1)] md:flex-nowrap md:px-10">
    <Link href="/inicio" className="inline-flex shrink-0 cursor-pointer items-center overflow-hidden rounded-xl bg-brand-red shadow-[0_4px_10px_rgba(230,30,37,0.35)]"><img src="/logo.jpg" alt="Creativa Studios" width={447} height={100} className="block h-10 w-auto max-w-full object-contain md:h-11" /></Link>
    <nav className="hidden items-center gap-3 md:flex lg:gap-4">
      {navItems.map(item => <Link key={item.id} href={item.href} className={`rounded-[30px] px-4 py-2 text-sm font-semibold shadow-[0_2px_4px_rgba(0,0,0,0.05)] transition-all md:px-5 lg:px-6 ${item.id === active ? 'bg-primary text-white' : 'bg-white text-main'}`}>{item.label}</Link>)}
    </nav>

    <div ref={dropdownRef} className="relative hidden md:block">
      <button
        type="button"
        aria-label="Menú de perfil"
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
        onClick={() => setDropdownOpen(v => !v)}
        className="flex h-[35px] w-[35px] cursor-pointer items-center justify-center rounded-full border border-black bg-transparent"
      ><User className="h-5 w-5" /></button>
      {dropdownOpen && <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-[15px] bg-white py-2 shadow-lg">
        <div className="border-b border-[#e0e0e0] px-4 pb-3 pt-2">
          <p className="truncate text-sm font-bold text-main">{usuario?.nombre_completo ?? 'Usuario'}</p>
          <p className="truncate text-xs text-muted">{usuario?.email ?? ''}</p>
        </div>
        <button type="button" role="menuitem" onClick={openProfile} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-main hover:bg-bg-light"><UserCog className="h-4 w-4" />Mi perfil y contraseña</button>
        <button type="button" role="menuitem" onClick={goReportes} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-main hover:bg-bg-light"><ClipboardList className="h-4 w-4" />Mis reportes</button>
        <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-brand-red hover:bg-bg-light"><LogOut className="h-4 w-4" />Cerrar sesión</button>
      </div>}
    </div>

    <button type="button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-main md:hidden">{menuOpen ? <X /> : <Menu />}</button>
    {menuOpen && <nav className="absolute left-0 right-0 top-full flex flex-col gap-1 rounded-b-2xl bg-white p-3 shadow-lg md:hidden">
      {usuario && <div className="px-4 pb-2 pt-1"><p className="truncate text-sm font-bold text-main">{usuario.nombre_completo}</p><p className="truncate text-xs text-muted">{usuario.email}</p></div>}
      {navItems.map(item => <Link key={item.id} href={item.href} onClick={() => setMenuOpen(false)} className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold ${item.id === active ? 'bg-primary text-white' : 'text-main hover:bg-bg-light'}`}>{item.label}</Link>)}
      <button type="button" onClick={openProfile} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-main hover:bg-bg-light"><UserCog className="h-4 w-4" />Mi perfil y contraseña</button>
      <button type="button" onClick={goReportes} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-main hover:bg-bg-light"><ClipboardList className="h-4 w-4" />Mis reportes</button>
      <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-brand-red hover:bg-bg-light"><LogOut className="h-4 w-4" />Cerrar sesión</button>
    </nav>}

    {profileOpen && usuario && <ProfileModal usuario={usuario} onClose={() => setProfileOpen(false)} onSaved={setUsuario} />}
  </header>;
}
