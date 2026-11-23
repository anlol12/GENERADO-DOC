import os
import base64
import json
import fitz  # PyMuPDF
import uuid
import shutil
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session

from database import engine, Base, get_db, SessionLocal
from models import Usuario, Documento, Reporte, ConfiguracionSistema
from security import SECRET_KEY, hash_password, verify_password, create_access_token
import jwt

class Settings(BaseSettings):
    APP_NAME: str = "Generador de Documentos API"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    CORS_ORIGINS: str = "http://localhost:5173"
    UPLOAD_DIR: str = "./uploads"
    DATABASE_URL: str = "sqlite:///./app.db"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

PLANTILLAS_DIR = os.path.join(settings.UPLOAD_DIR, "plantillas")
GENERADOS_DIR = os.path.join(settings.UPLOAD_DIR, "generados")
os.makedirs(PLANTILLAS_DIR, exist_ok=True)
os.makedirs(GENERADOS_DIR, exist_ok=True)

Base.metadata.create_all(bind=engine)


def _migrar_columnas_documentos():
    """create_all no altera tablas existentes: agrega las columnas nuevas en SQLite si faltan."""
    from sqlalchemy import inspect, text

    existentes = {c["name"] for c in inspect(engine).get_columns("documentos")}
    nuevas = {
        "template_id": "INTEGER REFERENCES documentos(id)",
        "valores_json": "TEXT DEFAULT '{}'",
        "enviado_en": "DATETIME",
        "revocado_en_origen": "BOOLEAN DEFAULT 0",
    }
    with engine.begin() as conn:
        for nombre, ddl in nuevas.items():
            if nombre not in existentes:
                conn.execute(text(f"ALTER TABLE documentos ADD COLUMN {nombre} {ddl}"))


_migrar_columnas_documentos()

app = FastAPI(title=settings.APP_NAME)

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------- ESQUEMAS --------------------
class LoginRequest(BaseModel):
    email: str
    password: str


class CrearUsuarioRequest(BaseModel):
    nombre_completo: str
    email: str
    password: str
    rol: str = "usuario"


class GuardarPlantillaRequest(BaseModel):
    name: str
    labels: list = []
    boxes: list = []
    detected_fonts: list = []


class PublicarDocumentoRequest(BaseModel):
    published: Optional[bool] = None
    assigned_user_id: Optional[int] = None
    clear_assigned_user: bool = False


class ActualizarUsuarioRequest(BaseModel):
    activo: Optional[bool] = None
    rol: Optional[str] = None


class CrearReporteRequest(BaseModel):
    titulo: str
    descripcion: str


class ActualizarReporteRequest(BaseModel):
    estado: str


class ActualizarConfiguracionRequest(BaseModel):
    nombre: Optional[str] = None
    email: Optional[str] = None
    correo_soporte: Optional[str] = None
    password_actual: Optional[str] = None
    password_nueva: Optional[str] = None


bearer_scheme = HTTPBearer(auto_error=False)


def usuario_actual(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme), db: Session = Depends(get_db)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Autenticación requerida")
    try:
        datos = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        usuario_id = int(datos.get("id"))
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id, Usuario.activo == True).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no válido")
    return usuario


def administrador_actual(usuario: Usuario = Depends(usuario_actual)):
    if usuario.rol != "admin":
        raise HTTPException(status_code=403, detail="Se requiere rol de administrador")
    return usuario


def _usuario_json(usuario: Usuario) -> dict:
    return {"id": usuario.id, "nombre_completo": usuario.nombre_completo, "email": usuario.email,
            "rol": usuario.rol, "activo": bool(usuario.activo)}


def _reporte_json(reporte: Reporte) -> dict:
    fecha = reporte.created_at
    if fecha and fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return {"id": reporte.id, "usuario_id": reporte.usuario_id, "usuario_nombre": reporte.usuario_nombre,
            "titulo": reporte.titulo, "descripcion": reporte.descripcion, "estado": reporte.estado,
            "created_at": fecha.isoformat() if fecha else datetime.now(timezone.utc).isoformat()}


