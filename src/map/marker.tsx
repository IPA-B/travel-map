import './marker.css';

import L from 'leaflet';
import { FC, useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useSettingsCurrentPlaceId } from '../settings/components/hooks';
import { TravelPlace } from '../travel-data';
import { TravelPopup } from './popup';
import { LeafletMarker, LeafletPopup } from './leaflet';

export type TravelMapMarkerProps = {
  latitude: number | null,
  longitude: number | null,
  places: TravelPlace[],
  onCurrentPlaceChanged?: ((place: TravelPlace | null) => void) | null,
}

export const TravelMapMarker: FC<TravelMapMarkerProps> = ({ 
  latitude: markerLat, 
  longitude: markerLng, 
  places: placesFromProps, 
  onCurrentPlaceChanged: onCurrentPlaceChangedFromProps,
}) => {
  const [settingsCurrentPlaceId, setSettingsCurrentPlaceId] = useSettingsCurrentPlaceId();

  const [currentPlace, setCurrentPlace] = useState<TravelPlace | null>(null);

  const places = useMemo(() => [...placesFromProps].sort((p1, p2) => p1.date.getTime() - p2.date.getTime()), [placesFromProps]);

  const isPopupOpened = useMemo<boolean>(() => places.some(p => p.id === settingsCurrentPlaceId), [places, settingsCurrentPlaceId]);

  const onMarkerClick = useEffectEvent(() => {
      if (!currentPlace) return;
      
      if (typeof settingsCurrentPlaceId !== 'string') {
        setSettingsCurrentPlaceId(currentPlace.id);
      } else {
        setSettingsCurrentPlaceId(null);
      }
  });

  const onPopupOpen = useCallback(() => {
    setSettingsCurrentPlaceId(settingsCurrentPlaceId => currentPlace ? currentPlace.id : settingsCurrentPlaceId);
  }, [currentPlace, setSettingsCurrentPlaceId]);

  const onPopupClose = useCallback(() => {
    setSettingsCurrentPlaceId(settingsCurrentPlaceId => settingsCurrentPlaceId === currentPlace?.id ? null : settingsCurrentPlaceId);
  }, [currentPlace, setSettingsCurrentPlaceId]);

  useEffect(() => {
    const settingsCurrentPlace = places.find(p => p.id === settingsCurrentPlaceId);
    if (settingsCurrentPlace && settingsCurrentPlace.id !== currentPlace?.id) {
      setCurrentPlace(settingsCurrentPlace);
      return;
    }

    if (currentPlace && places.some(p => p.id === currentPlace.id)) {
      return;
    }

    const newestPlace = places.length > 0
      ? places[places.length - 1]
      : null;

    setCurrentPlace(newestPlace);
  }, [places, settingsCurrentPlaceId]);

  useEffect(() => {
    if (!isPopupOpened) return;

    setSettingsCurrentPlaceId(settingsCurrentPlaceId => currentPlace ? currentPlace.id : settingsCurrentPlaceId);
  }, [currentPlace]);

  const onCurrentPlaceChanged = useCallback((place: TravelPlace) => {
    setCurrentPlace(place);
  }, []);

  useEffect(() => {
    onCurrentPlaceChangedFromProps?.(currentPlace);
  }, [currentPlace, onCurrentPlaceChangedFromProps]);

  const markerOptions = useMemo<L.MarkerOptions>(() => ({
    icon: L.divIcon({
      html: '<span class="marker-dot"></span>',
      className: 'travel-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
    }),
  }), []);

  const popupOptions = useMemo<L.PopupOptions>(() => ({
    className: 'travel-popup',
    minWidth: 250,
    maxWidth: 600,
    closeButton: false,
    offset: [0, -12],
  }), []);

  if (typeof markerLat !== 'number' || typeof markerLng !== 'number') {
    return null;
  }

  return (
    <LeafletMarker
      position={[markerLat, markerLng]}
      options={markerOptions}
      onClick={onMarkerClick}
    >
      <LeafletPopup
        isOpen={isPopupOpened}
        options={popupOptions}
        onOpen={onPopupOpen}
        onClose={onPopupClose}
      >
        <TravelPopup
          places={places}
          currentPlace={currentPlace}
          onCurrentPlaceChanged={onCurrentPlaceChanged}
        />
      </LeafletPopup>
    </LeafletMarker>
  );
}