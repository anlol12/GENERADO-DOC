//frontend\src\pages\Login.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { FileText } from 'lucide-react';
import axios from 'axios';
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password,
      });

      const { access_token, usuario } = response.data;

      // Guardar sesión en localStorage
      localStorage.setItem('token', access_token);
      localStorage.setItem('usuario', JSON.stringify(usuario));

      // Redirigir según el rol devuelto por SQLite/FastAPI
      if (usuario.rol === 'admin') {
        window.location.assign('/resumen');
      } else {
        window.location.assign('/inicio');
      }
    } catch (err: any) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError('No se pudo conectar con el servidor. Verifica que el backend esté activo.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-row bg-bg-light">
      {/* Panel izquierdo (azul) */}
      <div className="flex flex-1 flex-col justify-center gap-[30px] bg-primary p-10 text-white">
        <h2 className="text-[22px] font-semibold leading-[1.4]">
          "Deja de rellenar plantillas, construye tu contrato contigo mismo"
        </h2>
        <FileText className="h-[60px] w-[60px]" strokeWidth={2} />
      </div>

      {/* Panel derecho (formulario) */}
      <div className="flex flex-1 items-center justify-center p-10">
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[300px] flex-col gap-5"
        >
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-brand-red">
              {error}
            </div>
          )}

          <input
            type="email"
            placeholder="Correo Electronico"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-[#ddd] bg-[#f9f9f9] px-[15px] py-3 text-sm outline-none focus:border-primary"
          />
          <input
            type="password"
            placeholder="Contraseña"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-[#ddd] bg-[#f9f9f9] px-[15px] py-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={cargando}
            className="block cursor-pointer rounded-[20px] border-none bg-primary p-3 text-center font-semibold text-white transition-colors duration-200 hover:bg-primary-dark disabled:opacity-60"
          >
            {cargando ? 'Verificando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}