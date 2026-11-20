// src/utils/formatDate.ts
export function formatModified(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

  if (days <= 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}