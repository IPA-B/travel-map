import './index.css';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { FC, useState, useEffect, useRef, Ref, useCallback, RefCallback, useEffectEvent, useMemo, Fragment } from 'react';
import { TravelData, TravelPlace } from '../travel-data';
import { createPortal } from 'react-dom';
import { TravelPopup } from './popup';
import Utils from '../common/utils';
import Player from '../player';
import SettingsStorage from '../settings';
import { useSettings } from '../settings/components/hooks';

export type TravelMapProps = {
  mapRef?: Ref<L.Map>;
  travelData?: TravelData | null;
  enablePlayerController?: boolean;
};

const TravelMapBase: FC<TravelMapProps> = ({ mapRef }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const [setMapRef, cleanupMapRef] = Utils.useRefModifier(mapRef);

  useEffect(() => {
    if (!mapElementRef.current) {
      return;
    }

    const map = L.map(mapElementRef.current, {
      zoomControl: false,
      worldCopyJump: true,
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    setMapRef(map);

    return () => {
      cleanupMapRef();
      map.remove();
    };
  }, []);

  return (<div ref={mapElementRef} id="map" aria-label="Travel map" />);
}

type PlaceMarker = {
  place: TravelPlace,
  isPopupOpened: () => boolean,
  openPopup: () => void,
  closePopup: () => void,
  marker: L.Marker,
  popup: L.Popup,
  popupElement: HTMLDivElement,
}

const TravelMapPlaces: FC<TravelMapProps> = (props) => {
  const places = props.travelData?.places;

  const settings = useSettings();

  const [map, setMap] = useState<L.Map | null>(null);
  const mapRef = Utils.useMergedRef(setMap, props.mapRef);

  const [placeMarkers, setPlaceMarkers] = useState<PlaceMarker[]>([]);

  useEffect(() => {
    if (!map || !Array.isArray(places) || places.length === 0) {
      return;
    }

    const placeMarkersNew: PlaceMarker[] = [];
    for (const place of places) {
      const marker = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({
          html: '<span class="marker-dot"></span>',
          className: 'travel-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
        }),
      }).addTo(map);

      const popupElement = document.createElement('div');

      const popup = L.popup({
        className: 'travel-popup',
        minWidth: 250,
        maxWidth: 600,
        closeButton: false,
        offset: [0, -12],
      });

      let isPopupOpened = false;
      popup
        .setLatLng(marker.getLatLng())
        .setContent(popupElement);

      const onPopupOpen = () => {
        isPopupOpened = true;
        const settings = SettingsStorage.getSettings();
        if (settings.currentPlaceId === place.id) {
          return;
        }
        settings.currentPlaceId = place.id;
        SettingsStorage.setSettings(settings);
      };
      popup.on('add', onPopupOpen);
      
      const onPopupClose = () => {
        isPopupOpened = false;
        const settings = SettingsStorage.getSettings();
        if (settings.currentPlaceId !== place.id) {
          return;
        }
        settings.currentPlaceId = null;
        SettingsStorage.setSettings(settings);
      };
      popup.on('remove', onPopupClose);

      const openPopup = () => {
        if (!isPopupOpened) {
          map.openPopup(popup);
        }
      };

      const closePopup = () => {
        if (isPopupOpened) {
          map.closePopup(popup);
        }
      };

      marker.on('click', openPopup);

      placeMarkersNew.push({
        place,
        isPopupOpened: () => isPopupOpened,
        openPopup,
        closePopup,
        marker,
        popup,
        popupElement
      });
    }

    if (placeMarkersNew.length > 0) {
      const currentPlaceMarker = placeMarkersNew.find(pm => pm.place.id === settings.currentPlaceId) ?? null;
      if (currentPlaceMarker) {
        const bounds = L.latLngBounds([currentPlaceMarker.marker.getLatLng()]);
        map.fitBounds(bounds.pad(0.25), { maxZoom: 10, paddingTopLeft: L.point(0, 300), animate: false });
      } else {
        const bounds = L.latLngBounds(
          placeMarkersNew.map((placeMarker) => placeMarker.marker.getLatLng()),
        );
        map.fitBounds(bounds.pad(0.25), { maxZoom: 10, animate: false });
      }
    }

    setPlaceMarkers(placeMarkersNew);

    return () => {
      for (const placeMarker of placeMarkersNew) {
        placeMarker.marker.off();
        placeMarker.marker.removeFrom(map);

        placeMarker.closePopup();
        placeMarker.popup.off();
      }
      setPlaceMarkers([]);
    };
  }, [places, map]);

  useEffect(() => {
    if (settings.currentPlaceId !== null) {
      const placeMarker = placeMarkers.find(pm => pm.place.id === settings.currentPlaceId);
      placeMarker?.openPopup();
    } else {
      for (const placeMarker of placeMarkers) {
        placeMarker.closePopup();
      }
    }
  }, [placeMarkers, settings]);

  return (
    <>
      <TravelMapBase
        {...props}
        mapRef={mapRef}
      />

      <Fragment key={settings.currentData?.id ?? undefined}>
        {placeMarkers.map((placeMarker) => createPortal(
          <TravelPopup key={placeMarker.place.id} place={placeMarker.place} />,
          placeMarker.popupElement,
          placeMarker.place.id
        ))}
      </Fragment>
    </>
  );
};

