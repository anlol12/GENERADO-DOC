// src/pages/DocumentHome.tsx
import { useEffect, useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import UploadDocumentModal from '../components/UploadDocumentModal';
import DocumentRow, { ACTION_COL, DATE_COL } from '../components/DocumentRow';
import {
  addDocument,
  assignDocumentToUser,
  fetchDocuments,
  fetchUsuarios,
  isDocumentsLoading,
  nextDocumentName,
  togglePublish,
  useDocuments,
} from '../store/documentStore';
import type { UsuarioOption } from '../store/documentStore';

export default function DocumentHome() {
  const docs = useDocuments();
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [dropped, setDropped] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    void fetchDocuments();
    fetchUsuarios()
      .then(setUsuarios)
      .catch(() => setUsuarios([]));
  }, []);

  const recent = useMemo(
    () => [...docs].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    [docs],
  );

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  function openModal(file: File | null = null) {
    setDropped(file);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setDropped(null);
  }

  function openInEditor(id: string) {
    window.history.pushState({}, '', `/admin/editor?doc=${encodeURIComponent(id)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  }

  async function handleCreate(file: File, name: string, openEditor: boolean) {
    try {
      setErrorMsg('');
      const doc = await addDocument(file, name);
      closeModal();
      if (openEditor) {
        openInEditor(doc.id);
      } else {
        setNotice(`«${doc.name}» se guardó en el servidor.`);
      }
    } catch (err) {
      closeModal();
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir el documento');
    }
  }

  async function handleAssignUser(docId: string, userId: number | null) {
    try {
      setErrorMsg('');
      await assignDocumentToUser(docId, userId);
      setNotice(
        userId
          ? 'Documento asignado al usuario correctamente.'
          : 'Se quitó la asignación del usuario.',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al asignar usuario');
    }
  }

  return (
    <DashboardLayout active="documentos">
      <div className="mb-[30px]">
        <h1 className="text-[28px] font-bold text-main">Documentos</h1>
        <p className="text-sm font-semibold text-muted">
          Sube un documento, publícalo o mándalo a una persona en específico
        </p>
      </div>

      <div className="mb-10">
        <button
          type="button"
          onClick={() => openModal()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) openModal(file);
          }}
          className={`group flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-[15px] border-2 border-dashed px-6 py-10 text-center transition-all duration-200 hover:-translate-y-[3px] hover:border-primary ${
            dragOver ? 'border-primary bg-primary/5' : 'border-card-hover bg-white'
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_10px_rgba(75,59,255,0.3)] transition-colors duration-200 group-hover:bg-primary-dark">
            <Upload className="h-6 w-6" strokeWidth={2} />
          </span>
          <span className="text-lg font-semibold text-main">Subir un documento</span>
          <span className="text-xs font-medium text-muted">
            Haz clic o arrastra aquí un archivo PDF o Word (.docx)
          </span>
        </button>

        {notice && <p className="mt-3 text-xs font-semibold text-primary">{notice}</p>}
        {errorMsg && <p className="mt-3 text-xs font-semibold text-brand-red">{errorMsg}</p>}
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-main">Documentos guardados</h3>
        <span className="text-xs font-medium text-muted">
          {recent.length} {recent.length === 1 ? 'documento' : 'documentos'}
        </span>
      </div>

      {isDocumentsLoading() && recent.length === 0 ? (
        <p className="rounded-[15px] bg-white px-5 py-10 text-center text-sm font-medium text-muted">
          Cargando documentos desde el servidor…
        </p>
      ) : recent.length === 0 ? (
        <p className="rounded-[15px] bg-white px-5 py-10 text-center text-sm text-muted">
          Aún no hay documentos guardados. Sube el primero arriba.
        </p>
      ) : (
        <>
          <div className="mb-2 hidden items-center gap-4 px-5 text-[11px] font-semibold uppercase tracking-wide text-muted sm:flex">
            <span className="flex-1 pl-[60px]">Nombre</span>
            <span className={DATE_COL}>Última modificación</span>
            <span className={ACTION_COL} />
          </div>

          <div className="flex flex-col gap-2.5">
            {recent.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                usuarios={usuarios}
                onOpen={openInEditor}
                onTogglePublish={togglePublish}
                onAssignUser={handleAssignUser}
              />
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <UploadDocumentModal
          initialFile={dropped}
          nextName={nextDocumentName(docs)}
          onClose={closeModal}
          onCreate={handleCreate}
        />
      )}
    </DashboardLayout>
  );
}