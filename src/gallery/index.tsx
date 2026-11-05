import 'yet-another-react-lightbox/styles.css';
import './index.css';

import { FC, MouseEvent, useCallback, useMemo, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import type { Slide } from 'yet-another-react-lightbox';

const getVideoMimeType = (src: string) => {
  const videoMimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    ogg: 'video/ogg',
  };

  const fileName = src.split(/[?#]/, 1)[0];
  const extension = fileName?.split('.').pop()?.toLowerCase();
  return extension ? videoMimeTypes[extension] : undefined;
};

type GalleryProps = {
  items: string[],
};

export const Gallery: FC<GalleryProps> = ({ items }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxPlugins = useMemo(() => [Video], []);

  const onItemClick = useCallback((event: MouseEvent<HTMLAnchorElement>, index: number) => {
    event.preventDefault();
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const slides = useMemo<Slide[]>(() => items.map<Slide>(src => {
    const videoMimeType = getVideoMimeType(src);
    return videoMimeType
      ? { type: 'video', sources: [{ src, type: videoMimeType }] }
      : { type: 'image', src };
  }), [items]);

  const onLightboxClose = useCallback(() => setLightboxOpen(false), []);

  return (
    <>
      <div className="gallery">
        {items.slice(0, 4).map((src, index) => (
          <a
            key={src}
            href={src}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => onItemClick(event, index)}
          >
            {getVideoMimeType(src)
              ? <video src={src} aria-label="Video preview" muted playsInline preload="metadata" />
              : <img
                  src={src}
                  alt="img"
                  loading="lazy"
                  decoding="async"
                />}
          </a>
        ))}
      </div>

      <Lightbox
        open={lightboxOpen}
        close={onLightboxClose}
        index={lightboxIndex}
        slides={slides}
        video={{ controls: true }}
        plugins={lightboxPlugins}
      />
    </>
  );
};