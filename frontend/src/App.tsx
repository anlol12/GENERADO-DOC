import Inicio from './pages/Inicio';
import MisDocumentos from './pages/MisDocumentos'
import Ayuda from './pages/Ayuda';
import Resumen from './pages/Resumen'
export default function App(){
    const path = window.location.pathname;

    if(path === '/mis-documentos') return <MisDocumentos/>;
    if(path === '/ayuda') return <Ayuda/>
    if(path === '/resumen') return<Resumen/>
    return <Inicio/>;
}