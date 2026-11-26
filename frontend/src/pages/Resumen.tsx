import { useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import StatCard from '../components/StatCard';
import ActivityItem from '../components/ActivityItem';
import { apiFetch } from '../utils/api';
import type { AdminResumen } from '../types/admin';

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} días`;
}

export default function Resumen() {
  const [data, setData] = useState<AdminResumen | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { apiFetch<AdminResumen>('/api/admin/resumen').then(setData).catch((e: Error) => setError(e.message)); }, []);
  return <DashboardLayout active="resumen">
    <div className="mb-8"><h1 className="text-[28px] font-bold">Resumen</h1><p className="text-sm font-semibold text-primary">General</p><p className="mt-1 text-sm text-gray-500">{data ? `Últimos 7 días: ${data.semana.documentos} documentos · ${data.semana.reportes} reportes (las tarjetas muestran totales históricos)` : 'Totales históricos y actividad de los últimos 7 días'}</p></div>
    {error && <p role="alert" className="mb-4 text-sm text-brand-red">{error}</p>}
    <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Documentos generados" value={data?.documentos_generados ?? '—'} subtitle={data ? `${data.documentos_completados} completados · ${data.plantillas_base} plantillas base` : undefined} />
      <StatCard label="Usuarios activos" value={data?.usuarios_activos ?? '—'} />
      <StatCard label="Reportes" value={data?.reportes_total ?? '—'} subtitle={data ? `${data.reportes_pendientes} pendientes · ${data.reportes_resueltos} resueltos` : undefined} />
    </div>
    <h2 className="mb-5 text-base font-semibold">Actividades Recientes</h2>
    {!data && !error ? <p className="text-sm text-gray-500">Cargando actividades…</p> : null}
    {data?.actividades_recientes.length === 0 && <p className="text-sm text-gray-500">No hay actividades recientes.</p>}
    <div className="flex flex-col gap-3">{data?.actividades_recientes.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-white px-4 py-3 text-sm"><ActivityItem name={a.estado} status={a.tono} /><strong>{a.usuario}</strong><span className="flex-1">{a.descripcion}</span><time className="text-gray-500">{relativeTime(a.fecha)}</time></div>)}</div>
  </DashboardLayout>;
}
