import { useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { updateSessionUser } from '../utils/session';
import type { SessionUser } from '../utils/session';

interface ProfileModalProps {
  usuario: SessionUser;
  onClose: () => void;
  onSaved: (usuario: SessionUser) => void;
}

const input =
  'mt-2 w-full rounded-xl bg-[#e5e5ea] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary';

export default function ProfileModal({ usuario, onClose, onSaved }: ProfileModalProps) {
  const [nombre, setNombre] = useState(usuario.nombre_completo);
  const [email, setEmail] = useState(usuario.email);
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (passwordNueva && !passwordActual) {
      setError('Ingresa tu contraseña actual para cambiarla.');
      return;
    }
    if (passwordNueva && passwordNueva.length < 6) {
      setError('La contraseña nueva debe tener al menos 6 caracteres.');
      return;
    }
    const payload: Record<string, string> = { nombre_completo: nombre, email };
    if (passwordNueva) {
      payload.password_actual = passwordActual;
      payload.password_nueva = passwordNueva;
    }
    setSaving(true);
    try {
      const data = await apiFetch<SessionUser>('/api/usuario/perfil', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const updated = updateSessionUser({ nombre_completo: data.nombre_completo, email: data.email });
      onSaved(updated ?? data);
      setPasswordActual('');
      setPasswordNueva('');
      setSuccess('Cambios guardados correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Mi perfil y contraseña"
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-[20px] bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-main">Mi perfil y contraseña</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-light text-main"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-sm font-semibold text-main">
          Nombre completo
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-semibold text-main">
          Correo electrónico
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold text-main">Cambiar contraseña</legend>
          <label className="block text-sm text-main">
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              className={input}
            />
          </label>
          <label className="block text-sm text-main">
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              className={input}
            />
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-brand-red">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-green-700">
            {success}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[15px] bg-card px-5 py-2.5 text-sm font-semibold text-main"
          >
            Cerrar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-[15px] bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