# -------------------- STARTUP --------------------
@app.on_event("startup")
def crear_usuarios_por_defecto():
    db = SessionLocal()
    try:
        if db.query(Usuario).count() == 0:
            admin = Usuario(
                nombre_completo="Administrador Principal",
                email="admin@prueba.com",
                password_hash=hash_password("admin123"),
                rol="admin",
            )
            user = Usuario(
                nombre_completo="Usuario Normal",
                email="usuario@prueba.com",
                password_hash=hash_password("usuario123"),
                rol="usuario",
            )
            db.add_all([admin, user])
            db.commit()
        if db.query(ConfiguracionSistema).filter(ConfiguracionSistema.id == 1).first() is None:
            db.add(ConfiguracionSistema(id=1, correo_soporte="soporte@example.com"))
            db.commit()
        if db.query(Reporte).count() == 0:
            usuarios = db.query(Usuario).order_by(Usuario.id).all()
            nombres = [u.nombre_completo for u in usuarios] or ["Ana Pérez", "Luis García", "María López", "Carlos Ruiz"]
            ahora = datetime.now(timezone.utc)
            estados = ["nuevo", "revision", "resuelto", "nuevo"]
            reportes = []
            for i, estado in enumerate(estados):
                u = usuarios[i % len(usuarios)] if usuarios else None
                reportes.append(Reporte(usuario_id=u.id if u else None, usuario_nombre=u.nombre_completo if u else nombres[i],
                    titulo=f"Reporte de ejemplo {i + 1}", descripcion=f"Descripción del reporte {i + 1}",
                    estado=estado, created_at=ahora - __import__('datetime').timedelta(days=i)))
            db.add_all(reportes)
            db.commit()
    finally:
        db.close()


# -------------------- AUTH & USUARIOS --------------------
@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == payload.email).first()

    if not usuario or not verify_password(payload.password, usuario.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo electrónico o contraseña incorrectos",
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado",
        )

    token = create_access_token({"sub": usuario.email, "rol": usuario.rol, "id": usuario.id})

    return {
        "access_token": token,
        "token_type": "bearer",
        "usuario": {
            "id": usuario.id,
            "nombre_completo": usuario.nombre_completo,
            "email": usuario.email,
            "rol": usuario.rol,
        },
    }


