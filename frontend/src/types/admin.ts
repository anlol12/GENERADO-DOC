export interface AdminResumen {
  plantillas_base: number;
  documentos_generados: number;
  documentos_completados: number;
  usuarios_activos: number;
  reportes_total: number;
  reportes_pendientes: number;
  reportes_resueltos: number;
  semana: { documentos: number; reportes: number };
  actividades_recientes: AdminActividad[];
}
export interface AdminActividad {
  id: string;
  usuario: string;
  descripcion: string;
  estado: string;
  tono: 'green' | 'red' | 'gray';
  fecha: string;
}
export interface AdminUsuario {
  id: number;
  nombre_completo: string;
  email: string;
  rol: string;
  activo: boolean;
}
export interface AdminReporte {
  id: number;
  usuario_id: number | null;
  usuario_nombre: string;
  titulo: string;
  descripcion: string;
  estado: 'nuevo' | 'revision' | 'resuelto';
  created_at: string;
}
export interface AdminConfiguracion {
  nombre: string;
  email: string;
  correo_soporte: string;
  correo_recepcion_docs: string | null;
}
