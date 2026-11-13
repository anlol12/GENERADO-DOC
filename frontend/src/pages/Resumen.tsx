import DashboardLayout from '../components/DashboardLayout';
import StatCard from '../components/StatCard';
import ActivityItem from '../components/ActivityItem';

const stats = [
  { label: 'Documentos generados', value: 6 },
  { label: 'Usuarios activos', value: 2 },
  { label: 'Reportes', value: 1 },
];

const activities: { id: number; name: string; status: 'green' | 'red' }[] = [
  { id: 1, name: 'Mark Gonzales', status: 'green' },
  { id: 2, name: 'Jhon Arevalo', status: 'green' },
  { id: 3, name: 'Andres Rodriguez', status: 'red' },
];

export default function Resumen() {
  return (
    <DashboardLayout active="resumen">
      <div className="mb-[30px]">
        <h1 className="text-[28px] font-bold">Resumen-General</h1>
        <p className="text-sm font-semibold text-primary">Actividad semanal</p>
      </div>

      <div className="mb-10 flex gap-5">
        {stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <h3 className="mb-5 text-base font-semibold">Actividades Recientes</h3>
      <div className="flex flex-col gap-[15px]">
        {activities.map((a) => (
          <ActivityItem key={a.id} name={a.name} status={a.status} />
        ))}
      </div>
    </DashboardLayout>
  );
}