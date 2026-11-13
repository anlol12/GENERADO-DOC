interface ActivityItemProps {
  name: string;
  status: 'green' | 'red';
}

const dotColor = {
  green: 'bg-[#2ecc71]',
  red: 'bg-[#e74c3c]',
};

export default function ActivityItem({ name, status }: ActivityItemProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] bg-white px-[15px] py-3 text-sm font-medium">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotColor[status]}`} />
      {name}
    </div>
  );
}