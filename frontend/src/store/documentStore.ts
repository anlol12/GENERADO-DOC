// src/store/documentStore.ts
import { useSyncExternalStore } from 'react';
import type { DetectedFontInfo, FieldLabel, MappedBox } from '../pages/AdminEditor';

export type DocKind = 'pdf' | 'docx';

export interface DocItem {
  id: string;
  name: string;
  fileName: string;
  kind: DocKind;
  modifiedAt: string;
  published: boolean;
  assignedUserId: number | null;
  assignedUserName: string | null;
}

export interface DocDetail extends DocItem {
  labels: FieldLabel[];
  boxes: MappedBox[];
  detectedFonts: DetectedFontInfo[];
}

export interface UsuarioOption {
  id: number;
  nombre_completo: string;
  email: string;
  rol: string;
  activo: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

let docs: DocItem[] = [];
let loadingDocs = false;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!initialized) {
    initialized = true;
    void fetchDocuments();
  }
  return () => {
    listeners.delete(l);
  };
};

const getSnapshot = () => docs;

export const useDocuments = (): DocItem[] => useSyncExternalStore(subscribe, getSnapshot);
export const isDocumentsLoading = (): boolean => loadingDocs;

export function detectDocKind(file: File): DocKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  return null;
}

export function nextDocumentName(list: DocItem[] = docs): string {
  let max = 0;
  for (const d of list) {
    const m = /^Documento (\d+)$/i.exec(d.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Documento ${max + 1}`;
}

export async function fetchDocuments(): Promise<DocItem[]> {
  loadingDocs = true;
  emit();
  try {
    const res = await fetch(`${API_URL}/api/documentos`);
    if (!res.ok) throw new Error('Error al cargar documentos');
    docs = await res.json();
    return docs;
  } catch (err) {
    console.error(err);
    return docs;
  } finally {
    loadingDocs = false;
    emit();
  }
}

export async function fetchUsuarios(): Promise<UsuarioOption[]> {
  const res = await fetch(`${API_URL}/api/admin/usuarios`);
  if (!res.ok) throw new Error('Error al obtener usuarios');
  return res.json();
}

export async function addDocument(file: File, name: string): Promise<DocDetail> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name.trim() || nextDocumentName());

  const res = await fetch(`${API_URL}/api/documentos`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'No se pudo subir el documento');
  }

  const created: DocDetail = await res.json();
  docs = [created, ...docs.filter((d) => d.id !== created.id)];
  emit();
  return created;
}

export async function loadDocumentForEditor(
  id: string,
): Promise<{ doc: DocDetail; file: File } | null> {
  try {
    const metaRes = await fetch(`${API_URL}/api/documentos/${encodeURIComponent(id)}`);
    if (!metaRes.ok) return null;
    const doc: DocDetail = await metaRes.json();

    const fileRes = await fetch(`${API_URL}/api/documentos/${encodeURIComponent(id)}/archivo`);
    if (!fileRes.ok) return null;
    const blob = await fileRes.blob();
    const file = new File([blob], doc.fileName, { type: blob.type });

    return { doc, file };
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function saveDocumentTemplate(
  id: string,
  payload: {
    name: string;
    labels: FieldLabel[];
    boxes: MappedBox[];
    detected_fonts: DetectedFontInfo[];
  },
): Promise<DocDetail> {
  const res = await fetch(`${API_URL}/api/documentos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error('Error al guardar los cambios en el servidor');
  }

  const updated: DocDetail = await res.json();
  docs = docs.map((d) => (d.id === updated.id ? updated : d));
  emit();
  return updated;
}

async function patchPublication(
  id: string,
  body: { published?: boolean; assigned_user_id?: number; clear_assigned_user?: boolean },
  errorMessage: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/documentos/${encodeURIComponent(id)}/publicar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(errorMessage);
  const updated: DocItem = await res.json();
  docs = docs.map((d) => (d.id === updated.id ? updated : d));
  emit();
}

/** Publica en la galería general (Inicio) y libera cualquier asignación privada. */
export function publishDocument(id: string): Promise<void> {
  return patchPublication(
    id,
    { published: true, clear_assigned_user: true },
    'No se pudo publicar el documento',
  );
}

export function unpublishDocument(id: string): Promise<void> {
  return patchPublication(id, { published: false }, 'No se pudo quitar la publicación');
}

export function revokeUserAssignment(id: string): Promise<void> {
  return patchPublication(
    id,
    { clear_assigned_user: true },
    'No se pudo revocar la asignación del usuario',
  );
}

export async function togglePublish(id: string): Promise<void> {
  const current = docs.find((d) => d.id === id);
  if (!current) return;
  await (current.published ? unpublishDocument(id) : publishDocument(id));
}

/** Asigna solo a ese usuario (sale de la galería general); null revoca la asignación. */
export async function assignDocumentToUser(id: string, userId: number | null): Promise<void> {
  if (userId === null) return revokeUserAssignment(id);
  return patchPublication(
    id,
    { assigned_user_id: userId, published: false },
    'No se pudo asignar el documento al usuario',
  );
}

export async function fetchPublicDocuments(): Promise<DocItem[]> {
  const res = await fetch(`${API_URL}/api/documentos/publicos`);
  if (!res.ok) throw new Error('Error al cargar la galería');
  return res.json();
}
