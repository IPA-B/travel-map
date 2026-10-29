import 'yet-another-react-lightbox/styles.css';
import './popup.css';

import { CSSProperties, FC, MouseEvent, useCallback, useMemo, useState } from "react";
import { TravelPlace } from "../travel-data";
import Translations from "../translations";
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import type { Slide } from 'yet-another-react-lightbox';
import { Button } from '../common/button';
import { NextOutlinedIcon } from '../common/icons';

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

type TravelPopupItemProps = {
  style?: CSSProperties | null,
  place?: TravelPlace | null,
  onNext?: (() => void) | null,
}

const TravelPopupItem: FC<TravelPopupItemProps> = ({ style, place, onNext }) => {

  const defaultPlace = useMemo(() => ({
    id: 'unknown-place',
    date: new Date(Date.now()),
    title: Translations.get('unknown-place-title'),
    latitude: 0,
    longitude: 0,
    tracks: [],
    gallery: [],
  }), []);

  if (!place) {
    place = defaultPlace;
  }

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxPlugins = useMemo(() => [Video], []);

  const onGalleryItemClick = useCallback((event: MouseEvent, index: number) => {
    event.preventDefault();
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const onLightboxClose = useCallback(() => setLightboxOpen(false), []);

  const slides = useMemo<Slide[]>(() => place.gallery.map<Slide>(src => {
    const type = getVideoMimeType(src);
    return type
      ? { type: 'video', sources: [{ src, type }] }
      : { type: 'image', src };
  }), [place.gallery]);

  const formattedDate = useMemo(() => 
    new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(place.date), 
    [place.date]
  );


  return (
    <div className="popup-card" style={style ?? undefined}>
      <div className="popup-header">
        <div className="popup-header-left">
          <h3 className="popup-title">{place.title}</h3>
          <div className="popup-date">{formattedDate}</div>
        </div>

        {onNext ? <Button
          className='popup-next-button'
          color='secondary'
          variant='text'
          onClick={onNext ?? undefined}
          icon={<NextOutlinedIcon/>}
        /> : null}
      </div>

      <div className="popup-gallery">
        {place.gallery.slice(0, 4).map((g, i) => (
            <a 
              key={g}
              href={g} 
              target="_blank"
              rel="noreferrer"
              onClick={(e) => onGalleryItemClick(e, i)}
            >
              {getVideoMimeType(g)
                ? <video src={g} aria-label="Video preview" muted playsInline preload="metadata" />
                : <img
                    src={g}
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
        video={{
          controls: true,
        }}
        plugins={lightboxPlugins}
      />
    </div>
  );
};

export type TravelPopupProps = {
  places?: TravelPlace[] | null,
  currentPlace?: TravelPlace | null,
  onCurrentPlaceChanged?: ((place: TravelPlace) => void) | null,
};

export const TravelPopup: FC<TravelPopupProps> = ({ places, currentPlace, onCurrentPlaceChanged }) => {

  const onNext = useCallback(() => {
    if (!places || places.length == 0) {
      return;
    }

    const sortedPlaces = places.sort((p1, p2) => p1.date.getTime() - p2.date.getTime());
    const currentPlaceIndex = sortedPlaces.findIndex(p => p === currentPlace);
    const nextPlaceIndex = (currentPlaceIndex + 1) % places.length;
    const nextPlace = sortedPlaces[nextPlaceIndex];

    onCurrentPlaceChanged?.(nextPlace);
  }, [onCurrentPlaceChanged, places, currentPlace]);

  return (
    <>
      {places?.map(p => (
        <TravelPopupItem
          key={p.id}
          style={p !== currentPlace ? { display:  'none' } : {}}
          place={p}
          onNext={places.length > 1 ? onNext : null}
        />
      ))}
    </>
  );
};