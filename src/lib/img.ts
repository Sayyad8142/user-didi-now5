export function buildStorageRenderUrl(baseUrl: string, bucket: string, path: string, opts?: { w?: number; h?: number; q?: number; format?: 'webp'|'avif' }) {
  const w = opts?.w ?? 640;
  const h = opts?.h;
  const q = opts?.q ?? 70;
  const fmt = opts?.format ?? 'webp';
  const url = new URL(`${baseUrl}/storage/v1/render/image/public/${bucket}/${path}`);
  url.searchParams.set('width', String(w));
  if (h) url.searchParams.set('height', String(h));
  url.searchParams.set('quality', String(q));
  url.searchParams.set('format', fmt);
  return url.toString();
}

export function isStoragePath(src: string) {
  return src.startsWith('worker-photos/') || src.startsWith('legal-pdfs/') || src.startsWith('public/');
}