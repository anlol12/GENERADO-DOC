import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface FaqItemProps {
  question: string;
  children: ReactNode;
}

export default function FaqItem({ question, children }: FaqItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col border-b border-[#e0e0e0]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between py-[15px] text-left text-[13px] font-medium text-[#333] transition-colors hover:text-primary"
      >
        <span>{question}</span>
        <ChevronDown
          className={`h-[18px] w-[18px] transition-transform duration-300 ease-in-out ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      <div
        className={`overflow-hidden text-xs leading-normal text-[#555] transition-all duration-300 ease-in-out ${
          open ? 'max-h-[200px] pb-[15px]' : 'max-h-0 p-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}