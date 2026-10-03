import './marker.css';

import { FC, useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useSettingsCurrentPlaceId } from "../settings/components/hooks";
import { TravelPlace } from "../travel-data";
import { TravelPopup } from "./popup";
import { createPortal } from "react-dom";
import L from "leaflet";

export const getMarkerLatLng = (places: TravelPlace[]): [lat: number, lng: number] => {
    if (places.length === 0) throw 'Invalid places agrument';
    return (({lat, lng}: L.LatLng) => [lat, lng])(L.latLngBounds(places.map(p => L.latLng(p.latitude, p.longitude))).getCenter());
};

export type TravelMapMarkerProps = {
  map: L.Map | null,
  places: TravelPlace[],
}

export const TravelMapMarker: FC<TravelMapMarkerProps> = ({ map, places: placesFromProps }) => {
  const [settingsCurrentPlaceId, setSettingsCurrentPlaceId] = useSettingsCurrentPlaceId();

  const [currentPlace, setCurrentPlace] = useState<TravelPlace | null>(null);
  const [marker, setMarker] = useState<L.Marker | null>(null);
  const [popup, setPopup] = useState<L.Popup | null>(null);

  const places = useMemo(() => placesFromProps.sort((p1, p2) => p1.date.getTime() - p2.date.getTime()), [placesFromProps]);

  const isPopupOpened = useMemo<boolean>(() => places.some(p => p.id === settingsCurrentPlaceId), [places, settingsCurrentPlaceId]);
  const popupContentElement = useMemo<HTMLDivElement>(() => document.createElement('div'), []);
  const [markerLat, markerLng] = useMemo<[lat: number | null, lng: number | null]>(
    () => places.length > 0 ? getMarkerLatLng(places) : [null, null], 
    [places]
  );

  const onMarkerClick = useEffectEvent(() => {
      if (!currentPlace) return;
      
      setSettingsCurrentPlaceId(currentPlace.id);
  });

  const onPopupOpen = useEffectEvent(() => {
    setSettingsCurrentPlaceId(settingsCurrentPlaceId => currentPlace ? currentPlace.id : settingsCurrentPlaceId);
  });

  const onPopupClose = useEffectEvent(() => {
    setSettingsCurrentPlaceId(settingsCurrentPlaceId => settingsCurrentPlaceId === currentPlace?.id ? null : settingsCurrentPlaceId);
  });

  useEffect(() => {
    if (typeof map !== 'object' || map === null) return;
    if (typeof markerLat !== 'number' || typeof markerLng !== 'number') return;

    const marker = L.marker([markerLat, markerLng], {
      icon: L.divIcon({
        html: '<span class="marker-dot"></span>',
        className: 'travel-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      }),
    }).on('click', onMarkerClick)
      .addTo(map);
    
    setMarker(marker);

    const popup = L.popup({
      className: 'travel-popup',
      minWidth: 250,
      maxWidth: 600,
      closeButton: false,
      offset: [0, -12],
    }).setLatLng(marker.getLatLng())
      .setContent(popupContentElement)
      .on('add', onPopupOpen)
      .on('remove', onPopupClose);

    setPopup(popup);

    return () => {
      marker.off('click', onMarkerClick);
      marker.removeFrom(map);
      setMarker(null);

      popup.off('add', onPopupOpen)
      popup.off('remove', onPopupClose);
      map.closePopup(popup);
      setPopup(null);
    };
  }, [map, markerLat, markerLng]);

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
    if (typeof map !== 'object' || map === null) return;
    if (typeof popup !== 'object' || popup === null) return;

    if (isPopupOpened) {
      map.openPopup(popup);
    } else {
      map.closePopup(popup);
    }
  }, [map, popup, isPopupOpened]);

  useEffect(() => {
    if (!isPopupOpened) return;

    setSettingsCurrentPlaceId(settingsCurrentPlaceId => currentPlace ? currentPlace.id : settingsCurrentPlaceId);
  }, [currentPlace]);

  const onCurrentPlaceChanged = useCallback((currentPlace: TravelPlace) => {
    setCurrentPlace(currentPlace);
  }, []);

  return createPortal(
    <TravelPopup
      places={places}
      currentPlace={currentPlace}
      onCurrentPlaceChanged={onCurrentPlaceChanged}
    />,
    popupContentElement
  );
}