import { useRef, type MouseEvent } from 'react';
import { useEncryptedFile } from '../encryption/components/hooks';
import { useIsVisible } from '../common/utils/components/hooks';
import type { SlideEncrypted } from './encrypted-plugin';
import EncryptedImage from './encrypted-image';
import EncryptedVideo from './encrypted-video';

type EncryptedSlidePreviewProps = {
  slide: SlideEncrypted;
  onClick?: (event: MouseEvent) => void;
};

const EncryptedSlidePreview = ({ slide, onClick }: EncryptedSlidePreviewProps) => {
  const previewRef = useRef<HTMLAnchorElement>(null);
  const isVisible = useIsVisible(previewRef);
  const { src, blob, error } = useEncryptedFile(isVisible ? slide.src : null, slide.contentType);
  const contentType = slide.contentType ?? blob?.type;
  const isVideo = contentType?.startsWith('video/') ?? false;

  const preview = !src || error || !isVideo
    ? (
      <EncryptedImage
          src={slide.src}
          alt={slide.alt ?? 'img'}
          loading="lazy"
          decoding="async"
        />
    )
    : (
      <EncryptedVideo
        src={slide.src}
        aria-label="Video preview"
        muted
        playsInline
        preload="metadata"
      />
    );

  return (
    <a
      ref={previewRef}
      href={slide.src}
      aria-label={slide.alt ?? (isVideo ? 'Open encrypted video' : 'Open encrypted image')}
      onClick={onClick}
    >
      {preview}
    </a>
  );
};

export default EncryptedSlidePreview;
