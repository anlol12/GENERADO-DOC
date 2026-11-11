import { Link } from "./Link";
import { User } from 'lucide-react'


type ActivePega = 'inicio' | 'documentos' | 'ayuda';

interface ToHeaderProps {
    active: ActivePega;
    showUser?: boolean;
}

const navItems: {id: ActivePega; label: string; href: string}[] = [
    {id: 'inicio', label: 'Inicio', href: '/'},
    {id: 'documentos', label: 'Mis Documentos', href: '/mis-documentos'},
    {id: 'ayuda', label: 'Ayuda', href: '/ayuda'}
]


export default function TopHeader({active, showUser = false}: ToHeaderProps){
    return(
         <header className="flex shrink-0 items-center justify-between rounded-b-[20px] bg-gradient-to-b from-[#e6e6e6] to-[#d4d4d4] px-10 py-3 shadow-[0_2px_5px_rgba(0,0,0,0.1)]">
      <Link
        href="/"
        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-brand-red px-9 shadow-[0_4px_10px_rgba(230,30,37,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_rgba(230,30,37,0.45)]"
      >
        <img
          src="/logo.jpg"
          alt="Creativa Logo"
          className="block h-7 w-auto rounded-sm object-contain"
        />
      </Link>
        <nav className="flex gap-[15px]">
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`cursor-pointer rounded-[30px] px-[25px] py-2 text-sm font-semibold shadow-[0_2px_4px_rgba(0,0,0,0.05)] transition-all duration-200 ${
              item.id === active ? 'bg-primary text-white' : 'bg-white text-main'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      { showUser && (
        <div className ="flex h-[35px] w-[35px] items-center justify-center rounded-full border border-black">
        <User className="h-5 w-5" strokeWidth={2}/>
        </div>
      )}
      </header>
    );
}