// frontend/src/pages/MisDocumentos.tsx
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Eraser,
  ImageUp,
  Mail,
  PenTool,
  Send,
} from 'lucide-react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { renderAsync } from 'docx-preview';
import TopHeader from '../components/TopHeader';
import PageFooter from '../components/PageFooter';
import type { FieldDataType, DashRule, FieldLabel, MappedBox } from './AdminEditor';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const PDF_SCALE = 1.5;
const MIN_FONT = 6;

interface UserDocItem {
  id: string;
  name: string;
  fileName: string;
  kind: 'pdf' | 'docx';
  modifiedAt: string;
  published: boolean;
  assignedUserId: number | null;
  visto: boolean;
  adminEmail: string;
  labels: FieldLabel[];
  boxes: MappedBox[];
  valores?: Record<string, string>;
  revocadoEnOrigen?: boolean;
  enviado?: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 600;

interface PageRect {
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/* ==================== FORMATEO Y RENDERIZADO ==================== */
function formatFieldValue(raw: string, dataType: FieldDataType, dashRule: DashRule): string {
  if (dataType === 'signature') return raw;

  let clean = raw;
  if (dataType === 'number' || dataType === 'id_card' || dataType === 'phone') {
    clean = clean.replace(/\D/g, '');
  } else if (dataType === 'text') {
    clean = clean.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
  }
  if (!clean) return '';

  if (dashRule === 'auto_id') {
    const digits = clean.slice(0, 9);
    return digits.length > 8 ? `${digits.slice(0, 8)}-${digits.slice(8)}` : digits;
  }
  if (dashRule === 'auto_phone') {
    const digits = clean.slice(0, 8);
    return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
  }
  return clean;
}

async function renderPdfPages(file: File, mount: HTMLElement, isCancelled: () => boolean) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  for (let n = 1; n <= pdf.numPages; n++) {
    if (isCancelled()) return;
    // Cede el hilo principal entre páginas para no congelar la UI.
    await new Promise((r) => requestAnimationFrame(r));
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: PDF_SCALE });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.style.display = 'block';

    const wrap = document.createElement('div');
    wrap.dataset.pageIndex = String(n);
    wrap.className = 'mx-auto mb-4 bg-white shadow-md';
    wrap.style.width = `${viewport.width}px`;
    wrap.style.height = `${viewport.height}px`;
    wrap.appendChild(canvas);

    if (isCancelled()) return;
    mount.appendChild(wrap);

    await page.render({
      canvas,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    }).promise;
  }
}

async function renderDocxPages(file: File, mount: HTMLElement) {
  const buffer = await file.arrayBuffer();
  await renderAsync(buffer, mount, undefined, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
  });

  const wrapper = mount.querySelector<HTMLElement>('.docx-wrapper');
  if (wrapper) {
    wrapper.style.background = 'transparent';
    wrapper.style.padding = '0';
  }
  mount.querySelectorAll<HTMLElement>('section.docx').forEach((section, i) => {
    section.dataset.pageIndex = String(i + 1);
    section.style.marginBottom = '16px';
  });
}

function useAutoFit(ref: RefObject<HTMLElement | null>, fontMax: number, deps: ReadonlyArray<unknown>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    let lo = MIN_FONT;
    let hi = Math.max(fontMax, MIN_FONT);
    el.style.fontSize = `${hi}px`;
    if (fits()) return;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    el.style.fontSize = `${lo}px`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontMax, ...deps]);
}

/** Resuelve el valor de una caja: labelId, id del campo definido y respaldo por texto normalizado. */
function resolveBoxValue(box: MappedBox, values: Record<string, string>, labels: FieldLabel[]): string {
  const norm = (box.label || '').trim().toLowerCase();
  const defined = labels.find((l) => l.id === box.labelId || l.name.trim().toLowerCase() === norm);
  const keys = [box.labelId, defined?.id, box.label, norm].filter((k): k is string => !!k);
  for (const k of keys) {
    if (values[k] !== undefined && values[k] !== '') return values[k];
  }
  return '';
}

