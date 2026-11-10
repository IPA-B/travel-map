import { useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import Encryption from '../encryption';
import { useSettings } from '../settings/components/hooks';
import Utils from '../common/utils';

export type EncryptedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  ref?: React.Ref<HTMLImageElement>,
  src: string;
  contentType?: string;
};

const contentTypesByExtension: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jfif: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

const getImageContentType = (url: string) => {
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  const fileName = pathname.split(/[\\/]/).pop() ?? '';
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension ? contentTypesByExtension[extension] : undefined;
};

export const useEncryptedImageSource = (
  src?: string | null,
  contentType?: string | null,
): { src: string | undefined, error: Error | undefined } => {
  const [settings] = useSettings();
  const encryptionKey = settings.currentData?.encryptionKey ?? '';
  const imageKey = typeof src === 'string' ? `${src}\0${encryptionKey}\0${contentType ?? ''}` : 'null';
  const [decryptedImage, setDecryptedImage] = useState<{ key: string; url?: string; error?: Error } | null>(null);

  useEffect(() => {
    if (typeof src !== 'string') {
      setDecryptedImage({ key: imageKey });
      return;
    }

    if (!Encryption.isEncryptedUri(src)) {
      setDecryptedImage({ key: imageKey, url: src });
      return;
    }

    let active = true;
    let objectUrl: string | undefined;

    setDecryptedImage(null);

    void (async () => {
      try {
        const imageUrl = Encryption.decryptUri(src);
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch encrypted image. Status: ${response.status}`);
        }

        const encryptedData = new Uint8Array(await response.arrayBuffer());
        const decryptedData = await Encryption.decrypt(encryptedData, encryptionKey);
        const blob = new Blob([decryptedData], { type: contentType ?? getImageContentType(imageUrl) });

        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setDecryptedImage({ key: imageKey, url: objectUrl });
        }
      } catch (errorBase) {
        const errorMessageBase = errorBase instanceof Error ? errorBase.message : String(errorBase);
        const error = new Error(`Failed to load encrypted image "${src}": ${errorMessageBase}`, { cause: errorBase });
        console.error(error);
        if (active) {
          setDecryptedImage({ key: imageKey, error });
        }
      }
    })();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, encryptionKey, imageKey, contentType]);

  const result = useMemo(() => (decryptedImage?.key === imageKey ? {
      src: decryptedImage?.url,
      error: decryptedImage?.error,
    } : { src: undefined, error: undefined }), 
    [decryptedImage, imageKey]
  );

  return result;
};

const EncryptedImage = ({ ref, src, contentType, ...imgProps }: EncryptedImageProps) => {
  const isLazy = imgProps.loading === 'lazy';

  const imageRef = useRef<HTMLImageElement>(null);
  const imageRefMerged = Utils.useMergedRef(ref, imageRef);
  const [isVisible, setIsVisible] = useState(!isLazy);
  const { src: imageSrc, error: imageError } = useEncryptedImageSource(!isLazy || isVisible ? src : null, contentType);

  useEffect(() => {
    if (!isLazy) {
      setIsVisible(true);
      return;
    }

    const element = imageRef.current;
    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [isLazy]);

  useEffect(() => {
    if (imageError && imageRef.current) {
      imageRef.current.dispatchEvent(new ErrorEvent('error', { error: imageError }));
    }
  }, [imageError]);

  return (
    <img
      {...imgProps}
      ref={imageRefMerged}
      src={imageError === undefined ? imageSrc : src}
      {...(typeof src === 'string' && typeof imageSrc !== 'string' && imageError === undefined ? {
        style: { ...imgProps.style, opacity: 0 },
      } : {})}
    />
  );
};

export default EncryptedImage;
