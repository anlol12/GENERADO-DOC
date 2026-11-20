// src/components/DocumentRow.tsx
import { useState } from 'react';
import { Check, FileText, Send, UserCheck, UserMinus, UserPlus, X } from 'lucide-react';
import type { DocItem, UsuarioOption } from '../store/documentStore';
import { formatModified } from '../utils/formatDate';

interface DocumentRowProps {
  doc: DocItem;
  usuarios: UsuarioOption[];
  onOpen: (id: string) => void;
  onTogglePublish: (id: string) => void;
  onAssignUser: (docId: string, userId: number | null) => Promise<void>;
}

export const DATE_COL = 'sm:w-[150px]';
export const ACTION_COL = 'sm:w-[360px]';

export default function DocumentRow({
  doc,
  usuarios,
  onOpen,
  onTogglePublish,
  onAssignUser,
}: DocumentRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(
    doc.assignedUserId ? String(doc.assignedUserId) : '',
  );
  const [savingAssign, setSavingAssign] = useState(false);

  const [search, setSearch] = useState('');

  const soloUsuarios = usuarios.filter((u) => u.rol === 'usuario' && u.activo);
  const q = search.trim().toLowerCase();
  // Se conserva siempre el usuario ya seleccionado para que el <select> no pierda su valor.
  const usuariosFiltrados = q
    ? soloUsuarios.filter(
        (u) =>
          String(u.id) === selectedUserId ||
          u.nombre_completo.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    : soloUsuarios;

  async function handleConfirmAssign(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSavingAssign(true);
    try {
      await onAssignUser(doc.id, selectedUserId ? Number(selectedUserId) : null);
      setPickerOpen(false);
    } finally {
      setSavingAssign(false);
    }
  }

  async function handleRevoke() {
    setSavingAssign(true);
    try {
      await onAssignUser(doc.id, null);
      setPickerOpen(false);
    } finally {
      setSavingAssign(false);
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => onOpen(doc.id)}
        className="flex cursor-pointer flex-col gap-3 rounded-[15px] bg-card px-5 py-3.5 transition-colors duration-200 hover:bg-card-hover sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-white">
            <FileText
              className={`h-5 w-5 ${doc.kind === 'pdf' ? 'text-brand-red' : 'text-primary'}`}
              strokeWidth={2}
            />
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(doc.id);
              }}
              className="block max-w-full cursor-pointer truncate border-none bg-transparent p-0 text-left text-sm font-semibold text-main hover:text-primary"
            >
              {doc.name}
            </button>
            <p className="truncate text-[11px] text-[#555]">
              {doc.fileName} · {doc.kind === 'pdf' ? 'PDF' : 'Word'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <span className={`whitespace-nowrap text-xs font-medium text-[#555] ${DATE_COL}`}>
            {formatModified(doc.modifiedAt)}
          </span>

          <div className={`flex flex-wrap items-center justify-end gap-2 ${ACTION_COL}`}>
            {doc.published ? (
              <button
                type="button"
                title="Quitar este documento de la galería de Inicio"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePublish(doc.id);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none bg-white px-3.5 py-2 text-xs font-semibold text-main ring-1 ring-primary/40 transition-colors duration-200 hover:bg-bg-light"
              >
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
                Quitar publicación
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePublish(doc.id);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
                Publicar
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedUserId(doc.assignedUserId ? String(doc.assignedUserId) : '');
                setSearch('');
                setPickerOpen((v) => !v);
              }}
              title="Mandar este documento a una persona en específico"
              className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
                doc.assignedUserId
                  ? 'bg-white text-primary ring-1 ring-primary/40 hover:bg-bg-light'
                  : 'bg-white text-main hover:bg-bg-light'
              }`}
            >
              {doc.assignedUserId ? (
                <>
                  <UserCheck className="h-3.5 w-3.5 text-primary" strokeWidth={2.2} />
                  <span className="max-w-[115px] truncate">
                    {doc.assignedUserName || 'Asignado'}
                  </span>
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                  Mandar a usuario
                </>
              )}
            </button>

            {doc.assignedUserId && (
              <button
                type="button"
                title="Quitar la asignación al usuario actual"
                disabled={savingAssign}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRevoke();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none bg-white px-3.5 py-2 text-xs font-semibold text-brand-red ring-1 ring-brand-red/40 transition-colors duration-200 hover:bg-brand-red/10 disabled:opacity-50"
              >
                <UserMinus className="h-3.5 w-3.5" strokeWidth={2.2} />
                Revocar usuario
              </button>
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-primary/20 bg-white p-3.5 shadow-md"
        >
          <form onSubmit={handleConfirmAssign} className="flex flex-1 flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold text-main">Enviar documento a:</span>
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuario por nombre o correo..."
              className="min-w-[220px] rounded-[10px] bg-bg-light px-3 py-1.5 text-xs font-medium text-main outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="min-w-[220px] rounded-[10px] bg-bg-light px-3 py-1.5 text-xs font-medium text-main outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">-- Ningún usuario (sin asignación directa) --</option>
              {usuariosFiltrados.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre_completo} ({u.email})
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={savingAssign}
              className="cursor-pointer rounded-[16px] border-none bg-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {savingAssign ? 'Guardando…' : 'Confirmar'}
            </button>

            {doc.assignedUserId && (
              <button
                type="button"
                disabled={savingAssign}
                onClick={() => void handleRevoke()}
                className="cursor-pointer rounded-[16px] border-none bg-brand-red px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Quitar asignación actual
              </button>
            )}
          </form>

          <button
            type="button"
            aria-label="Cerrar selector"
            onClick={() => setPickerOpen(false)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-bg-light text-muted hover:text-main"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}