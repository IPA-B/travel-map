import './index.css';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { FC, useState, useEffect, useRef, Ref, RefCallback, useEffectEvent, useMemo, Fragment, useCallback } from 'react';
import { TravelData, TravelPlace } from '../travel-data';
import Utils from '../common/utils';
import Player from '../player';
import { useSettingsCurrentPlaceId } from '../settings/components/hooks';
import { TravelMapMarker } from './marker';

export type TravelMapProps = {
  mapRef?: Ref<L.Map>;
  travelData?: TravelData | null;
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

const getMarkerLatLng = (places: TravelPlace[]): [lat: number, lng: number] => {
    if (places.length === 0) throw 'Invalid places agrument';
    return (({lat, lng}: L.LatLng) => [lat, lng])(L.latLngBounds(places.map(p => L.latLng(p.latitude, p.longitude))).getCenter());
};


async function updatePlayerState(
  map: L.Map | null | undefined, 
  places: TravelPlace[], 
  positions: [lat: number, lng: number][], 
  currentPlace: TravelPlace | null | undefined,
  isVideoPlaying: boolean
) {

  const pauseTrackRadiusPixels = 500;
  const playTrackRadiusPixels = 300;

  let centeredPlace: TravelPlace | null = null;
  let centeredDistance = Number.POSITIVE_INFINITY;
  let currentPlaylistPlaceDistance = Number.POSITIVE_INFINITY;

  if (currentPlace) {
    centeredPlace = currentPlace;
    centeredDistance = 0;
  }

  const playerState = Player.getState();
  const playerPlaylist = playerState.currentPlaylist;
  const playerPlaylistId = playerPlaylist?.id ?? null;

  if (playerState.volume === 0 || isVideoPlaying || !map || !Array.isArray(places) || places.length === 0) {
    if (playerPlaylist !== null) {
      await Player.stop();
    }
    return;
  }

  const mapCenter = map.getCenter();
  const mapCenterPoint = map.latLngToContainerPoint(mapCenter);

  const placesExtended = places.map((place, index) => ({
    place,
    playlist: playerState.playlists.find(p => p.id === place.id) ?? null,
    position: positions[index] ?? [place.latitude, place.longitude],
  }));

  placesExtended.forEach(({ place, playlist, position }) => {
    const placePoint = map.latLngToContainerPoint(position);
    const pixelDistance = Math.hypot(placePoint.x - mapCenterPoint.x, placePoint.y - mapCenterPoint.y);

    if (place.id === playerPlaylistId) {
      currentPlaylistPlaceDistance = pixelDistance;
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
    const canChangePlaylist = centeredDistance <= playTrackRadiusPixels;
    if (canChangePlaylist) {
      await Player.changePlaylist(centeredPlace.id);
    }
  } else if (playerPlaylistId !== null && currentPlaylistPlaceDistance > pauseTrackRadiusPixels && !currentPlace) {
    await Player.stop();
  }
}

const useTravelMapPlayerController = (map: L.Map | null | undefined, places: (TravelPlace | null)[], positions: [lat: number, lng: number][]) => {

  const cacheRef = useRef<[placesCache: TravelPlace[], positionsCache: [lat: number, lng: number][]]>([[], []]);
  const [placesReady, positionsReady] = useMemo(
    () => places.every(p => !!p)
      ? (cacheRef.current = [places, positions])
      : cacheRef.current,
    [places, positions]
  );

  const [settingsCurrentPlaceId] = useSettingsCurrentPlaceId();
  const settingsCurrentPlace = useMemo(
    () => placesReady?.find(p => p && p.id === settingsCurrentPlaceId) ?? null,
    [settingsCurrentPlaceId, placesReady]
  );

  const updatePlayerStateSkipping = useEffectEvent(() => {
    return Utils.skipOrExecute(
      'map-player-controller-update-player-state',
      updatePlayerState,
      map,
      placesReady,
      positionsReady,
      settingsCurrentPlace,
      false
    );
  });

  const updatePlayerStateWaiting = useEffectEvent(() => {
    return Utils.waitAndExecute(
      'map-player-controller-update-player-state',
      updatePlayerState,
      map,
      placesReady,
      positionsReady,
      settingsCurrentPlace,
      false
    );
  });

  useEffect(() => {
    updatePlayerStateWaiting();
  }, [settingsCurrentPlace, placesReady, positionsReady]);

  useEffect(() => {
    if (!map) {
      return;
    }

    let isUpdateCurrentPlaylistActive = false;
    const onPlayerStateChanged = () => {
      const state = Player.getState();

      if (state.volume === 0 && isUpdateCurrentPlaylistActive) {
        isUpdateCurrentPlaylistActive = false;

        map.off('move', updatePlayerStateSkipping);
        map.off('zoom', updatePlayerStateSkipping);

        updatePlayerStateWaiting();

        return;
      }

      if (state.volume > 0 && !isUpdateCurrentPlaylistActive) {
        isUpdateCurrentPlaylistActive = true;

        map.on('move', updatePlayerStateSkipping);
        map.on('zoom', updatePlayerStateSkipping);

        updatePlayerStateWaiting();

        return;
      }
    }

    Player.addEventListener('state_changed', onPlayerStateChanged);
    onPlayerStateChanged();

    return () => {
      Player.removeEventListener('state_changed', onPlayerStateChanged);

      if (isUpdateCurrentPlaylistActive) {
        map?.off('move', updatePlayerStateSkipping);
        map?.off('zoom', updatePlayerStateSkipping);
      }

      updatePlayerStateWaiting();
    };
  }, [map]);
};

const TravelMapWithMarkers: FC<TravelMapProps> = (props) => {
  const places = props.travelData?.places;

  const [settingsCurrentPlaceId] = useSettingsCurrentPlaceId();

  const [map, setMap] = useState<L.Map | null>(null);
  const mapRef = Utils.useMergedRef(setMap, props.mapRef);

  const [markerPlaces, setMarkerPlaces] = useState<TravelPlace[][]>([]);

  const [markerCurrentPlaces, setMarkerCurrentPlaces] = useState<(TravelPlace | null)[]>([]);

  const markerPositions = useMemo<[lat: number, lng: number][]>(
    () => markerPlaces.map(getMarkerLatLng), 
    [markerPlaces]
  );

  useTravelMapPlayerController(
    map, 
    markerCurrentPlaces, 
    markerPositions
  );

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
      setMarkerCurrentPlaces(markerPlacesNew.map(() => null));
    };

    const onMapZoomChanged = () => updateMarkerPlaces();

    map.on('zoom', onMapZoomChanged);
    updateMarkerPlaces();

    return () => {
      map.off('zoom', onMapZoomChanged);
      setMarkerPlaces([]);
      setMarkerCurrentPlaces([]);
    };
  }, [map, placesHash]);

  useEffect(() => {
    if (typeof map !== 'object' || map === null) {
      return;
    }

    if (!Array.isArray(places) || places.length == 0) {
      return;
    }

    const settingsCurrentPlace = places.find(p => p.id === settingsCurrentPlaceId);
    if (settingsCurrentPlace) {
      const bounds = L.latLngBounds([L.latLng(settingsCurrentPlace.latitude, settingsCurrentPlace.longitude)]);
      map.fitBounds(bounds.pad(0.25), { maxZoom: 10, paddingTopLeft: L.point(0, 300), animate: false });
    } else {
      const bounds = L.latLngBounds(places.map(p => L.latLng(p.latitude, p.longitude)));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 10, animate: false });
    }
  }, [map, placesHash]);

  const onCurrentPlaceChanged = useMemo(
    () => markerPlaces.map((_, i) => (cp: TravelPlace | null) => setMarkerCurrentPlaces(mcp => { 
      if (mcp[i] !== cp) {
        const mcpNew = mcp.slice(); 
        mcpNew[i] = cp;
        return mcpNew; 
      } else {
        return mcp;
      }
    })), 
    [markerPlaces]
  );

  return (
    <>
      <TravelMapBase
        {...props}
        mapRef={mapRef}
      />

      <Fragment key={placesHash}>
        {markerPlaces.map((places, index) => (
          <TravelMapMarker
            key={places.reduce((r, p) => r ^ getStringHash(p.id), places.length)}
            map={map}
            latitude={markerPositions[index][0]}
            longitude={markerPositions[index][1]}
            places={places}
            onCurrentPlaceChanged={onCurrentPlaceChanged[index]}
          />
        ))}
      </Fragment>
    </>
  );
};

export const TravelMap: FC<TravelMapProps> = TravelMapWithMarkers;
