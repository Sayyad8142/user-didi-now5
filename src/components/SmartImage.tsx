import React, { useMemo } from 'react';
import { buildStorageRenderUrl, isStoragePath } from '@/lib/img';

const SUPABASE_URL = 'https://paywwbuqycovjopryele.supabase.co';

type Props = {
  src: string; alt: string;
  bucket?: string;
  width?: number; height?: number;
  className?: string;
  priority?: boolean; sizes?: string;
};

export default function SmartImage({ src, alt, bucket, width, height, className, priority, sizes }: Props) {
  const storageLike = bucket || isStoragePath(src);
  const bkt = bucket ?? (src.startsWith('worker-photos/') ? 'worker-photos' : undefined);

  const avifSet = useMemo(() => {
    if (!storageLike || !bkt) return '';
    return [360,540,720,960].map(w => `${buildStorageRenderUrl(SUPABASE_URL, bkt, src.replace(`${bkt}/`,''), { w, format:'avif' })} ${w}w`).join(', ');
  }, [src, storageLike, bkt]);

  const webpSet = useMemo(() => {
    if (!storageLike || !bkt) return '';
    return [360,540,720,960].map(w => `${buildStorageRenderUrl(SUPABASE_URL, bkt, src.replace(`${bkt}/`,''), { w, format:'webp' })} ${w}w`).join(', ');
  }, [src, storageLike, bkt]);

  const plainSrc = useMemo(() => {
    if (storageLike && bkt) {
      return buildStorageRenderUrl(SUPABASE_URL, bkt, src.replace(`${bkt}/`,''), { w: width ?? 640, format:'webp' });
    }
    // static asset path (already optimized by Vite)
    return src;
  }, [src, storageLike, bkt, width]);

  const loading = priority ? 'eager' : 'lazy';
  const fetchPriority = priority ? 'high' : 'auto';
  const dec = 'async';

  return (
    <picture>
      {storageLike && bkt ? (
        <>
          <source type="image/avif" srcSet={avifSet} sizes={sizes ?? '100vw'} />
          <source type="image/webp" srcSet={webpSet} sizes={sizes ?? '100vw'} />
        </>
      ) : null}
      <img
        src={plainSrc}
        alt={alt}
        width={width}
        height={height}
        loading={loading as any}
        fetchPriority={fetchPriority as any}
        decoding={dec as any}
        className={className}
        style={{ contentVisibility: priority ? 'auto' : 'auto' }}
      />
    </picture>
  );
}