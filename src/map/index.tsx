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
import { useSettings, useSettingsCurrentPlaceId } from '../settings/components/hooks';
import { getMarkerLatLng, TravelMapMarker } from './marker';

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

const getStringHash = (value: string) => {
  let hash = 0;
  for (const char of value) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return hash;
};


const TravelMapPlaces: FC<TravelMapProps> = (props) => {
  const places = props.travelData?.places;

  const [settingsCurrentPlaceId] = useSettingsCurrentPlaceId();

  const [map, setMap] = useState<L.Map | null>(null);
  const mapRef = Utils.useMergedRef(setMap, props.mapRef);

  const [markerPlaces, setMarkerPlaces] = useState<TravelPlace[][]>([]);

  const placesHash = useMemo(
    () => places?.reduce((r, p) => r ^ getStringHash(p.id), places.length) ?? 0,
    [places]
  );

  useEffect(() => {
    if (!map || !Array.isArray(places) || places.length === 0) {
      return;
    }

    const updateMarkerPlaces = () => {
      const markerPointMinDistancePixels = 25;

      const markerPlacesNew = places.map(p => [p]);

      const distanceSquared = (a: L.Point, b: L.Point): number => { 
        const dx = a.x - b.x; 
        const dy = a.y - b.y; 
        return dx * dx + dy * dy; 
      }

      while (markerPlacesNew.length > 1) {
        let closestA = -1;
        let closestB = -1;
        let closestDistance = Infinity;

        for (let i = 0; i < markerPlacesNew.length - 1; i++) {
          const centerA = map.latLngToContainerPoint(getMarkerLatLng(markerPlacesNew[i]));

          for (let j = i + 1; j < markerPlacesNew.length; j++) {
            const centerB = map.latLngToContainerPoint(getMarkerLatLng(markerPlacesNew[j]));

            const distance = distanceSquared(centerA, centerB);

            if (distance < closestDistance) {
              closestDistance = distance;
              closestA = i;
              closestB = j;
            }
          }
        }

        // The closest pair is already far enough apart.
        if (closestDistance >= markerPointMinDistancePixels * markerPointMinDistancePixels) {
          break;
        }

        // Merge the closest pair.
        markerPlacesNew[closestA].push(...markerPlacesNew[closestB]);
        markerPlacesNew.splice(closestB, 1);
      }
      
      setMarkerPlaces(markerPlacesNew);
    };

    const onMapZoomChanged = () => updateMarkerPlaces();

    map.on('zoom', onMapZoomChanged);
    updateMarkerPlaces();

    return () => {
      map.off('zoom', onMapZoomChanged);
      setMarkerPlaces([]);
    };
  }, [map, placesHash]);

  useEffect(() => {
    if (typeof map !== 'object' || map === null) {
      return;
    }

    if (!Array.isArray(places) || places.length == 0) {
      return;
    }

    const currentPlace = places.find(p => p.id === settingsCurrentPlaceId);
    if (currentPlace) {
      const bounds = L.latLngBounds([L.latLng(currentPlace.latitude, currentPlace.longitude)]);
      map.fitBounds(bounds.pad(0.25), { maxZoom: 10, paddingTopLeft: L.point(0, 300), animate: false });
    } else {
      const bounds = L.latLngBounds(
        places.map(p => L.latLng(p.latitude, p.longitude)),
      );
      map.fitBounds(bounds.pad(0.25), { maxZoom: 10, animate: false });
    }
  }, [map, placesHash]);

  return (
    <>
      <TravelMapBase
        {...props}
        mapRef={mapRef}
      />

      <Fragment key={placesHash}>
        {markerPlaces.map((places) => (
          <TravelMapMarker
            key={places.reduce((r, p) => r ^ getStringHash(p.id), places.length)}
            map={map}
            places={places}
          />
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

  const [settingsCurrentPlaceId] = useSettingsCurrentPlaceId();
  const selectedPlace = useMemo(
    () => places?.find(p => p.id === settingsCurrentPlaceId) ?? null,
    [settingsCurrentPlaceId, places]
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
