export interface AdminResumen {
  documentos_generados: number;
  usuarios_activos: number;
  reportes_pendientes: number;
  actividades_recientes: AdminActividad[];
}
export interface AdminActividad {
  id: string;
  usuario: string;
  descripcion: string;
  activo: boolean;
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
}
