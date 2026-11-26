interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
}

export default function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="flex-1 rounded-[15px] bg-card p-5">
      <p className="mb-2.5 text-xs font-semibold">{label}</p>
      <p className="text-right text-2xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-right text-xs text-gray-600">{subtitle}</p>}
    </div>
  );
}