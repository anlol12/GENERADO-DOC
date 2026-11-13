import type { ReactNode } from 'react';
import AdminSidebar from './AdminSidebar';
import type { AdminPage } from './AdminSidebar';

interface DashboardLayoutProps {
  active: AdminPage;
  children: ReactNode;
}

export default function DashboardLayout({ active, children }: DashboardLayoutProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-row bg-bg-light">
      <AdminSidebar active={active} />
      <main className="flex-1 bg-bg-light p-10">{children}</main>
    </div>
  );
}