const LiveReadonlyBox = memo(function LiveReadonlyBox({
  box,
  rect,
  liveValue = '',
}: {
  box: MappedBox;
  rect: PageRect;
  liveValue?: string;
}) {
  const fitRef = useRef<HTMLDivElement>(null);
  const isPatch = box.kind === 'patch';
  const isSignature = box.dataType === 'signature';
  const isImageSignature = isSignature && liveValue.startsWith('data:image/');
  const hasLiveText = !isSignature && liveValue.trim().length > 0;

  useAutoFit(fitRef, box.font_max, [
    box.text,
    box.label,
    box.fontFamily,
    liveValue,
    box.w_pct,
    box.h_pct,
    rect.width,
    rect.height,
  ]);

  return (
    <div
      className={`absolute box-border ${
        isPatch ? 'bg-[#ffffff]' : 'border border-primary/35 bg-primary/5'
      }`}
      style={{
        left: `${box.x_pct}%`,
        top: `${box.y_pct}%`,
        width: `${box.w_pct}%`,
        height: `${box.h_pct}%`,
      }}
    >
      {isPatch ? (
        <div
          ref={fitRef}
          style={box.fontFamily ? { fontFamily: box.fontFamily } : undefined}
          className="flex h-full w-full items-center overflow-hidden bg-[#ffffff] px-0.5 font-sans leading-tight text-main"
        >
          {box.text}
        </div>
      ) : isImageSignature ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden p-0.5">
          <img src={liveValue} alt="Firma" className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div
          ref={fitRef}
          style={box.fontFamily ? { fontFamily: box.fontFamily } : undefined}
          className={`flex h-full w-full items-center overflow-hidden break-words px-1 font-sans leading-tight ${
            hasLiveText ? 'font-medium text-main' : 'text-primary/60'
          }`}
        >
          {hasLiveText ? liveValue : box.label}
        </div>
      )}
    </div>
  );
});

