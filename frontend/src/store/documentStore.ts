// src/store/documentStore.ts
import { useSyncExternalStore } from 'react';
import type { DetectedFontInfo, FieldLabel, MappedBox } from '../pages/AdminEditor';
import { apiFetch, apiFetchBlob } from '../utils/api';

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
  revocadoEnOrigen?: boolean;
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
    docs = await apiFetch<DocItem[]>('/api/documentos');
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
  return apiFetch<UsuarioOption[]>('/api/admin/usuarios');
}

export async function addDocument(file: File, name: string): Promise<DocDetail> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name.trim() || file.name.replace(/\.[^.]+$/, '').trim() || nextDocumentName());

  const created: DocDetail = await apiFetch('/api/documentos', {
    method: 'POST',
    body: formData,
  });

  docs = [created, ...docs.filter((d) => d.id !== created.id)];
  emit();
  return created;
}

export async function loadDocumentForEditor(
  id: string,
): Promise<{ doc: DocDetail; file: File } | null> {
  try {
    const path = `/api/documentos/${encodeURIComponent(id)}`;
    const doc = await apiFetch<DocDetail>(path);
    const blob = await apiFetchBlob(`${path}/archivo`);
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
  const updated: DocDetail = await apiFetch(`/api/documentos/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  docs = docs.map((d) => (d.id === updated.id ? updated : d));
  emit();
  return updated;
}

async function patchPublication(
  id: string,
  body: { published?: boolean; assigned_user_id?: number; clear_assigned_user?: boolean },
): Promise<void> {
  const updated: DocItem = await apiFetch(`/api/documentos/${encodeURIComponent(id)}/publicar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  docs = docs.map((d) => (d.id === updated.id ? updated : d));
  emit();
}

/** Publica en la galería general (Inicio) y libera cualquier asignación privada. */
export function publishDocument(id: string): Promise<void> {
  return patchPublication(id, { published: true, clear_assigned_user: true });
}

export function unpublishDocument(id: string): Promise<void> {
  return patchPublication(id, { published: false });
}

export function revokeUserAssignment(id: string): Promise<void> {
  return patchPublication(id, { clear_assigned_user: true });
}

export async function togglePublish(id: string): Promise<void> {
  const current = docs.find((d) => d.id === id);
  if (!current) return;
  await (current.published ? unpublishDocument(id) : publishDocument(id));
}

/** Asigna solo a ese usuario (sale de la galería general); null revoca la asignación. */
export async function assignDocumentToUser(id: string, userId: number | null): Promise<void> {
  if (userId === null) return revokeUserAssignment(id);
  return patchPublication(id, { assigned_user_id: userId, published: false });
}

export async function fetchPublicDocuments(): Promise<DocItem[]> {
  return apiFetch<DocItem[]>('/api/documentos/publicos');
}

export async function deleteDocument(id: number | string): Promise<void> {
  await apiFetch<unknown>(`/api/documentos/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  docs = docs.filter((doc) => doc.id !== String(id));
  emit();
}



export interface AccessRequest {
  doc_id: number;
  template_id: number | null;
  doc_name: string;
  usuario_id: number | null;
  usuario_nombre: string;
  usuario_email: string;
  solicitado_en: string;
}

export function fetchAccessRequests(): Promise<AccessRequest[]> {
  return apiFetch<AccessRequest[]>('/api/admin/solicitudes-acceso');
}

export function resolveAccessRequest(docId: number, aprobar: boolean): Promise<unknown> {
  return apiFetch(`/api/admin/solicitudes-acceso/${encodeURIComponent(String(docId))}/resolver`, {
    method: 'PATCH', body: JSON.stringify({ aprobar }),
  });
}