async function updateCurrentPlaylist(map: L.Map | null | undefined, places: TravelPlace[] | null | undefined, selectedPlace: TravelPlace | null | undefined) {

  const pauseTrackRadiusPixels = 500;
  const playTrackRadiusPixels = 300;
  const switchTrackRadiusPixels = 100;

  let centeredPlace: TravelPlace | null = null;
  let centeredDistance = Number.POSITIVE_INFINITY;
  let lastCenteredDistance = Number.POSITIVE_INFINITY;

  if (selectedPlace) {
    centeredPlace = selectedPlace;
    centeredDistance = 0;
  }

  const playerState = Player.getState();
  const playerPlaylist = playerState.currentPlaylist;
  const playerPlaylistId = playerPlaylist?.id ?? null;

  if (playerState.volume === 0 || !map || !Array.isArray(places) || places.length === 0) {
    if (playerPlaylist !== null) {
      await Player.stop();
    }
    return;
  }

  const mapCenter = map.getCenter();
  const mapCenterPoint = map.latLngToContainerPoint(mapCenter);

  const placesPlaylists = places.map(place => ({
    place,
    playlist: playerState.playlists.find(p => p.id === place.id) ?? null,
  }));

  placesPlaylists.forEach(({ place, playlist }) => {
    const placePoint = map.latLngToContainerPoint(L.latLng(place.latitude, place.longitude));
    const pixelDistance = Math.hypot(placePoint.x - mapCenterPoint.x, placePoint.y - mapCenterPoint.y);

    if (place.id === playerPlaylistId) {
      lastCenteredDistance = pixelDistance;
    }

    if (!playlist || playlist.tracks.length === 0 || playlist.tracks.every(t => t.canPlay === false)) {
      return;
    }

    if (pixelDistance < centeredDistance) {
      centeredDistance = pixelDistance;
      centeredPlace = place;
    }
  });


  if (centeredPlace !== null && centeredPlace.id !== playerPlaylistId) {
    const canChangePlaylist = centeredDistance <= (playerPlaylistId === null ? playTrackRadiusPixels : switchTrackRadiusPixels);
    if (canChangePlaylist) {
      await Player.changePlaylist(centeredPlace.id);
    }
  } else if (playerPlaylistId !== null && lastCenteredDistance > pauseTrackRadiusPixels && !selectedPlace) {
    await Player.stop();
  }
}

const TravelMapPlayerController: FC<TravelMapProps> = (props) => {
  const enablePlayerController = props.enablePlayerController ?? true;
  const places = props.travelData?.places;

  const [map, setMap] = useState<L.Map | null>(null);
  const mapRef: RefCallback<L.Map> = Utils.useMergedRef(props.mapRef, setMap);

  const settings = useSettings();
  const selectedPlace = useMemo(
    () => places?.find(p => p.id === settings.currentPlaceId) ?? null, 
    [settings.currentPlaceId, places]
  );

  const updateCurrentPlaylistSkipping = useEffectEvent(() => {
    if (!map || enablePlayerController === false) {
      return;
    }

    return Utils.skipOrExecute(
      'map-player-controller-update-current-playlist', 
      updateCurrentPlaylist, 
      map, 
      places ?? [], 
      selectedPlace
    );
  });

  const updateCurrentPlaylistWaiting = useEffectEvent(() => {
    if (!map || enablePlayerController === false) {
      return;
    }

    return Utils.waitAndExecute(
      'map-player-controller-update-current-playlist', 
      updateCurrentPlaylist, 
      map, 
      places ?? [], 
      selectedPlace
    );
  });

  useEffect(() => {
    updateCurrentPlaylistWaiting();
  }, [selectedPlace]);

  useEffect(() => {
    if (!map || enablePlayerController === false) {
      return;
    }

    let isUpdateCurrentPlaylistActive = false;
    const onPlayerStateChanged = () => {
      const state = Player.getState();

      if (state.volume === 0 && isUpdateCurrentPlaylistActive) {
        isUpdateCurrentPlaylistActive = false;

        map.off('move', updateCurrentPlaylistSkipping);
        map.off('zoom', updateCurrentPlaylistSkipping);

        Player.stop();

        return;
      }

      if (state.volume > 0 && !isUpdateCurrentPlaylistActive) {
        isUpdateCurrentPlaylistActive = true;

        map.on('move', updateCurrentPlaylistSkipping);
        map.on('zoom', updateCurrentPlaylistSkipping);

        updateCurrentPlaylistWaiting();

        return;
      }
    }

    Player.addEventListener('state_changed', onPlayerStateChanged);
    onPlayerStateChanged();

    return () => {
      Player.removeEventListener('state_changed', onPlayerStateChanged);

      if (isUpdateCurrentPlaylistActive) {
        map?.off('move', updateCurrentPlaylistSkipping);
        map?.off('zoom', updateCurrentPlaylistSkipping);
      }

      Utils.waitAndExecute(
        'map-player-controller-update-current-playlist',
        Player.stop
      );
    };
  }, [map, enablePlayerController]);

  return TravelMapPlaces({
    ...props,
    mapRef: mapRef,
  });
};

export const TravelMap: FC<TravelMapProps> = TravelMapPlayerController;
