import { useEffect, useRef, type ImgHTMLAttributes } from 'react';
import { useEncryptedFile } from '../encryption/components/hooks';
import { useIsVisible, useMergedRef } from '../common/utils/components/hooks';

export type EncryptedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  ref?: React.Ref<HTMLImageElement>,
  src: string;
  contentType?: string;
};

const EncryptedImage = ({ ref, src, contentType, ...imgProps }: EncryptedImageProps) => {
  const isLazy = imgProps.loading === 'lazy';

  const imageRef = useRef<HTMLImageElement>(null);
  const imageRefMerged = useMergedRef(ref, imageRef);
  const isVisible = useIsVisible(imageRef, isLazy);
  const { src: imageSrc, error: imageError } = useEncryptedFile(!isLazy || isVisible ? src : null, contentType);

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
