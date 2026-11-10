import 'yet-another-react-lightbox/styles.css';
import './index.css';

import { FC, MouseEvent, ReactNode, useCallback, useMemo, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import type { Slide, SlideTypeKey, SlideTypes } from 'yet-another-react-lightbox';
import Encryption from '../encryption';
import Utils from '../common/utils';
import EncryptedImage from './encrypted-image';
import EncryptedImagePlugin from './encrypted-image-plugin';
import EncryptedVideo from './encrypted-video';
import EncryptedVideoPlugin from './encrypted-video-plugin';

type SlidePreviewProps<TSlideTypeKey extends SlideTypeKey = SlideTypeKey> = {
  slide: SlideTypes[TSlideTypeKey];
  onClick?: (event: MouseEvent) => void;
}

const slidePreviewByTypeKey: { [TSlideTypeKey in SlideTypeKey]: (props: SlidePreviewProps<TSlideTypeKey>) => ReactNode } = {
  'image': ({ slide, onClick }) => {
    return (
      <a
        key={slide.src}
        href={slide.src}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
      >
        <img
            src={slide.src}
            alt={slide.alt ?? 'img'}
            loading="lazy"
            decoding="async"
          />
      </a>
    );
  },

  'video': ({ slide, onClick }) => {
    const src = slide.sources.length > 0 ? slide.sources[0].src : null;
    return src ? (
      <a
        key={src}
        href={src}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
      >
        <video 
          src={src} 
          aria-label="Video preview" 
          muted 
          playsInline 
          preload="metadata" 
        />
      </a>
    ) : (console.error(`No sources in the video slide!`), null);
  },

  'encrypted-image': ({ slide, onClick }) => {
    return (
      <a
        key={slide.src}
        href={slide.src}
        aria-label={slide.alt ?? 'Open encrypted image'}
        onClick={onClick}
      >
        <EncryptedImage
          src={slide.src}
          alt={slide.alt ?? 'img'}
          loading="lazy"
          decoding="async"
        />
      </a>
    );
  },

  'encrypted-video': ({ slide, onClick }) => (
    <a
      key={slide.src}
      href={slide.src}
      aria-label="Open encrypted video"
      onClick={onClick}
    >
      <EncryptedVideo
        src={slide.src}
        contentType={slide.contentType}
        aria-label="Video preview"
        muted
        playsInline
        preload="metadata"
      />
    </a>
  ),
};

const SlidePreview: FC<SlidePreviewProps> = (props) => 
  typeof props.slide.type === 'string'
  ? slidePreviewByTypeKey[props.slide.type](props as any)
  : (console.error(`Empty slide type!`), null);

type GalleryProps = {
  items: string[],
};

export const Gallery: FC<GalleryProps> = ({ items }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const onItemClick = useCallback((event: MouseEvent, index: number) => {
    event.preventDefault();
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const slides = useMemo<Slide[]>(() => items.map<Slide>(src => {
    if (Encryption.isEncryptedUri(src)) {
      const contentType = Utils.getContentType(Encryption.decryptUri(src));
      return contentType?.startsWith('video/')
        ? { type: 'encrypted-video', src, contentType }
        : { type: 'encrypted-image', src };
    } else {
      const contentType = Utils.getContentType(src);
      return contentType?.startsWith('video/')
        ? { type: 'video', sources: [{ src, type: contentType }] }
        : { type: 'image', src };
    }
  }), [items]);

  const onLightboxClose = useCallback(() => setLightboxOpen(false), []);

  return (
    <>
      <div className="gallery">
        {slides.slice(0, 4).map((slide, index) => (
          <SlidePreview 
            key={index}
            slide={slide} 
            onClick={(e) => onItemClick(e, index)} 
          />
        ))}
      </div>

      <Lightbox
        open={lightboxOpen}
        close={onLightboxClose}
        index={lightboxIndex}
        slides={slides}
        video={{ controls: true }}
        plugins={[Video, EncryptedImagePlugin, EncryptedVideoPlugin]}
      />
    </>
  );
};