// src/components/UploadDocumentModal.tsx
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { FileText, X } from 'lucide-react';
import { detectDocKind } from '../store/documentStore';

interface UploadDocumentModalProps {
  initialFile?: File | null;
  nextName: string;
  onClose: () => void;
  onCreate: (file: File, name: string, openEditor: boolean) => void;
}

const UNSUPPORTED = 'Formato no soportado. Sube un archivo .pdf o .docx';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadDocumentModal({
  initialFile = null,
  nextName,
  onClose,
  onCreate,
}: UploadDocumentModalProps) {
  const validInitial = initialFile && detectDocKind(initialFile) ? initialFile : null;
  const [file, setFile] = useState<File | null>(validInitial);
  const [name, setName] = useState('');
  const [error, setError] = useState(initialFile && !validInitial ? UNSUPPORTED : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!detectDocKind(f)) {
      setFile(null);
      setError(UNSUPPORTED);
      return;
    }
    setError('');
    setFile(f);
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0]);
    e.target.value = '';
  }

  function submit(openEditor: boolean) {
    if (!file) return;
    onCreate(file, name.trim() || nextName, openEditor);
  }

  const disabled = !file;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
        className="max-h-full w-full max-w-[480px] overflow-auto rounded-[20px] bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="upload-title" className="text-xl font-bold text-main">
              Subir un documento
            </h2>
            <p className="text-xs font-medium text-muted">Selecciona el archivo y ponle un nombre</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-main transition-colors duration-200 hover:bg-card"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleInput}
          className="hidden"
        />

        {file ? (
          <div className="mb-1 flex items-center gap-3 rounded-[15px] bg-bg-light p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-white">
              <FileText
                className={`h-5 w-5 ${detectDocKind(file) === 'pdf' ? 'text-brand-red' : 'text-primary'}`}
                strokeWidth={2}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-main">{file.name}</p>
              <p className="text-[11px] text-muted">{formatSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 cursor-pointer rounded-[20px] border-none bg-card px-3 py-1.5 text-[11px] font-semibold text-main transition-colors duration-200 hover:bg-card-hover"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0]);
            }}
            className="mb-1 flex w-full cursor-pointer flex-col items-center gap-1 rounded-[15px] border-2 border-dashed border-card-hover bg-bg-light px-4 py-8 transition-colors duration-200 hover:border-primary"
          >
            <span className="text-sm font-semibold text-main">Seleccionar archivo</span>
            <span className="text-[11px] text-muted">PDF o Word (.docx), o arrástralo aquí</span>
          </button>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-brand-red">{error}</p>}

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-main">Nombre del documento</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit(false)}
            placeholder={nextName}
            maxLength={80}
            className="w-full rounded-[10px] bg-bg-light px-3 py-2.5 text-sm text-main outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-[11px] text-muted">
            Si lo dejas vacío se llamará «{nextName}».
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[20px] border-none bg-transparent px-5 py-2.5 text-xs font-semibold text-muted transition-colors duration-200 hover:bg-bg-light hover:text-main"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => submit(false)}
            className="cursor-pointer rounded-[20px] border-none bg-card px-5 py-2.5 text-xs font-semibold text-main transition-colors duration-200 hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => submit(true)}
            className="cursor-pointer rounded-[20px] border-none bg-primary px-5 py-2.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear y modificar
          </button>
        </div>
      </div>
    </div>
  );
}