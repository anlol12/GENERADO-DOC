import logging
import os
import smtplib
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable, Optional

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self):
        self.host = os.getenv("SMTP_HOST")
        self.port = int(os.getenv("SMTP_PORT", "587"))
        self.user = os.getenv("SMTP_USER")
        self.password = os.getenv("SMTP_PASSWORD")
        self.sender = os.getenv("SMTP_FROM") or self.user or "noreply@localhost"
        self.admin_email = os.getenv("ADMIN_EMAIL")

    def send_email(self, to: str, subject: str, html: str, attachments: Optional[Iterable[str]] = None):
        if not self.host:
            logger.info("[Email dev] To=%s Subject=%s HTML=%s", to, subject, html)
            return False
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.sender
        msg["To"] = to
        msg.set_content("Este mensaje requiere un cliente compatible con HTML.")
        msg.add_alternative(html, subtype="html")
        for attachment in attachments or []:
            path = Path(attachment)
            data = path.read_bytes()
            msg.add_attachment(data, maintype="application", subtype="pdf", filename=path.name)
        with smtplib.SMTP(self.host, self.port, timeout=20) as smtp:
            smtp.starttls()
            if self.user:
                smtp.login(self.user, self.password or "")
            smtp.send_message(msg)
        return True

    def send_document_completed(self, recipients: Iterable[str], doc_name: str, sent_at: str, pdf_path: str) -> dict:
        """Envía el PDF terminado a cada destinatario (sin duplicados). Devuelve {correo: enviado}; un fallo no corta los demás."""
        html = f"<html><body><h2>Documento completado</h2><p>Documento: {doc_name}</p><p>Fecha y hora: {sent_at}</p></body></html>"
        resultado = {}
        for to in dict.fromkeys(r.strip() for r in recipients if r and r.strip()):
            try:
                resultado[to] = bool(self.send_email(to, f"Documento completado: {doc_name}", html, [pdf_path]))
            except Exception:
                logger.exception("No se pudo enviar el documento a %s", to)
                resultado[to] = False
        return resultado
