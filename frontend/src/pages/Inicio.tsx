import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import TopHeader from '../components/TopHeader';
import PageFooter from '../components/PageFooter';
import { fetchPublicDocuments } from '../store/documentStore';
import type { DocItem } from '../store/documentStore';
import { formatModified } from '../utils/formatDate';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Crea la copia personal de la plantilla y abre esa copia en Mis Documentos. */
async function startFromTemplate(templateId: string): Promise<void> {
  const raw = localStorage.getItem('usuario');
  const usuario = raw ? JSON.parse(raw) : null;
  if (!usuario?.id) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');

  const res = await fetch(
    `${API_URL}/api/usuario/${usuario.id}/documentos/iniciar/${encodeURIComponent(templateId)}`,
    { method: 'POST' },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'No se pudo iniciar el documento');
  window.location.assign(`/mis-documentos?doc=${encodeURIComponent(data.id)}`);
}

export default function Inicio() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPublicDocuments()
      .then(setDocs)
      .catch(() => setError('No se pudo cargar la galería de documentos.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(
      (d) => d.name.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q),
    );
  }, [docs, query]);

  async function openDocument(id: string) {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      await startFromTemplate(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el documento');
      setStarting(false);
    }
  }

  const suggestions = query.trim() ? filtered.slice(0, 6) : [];

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-bg-light">
      <TopHeader active="inicio" />

      <main className="flex flex-1 flex-col items-center p-4 md:p-6 lg:p-10">
        <div className="mb-8 flex w-full flex-wrap items-center justify-between gap-3 rounded-[15px] bg-primary px-4 py-5 md:px-[30px] text-white shadow-[0_4px_10px_rgba(75,59,255,0.3)]">
          <h1 className="text-[22px] font-semibold">
            Tu contrato, hecho a tu medida, cláusula por cláusula
          </h1>
          <FileText className="h-10 w-10 shrink-0 fill-none stroke-white" strokeWidth={2} />
        </div>

        {/* BUSCADOR CON AUTOCOMPLETADO */}
        <div ref={searchRef} className="relative mb-10 w-full max-w-[720px]">
          <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Buscar plantillas de documentos…"
            className="w-full rounded-[30px] border-none bg-white py-3 pl-12 pr-5 text-sm font-medium text-main shadow-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
          />

          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 m-0 list-none overflow-hidden rounded-[15px] bg-white p-1.5 shadow-lg">
              {suggestions.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => void openDocument(d.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-3 py-2 text-left text-sm font-semibold text-main transition-colors hover:bg-bg-light"
                  >
                    <FileText
                      className={`h-4 w-4 shrink-0 ${d.kind === 'pdf' ? 'text-brand-red' : 'text-primary'}`}
                    />
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto text-[11px] font-medium text-muted">
                      {d.kind === 'pdf' ? 'PDF' : 'DOCX'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* GALERÍA */}
        <section className="w-full">
          {error && (
            <p className="mb-4 rounded-[10px] bg-brand-red/10 px-4 py-2 text-center text-xs font-semibold text-brand-red">
              {error}
            </p>
          )}
          {starting && (
            <p className="mb-4 text-center text-xs font-semibold text-primary">
              Preparando tu documento…
            </p>
          )}
          {loading ? (
            <p className="text-center text-sm text-muted">Cargando plantillas…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted">
              {docs.length === 0
                ? 'Aún no hay plantillas publicadas.'
                : 'Ninguna plantilla coincide con tu búsqueda.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => void openDocument(d.id)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-[15px] border-none bg-card p-0 text-left transition-colors duration-200 hover:bg-card-hover"
                >
                  <div className="flex h-[170px] items-center justify-center bg-white/60">
                    <div className="relative flex h-[130px] w-[100px] flex-col items-center justify-center gap-2 rounded-[6px] bg-white shadow-md transition-transform duration-200 group-hover:-translate-y-1">
                      <FileText
                        className={`h-9 w-9 ${d.kind === 'pdf' ? 'text-brand-red' : 'text-primary'}`}
                        strokeWidth={1.8}
                      />
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold text-white ${
                          d.kind === 'pdf' ? 'bg-brand-red' : 'bg-primary'
                        }`}
                      >
                        {d.kind === 'pdf' ? 'PDF' : 'DOCX'}
                      </span>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <p className="truncate text-sm font-semibold text-main">{d.name}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-muted">
                      {d.kind === 'pdf' ? 'PDF' : 'Word'} · {formatModified(d.modifiedAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <PageFooter />
    </div>
  );
}
