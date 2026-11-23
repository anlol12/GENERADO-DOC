// frontend/src/App.tsx
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import MisDocumentos from './pages/MisDocumentos';
import Ayuda from './pages/Ayuda';
import Resumen from './pages/Resumen';
import DocumentHome from './pages/DocumentHome';
import AdminEditor from './pages/AdminEditor';
import Usuarios from './pages/Usuarios';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  const token = localStorage.getItem('token');
  const usuarioRaw = localStorage.getItem('usuario');
  const usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null;

  // 1. Login y cierre de sesión
  if (path === '/' || path === '/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    return <Login />;
  }

  // 2. Protección de sesión
  if (!token || !usuario) {
    window.location.replace('/login');
    return <Login />;
  }

  // 3. Rutas exclusivas de Administrador
  if (path === '/resumen') {
    if (usuario.rol !== 'admin') {
      window.location.replace('/inicio');
      return <Inicio />;
    }
    return <Resumen />;
  }

  if (path === '/usuarios' || path === '/reportes' || path === '/configuracion') {
    if (usuario.rol !== 'admin') {
      window.location.replace('/inicio');
      return <Inicio />;
    }
    if (path === '/usuarios') return <Usuarios />;
    if (path === '/reportes') return <Reportes />;
    return <Configuracion />;
  }

  if (path === '/admin/documentos') {
    if (usuario.rol !== 'admin') {
      window.location.replace('/inicio');
      return <Inicio />;
    }
    return <DocumentHome />;
  }

  if (path === '/admin/editor') {
    if (usuario.rol !== 'admin') {
      window.location.replace('/inicio');
      return <Inicio />;
    }
    return <AdminEditor />;
  }

  // 4. Rutas de Usuario
  if (path === '/inicio') return <Inicio />;
  if (path === '/mis-documentos') return <MisDocumentos />;
  if (path === '/ayuda') return <Ayuda />;

  return <Login />;
}
