// src/components/DocumentRow.tsx
import { useState } from 'react';
import { Check, FileText, Send, Trash2, UserCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { deleteDocument } from '../store/documentStore';
import type { DocItem, UsuarioOption } from '../store/documentStore';
import { formatModified } from '../utils/formatDate';

interface DocumentRowProps {
  doc: DocItem;
  usuarios: UsuarioOption[];
  onOpen: (id: string) => void;
  onTogglePublish: (id: string) => void | Promise<void>;
  onAssignUser: (docId: string, userId: number | null) => Promise<void>;
}

export const DATE_COL = '';
export const ACTION_COL = '';

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
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState('');

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
    if (
      !window.confirm(
        `¿Revocar el documento a ${doc.assignedUserName || 'este usuario'}? ` +
          'Si ya trabajó en él, conservará su copia en Mis Documentos y la plantilla quedará disponible de nuevo.',
      )
    ) {
      return;
    }
    setSavingAssign(true);
    setRowError('');
    try {
      await onAssignUser(doc.id, null);
      setPickerOpen(false);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'No se pudo revocar al usuario');
    } finally {
      setSavingAssign(false);
    }
  }

  async function handleTogglePublish() {
    if (busy) return;
    if (
      !doc.published &&
      doc.assignedUserId &&
      !window.confirm(
        `Este documento está asignado a ${doc.assignedUserName || 'un usuario'}. ¿Publicarlo en la galería de todos modos?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setRowError('');
    try {
      await onTogglePublish(doc.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'No se pudo cambiar la publicación');
    } finally {
      setBusy(false);
    }
  }

  function handleToggleAssignPicker() {
    if (
      !pickerOpen &&
      doc.published &&
      !doc.assignedUserId &&
      !window.confirm(
        'Este documento está publicado en la galería. ¿Quieres mandarlo a un usuario en específico de todos modos?',
      )
    ) {
      return;
    }
    setSelectedUserId(doc.assignedUserId ? String(doc.assignedUserId) : '');
    setSearch('');
    setPickerOpen((v) => !v);
  }

  async function handleDelete() {
    if (busy) return;
    if (
      !window.confirm(
        `¿Eliminar «${doc.name}»? Se borrará la plantilla y las copias sin envíos; las copias con trabajo completado se conservan.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setRowError('');
    try {
      await deleteDocument(doc.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'No se pudo eliminar el documento');
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => onOpen(doc.id)}
        className="flex cursor-pointer flex-col justify-between gap-3 rounded-[15px] bg-card px-5 py-3.5 transition-colors duration-200 hover:bg-card-hover lg:flex-row lg:items-center"
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
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleTogglePublish();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none bg-white px-3.5 py-2 text-xs font-semibold text-main ring-1 ring-primary/40 transition-colors duration-200 hover:bg-bg-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
                Quitar publicación
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleTogglePublish();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
                Publicar
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleAssignPicker();
              }}
              title="Mandar este documento a una persona en específico"
              className={`inline-flex cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none px-3.5 py-2 text-xs font-semibold transition-colors duration-200 ${
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
                disabled={savingAssign || busy}
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

            <button
              type="button"
              title="Eliminar este documento"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[20px] border-none bg-brand-red px-3.5 py-2 text-xs font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
              Eliminar
            </button>
          </div>
          {rowError && (
            <p className="w-full text-right text-[11px] font-semibold text-brand-red">{rowError}</p>
          )}
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
              className="w-full sm:w-[260px] rounded-[10px] bg-bg-light px-3 py-1.5 text-xs font-medium text-main outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full sm:w-[260px] rounded-[10px] bg-bg-light px-3 py-1.5 text-xs font-medium text-main outline-none focus:ring-2 focus:ring-primary/40"
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