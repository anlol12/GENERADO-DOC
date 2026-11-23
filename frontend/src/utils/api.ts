const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    // Sesión inválida o expirada: limpiar y volver al login
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.replace('/login');
    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(error.detail || 'Ocurrió un error al comunicarse con el servidor');
  }
  return response.json() as Promise<T>;
}

export async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.replace('/login');
    throw new Error('Sesión expirada. Inicia sesión de nuevo.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(error.detail || 'Ocurrió un error al descargar el archivo');
  }
  return response.blob();
}
