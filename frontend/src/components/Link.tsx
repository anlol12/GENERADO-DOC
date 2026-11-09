// Envoltorio de enlace: hoy usa <a> nativo y facilitará cambiar a react-router-dom mañana sin tocar el resto del código
import type { AnchorHTMLAttributes } from 'react';

export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}