import { Download } from "lucide-react";

interface DocumentItemProps {
    title: string;
    date: string;
    status: string;
    onDownload?: () =>void;
}

export default function DocumentItem({ title, date, status, onDownload }: DocumentItemProps) {
  return (
    <div className="mb-[15px] flex items-center justify-between rounded-[15px] bg-card px-[25px] py-[15px]">
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-main">{title}</span>
        <span className="mt-1 text-[11px] text-[#555]">{date}</span>
      </div>

      <div className="flex items-center gap-[15px]">
        <span className="text-[13px] font-semibold">{status}</span>
        <button
          type="button"
          onClick={onDownload}
          aria-label={`Descargar ${title}`}
          className="flex cursor-pointer items-center justify-center border-none bg-transparent"
        >
          <Download className="h-5 w-5 stroke-[#111]" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}