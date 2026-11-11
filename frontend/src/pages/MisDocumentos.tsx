import TopHeader from '../components/TopHeader';
import PageFooter from '../components/PageFooter';
import DocumentItem from '../components/DocumentItem';

interface DocumentData {
  id: number;
  title: string;
  date: string;
  status: string;
}

const documents: DocumentData[] = [
  { id: 1, title: 'Contrato laboral — Tiempo completo', date: 'Generado hace 3 semanas', status: 'Completado' },
  { id: 2, title: 'Contrato laboral — Medio tiempo', date: 'Generado hace 3 semanas', status: 'Completado' },
  { id: 3, title: 'Contrato laboral — Tiempo completo', date: 'Generado hace 1 semana', status: 'Completado' },
  { id: 4, title: 'Contrato laboral — Tiempo completo', date: 'Generado hace 2 semanas', status: 'Completado' },
];

export default function MisDocumentos() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-bg-light">
      <TopHeader active="documentos" />

      <main className="flex-1 p-10">
        <h2 className="mb-[5px] text-[26px] font-bold">Mis documentos</h2>
        <p className="mb-[30px] text-sm font-semibold text-primary">
          {documents.length} completados
        </p>

        {documents.map((doc) => (
          <DocumentItem key={doc.id} title={doc.title} date={doc.date} status={doc.status} />
        ))}
      </main>

      <PageFooter />
    </div>
  );
}