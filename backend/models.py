from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre_completo = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    rol = Column(String, default="usuario", nullable=False)  # "admin" | "usuario"
    activo = Column(Boolean, default=True)


class Documento(Base):
    __tablename__ = "documentos"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    kind = Column(String, nullable=False)  # "pdf" | "docx"
    published = Column(Boolean, default=False)
    assigned_user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    visto = Column(Boolean, default=False)  # False = sombreado de "No visto"
    labels_json = Column(Text, default="[]")
    boxes_json = Column(Text, default="[]")
    detected_fonts_json = Column(Text, default="[]")
    # Copias personales: plantilla de origen y borrador de respuestas del usuario.
    template_id = Column(Integer, ForeignKey("documentos.id"), nullable=True, index=True)
    valores_json = Column(Text, default="{}")
    enviado_en = Column(DateTime, nullable=True)  # fecha de envío completado
    revocado_en_origen = Column(Boolean, default=False)  # admin revocó, el usuario conserva su copia
    acceso_solicitado = Column(Boolean, default=False, nullable=False)
    acceso_solicitado_en = Column(DateTime, nullable=True)
    completado = Column(Boolean, default=False, nullable=False)
    fecha_completado = Column(DateTime, nullable=True)
    modified_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class TicketAyuda(Base):
    __tablename__ = "tickets_ayuda"
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    nombre_usuario = Column(String, nullable=False)
    email_usuario = Column(String, nullable=False)
    categoria = Column(String, nullable=False)
    prioridad = Column(String, nullable=False)
    documento_relacionado_id = Column(Integer, nullable=True)
    asunto = Column(String, nullable=False)
    descripcion = Column(Text, nullable=False)
    captura_base64 = Column(Text, nullable=True)
    estado = Column(String, default="abierto", nullable=False)
    respuesta_admin = Column(Text, nullable=True)
    fecha_creacion = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    fecha_actualizacion = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)


class Reporte(Base):
    __tablename__ = "reportes"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario_nombre = Column(String, nullable=False)
    titulo = Column(String, nullable=False)
    descripcion = Column(Text, nullable=False)
    estado = Column(String, default="nuevo", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class ConfiguracionSistema(Base):
    __tablename__ = "configuracion_sistema"

    id = Column(Integer, primary_key=True)
    correo_soporte = Column(String, nullable=False)
    correo_recepcion_docs = Column(String, nullable=True)