@app.post("/api/auth/registro", status_code=status.HTTP_201_CREATED)
def registrar_usuario(payload: CrearUsuarioRequest, db: Session = Depends(get_db)):
    existe = db.query(Usuario).filter(Usuario.email == payload.email).first()
    if existe:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    nuevo = Usuario(
        nombre_completo=payload.nombre_completo,
        email=payload.email,
        password_hash=hash_password(payload.password),
        rol="usuario",
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    return {
        "id": nuevo.id,
        "nombre_completo": nuevo.nombre_completo,
        "email": nuevo.email,
        "rol": nuevo.rol,
    }


@app.get("/api/admin/usuarios")
def listar_usuarios(db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    usuarios = db.query(Usuario).all()
    return [
        _usuario_json(u)
        for u in usuarios
    ]


@app.post("/api/admin/usuarios", status_code=status.HTTP_201_CREATED)
def crear_usuario_admin(payload: CrearUsuarioRequest, db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    nombre, email = payload.nombre_completo.strip(), payload.email.strip()
    if not nombre or not email or len(payload.password) < 6 or payload.rol not in ("admin", "usuario"):
        raise HTTPException(status_code=400, detail="Los campos son inválidos")
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    nuevo = Usuario(nombre_completo=nombre, email=email, password_hash=hash_password(payload.password), rol=payload.rol)
    db.add(nuevo); db.commit(); db.refresh(nuevo)
    return _usuario_json(nuevo)


@app.patch("/api/admin/usuarios/{user_id}")
def actualizar_usuario_admin(user_id: int, payload: ActualizarUsuarioRequest, db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    usuario = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not usuario: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if payload.rol is not None and payload.rol not in ("admin", "usuario"):
        raise HTTPException(status_code=400, detail="El rol debe ser 'admin' o 'usuario'")
    if usuario.id == admin.id and ((payload.activo is False) or payload.rol == "usuario"):
        raise HTTPException(status_code=400, detail="No puede desactivarse ni quitarse el rol de administrador")
    if payload.activo is not None: usuario.activo = payload.activo
    if payload.rol is not None: usuario.rol = payload.rol
    db.commit(); db.refresh(usuario)
    return _usuario_json(usuario)


@app.get("/api/admin/resumen")
def resumen_admin(db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    actividades = []
    for d in db.query(Documento).order_by(Documento.modified_at.desc()).all():
        u = db.query(Usuario).filter(Usuario.id == d.assigned_user_id).first() if d.assigned_user_id else None
        f = d.modified_at or datetime.now(timezone.utc)
        if f.tzinfo is None: f = f.replace(tzinfo=timezone.utc)
        actividades.append({"id": str(d.id), "usuario": u.nombre_completo if u else "Sistema", "descripcion": f"Modificó el documento {d.name}", "activo": bool(u.activo) if u else False, "fecha": f.isoformat()})
    for r in db.query(Reporte).all():
        u = db.query(Usuario).filter(Usuario.id == r.usuario_id).first() if r.usuario_id else None
        f = r.created_at or datetime.now(timezone.utc)
        if f.tzinfo is None: f = f.replace(tzinfo=timezone.utc)
        actividades.append({"id": f"reporte-{r.id}", "usuario": u.nombre_completo if u else (r.usuario_nombre or "Sistema"), "descripcion": f"Envió el reporte {r.titulo}", "activo": bool(u.activo) if u else False, "fecha": f.isoformat()})
    actividades.sort(key=lambda x: x["fecha"], reverse=True)
    return {"documentos_generados": db.query(Documento).count(), "usuarios_activos": db.query(Usuario).filter(Usuario.activo == True).count(),
            "reportes_pendientes": db.query(Reporte).filter(Reporte.estado != "resuelto").count(), "actividades_recientes": actividades[:8]}


@app.get("/api/admin/reportes")
def listar_reportes(estado: Optional[str] = None, db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    q = db.query(Reporte)
    if estado is not None:
        if estado not in ("nuevo", "revision", "resuelto"): raise HTTPException(status_code=422, detail="Estado inválido")
        q = q.filter(Reporte.estado == estado)
    return [_reporte_json(r) for r in q.order_by(Reporte.created_at.desc()).all()]


@app.post("/api/reportes", status_code=status.HTTP_201_CREATED)
def crear_reporte(payload: CrearReporteRequest, db: Session = Depends(get_db), usuario: Usuario = Depends(usuario_actual)):
    if not payload.titulo.strip() or not payload.descripcion.strip(): raise HTTPException(status_code=400, detail="Título y descripción son obligatorios")
    reporte = Reporte(usuario_id=usuario.id, usuario_nombre=usuario.nombre_completo, titulo=payload.titulo.strip(), descripcion=payload.descripcion.strip(), estado="nuevo")
    db.add(reporte); db.commit(); db.refresh(reporte)
    return _reporte_json(reporte)


@app.patch("/api/admin/reportes/{reporte_id}")
def actualizar_reporte(reporte_id: int, payload: ActualizarReporteRequest, db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    if payload.estado not in ("nuevo", "revision", "resuelto"): raise HTTPException(status_code=422, detail="Estado inválido")
    reporte = db.query(Reporte).filter(Reporte.id == reporte_id).first()
    if not reporte: raise HTTPException(status_code=404, detail="Reporte no encontrado")
    reporte.estado = payload.estado; db.commit(); db.refresh(reporte)
    return _reporte_json(reporte)


@app.get("/api/admin/configuracion")
def obtener_configuracion(db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    config = db.query(ConfiguracionSistema).filter(ConfiguracionSistema.id == 1).first()
    return {"nombre": admin.nombre_completo, "email": admin.email, "correo_soporte": config.correo_soporte}


@app.put("/api/admin/configuracion")
def guardar_configuracion(payload: ActualizarConfiguracionRequest, db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    if payload.password_nueva is not None:
        if payload.password_actual is None or not verify_password(payload.password_actual, admin.password_hash):
            raise HTTPException(status_code=400, detail="La contraseña actual es incorrecta")
        if len(payload.password_nueva) < 6: raise HTTPException(status_code=400, detail="La contraseña nueva debe tener al menos 6 caracteres")
        admin.password_hash = hash_password(payload.password_nueva)
    if payload.nombre is not None:
        if not payload.nombre.strip(): raise HTTPException(status_code=400, detail="El nombre no puede estar vacío")
        admin.nombre_completo = payload.nombre.strip()
    if payload.email is not None:
        if not payload.email.strip(): raise HTTPException(status_code=400, detail="El correo no puede estar vacío")
        otro = db.query(Usuario).filter(Usuario.email == payload.email.strip(), Usuario.id != admin.id).first()
        if otro: raise HTTPException(status_code=400, detail="El correo ya está registrado")
        admin.email = payload.email.strip()
    config = db.query(ConfiguracionSistema).filter(ConfiguracionSistema.id == 1).first()
    if payload.correo_soporte is not None:
        if not payload.correo_soporte.strip(): raise HTTPException(status_code=400, detail="El correo de soporte no puede estar vacío")
        config.correo_soporte = payload.correo_soporte.strip()
    db.commit(); db.refresh(admin)
    return {"nombre": admin.nombre_completo, "email": admin.email, "correo_soporte": config.correo_soporte}


# -------------------- DOCUMENTOS Y PLANTILLAS --------------------
def serialize_doc(doc: Documento, db: Session, include_schema: bool = False) -> dict:
    assigned_user_name = None
    if doc.assigned_user_id:
        u = db.query(Usuario).filter(Usuario.id == doc.assigned_user_id).first()
        if u:
            assigned_user_name = u.nombre_completo

    iso_date = (
        doc.modified_at.replace(tzinfo=timezone.utc).isoformat()
        if doc.modified_at
        else datetime.now(timezone.utc).isoformat()
    )

    payload = {
        "id": str(doc.id),
        "name": doc.name,
        "fileName": doc.file_name,
        "kind": doc.kind,
        "modifiedAt": iso_date,
        "published": doc.published,
        "assignedUserId": doc.assigned_user_id,
        "assignedUserName": assigned_user_name,
        "templateId": doc.template_id,
        "revocadoEnOrigen": bool(doc.revocado_en_origen),
        "enviado": doc.enviado_en is not None,
    }

    if include_schema:
        payload["labels"] = json.loads(doc.labels_json or "[]")
        payload["boxes"] = json.loads(doc.boxes_json or "[]")
        payload["detectedFonts"] = json.loads(doc.detected_fonts_json or "[]")
        payload["valores"] = json.loads(doc.valores_json or "{}")

    return payload


@app.get("/api/documentos")
def listar_documentos(db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    # Las copias personales de usuarios (template_id != NULL) no son plantillas del admin.
    docs = (
        db.query(Documento)
        .filter(Documento.template_id.is_(None))
        .order_by(Documento.modified_at.desc())
        .all()
    )
    return [serialize_doc(d, db, include_schema=False) for d in docs]


@app.get("/api/documentos/publicos")
def listar_documentos_publicos(db: Session = Depends(get_db)):
    """Galería general: plantillas publicadas. Declarada antes de /{doc_id} para no colisionar."""
    docs = (
        db.query(Documento)
        .filter(Documento.published == True)  # noqa: E712
        .order_by(Documento.modified_at.desc())
        .all()
    )
    return [serialize_doc(d, db, include_schema=False) for d in docs]


def _autorizar_acceso_documento(doc: Documento, usuario: Usuario) -> None:
    if usuario.rol != "admin" and doc.assigned_user_id != usuario.id and not doc.published:
        raise HTTPException(status_code=403, detail="No tiene permiso para acceder a este documento")


@app.get("/api/documentos/{doc_id}")
def obtener_documento(doc_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(usuario_actual)):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    _autorizar_acceso_documento(doc, usuario)
    return serialize_doc(doc, db, include_schema=True)


@app.get("/api/documentos/{doc_id}/archivo")
def descargar_archivo_plantilla(doc_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(usuario_actual)):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    _autorizar_acceso_documento(doc, usuario)

    file_path = os.path.join(PLANTILLAS_DIR, doc.stored_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="El archivo físico no existe en el servidor")

    media_type = (
        "application/pdf"
        if doc.kind == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(path=file_path, media_type=media_type, filename=doc.file_name)


@app.post("/api/documentos", status_code=status.HTTP_201_CREATED)
async def subir_documento(
    file: UploadFile = File(...),
    name: str = Form(...),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(administrador_actual),
):
    original_name = file.filename or "documento.pdf"
    lower = original_name.lower()
    if not lower.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Formato no soportado. Solo se permiten archivos PDF (.pdf).")
    kind = "pdf"

    ext = ".pdf"
    stored_filename = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(PLANTILLAS_DIR, stored_filename)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    nuevo = Documento(
        name=name.strip() or original_name,
        file_name=original_name,
        stored_path=stored_filename,
        kind=kind,
        published=False,
        assigned_user_id=None,
        labels_json="[]",
        boxes_json="[]",
        detected_fonts_json="[]",
        modified_at=datetime.now(timezone.utc),
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return serialize_doc(nuevo, db, include_schema=True)


@app.put("/api/documentos/{doc_id}")
def guardar_cambios_documento(
    doc_id: int,
    payload: GuardarPlantillaRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(administrador_actual),
):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    doc.name = payload.name.strip() or doc.name
    doc.labels_json = json.dumps(payload.labels, ensure_ascii=False)
    doc.boxes_json = json.dumps(payload.boxes, ensure_ascii=False)
    doc.detected_fonts_json = json.dumps(payload.detected_fonts, ensure_ascii=False)
    doc.modified_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(doc)
    return serialize_doc(doc, db, include_schema=True)


def _tiene_trabajo(doc: Documento) -> bool:
    """True si el usuario ya guardó datos o completó el envío."""
    if doc.enviado_en is not None:
        return True
    try:
        valores = json.loads(doc.valores_json or "{}")
    except json.JSONDecodeError:
        valores = {}
    return any(str(v).strip() for v in valores.values()) if isinstance(valores, dict) else False


@app.patch("/api/documentos/{doc_id}/publicar")
def publicar_o_asignar_documento(
    doc_id: int,
    payload: PublicarDocumentoRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(administrador_actual),
):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if payload.published is not None:
        doc.published = payload.published
        if payload.published is False and doc.template_id is None:
            # Al despublicar la plantilla, las copias sin trabajo se retiran; las demás se conservan.
            copias = db.query(Documento).filter(Documento.template_id == doc.id).all()
            for c in copias:
                if _tiene_trabajo(c):
                    c.revocado_en_origen = True
                else:
                    db.delete(c)

    if payload.clear_assigned_user:
        if _tiene_trabajo(doc):
            copia = Documento(
                name=doc.name, file_name=doc.file_name, stored_path=doc.stored_path,
                kind=doc.kind, published=False, assigned_user_id=doc.assigned_user_id,
                visto=doc.visto, labels_json=doc.labels_json, boxes_json=doc.boxes_json,
                detected_fonts_json=doc.detected_fonts_json, template_id=doc.id,
                valores_json=doc.valores_json, enviado_en=doc.enviado_en,
                revocado_en_origen=True, modified_at=doc.modified_at,
            )
            db.add(copia)
            doc.assigned_user_id = None
            doc.revocado_en_origen = False
        else:
            doc.assigned_user_id = None
            doc.revocado_en_origen = False
    elif payload.assigned_user_id is not None:
        usuario = db.query(Usuario).filter(Usuario.id == payload.assigned_user_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario destino no encontrado")
        doc.assigned_user_id = usuario.id

    doc.modified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return serialize_doc(doc, db, include_schema=False)


@app.delete("/api/documentos/{doc_id}")
def eliminar_documento(doc_id: int, db: Session = Depends(get_db), admin: Usuario = Depends(administrador_actual)):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    copias = db.query(Documento).filter(Documento.template_id == doc.id).all()
    rutas_candidatas = {doc.stored_path}
    for copia in copias:
        if _tiene_trabajo(copia):
            copia.template_id = None
            copia.revocado_en_origen = True
        else:
            rutas_candidatas.add(copia.stored_path)
            db.delete(copia)
    db.delete(doc)
    db.flush()
    for ruta in rutas_candidatas:
        usada = db.query(Documento).filter(Documento.stored_path == ruta).first()
        if not usada:
            path = os.path.join(PLANTILLAS_DIR, ruta)
            if os.path.isfile(path):
                os.remove(path)
    db.commit()
    return {"ok": True, "mensaje": "Documento eliminado"}


class GuardarBorradorRequest(BaseModel):
    valores: dict = {}


class EnviarDocumentoCorreoRequest(BaseModel):
    usuario_id: int
    correo_usuario: str
    correo_admin: str
    valores: dict = {}


def _insertar_texto_ajustado(page, rect, text: str, font_max: float, min_font: float = 4.0):
    """Inserta texto reduciendo el tamaño hasta que quepa en el rectángulo."""
    size = max(font_max, min_font)
    # insert_textbox devuelve <0 si no cabe; se prueba en un documento temporal.
    probe_doc = fitz.open()
    try:
        probe = probe_doc.new_page(width=page.rect.width, height=page.rect.height)
        while size > min_font and probe.insert_textbox(
            rect, text, fontsize=size, fontname="helv", align=0
        ) < 0:
            size = max(size - 0.5, min_font)
    finally:
        probe_doc.close()
    page.insert_textbox(rect, text, fontsize=size, fontname="helv", color=(0, 0, 0), align=0)


def estampar_pdf(template_path: str, output_path: str, boxes: list, valores: dict) -> None:
    pdf = fitz.open(template_path)
    try:
        for box in boxes:
            page_idx = int(box.get("page", 1)) - 1
            if page_idx < 0 or page_idx >= len(pdf):
                continue
            page = pdf[page_idx]
            pw, ph = page.rect.width, page.rect.height
            x0 = float(box["x_pct"]) / 100.0 * pw
            y0 = float(box["y_pct"]) / 100.0 * ph
            rect = fitz.Rect(
                x0,
                y0,
                x0 + float(box["w_pct"]) / 100.0 * pw,
                y0 + float(box["h_pct"]) / 100.0 * ph,
            )
            if rect.is_empty:
                continue

            lbl = str(box.get("label") or "")
            value = ""
            for key in (box.get("labelId"), lbl, lbl.strip().lower()):
                if key and key in valores:
                    value = valores[key]
                    break
            value = value if isinstance(value, str) else str(value or "")
            is_patch = box.get("kind") == "patch"

            if box.get("dataType") == "signature":
                if not value.startswith("data:image/"):
                    continue
                try:
                    img_bytes = base64.b64decode(value.split(",", 1)[1])
                except (IndexError, ValueError):
                    continue
                page.insert_image(rect, stream=img_bytes, keep_proportion=True)
                continue

            text = value.strip() or (box.get("text", "") if is_patch else "")
            if is_patch:
                page.draw_rect(rect, color=None, fill=(1, 1, 1), overlay=True)
            if text:
                _insertar_texto_ajustado(page, rect, text, float(box.get("font_max") or 11))

        pdf.save(output_path, garbage=3, deflate=True)
    finally:
        pdf.close()


@app.get("/api/usuario/{usuario_id}/documentos")
def listar_documentos_usuario(usuario_id: int, db: Session = Depends(get_db)):
    docs = (
        db.query(Documento)
        .filter(Documento.assigned_user_id == usuario_id)
        .order_by(Documento.modified_at.desc())
        .all()
    )

    admin = db.query(Usuario).filter(Usuario.rol == "admin", Usuario.activo == True).first()
    admin_email = admin.email if admin else "admin@prueba.com"

    resultado = []
    for d in docs:
        item = serialize_doc(d, db, include_schema=True)
        item["visto"] = bool(d.visto)
        item["adminEmail"] = admin_email
        resultado.append(item)
    return resultado


@app.post("/api/usuario/{usuario_id}/documentos/iniciar/{template_id}")
def iniciar_documento_desde_plantilla(
    usuario_id: int, template_id: int, db: Session = Depends(get_db)
):
    """Crea (o reutiliza) la copia personal del usuario; la plantilla original no se modifica."""
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id, Usuario.activo == True).first()  # noqa: E712
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    plantilla = (
        db.query(Documento)
        .filter(
            Documento.id == template_id,
            Documento.published == True,  # noqa: E712
            Documento.template_id.is_(None),
        )
        .first()
    )
    if not plantilla:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada o no publicada")

    copia = (
        db.query(Documento)
        .filter(Documento.template_id == plantilla.id, Documento.assigned_user_id == usuario_id)
        .first()
    )
    if not copia:
        copia = Documento(
            name=plantilla.name,
            file_name=plantilla.file_name,
            stored_path=plantilla.stored_path,  # el archivo base se comparte, no se duplica
            kind=plantilla.kind,
            published=False,
            assigned_user_id=usuario_id,
            visto=True,
            labels_json=plantilla.labels_json,
            boxes_json=plantilla.boxes_json,
            detected_fonts_json=plantilla.detected_fonts_json,
            template_id=plantilla.id,
            valores_json="{}",
        )
        db.add(copia)
        db.commit()
        db.refresh(copia)

    item = serialize_doc(copia, db, include_schema=True)
    item["visto"] = True
    return item


@app.patch("/api/usuario/documentos/{doc_id}/borrador")
def guardar_borrador_documento(
    doc_id: int, payload: GuardarBorradorRequest, db: Session = Depends(get_db)
):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if doc.assigned_user_id is None:
        raise HTTPException(status_code=403, detail="Solo se guardan borradores de documentos personales")
    if doc.revocado_en_origen:
        raise HTTPException(status_code=403, detail="Documento revocado: solo lectura")

    doc.valores_json = json.dumps(payload.valores, ensure_ascii=False)
    doc.modified_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": str(doc.id), "guardado": True}


@app.patch("/api/usuario/documentos/{doc_id}/visto")
def marcar_documento_visto(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    doc.visto = True
    db.commit()
    return {"id": str(doc.id), "visto": True}


@app.post("/api/usuario/documentos/{doc_id}/enviar")
def enviar_documento_completado(
    doc_id: int,
    payload: EnviarDocumentoCorreoRequest,
    db: Session = Depends(get_db),
):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    if doc.kind != "pdf":
        raise HTTPException(status_code=400, detail="El estampado solo está soportado para plantillas PDF")

    template_path = os.path.join(PLANTILLAS_DIR, doc.stored_path)
    if not os.path.isfile(template_path):
        raise HTTPException(status_code=404, detail="Plantilla base no encontrada")

    try:
        boxes = json.loads(doc.boxes_json or "[]")
    except json.JSONDecodeError:
        boxes = []

    nombre_generado = f"{doc.id}_{uuid.uuid4().hex}.pdf"
    output_path = os.path.join(GENERADOS_DIR, nombre_generado)

    try:
        estampar_pdf(template_path, output_path, boxes, payload.valores)
    except Exception as exc:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}")

    doc.valores_json = json.dumps(payload.valores, ensure_ascii=False)
    doc.enviado_en = datetime.now(timezone.utc)
    db.commit()

    # Pendiente: despachar por SMTP a payload.correo_admin y payload.correo_usuario.
    return {
        "ok": True,
        "mensaje": f"Documento '{doc.name}' generado correctamente.",
        "destinatarios": [payload.correo_admin, payload.correo_usuario],
        "campos_recibidos": len(payload.valores),
        "archivo": nombre_generado,
        "url_descarga": f"/api/usuario/documentos/{doc.id}/descargar/{nombre_generado}",
    }


@app.get("/api/usuario/documentos/{doc_id}/descargar/{archivo}")
def descargar_documento_generado(doc_id: int, archivo: str, db: Session = Depends(get_db)):
    doc = db.query(Documento).filter(Documento.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    # Evita path traversal y exige que el archivo pertenezca a este documento.
    if archivo != os.path.basename(archivo) or not archivo.endswith(".pdf") or not archivo.startswith(f"{doc.id}_"):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

    path = os.path.join(GENERADOS_DIR, archivo)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Archivo generado no encontrado")

    safe_name = "".join(c for c in doc.name if c.isalnum() or c in " -_").strip() or "documento"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"{safe_name}_completado.pdf",
    )
