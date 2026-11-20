// frontend/src/pages/AdminEditor.tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  Check,
  Copy,
  Eraser,
  Eye,
  FileUp,
  ImageUp,
  LayoutGrid,
  LogOut,
  Pencil,
  PenTool,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { renderAsync } from 'docx-preview';
import DashboardLayout from '../components/DashboardLayout';
import { addDocument, loadDocumentForEditor, saveDocumentTemplate } from '../store/documentStore';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type BoxKind = 'field' | 'patch';
export type DocumentKind = 'pdf' | 'docx';
export type FieldDataType = 'any' | 'text' | 'number' | 'id_card' | 'phone' | 'signature';
export type DashRule = 'none' | 'auto_id' | 'auto_phone';

export interface FieldLabel {
  id: string;
  name: string;
  dataType: FieldDataType;
  dashRule: DashRule;
  isSystem?: boolean;
}

export interface DetectedFontInfo {
  fontFamily: string;
  sizePt: number;
  sizePx: number;
  occurrences: number;
}

export interface MappedBox {
  id: string;
  kind: BoxKind;
  labelId?: string;
  label: string;
  dataType: FieldDataType;
  dashRule: DashRule;
  fontFamily?: string;
  page: number;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  font_max: number;
  text: string;
}

interface PageRect {
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

const BOX_DEFAULTS: Record<BoxKind, { w_pct: number; h_pct: number; font_max: number }> = {
  field: { w_pct: 25, h_pct: 3, font_max: 14 },
  patch: { w_pct: 30, h_pct: 3.5, font_max: 16 },
};

const SIGNATURE_DEFAULTS = { w_pct: 26, h_pct: 8, font_max: 14 };
const MIN_FONT = 6;
const PDF_SCALE = 1.5;

const SIGNATURE_LABEL: FieldLabel = {
  id: 'firma',
  name: 'Firma',
  dataType: 'signature',
  dashRule: 'none',
  isSystem: true,
};

const DEFAULT_LABELS: FieldLabel[] = [
  { id: 'nombre', name: 'Nombre', dataType: 'text', dashRule: 'none' },
  SIGNATURE_LABEL,
  { id: 'dui', name: 'DUI', dataType: 'id_card', dashRule: 'auto_id' },
  { id: 'telefono', name: 'Teléfono', dataType: 'phone', dashRule: 'auto_phone' },
];

const DATA_TYPE_LABELS: Record<FieldDataType, string> = {
  any: 'Texto y números',
  text: 'Solo texto',
  number: 'Solo números',
  id_card: 'DUI / Identificación',
  phone: 'Teléfono',
  signature: 'Firma (Cursor / Imagen)',
};

const DASH_RULE_LABELS: Record<DashRule, string> = {
  none: 'Sin guion',
  auto_id: 'Guion para DUI (00000000-0)',
  auto_phone: 'Guion para Teléfono (0000-0000)',
};

const inputClass =
  'w-full rounded-[10px] bg-bg-light px-3 py-2 text-sm text-main outline-none focus:ring-2 focus:ring-primary/40';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const roundPct = (v: number): number => Math.round(v * 100) / 100;

function normalizeBox(b: MappedBox): MappedBox {
  const w = clamp(b.w_pct, 1, 100);
  const h = clamp(b.h_pct, 0.5, 100);
  return {
    ...b,
    w_pct: roundPct(w),
    h_pct: roundPct(h),
    x_pct: roundPct(clamp(b.x_pct, 0, 100 - w)),
    y_pct: roundPct(clamp(b.y_pct, 0, 100 - h)),
    font_max: Math.round(clamp(b.font_max, MIN_FONT, 96)),
  };
}

function detectKind(file: File): DocumentKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  return null;
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

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

function fitBoxToFont(
  box: MappedBox,
  textSample: string,
  pageWidthPx: number,
  pageHeightPx: number,
): { w_pct: number; h_pct: number } {
  if (box.dataType === 'signature' || pageWidthPx <= 0 || pageHeightPx <= 0) {
    return { w_pct: box.w_pct, h_pct: box.h_pct };
  }

  const fontSize = Math.max(MIN_FONT, box.font_max);
  const family = box.fontFamily || 'sans-serif';
  const content = (textSample || box.label || 'Texto').trim();

  let textWidthPx = content.length * (fontSize * 0.6);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `600 ${fontSize}px ${family}`;
      textWidthPx = ctx.measureText(content).width;
    }
  }

  const targetWidthPx = textWidthPx + 18;
  const targetHeightPx = Math.ceil(fontSize * 1.45) + 4;

  const neededWPct = roundPct(clamp((targetWidthPx / pageWidthPx) * 100, 4, 100 - box.x_pct));
  const neededHPct = roundPct(clamp((targetHeightPx / pageHeightPx) * 100, 1.5, 100 - box.y_pct));

  return {
    w_pct: Math.max(box.w_pct, neededWPct),
    h_pct: neededHPct,
  };
}

