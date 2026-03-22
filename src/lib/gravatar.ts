import crypto from 'crypto';

/**
 * Genera una URL de Gravatar basada en el email del usuario
 * @param email - Email del usuario
 * @param size - Tamaño del avatar en píxeles (default: 200)
 * @param defaultImage - Imagen por defecto si no existe avatar ('identicon', 'monsterid', 'wavatar', 'retro', 'robohash', 'blank')
 * @returns URL de Gravatar
 */
export function getGravatarUrl(
  email?: string | null,
  size: number = 200,
  defaultImage: string = 'identicon'
): string {
  if (!email) {
    return `https://www.gravatar.com/avatar/?s=${size}&d=${defaultImage}`;
  }

  // Generar hash MD5 del email (trimmed y en lowercase)
  const hash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}`;
}

/**
 * Obtiene la URL de avatar del usuario, usando Gravatar como fallback
 * @param avatarUrl - URL del avatar del usuario (si existe)
 * @param email - Email del usuario (para Gravatar)
 * @param size - Tamaño deseado (default: 200)
 * @returns URL del avatar o Gravatar
 */
export function getUserAvatarUrl(
  avatarUrl?: string | null,
  email?: string | null,
  size: number = 200
): string {
  // Si hay una URL de avatar personalizada, usar esa
  if (avatarUrl) {
    return avatarUrl;
  }
  
  // Fallback a Gravatar usando el email
  return getGravatarUrl(email, size, 'identicon');
}
