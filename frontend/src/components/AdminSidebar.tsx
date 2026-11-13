import { Link } from "./Link";

export type AdminPage = 'resumen' | 'usuarios' | 'reportes' | 'configuracion';

interface AdminSidebarProps {
    active: AdminPage;
    role?: string;
}

const adminItems: { id: AdminPage; label: string; href: string }[] = [
  { id: 'resumen', label: 'Resumen', href: '/resumen' },
  { id: 'usuarios', label: 'Usuarios', href: '/usuarios' },
  { id: 'reportes', label: 'Reportes', href: '/reportes' },
  { id: 'configuracion', label: 'Configuración', href: '/configuracion' },
];

export default function AdminSidebar({ active, role = 'Admin' }: AdminSidebarProps) {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col gap-[30px] border-r border-[#e0e0e0] bg-white p-[25px]">
      <Link
        href="/"
        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-brand-red px-9 shadow-[0_4px_10px_rgba(230,30,37,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_rgba(230,30,37,0.45)]"
      >
        <img src="/logo.jpg" alt="Creativa Logo" className="block h-7 w-auto rounded-sm object-contain" />
      </Link>

      <nav className="flex flex-1 flex-col gap-2.5">
        <p className="mb-2.5 text-center text-sm font-black">{role}</p>
        {adminItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`cursor-pointer rounded-[20px] px-[15px] py-2.5 text-sm transition-all duration-200 ${
              item.id === active
                ? 'bg-primary font-semibold text-white'
                : 'font-medium text-main hover:bg-[#f0f0f0]'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5">
        <Link
          href="/login"
          className="cursor-pointer rounded-[15px] bg-card px-2.5 py-2 text-center text-[13px] font-semibold text-main transition-colors duration-200 hover:bg-card-hover"
        >
          Cerrar sesión ➔
        </Link>
      </div>
    </aside>
  );
}