import './popup.css';

import { CSSProperties, FC, useCallback, useMemo } from "react";
import { TravelPlace } from "../travel-data";
import Translations from "../translations";
import { Button } from '../common/button';
import { NextOutlinedIcon } from '../common/icons';
import { Gallery } from '../gallery';

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

      <Gallery items={place.gallery} />
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