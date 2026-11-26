import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Search, UserRound, X } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { apiFetch } from '../utils/api';
import type { AdminUsuario } from '../types/admin';

const input = 'w-full rounded-xl bg-[#e5e5ea] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary';
export default function Usuarios() {
  const [users, setUsers] = useState<AdminUsuario[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nombre_completo: '', email: '', password: '', rol: 'usuario' as 'usuario' | 'admin' });
  const load = () => apiFetch<AdminUsuario[]>('/api/admin/usuarios').then(setUsers).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => users.filter(u => `${u.nombre_completo} ${u.email}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  async function create(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { const created = await apiFetch<AdminUsuario>('/api/admin/usuarios', { method: 'POST', body: JSON.stringify(form) }); setUsers(current => [created, ...current]); setOpen(false); setForm({ nombre_completo: '', email: '', password: '', rol: 'usuario' }); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function update(user: AdminUsuario, patch: { activo?: boolean; rol?: 'admin' | 'usuario' }) {
    setError(''); try { const updated = await apiFetch<AdminUsuario>(`/api/admin/usuarios/${user.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); setUsers(current => current.map(u => u.id === user.id ? updated : u)); }
    catch (err) { setError((err as Error).message); }
  }
  return <DashboardLayout active="usuarios">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><h1 className="text-[28px] font-bold">Usuarios</h1><button onClick={() => setOpen(true)} className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white">+ Invitar usuario</button></div>
    {error && <p role="alert" className="mb-4 text-sm text-brand-red">{error}</p>}
    <label className="mb-6 flex max-w-sm items-center gap-2 rounded-full bg-[#e5e5ea] px-4"><Search size={18}/><input aria-label="Buscar usuarios" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o correo" className="w-full bg-transparent py-3 text-sm outline-none" /></label>
    {loading && <p className="text-sm text-gray-500">Cargando usuarios…</p>}
    {!loading && !error && users.length === 0 && <p className="text-sm text-gray-500">No hay usuarios registrados.</p>}
    {users.length > 0 && filtered.length === 0 && <p className="text-sm text-gray-500">No se encontraron usuarios.</p>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(u => <article key={u.id} className="flex min-w-0 flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-sm"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e5e5ea]"><UserRound/></span><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{u.nombre_completo}</h2><p className="break-all text-sm text-gray-500">{u.email}</p><div className="mt-2 flex gap-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">{u.rol}</span><span className={`rounded-full px-3 py-1 text-xs ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></div></div><div className="flex flex-wrap gap-2"><button onClick={() => void update(u, { activo: !u.activo })} className="rounded-full bg-[#e5e5ea] px-3 py-2 text-xs">{u.activo ? 'Desactivar' : 'Activar'}</button><button onClick={() => void update(u, { rol: u.rol === 'admin' ? 'usuario' : 'admin' })} className="rounded-full bg-[#e5e5ea] px-3 py-2 text-xs">Cambiar rol</button></div></article>)}</div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={create} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Invitar usuario</h2><button type="button" aria-label="Cerrar" onClick={() => setOpen(false)}><X/></button></div><div className="space-y-3"><input required placeholder="Nombre completo" className={input} value={form.nombre_completo} onChange={e => setForm({...form, nombre_completo:e.target.value})}/><input required type="email" placeholder="Correo" className={input} value={form.email} onChange={e => setForm({...form, email:e.target.value})}/><input required type="password" placeholder="Contraseña" className={input} value={form.password} onChange={e => setForm({...form, password:e.target.value})}/><select className={input} value={form.rol} onChange={e => setForm({...form, rol:e.target.value as 'admin'|'usuario'})}><option value="usuario">Usuario</option><option value="admin">Administrador</option></select></div>{error && <p className="mt-3 text-sm text-brand-red">{error}</p>}<button disabled={busy} className="mt-5 w-full rounded-full bg-primary py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Creando…' : 'Crear usuario'}</button></form></div>}
  </DashboardLayout>;
}