function aggregateFonts(
  rawList: Array<{ fontFamily: string; sizePt: number; sizePx: number }>,
): DetectedFontInfo[] {
  const map = new Map<string, DetectedFontInfo>();
  for (const item of rawList) {
    const cleanFamily = item.fontFamily.replace(/['"]/g, '').split(',')[0].trim() || 'Sans-serif';
    const pt = Math.round(item.sizePt * 10) / 10;
    const px = Math.round(item.sizePx);
    if (pt <= 0) continue;
    const key = `${cleanFamily}__${pt}`;
    const existing = map.get(key);
    if (existing) existing.occurrences += 1;
    else map.set(key, { fontFamily: cleanFamily, sizePt: pt, sizePx: px, occurrences: 1 });
  }
  return Array.from(map.values()).sort((a, b) => b.occurrences - a.occurrences);
}

async function renderPdf(
  file: File,
  mount: HTMLElement,
  isCancelled: () => boolean,
): Promise<DetectedFontInfo[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const dpr = window.devicePixelRatio || 1;
  const collectedFonts: Array<{ fontFamily: string; sizePt: number; sizePx: number }> = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    if (isCancelled()) return [];
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: PDF_SCALE });

    try {
      const textContent = await page.getTextContent();
      const styles = textContent.styles as Record<string, { fontFamily?: string }>;
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim().length > 0) {
          const scaleY = Math.hypot(item.transform[2], item.transform[3]);
          const scaleX = Math.hypot(item.transform[0], item.transform[1]);
          const sizePt = scaleY || scaleX || 12;
          const sizePx = sizePt * PDF_SCALE;
          const rawFamily = styles[item.fontName]?.fontFamily || item.fontName || 'Helvetica';
          collectedFonts.push({ fontFamily: rawFamily, sizePt, sizePx });
        }
      }
    } catch {
      /* PDF escaneado */
    }

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

    if (isCancelled()) return [];
    mount.appendChild(wrap);

    await page.render({
      canvas,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    }).promise;
  }
  return aggregateFonts(collectedFonts);
}

