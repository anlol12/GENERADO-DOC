import { useState } from 'react';
import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import type { AdminPage } from './AdminSidebar';

interface DashboardLayoutProps {
  active: AdminPage;
  children: ReactNode;
}

export default function DashboardLayout({ active, children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="relative flex min-h-screen w-full overflow-x-hidden bg-bg-light">
      {sidebarOpen && <button aria-label="Cerrar menu" className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <AdminSidebar active={active} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} onClose={() => setSidebarOpen(false)} />
      <main className="min-w-0 flex-1 bg-bg-light p-4 pt-16 md:p-6 md:pt-16 lg:p-10">
        {!sidebarOpen && <button type="button" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)} className="fixed left-4 top-3 z-30 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow md:left-6 lg:hidden"><Menu /></button>}
        {children}
      </main>
    </div>
  );
}