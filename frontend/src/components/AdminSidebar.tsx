import { X } from 'lucide-react';
import { Link } from "./Link";

export type AdminPage = 'resumen' | 'usuarios' | 'reportes' | 'configuracion' | 'documentos';

interface AdminSidebarProps { active: AdminPage; role?: string; open?: boolean; onNavigate?: () => void; onClose?: () => void }

const adminItems: { id: AdminPage; label: string; href: string }[] = [
  { id: 'resumen', label: 'Resumen', href: '/resumen' },
  { id: 'usuarios', label: 'Usuarios', href: '/usuarios' },
  { id: 'reportes', label: 'Reportes', href: '/reportes' },
  { id: 'configuracion', label: 'Configuración', href: '/configuracion' },
  { id: 'documentos', label: 'Documentos', href: '/admin/documentos' },
];

export default function AdminSidebar({ active, role = 'Admin', open = false, onNavigate, onClose }: AdminSidebarProps) {
  return (
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[240px] shrink-0 flex-col gap-[30px] border-r border-[#e0e0e0] bg-white p-[25px] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="-mb-5 flex justify-end lg:hidden">
        <button type="button" aria-label="Cerrar menu" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow"><X className="h-5 w-5" /></button>
      </div>
      <Link href="/inicio" className="mx-auto block w-full max-w-[185px] cursor-pointer transition-transform duration-200 hover:-translate-y-0.5">
        <img src="/logo.jpg" alt="Creativa Studios" width={447} height={100} className="mx-auto block h-auto w-full max-w-[185px] rounded-xl object-contain" />
      </Link>

      <nav className="flex flex-1 flex-col gap-2.5">
        <p className="mb-2.5 text-center text-sm font-black">{role}</p>
        {adminItems.map((item) => (
          <Link
            onClick={onNavigate}
            key={item.id}
            href={item.href}
            className={`cursor-pointer rounded-[20px] px-[15px] py-2.5 text-sm transition-all duration-200 ${
              item.id === active
                ? 'bg-primary font-semibold text-white'
                : 'bg-white font-medium text-main hover:bg-[#f0f0f0]'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('token');
            localStorage.removeItem('usuario');
            window.location.assign('/login');
          }}
          className="cursor-pointer rounded-[15px] bg-card px-2.5 py-2 text-center text-[13px] font-semibold text-main transition-colors duration-200 hover:bg-card-hover"
        >
          Cerrar sesión ➔
        </button>
      </div>
    </aside>
  );
}