async function renderDocx(file: File, mount: HTMLElement): Promise<DetectedFontInfo[]> {
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

  const collectedFonts: Array<{ fontFamily: string; sizePt: number; sizePx: number }> = [];
  mount.querySelectorAll<HTMLElement>('section.docx p, section.docx span, section.docx td').forEach((el) => {
    const text = el.textContent?.trim();
    if (!text) return;
    const computed = window.getComputedStyle(el);
    const px = parseFloat(computed.fontSize);
    if (!Number.isNaN(px) && px > 0) {
      collectedFonts.push({
        fontFamily: computed.fontFamily || 'Calibri',
        sizePt: px * 0.75,
        sizePx: px,
      });
    }
  });
  return aggregateFonts(collectedFonts);
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

function MappedBoxItem({
  box,
  rect,
  selected,
  editMode,
  liveValue = '',
  previewMode = false,
  onSelect,
  onChange,
  onDelete,
}: {
  box: MappedBox;
  rect: PageRect;
  selected: boolean;
  editMode: boolean;
  liveValue?: string;
  previewMode?: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, changes: Partial<MappedBox>) => void;
  onDelete: (id: string) => void;
}) {
  const fitRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const isPatch = box.kind === 'patch';
  const isSignature = box.dataType === 'signature';
  const isImageSignature = isSignature && liveValue.startsWith('data:image/');
  const hasLiveText = !isSignature && liveValue.trim().length > 0;

  useAutoFit(isPatch ? textRef : fitRef, box.font_max, [
    box.text,
    box.label,
    box.fontFamily,
    liveValue,
    box.w_pct,
    box.h_pct,
    rect.width,
    rect.height,
  ]);

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!editMode || previewMode) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(box.id);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const originX = box.x_pct;
    const originY = box.y_pct;

    const move = (ev: PointerEvent) => {
      const x = clamp(originX + ((ev.clientX - startX) / rect.width) * 100, 0, 100 - box.w_pct);
      const y = clamp(originY + ((ev.clientY - startY) / rect.height) * 100, 0, 100 - box.h_pct);
      onChange(box.id, { x_pct: x, y_pct: y });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    if (!editMode || previewMode) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const originW = box.w_pct;
    const originH = box.h_pct;

    const move = (ev: PointerEvent) => {
      const w = clamp(originW + ((ev.clientX - startX) / rect.width) * 100, 1, 100 - box.x_pct);
      const h = clamp(originH + ((ev.clientY - startY) / rect.height) * 100, 0.5, 100 - box.y_pct);
      onChange(box.id, { w_pct: w, h_pct: h });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  const canEditBox = editMode && !previewMode;
  const frame = isPatch
    ? `bg-[#ffffff] ${canEditBox ? 'border border-dashed border-brand-red' : ''} ${selected && canEditBox ? 'ring-2 ring-brand-red/40' : ''}`
    : previewMode
      ? 'bg-transparent border border-primary/30'
      : `bg-primary/10 border-2 border-dashed border-primary ${selected && canEditBox ? 'border-solid ring-2 ring-primary/40' : ''}`;

  return (
    <div
      className={`pointer-events-auto absolute z-30 box-border ${frame}`}
      style={{
        left: `${box.x_pct}%`,
        top: `${box.y_pct}%`,
        width: `${box.w_pct}%`,
        height: `${box.h_pct}%`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!previewMode) onSelect(box.id);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {canEditBox && selected && (
        <div
          onPointerDown={startDrag}
          className={`absolute -top-[22px] left-0 flex h-[22px] cursor-move touch-none select-none items-center gap-2 rounded-t-[6px] px-2 text-[10px] font-semibold text-white ${
            isPatch ? 'bg-brand-red' : 'bg-primary'
          }`}
        >
          <span className="max-w-[140px] truncate">
            {isPatch ? 'Parche' : box.label} · p.{box.page}
          </span>
          <button
            type="button"
            aria-label="Eliminar caja"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(box.id)}
            className="flex cursor-pointer items-center border-none bg-transparent p-0 text-white"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {isPatch ? (
        <textarea
          ref={textRef}
          value={box.text}
          readOnly={previewMode}
          placeholder={canEditBox ? 'Texto corregido…' : ''}
          onChange={(e) => onChange(box.id, { text: e.target.value })}
          spellCheck={false}
          style={box.fontFamily ? { fontFamily: box.fontFamily } : undefined}
          className="block h-full w-full resize-none overflow-hidden border-none bg-[#ffffff] p-0.5 font-sans leading-tight text-main outline-none placeholder:text-muted"
        />
      ) : isImageSignature ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden p-0.5">
          <img src={liveValue} alt="Firma" className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div
          ref={fitRef}
          style={box.fontFamily ? { fontFamily: box.fontFamily } : undefined}
          className={`flex h-full w-full items-center overflow-hidden break-words px-1 font-sans leading-tight ${
            hasLiveText ? 'font-medium text-main' : 'font-semibold text-primary/80'
          }`}
        >
          {hasLiveText ? liveValue : previewMode ? '' : box.label}
        </div>
      )}

      {canEditBox && selected && (
        <div
          onPointerDown={startResize}
          className={`absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize touch-none rounded-sm ${
            isPatch ? 'bg-brand-red' : 'bg-primary'
          }`}
        />
      )}
    </div>
  );
}

function SignaturePadBox({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
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
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    }
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

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        className={inputClass}
      />
    </label>
  );
}

export default function AdminEditor() {
  const [docId, setDocId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('doc'),
  );
  const [loadingDoc, setLoadingDoc] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempDocName, setTempDocName] = useState('');

  const [detectedFonts, setDetectedFonts] = useState<DetectedFontInfo[]>([]);
  const [labels, setLabels] = useState<FieldLabel[]>(DEFAULT_LABELS);
  const [activeLabelId, setActiveLabelId] = useState<string | null>(DEFAULT_LABELS[0].id);

  const [newLabel, setNewLabel] = useState('');
  const [newDataType, setNewDataType] = useState<FieldDataType>('any');
  const [newDashRule, setNewDashRule] = useState<DashRule>('none');

  const [editMode, setEditMode] = useState(true);
  const [viewMode, setViewMode] = useState<'design' | 'live'>('design');
  const [boxKind, setBoxKind] = useState<BoxKind>('field');
  const [boxes, setBoxes] = useState<MappedBox[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveValues, setLiveValues] = useState<Record<string, string>>({});

  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [copied, setCopied] = useState(false);

  const hostRef = useRef<HTMLDivElement>(null);
  const [renderStatus, setRenderStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [renderError, setRenderError] = useState('');
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
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    setPageRects([]);

    if (!file) {
      setRenderStatus('idle');
      setDetectedFonts([]);
      return;
    }

    const kind = detectKind(file);
    if (!kind) {
      setRenderStatus('error');
      setRenderError('Formato no soportado. Sube un .pdf o .docx');
      return;
    }

    let cancelled = false;
    const mount = document.createElement('div');
    host.appendChild(mount);
    setRenderStatus('loading');
    setRenderError('');

    (async () => {
      try {
        const fonts =
          kind === 'pdf'
            ? await renderPdf(file, mount, () => cancelled)
            : await renderDocx(file, mount);
        if (cancelled) return;
        setDetectedFonts(fonts);
        setRenderStatus('ready');
        measurePages();
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setRenderStatus('error');
        setRenderError('No se pudo renderizar el documento.');
      }
    })();

    return () => {
      cancelled = true;
      mount.remove();
    };
  }, [file, measurePages]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measurePages());
    ro.observe(host);
    return () => ro.disconnect();
  }, [measurePages]);

  // Cargar plantilla guardada desde SQLite cuando viene ?doc=ID
  useEffect(() => {
    const idFromUrl = new URLSearchParams(window.location.search).get('doc');
    if (!idFromUrl) return;

    let cancelled = false;
    setLoadingDoc(true);
    loadDocumentForEditor(idFromUrl)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setNotice('No se pudo cargar el documento desde el servidor.');
          return;
        }
        setDocId(res.doc.id);
        setDocName(res.doc.name);
        setFile(res.file);
        if (Array.isArray(res.doc.labels) && res.doc.labels.length > 0) {
          setLabels(res.doc.labels);
          setActiveLabelId(res.doc.labels[0].id);
        }
        if (Array.isArray(res.doc.boxes) && res.doc.boxes.length > 0) {
          setBoxes(
            res.doc.boxes.map((b: MappedBox) =>
              normalizeBox({
                ...b,
                id: b.id || uid(),
                text: b.text || '',
              }),
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = boxes.find((b) => b.id === selectedId) ?? null;
  const activeLabel = labels.find((l) => l.id === activeLabelId) ?? null;
  const hasSignatureLabel = labels.some((l) => l.id === 'firma' || l.dataType === 'signature');

  const placedLabels = useMemo(() => {
    const fieldBoxes = boxes.filter((b) => b.kind === 'field');
    if (fieldBoxes.length === 0) return [];
    const usedIds = new Set(fieldBoxes.map((b) => b.labelId || b.label));
    return labels.filter((l) => usedIds.has(l.id) || usedIds.has(l.name));
  }, [boxes, labels]);

  function adaptBoxDimensions(box: MappedBox, customSampleText?: string): MappedBox {
    const rect = pageRects.find((r) => r.page === box.page) ?? pageRects[0];
    if (!rect || box.dataType === 'signature') return normalizeBox(box);

    const key = box.labelId || box.label;
    const sample =
      customSampleText !== undefined
        ? customSampleText
        : box.kind === 'patch'
          ? box.text || 'Texto corregido'
          : liveValues[key] || box.label;

    const fitted = fitBoxToFont(box, sample, rect.width, rect.height);
    return normalizeBox({ ...box, w_pct: fitted.w_pct, h_pct: fitted.h_pct });
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!detectKind(f)) {
      setNotice('Formato no soportado. Sube un .pdf o .docx');
      return;
    }
    setNotice('');
    try {
      const created = await addDocument(f, f.name);
      setDocId(created.id);
      setFile(f);
      setDocName(created.name);
      setIsEditingName(false);
      setBoxes([]);
      setSelectedId(null);
      setLiveValues({});
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Error al subir archivo');
    }
  }

  function handleExitDocument() {
    window.history.pushState({}, '', '/admin/documentos');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
  }

  async function handleSaveTemplate() {
    if (!file) return;
    setSaving(true);
    setNotice('');
    try {
      let targetId = docId;
      if (!targetId) {
        const created = await addDocument(file, docName || file.name);
        targetId = created.id;
        setDocId(targetId);
      }

      await saveDocumentTemplate(targetId, {
        name: docName || file.name,
        labels,
        boxes,
        detected_fonts: detectedFonts,
      });

      setSavedToast(true);
      window.setTimeout(() => setSavedToast(false), 2000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Error al guardar en el servidor');
    } finally {
      setSaving(false);
    }
  }

  function startEditingName() {
    setTempDocName(docName);
    setIsEditingName(true);
  }

  function commitDocName() {
    const trimmed = tempDocName.trim();
    if (trimmed) setDocName(trimmed);
    setIsEditingName(false);
  }

  function restoreSignatureLabel() {
    if (hasSignatureLabel) return;
    setLabels((prev) => [prev[0], SIGNATURE_LABEL, ...prev.slice(1)]);
    setActiveLabelId(SIGNATURE_LABEL.id);
    setBoxKind('field');
  }

  function addLabel() {
    const name = newLabel.trim();
    if (!name) return;
    const label: FieldLabel = {
      id: uid(),
      name,
      dataType: newDataType,
      dashRule: newDashRule,
    };
    setLabels((prev) => [...prev, label]);
    setActiveLabelId(label.id);
    setBoxKind('field');
    setNewLabel('');
    setNewDataType('any');
    setNewDashRule('none');
  }

  function updateLabelConfig(id: string, changes: Partial<FieldLabel>) {
    setLabels((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...changes };
        setLiveValues((vals) =>
          vals[id]
            ? { ...vals, [id]: formatFieldValue(vals[id], updated.dataType, updated.dashRule) }
            : vals,
        );
        return updated;
      }),
    );
    setBoxes((prev) =>
      prev.map((b) =>
        b.labelId === id
          ? {
              ...b,
              label: changes.name ?? b.label,
              dataType: changes.dataType ?? b.dataType,
              dashRule: changes.dashRule ?? b.dashRule,
            }
          : b,
      ),
    );
  }

  function removeLabel(id: string) {
    if (id === 'firma') return;
    setLabels((prev) => prev.filter((l) => l.id !== id));
    if (activeLabelId === id) setActiveLabelId(null);
    setLiveValues((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function handleLiveInputChange(label: FieldLabel, rawInput: string) {
    const formatted = formatFieldValue(rawInput, label.dataType, label.dashRule);
    setLiveValues((prev) => ({ ...prev, [label.id]: formatted }));

    if (label.dataType !== 'signature') {
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.kind === 'field' && (b.labelId === label.id || b.label === label.name)) {
            return adaptBoxDimensions(b, formatted || label.name);
          }
          return b;
        }),
      );
    }
  }

  function removeLabelFromDocument(label: FieldLabel) {
    setBoxes((prev) => {
      const remaining = prev.filter(
        (b) => !(b.kind === 'field' && (b.labelId === label.id || b.label === label.name)),
      );
      if (selectedId && !remaining.some((b) => b.id === selectedId)) setSelectedId(null);
      return remaining;
    });
    setLiveValues((prev) => {
      const copy = { ...prev };
      delete copy[label.id];
      delete copy[label.name];
      return copy;
    });
  }

  function placeBox(page: number, x: number, y: number) {
    if (boxKind === 'field' && !activeLabel) {
      setNotice('Selecciona o crea una etiqueta antes de colocar una caja.');
      return;
    }
    setNotice('');
    const isSig = boxKind === 'field' && activeLabel?.dataType === 'signature';
    const d = isSig ? SIGNATURE_DEFAULTS : BOX_DEFAULTS[boxKind];
    const defaultDetectedFont = detectedFonts[0];

    const rawBox: MappedBox = {
      id: uid(),
      kind: boxKind,
      labelId: boxKind === 'field' ? activeLabel?.id : undefined,
      label: boxKind === 'patch' ? 'Parche' : (activeLabel as FieldLabel).name,
      dataType: boxKind === 'field' && activeLabel ? activeLabel.dataType : 'any',
      dashRule: boxKind === 'field' && activeLabel ? activeLabel.dashRule : 'none',
      fontFamily: defaultDetectedFont?.fontFamily,
      page,
      x_pct: clamp(x, 0, 100 - d.w_pct),
      y_pct: clamp(y - d.h_pct / 2, 0, 100 - d.h_pct),
      w_pct: d.w_pct,
      h_pct: d.h_pct,
      font_max: defaultDetectedFont ? defaultDetectedFont.sizePx : d.font_max,
      text: '',
    };

    const box = adaptBoxDimensions(rawBox);
    setBoxes((prev) => [...prev, box]);
    setSelectedId(box.id);
  }

  function updateBox(id: string, changes: Partial<MappedBox>) {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const merged = { ...b, ...changes };
        const fontChanged = changes.font_max !== undefined || changes.fontFamily !== undefined;
        return fontChanged ? adaptBoxDimensions(merged) : normalizeBox(merged);
      }),
    );
  }

  function deleteBox(id: string) {
    setBoxes((prev) => {
      const target = prev.find((b) => b.id === id);
      const next = prev.filter((b) => b.id !== id);
      if (target && target.kind === 'field') {
        const keyId = target.labelId;
        const keyName = target.label;
        const stillExists = next.some(
          (b) => b.kind === 'field' && ((keyId && b.labelId === keyId) || b.label === keyName),
        );
        if (!stillExists) {
          setLiveValues((vals) => {
            const copy = { ...vals };
            if (keyId) delete copy[keyId];
            if (keyName) delete copy[keyName];
            return copy;
          });
        }
      }
      return next;
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  const exportData = useMemo(
    () => ({
      document: { name: docName, type: file ? detectKind(file) : null },
      detected_fonts: detectedFonts,
      labels,
      boxes: boxes.map((b) => ({
        kind: b.kind,
        labelId: b.labelId,
        label: b.label,
        dataType: b.dataType,
        dashRule: b.dashRule,
        fontFamily: b.fontFamily,
        page: b.page,
        x_pct: b.x_pct,
        y_pct: b.y_pct,
        w_pct: b.w_pct,
        h_pct: b.h_pct,
        font_max: b.font_max,
        ...(b.kind === 'patch' ? { text: b.text } : {}),
      })),
    }),
    [boxes, file, docName, labels, detectedFonts],
  );
  const json = JSON.stringify(exportData, null, 2);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice('No se pudo copiar al portapapeles.');
    }
  }

  const canPlace = editMode && viewMode === 'design';

  return (
    <DashboardLayout active="documentos">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold leading-tight text-main">Editor de plantillas</h1>
          <p className="text-xs font-semibold text-muted">
            Mapea las etiquetas en el documento y guarda los cambios en el servidor
          </p>
        </div>

        {file && (
          <div className="flex rounded-[20px] bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('design')}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-[16px] border-none px-4 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'design'
                  ? 'bg-primary text-white'
                  : 'bg-transparent text-main hover:bg-bg-light'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Mapeo y Etiquetas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('live')}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-[16px] border-none px-4 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'live'
                  ? 'bg-primary text-white'
                  : 'bg-transparent text-main hover:bg-bg-light'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Vista Previa Limpia
            </button>
          </div>
        )}
      </div>

      {/* Barra de herramientas */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[15px] bg-white p-3.5 shadow-sm">
        {loadingDoc ? (
          <span className="text-xs font-semibold text-primary">
            Cargando documento desde el servidor…
          </span>
        ) : !file ? (
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-[20px] bg-primary px-5 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark">
              <FileUp className="h-4 w-4" strokeWidth={2} />
              Subir documento
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFile}
                className="hidden"
              />
            </label>
            <span className="text-xs font-medium text-muted">Ningún archivo seleccionado</span>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveTemplate}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[20px] border-none bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark disabled:opacity-60"
            >
              {savedToast ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? 'Guardando…' : savedToast ? 'Guardado' : 'Guardar'}
            </button>

            <button
              type="button"
              onClick={handleExitDocument}
              className="inline-flex cursor-pointer items-center gap-2 rounded-[20px] border-none bg-brand-red px-4 py-2 text-xs font-semibold text-white transition-opacity duration-200 hover:opacity-90"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>

            <div className="ml-2 flex items-center gap-2 border-l border-card pl-3">
              {isEditingName ? (
                <input
                  type="text"
                  autoFocus
                  value={tempDocName}
                  onChange={(e) => setTempDocName(e.target.value)}
                  onBlur={commitDocName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitDocName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  className="w-[260px] rounded-[8px] bg-bg-light px-2.5 py-1 text-xs font-semibold text-main outline-none ring-2 ring-primary"
                />
              ) : (
                <div
                  onDoubleClick={startEditingName}
                  title="Haz doble clic para cambiar el nombre del documento"
                  className="group flex cursor-pointer items-center gap-1.5 rounded-[8px] px-2 py-1 hover:bg-bg-light"
                >
                  <span className="max-w-[260px] truncate text-xs font-semibold text-main">
                    {docName}
                  </span>
                  <Pencil className="h-3 w-3 text-muted opacity-60 group-hover:opacity-100" />
                  <span className="text-[10px] text-muted">(doble clic para renombrar)</span>
                </div>
              )}
            </div>
          </>
        )}

        {file && viewMode === 'design' && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex rounded-[20px] bg-bg-light p-1">
              {(
                [
                  ['field', 'Campo'],
                  ['patch', 'Parche / Blanqueo de texto'],
                ] as const
              ).map(([kind, text]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setBoxKind(kind)}
                  className={`cursor-pointer rounded-[16px] border-none px-4 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                    boxKind === kind
                      ? kind === 'patch'
                        ? 'bg-brand-red text-white'
                        : 'bg-primary text-white'
                      : 'bg-transparent text-main hover:bg-card'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`cursor-pointer rounded-[20px] border-none px-4 py-2 text-xs font-semibold transition-colors duration-200 ${
                editMode
                  ? 'bg-primary text-white hover:bg-primary-dark'
                  : 'bg-card text-main hover:bg-card-hover'
              }`}
            >
              Modo edición: {editMode ? 'ON' : 'OFF'}
            </button>
          </div>
        )}
      </div>

      {notice && <p className="mb-3 text-xs font-semibold text-brand-red">{notice}</p>}

      {/* ÁREA DE TRABAJO */}
      <div className="flex flex-col gap-5 lg:h-[calc(100vh-215px)] lg:flex-row lg:overflow-hidden">
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:h-full lg:w-[375px] lg:overflow-y-auto lg:pr-1">
          <section className="rounded-[15px] bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-main">Formulario en tiempo real</h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                {placedLabels.length} activas
              </span>
            </div>

            {placedLabels.length === 0 ? (
              <p className="rounded-[10px] bg-bg-light p-3 text-xs text-muted">
                Coloca una etiqueta sobre el documento para que aparezca aquí y puedas probarla en vivo.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {placedLabels.map((lbl) => (
                  <div
                    key={lbl.id}
                    className="flex flex-col gap-1 rounded-[10px] border border-card/80 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-main">{lbl.name}</label>
                      <button
                        type="button"
                        onClick={() => removeLabelFromDocument(lbl)}
                        className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[10px] font-semibold text-brand-red hover:underline"
                      >
                        <Trash2 className="h-3 w-3" />
                        Quitar campo
                      </button>
                    </div>

                    {lbl.dataType === 'signature' ? (
                      <SignaturePadBox
                        value={liveValues[lbl.id] ?? ''}
                        onChange={(dataUrl) => handleLiveInputChange(lbl, dataUrl)}
                      />
                    ) : (
                      <>
                        <input
                          type="text"
                          value={liveValues[lbl.id] ?? ''}
                          onChange={(e) => handleLiveInputChange(lbl, e.target.value)}
                          placeholder={
                            lbl.dashRule === 'auto_id'
                              ? 'Ej: 01234567-8'
                              : lbl.dashRule === 'auto_phone'
                                ? 'Ej: 7777-8888'
                                : `Ingresa ${lbl.name.toLowerCase()}…`
                          }
                          className={inputClass}
                        />
                        <div className="flex flex-wrap gap-1.5 text-[10px] text-muted">
                          <span>{DATA_TYPE_LABELS[lbl.dataType]}</span>
                          {lbl.dashRule !== 'none' && (
                            <span className="font-semibold text-primary">
                              · {DASH_RULE_LABELS[lbl.dashRule]}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {file && (
            <section className="rounded-[15px] bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Type className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-main">Fuentes detectadas en el documento</h3>
              </div>
              {detectedFonts.length === 0 ? (
                <p className="text-xs text-muted">
                  No se detectó texto seleccionable (puede ser un documento escaneado).
                </p>
              ) : (
                <>
                  <p className="mb-2.5 text-[11px] text-muted">
                    Haz clic en una fuente para aplicar su tamaño exacto y adaptar la caja seleccionada:
                  </p>
                  <div className="flex max-h-[160px] flex-col gap-1.5 overflow-y-auto pr-1">
                    {detectedFonts.map((f, idx) => (
                      <button
                        key={`${f.fontFamily}-${f.sizePt}-${idx}`}
                        type="button"
                        onClick={() => {
                          if (!selected) {
                            setNotice('Selecciona primero una caja en el documento para aplicarle esta fuente.');
                            return;
                          }
                          setNotice('');
                          updateBox(selected.id, {
                            fontFamily: f.fontFamily,
                            font_max: f.sizePx,
                          });
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-[8px] border border-transparent bg-bg-light px-3 py-1.5 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <span
                          className="truncate font-semibold text-main"
                          style={{ fontFamily: f.fontFamily }}
                        >
                          {f.fontFamily}
                        </span>
                        <span className="ml-2 shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-bold text-primary">
                          {f.sizePt} pt ({f.sizePx} px)
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          <section className="rounded-[15px] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-main">Etiquetas</h3>
              {!hasSignatureLabel && (
                <button
                  type="button"
                  onClick={restoreSignatureLabel}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-[12px] border-none bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restaurar Firma
                </button>
              )}
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {labels.map((l) => {
                const isProtected = l.id === 'firma' || l.isSystem;
                return (
                  <span
                    key={l.id}
                    className={`inline-flex items-center gap-1 rounded-[20px] py-1 pl-3 ${
                      isProtected ? 'pr-3' : 'pr-2'
                    } text-xs font-semibold transition-colors duration-200 ${
                      l.id === activeLabelId && boxKind === 'field'
                        ? 'bg-primary text-white'
                        : 'bg-bg-light text-main hover:bg-card'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLabelId(l.id);
                        setBoxKind('field');
                      }}
                      className="cursor-pointer border-none bg-transparent p-0 text-inherit"
                    >
                      {l.name}
                    </button>
                    {!isProtected && (
                      <button
                        type="button"
                        aria-label={`Quitar ${l.name}`}
                        onClick={() => removeLabel(l.id)}
                        className="flex cursor-pointer items-center border-none bg-transparent p-0 text-inherit opacity-70 hover:opacity-100"
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>

            {activeLabel && activeLabel.dataType !== 'signature' && (
              <div className="mb-4 rounded-[12px] bg-bg-light p-3">
                <p className="mb-2 text-[11px] font-bold text-primary">
                  Reglas de «{activeLabel.name}»
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                    Tipo de dato
                    <select
                      value={activeLabel.dataType}
                      onChange={(e) =>
                        updateLabelConfig(activeLabel.id, {
                          dataType: e.target.value as FieldDataType,
                        })
                      }
                      className="rounded-[8px] bg-white px-2.5 py-1.5 text-xs text-main outline-none"
                    >
                      {Object.entries(DATA_TYPE_LABELS)
                        .filter(([k]) => k !== 'signature')
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                    Formato de guion
                    <select
                      value={activeLabel.dashRule}
                      onChange={(e) =>
                        updateLabelConfig(activeLabel.id, {
                          dashRule: e.target.value as DashRule,
                        })
                      }
                      className="rounded-[8px] bg-white px-2.5 py-1.5 text-xs text-main outline-none"
                    >
                      {Object.entries(DASH_RULE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-card pt-3">
              <span className="text-[11px] font-semibold text-muted">Nueva etiqueta personalizada</span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLabel()}
                placeholder="Ej: Dirección, NIT, Cargo…"
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newDataType}
                  onChange={(e) => setNewDataType(e.target.value as FieldDataType)}
                  className="rounded-[10px] bg-bg-light px-2.5 py-2 text-xs text-main outline-none"
                >
                  {Object.entries(DATA_TYPE_LABELS)
                    .filter(([k]) => k !== 'signature')
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>

                <select
                  value={newDashRule}
                  onChange={(e) => setNewDashRule(e.target.value as DashRule)}
                  className="rounded-[10px] bg-bg-light px-2.5 py-2 text-xs text-main outline-none"
                >
                  {Object.entries(DASH_RULE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={addLabel}
                className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Agregar etiqueta
              </button>
            </div>
          </section>

          {viewMode === 'design' && (
            <section className="rounded-[15px] bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold text-main">Caja seleccionada</h3>
              {selected ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold text-muted">
                    {selected.kind === 'patch' ? 'Parche / Blanqueo' : selected.label} · página{' '}
                    {selected.page}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <NumField
                      label="X (%)"
                      step={0.1}
                      value={selected.x_pct}
                      onChange={(v) => updateBox(selected.id, { x_pct: v })}
                    />
                    <NumField
                      label="Y (%)"
                      step={0.1}
                      value={selected.y_pct}
                      onChange={(v) => updateBox(selected.id, { y_pct: v })}
                    />
                    <NumField
                      label="Ancho (%)"
                      step={0.1}
                      value={selected.w_pct}
                      onChange={(v) => updateBox(selected.id, { w_pct: v })}
                    />
                    <NumField
                      label="Alto (%)"
                      step={0.1}
                      value={selected.h_pct}
                      onChange={(v) => updateBox(selected.id, { h_pct: v })}
                    />
                  </div>

                  {selected.dataType !== 'signature' && (
                    <div className="grid grid-cols-2 gap-3">
                      <NumField
                        label="Fuente máxima (px)"
                        step={1}
                        value={selected.font_max}
                        onChange={(v) => updateBox(selected.id, { font_max: v })}
                      />
                      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                        Tipografía
                        <input
                          type="text"
                          value={selected.fontFamily ?? ''}
                          onChange={(e) => updateBox(selected.id, { fontFamily: e.target.value })}
                          placeholder="Ej: Arial, Times…"
                          className={inputClass}
                        />
                      </label>
                    </div>
                  )}

                  {selected.kind === 'patch' && (
                    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                      Texto corregido
                      <textarea
                        rows={2}
                        value={selected.text}
                        onChange={(e) => updateBox(selected.id, { text: e.target.value })}
                        className={`${inputClass} resize-none`}
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() => deleteBox(selected.id)}
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[20px] border-none bg-brand-red px-4 py-2 text-xs font-semibold text-white transition-opacity duration-200 hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                    Eliminar caja
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted">Haz clic en una caja para editar sus valores.</p>
              )}
            </section>
          )}

          <section className="rounded-[15px] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-main">
                Vista previa JSON{' '}
                <span className="text-xs font-medium text-muted">({boxes.length})</span>
              </h3>
              <button
                type="button"
                onClick={copyJson}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-[20px] border-none bg-card px-3 py-1.5 text-[11px] font-semibold text-main transition-colors duration-200 hover:bg-card-hover"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <pre className="max-h-[200px] overflow-auto rounded-[10px] bg-bg-light p-3 text-[11px] leading-snug text-main">
              {json}
            </pre>
          </section>
        </aside>

        {/* COLUMNA DERECHA: Lienzo */}
        <div className="min-h-[500px] min-w-0 flex-1 rounded-[15px] bg-card p-5 lg:h-full lg:overflow-y-auto">
          {editMode && file && viewMode === 'design' && (
            <p className="mb-3 text-xs text-muted">
              {boxKind === 'field'
                ? `Haz clic en el documento para ubicar «${activeLabel?.name ?? '—'}».`
                : 'Haz clic sobre el texto a corregir para colocar un parche blanco.'}{' '}
              Presiona <strong>Guardar</strong> para registrar las modificaciones en el servidor.
            </p>
          )}

          <div className="relative w-full">
            {renderStatus === 'idle' && (
              <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-[15px] border-2 border-dashed border-card-hover text-muted">
                <FileUp className="h-10 w-10" strokeWidth={1.5} />
                <p className="text-sm font-medium">Sube un .pdf o .docx para empezar</p>
              </div>
            )}
            {renderStatus === 'loading' && (
              <p className="py-10 text-center text-sm font-semibold text-muted">
                Cargando documento…
              </p>
            )}
            {renderStatus === 'error' && (
              <p className="py-10 text-center text-sm font-semibold text-brand-red">{renderError}</p>
            )}

            <div
              ref={hostRef}
              className={canPlace ? 'pointer-events-none select-none' : undefined}
            />

            <div className="pointer-events-none absolute inset-0 z-20">
              {pageRects.map((rect) => (
                <div
                  key={rect.page}
                  className={`absolute ${
                    canPlace ? 'pointer-events-auto cursor-crosshair select-none' : 'pointer-events-none'
                  }`}
                  onMouseDown={(e) => {
                    // Evita que arrastrar sobre el documento seleccione texto nativo.
                    if (canPlace && e.target === e.currentTarget) e.preventDefault();
                  }}
                  style={{
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget || !canPlace) return;
                    const b = e.currentTarget.getBoundingClientRect();
                    placeBox(
                      rect.page,
                      ((e.clientX - b.left) / b.width) * 100,
                      ((e.clientY - b.top) / b.height) * 100,
                    );
                  }}
                >
                  {boxes
                    .filter((b) => b.page === rect.page)
                    .map((box) => {
                      const key = box.labelId || box.label;
                      return (
                        <MappedBoxItem
                          key={box.id}
                          box={box}
                          rect={rect}
                          selected={box.id === selectedId}
                          editMode={editMode}
                          previewMode={viewMode === 'live'}
                          liveValue={liveValues[key] ?? ''}
                          onSelect={setSelectedId}
                          onChange={updateBox}
                          onDelete={deleteBox}
                        />
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}