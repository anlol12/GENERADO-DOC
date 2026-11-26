export interface SessionUser {
  id: number;
  nombre_completo: string;
  email: string;
  rol?: string;
  activo?: boolean;
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem('usuario');
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

/** Fusiona cambios en localStorage['usuario'] y devuelve el usuario actualizado. */
export function updateSessionUser(patch: Partial<SessionUser>): SessionUser | null {
  const current = getSessionUser();
  if (!current) return null;
  const next = { ...current, ...patch };
  localStorage.setItem('usuario', JSON.stringify(next));
  return next;
}

export function logout(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.assign('/login');
}