function UserSignaturePad({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#0f172a';
  }, [mode]);

  function getCoords(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  }

  function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-bg-light p-2.5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex rounded-[8px] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-[6px] border-none px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              mode === 'draw' ? 'bg-primary text-white' : 'bg-transparent text-main'
            }`}
          >
            <PenTool className="h-3 w-3" />
            Dibujar
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-[6px] border-none px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              mode === 'upload' ? 'bg-primary text-white' : 'bg-transparent text-main'
            }`}
          >
            <ImageUp className="h-3 w-3" />
            Subir foto
          </button>
        </div>

        {value && (
          <button
            type="button"
            onClick={clearCanvas}
            className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-[11px] font-semibold text-brand-red hover:underline"
          >
            <Eraser className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>

      {mode === 'draw' ? (
        <div className="relative overflow-hidden rounded-[8px] border border-dashed border-muted/40 bg-white">
          <canvas
            ref={canvasRef}
            width={300}
            height={90}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="block h-[90px] w-full cursor-crosshair touch-none"
          />
          {!value && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-muted/70">
              Dibuja tu firma aquí con el cursor
            </span>
          )}
        </div>
      ) : (
        <label className="flex h-[90px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border border-dashed border-primary/40 bg-white p-2 text-center hover:bg-primary/5">
          {value && value.startsWith('data:image/') ? (
            <img src={value} alt="Vista previa firma" className="max-h-[70px] object-contain" />
          ) : (
            <>
              <ImageUp className="h-5 w-5 text-primary" />
              <span className="text-[11px] font-medium text-muted">
                Haz clic para subir foto de firma (.png, .jpg)
              </span>
            </>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}

/* ==================== COMPONENTE PRINCIPAL ==================== */
export default function MisDocumentos() {
  const usuarioRaw = localStorage.getItem('usuario');
  const usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null;

  const [documents, setDocuments] = useState<UserDocItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<UserDocItem | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [loadingDocFile, setLoadingDocFile] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Correo del administrador oculto por defecto y correo del usuario editable
  const [adminEmail, setAdminEmail] = useState('');
  const [userEmail, setUserEmail] = useState(usuario?.email ?? '');
  const [sendingMail, setSendingMail] = useState(false);
  const [mailSentNotice, setMailSentNotice] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const dirtyRef = useRef(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const [pageRects, setPageRects] = useState<PageRect[]>([]);

  const measurePages = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const h = host.getBoundingClientRect();
    const next: PageRect[] = Array.from(host.querySelectorAll<HTMLElement>('[data-page-index]')).map(
      (el) => {
        const r = el.getBoundingClientRect();
        return {
          page: Number(el.dataset.pageIndex),
          left: r.left - h.left,
          top: r.top - h.top,
          width: r.width,
          height: r.height,
        };
      },
    );
    setPageRects((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    if (!usuario?.id) return;
    setLoadingList(true);
    fetch(`${API_URL}/api/usuario/${usuario.id}/documentos`)
      .then((res) => (res.ok ? res.json() : []))
      .then(async (data: UserDocItem[]) => {
        setDocuments(data);

        // Apertura directa (p. ej. la copia creada desde Inicio): /mis-documentos?doc=ID
        const docId = new URLSearchParams(window.location.search).get('doc');
        if (!docId) return;
        const assigned = data.find((d) => d.id === docId);
        if (assigned) void handleSelectDocument(assigned);
        else setErrorNotice('El documento solicitado no está en tu lista.');
      })
      .catch(() => setDocuments([]))
      .finally(() => setLoadingList(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    setPageRects([]);

    if (!docFile || !selectedDoc) return;

    let cancelled = false;
    const mount = document.createElement('div');
    host.appendChild(mount);

    (async () => {
      try {
        if (selectedDoc.kind === 'pdf') {
          await renderPdfPages(docFile, mount, () => cancelled);
        } else {
          await renderDocxPages(docFile, mount);
        }
        if (!cancelled) measurePages();
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      mount.remove();
    };
  }, [docFile, selectedDoc, measurePages]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    let timer: number | undefined;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measurePages, 100);
    });
    ro.observe(host);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [measurePages]);

  async function handleSelectDocument(doc: UserDocItem) {
    if (selectedDoc && selectedDoc.id !== doc.id) await flushDraft();
    setSelectedDoc(doc);
    setDocFile(null);
    dirtyRef.current = false;
    setSaveStatus('idle');
    setFormValues(doc.valores ?? {});
    setMailSentNotice('');
    setGeneratedUrl('');
    setErrorNotice('');
    setAdminEmail(doc.adminEmail || 'admin@prueba.com');
    setUserEmail(usuario?.email || '');
    setLoadingDocFile(true);

    if (!doc.visto) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, visto: true } : d)));
      void fetch(`${API_URL}/api/usuario/documentos/${encodeURIComponent(doc.id)}/visto`, {
        method: 'PATCH',
      });
    }

    try {
      const fileRes = await fetch(`${API_URL}/api/documentos/${encodeURIComponent(doc.id)}/archivo`);
      if (!fileRes.ok) throw new Error('No se pudo cargar el archivo');
      const blob = await fileRes.blob();
      setDocFile(new File([blob], doc.fileName, { type: blob.type }));
    } catch {
      setErrorNotice('No se pudo descargar el documento desde el servidor.');
    } finally {
      setLoadingDocFile(false);
    }
  }

  const activeFields = useMemo(() => {
    if (!selectedDoc) return [];
    const fieldBoxes = selectedDoc.boxes.filter((b) => b.kind === 'field');
    if (fieldBoxes.length === 0) return [];

    const seen = new Set<string>();
    const result: FieldLabel[] = [];

    for (const box of fieldBoxes) {
      const key = box.labelId || box.label;
      if (seen.has(key)) continue;
      seen.add(key);

      const definedLabel = selectedDoc.labels.find(
        (l) => l.id === box.labelId || l.name === box.label,
      );
      if (definedLabel) {
        result.push(definedLabel);
      } else {
        result.push({
          id: key,
          name: box.label,
          dataType: box.dataType,
          dashRule: box.dashRule,
        });
      }
    }
    return result;
  }, [selectedDoc]);

  function handleInputChange(field: FieldLabel, rawValue: string) {
    const formatted = formatFieldValue(rawValue, field.dataType, field.dashRule);
    dirtyRef.current = true;
    const alias = field.name.trim().toLowerCase();
    // Se guarda también bajo el nombre normalizado para que visor y estampado resuelvan la misma clave.
    setFormValues((prev) => ({ ...prev, [field.id]: formatted, [alias]: formatted }));
  }

  const saveDraft = useCallback(async (docId: string, valores: Record<string, string>) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(
        `${API_URL}/api/usuario/documentos/${encodeURIComponent(docId)}/borrador`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valores }),
        },
      );
      if (!res.ok) throw new Error();
      setSaveStatus('saved');
      // Sincroniza el borrador en la lista en memoria para que reabrir muestre lo último.
      setDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, valores } : d)));
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, []);

  /** Cancela el debounce pendiente y guarda ya los últimos valores, si hay cambios sin guardar. */
  async function flushDraft() {
    if (selectedDoc && dirtyRef.current) {
      dirtyRef.current = false;
      const ok = await saveDraft(selectedDoc.id, formValues);
      if (!ok) dirtyRef.current = true;
    }
  }

  async function refreshDocuments() {
    if (!usuario?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/usuario/${usuario.id}/documentos`);
      if (res.ok) setDocuments(await res.json());
    } catch {
      /* se conserva la lista en memoria */
    }
  }

  // Autoguardado con debounce: solo tras ediciones del usuario, no al precargar el borrador.
  useEffect(() => {
    if (!selectedDoc || !dirtyRef.current) return;
    const docId = selectedDoc.id;
    const timer = window.setTimeout(() => {
      if (!dirtyRef.current) return; // ya guardado por un flush inmediato
      dirtyRef.current = false;
      void saveDraft(docId, formValues);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [formValues, selectedDoc, saveDraft]);

  async function handleBackToList() {
    // Guarda de inmediato cualquier cambio pendiente del debounce antes de salir.
    await flushDraft();
    setSelectedDoc(null);
    setDocFile(null);
    window.history.pushState({}, '', '/mis-documentos');
    await refreshDocuments();
  }

  async function handleSendEmails(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoc || !usuario?.id) return;

    setSendingMail(true);
    setMailSentNotice('');
    setGeneratedUrl('');
    setErrorNotice('');

    try {
      const res = await fetch(
        `${API_URL}/api/usuario/documentos/${encodeURIComponent(selectedDoc.id)}/enviar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usuario_id: usuario.id,
            correo_usuario: userEmail,
            correo_admin: adminEmail,
            valores: formValues,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al enviar los correos');
      setMailSentNotice(data.mensaje);
      setGeneratedUrl(data.url_descarga || '');
    } catch (err) {
      setErrorNotice(err instanceof Error ? err.message : 'No se pudo procesar el envío');
    } finally {
      setSendingMail(false);
    }
  }

  async function handleDownloadGenerated() {
    if (!selectedDoc || !generatedUrl) return;
    setDownloading(true);
    setErrorNotice('');
    try {
      const res = await axios.get<Blob>(`${API_URL}${generatedUrl}`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${selectedDoc.name.replace(/[^\w\- ]+/g, '').trim() || 'documento'}_completado.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setErrorNotice('No se pudo descargar el PDF generado.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-bg-light">
      <TopHeader active="documentos" />

      <main className="flex-1 p-10">
        {!selectedDoc ? (
          /* ==================== LISTA CON FORMA Y COLOR ORIGINAL DE TARJETAS ==================== */
          <>
            <h2 className="mb-[5px] text-[26px] font-bold">Mis documentos</h2>
            <p className="text-sm font-semibold text-primary">
              {documents.length} {documents.length === 1 ? 'disponible' : 'disponibles'}
            </p>

            {loadingList ? (
              <p className="mt-[30px] text-sm text-muted">Cargando documentos…</p>
            ) : documents.length === 0 ? (
              <p className="mt-[30px] text-sm text-muted">
                No hay documentos disponibles por el momento.
              </p>
            ) : (
              <div className="mt-[30px] flex max-w-[600px] flex-col gap-[15px]">
                {documents.map((doc) => {
                  const isUnread = !doc.visto;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => void handleSelectDocument(doc)}
                      className="flex cursor-pointer items-center justify-between gap-5"
                    >
                      <div
                        className={`flex h-[45px] flex-1 items-center rounded-[10px] bg-card px-4 text-sm font-semibold text-main transition-all duration-200 hover:bg-card-hover ${
                          isUnread ? 'shadow-[0_4px_12px_rgba(0,0,0,0.16)]' : ''
                        }`}
                      >
                        <span className="truncate">{doc.name}</span>
                      </div>

                      <div className="flex min-w-[120px] items-center gap-2 text-sm font-semibold text-main">
                        {doc.visto ? 'Disponible' : 'Nuevo'}
                        <Download className="h-4 w-4" strokeWidth={2.5} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* ==================== VISTA DE LLENADO EN TIEMPO REAL ==================== */
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleBackToList()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[20px] border-none bg-white px-4 py-2 text-xs font-semibold text-main shadow-sm transition-colors hover:bg-card"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a mis documentos
                </button>
                <div>
                  <h2 className="text-xl font-bold text-main">{selectedDoc.name}</h2>
                  {saveStatus !== 'idle' && (
                    <p
                      className={`text-[11px] font-semibold ${
                        saveStatus === 'error' ? 'text-brand-red' : 'text-muted'
                      }`}
                    >
                      {saveStatus === 'saving'
                        ? 'Guardando cambios…'
                        : saveStatus === 'saved'
                          ? 'Guardado automáticamente'
                          : 'No se pudo guardar el borrador'}
                    </p>
                  )}
                  {selectedDoc.revocadoEnOrigen && (
                    <p className="text-[11px] font-semibold text-brand-red">
                      El administrador retiró este documento: se conserva en solo lectura.
                    </p>
                  )}
                  <p className="text-xs font-medium text-muted">
                    Completa los campos a la izquierda y observa cómo se llena el documento en vivo
                  </p>
                </div>
              </div>
            </div>

            {errorNotice && (
              <p className="mb-4 rounded-[10px] bg-brand-red/10 px-4 py-2 text-xs font-semibold text-brand-red">
                {errorNotice}
              </p>
            )}

            <div className="flex flex-col gap-5 lg:h-[calc(100vh-230px)] lg:flex-row lg:overflow-hidden">
              {/* COLUMNA IZQUIERDA: FORMULARIO + ENVÍO POR CORREO */}
              <aside className="flex w-full shrink-0 flex-col gap-4 lg:h-full lg:w-[390px] lg:overflow-y-auto lg:pr-1">
                <section className="rounded-[15px] bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-bold text-main">Datos del documento</h3>

                  {activeFields.length === 0 ? (
                    <p className="rounded-[10px] bg-bg-light p-3 text-xs text-muted">
                      Este documento no tiene campos configurados para llenar.
                    </p>
                  ) : (
                    <fieldset
                      disabled={!!selectedDoc.revocadoEnOrigen}
                      className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0 disabled:opacity-70"
                    >
                      {activeFields.map((field) => (
                        <div key={field.id} className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-main">{field.name}</label>

                          {field.dataType === 'signature' ? (
                            <UserSignaturePad
                              value={formValues[field.id] ?? ''}
                              onChange={(dataUrl) => handleInputChange(field, dataUrl)}
                            />
                          ) : (
                            <input
                              type="text"
                              value={formValues[field.id] ?? ''}
                              onChange={(e) => handleInputChange(field, e.target.value)}
                              placeholder={
                                field.dashRule === 'auto_id'
                                  ? 'Ej: 01234567-8'
                                  : field.dashRule === 'auto_phone'
                                    ? 'Ej: 7777-8888'
                                    : `Escribe ${field.name.toLowerCase()}…`
                              }
                              className="w-full rounded-[10px] bg-bg-light px-3 py-2 text-sm text-main outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          )}
                        </div>
                      ))}
                    </fieldset>
                  )}
                </section>

                {/* Envío por correo (correo del administrador oculto por defecto) */}
                <section className="rounded-[15px] bg-white p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold text-main">Enviar documento por correo</h3>
                  </div>
                  <p className="mb-3 text-[11px] text-muted">
                    Ingresa el correo donde deseas recibir el documento completado (por defecto aparece el tuyo):
                  </p>

                  <form onSubmit={handleSendEmails} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                      Correo de destino
                      <input
                        type="email"
                        required
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        placeholder="tucorreo@ejemplo.com"
                        className="w-full rounded-[10px] bg-bg-light px-3 py-2 text-xs font-medium text-main outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={sendingMail}
                      className="mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[20px] border-none bg-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendingMail ? 'Enviando documento…' : 'Enviar documento'}
                    </button>

                    {mailSentNotice && (
                      <div className="flex items-start gap-2 rounded-[10px] bg-primary/10 p-2.5 text-[11px] font-semibold text-primary">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{mailSentNotice}</span>
                      </div>
                    )}

                    {generatedUrl && (
                      <button
                        type="button"
                        onClick={() => void handleDownloadGenerated()}
                        disabled={downloading}
                        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[20px] border border-primary bg-white px-4 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {downloading ? 'Descargando…' : 'Descargar PDF'}
                      </button>
                    )}
                  </form>
                </section>
              </aside>

              {/* COLUMNA DERECHA: DOCUMENTO LLENÁNDOSE EN TIEMPO REAL */}
              <div className="min-h-[500px] min-w-0 flex-1 rounded-[15px] bg-card p-5 lg:h-full lg:overflow-y-auto">
                {loadingDocFile ? (
                  <p className="py-12 text-center text-sm font-semibold text-muted">
                    Cargando documento…
                  </p>
                ) : (
                  <div className="relative w-full">
                    <div ref={hostRef} />

                    <div className="pointer-events-none absolute inset-0">
                      {pageRects.map((rect) => (
                        <div
                          key={rect.page}
                          className="absolute"
                          style={{
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                          }}
                        >
                          {selectedDoc.boxes
                            .filter((b) => b.page === rect.page)
                            .map((box) => (
                              <LiveReadonlyBox
                                key={box.id || `${box.labelId || box.label}-${box.x_pct}-${box.y_pct}`}
                                box={box}
                                rect={rect}
                                liveValue={resolveBoxValue(box, formValues, selectedDoc.labels)}
                              />
                            ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <PageFooter />
    </div>
  );
}