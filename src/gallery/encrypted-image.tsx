import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { useEncryptedFile } from '../encryption/components/hooks';
import Utils from '../common/utils';

export type EncryptedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  ref?: React.Ref<HTMLImageElement>,
  src: string;
  contentType?: string;
};

const EncryptedImage = ({ ref, src, contentType, ...imgProps }: EncryptedImageProps) => {
  const isLazy = imgProps.loading === 'lazy';

  const imageRef = useRef<HTMLImageElement>(null);
  const imageRefMerged = Utils.useMergedRef(ref, imageRef);
  const [isVisible, setIsVisible] = useState(!isLazy);
  const { src: imageSrc, error: imageError } = useEncryptedFile(!isLazy || isVisible ? src : null, contentType);

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
      src={imageError === undefined ? (imageSrc ?? undefined) : src}
      {...(typeof src === 'string' && typeof imageSrc !== 'string' && imageError === undefined ? {
        style: { ...imgProps.style, opacity: 0 },
      } : {})}
    />
  );
};

export default EncryptedImage;
