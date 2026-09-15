/** Build a URL that remains valid when Vite is deployed beneath a subpath. */
export function appUrl(path) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = String(path).replace(/^\/+/, '');
  return `${cleanBase}${cleanPath}`;
}
