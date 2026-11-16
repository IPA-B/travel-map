import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { createContext, FC, PropsWithChildren, Ref, useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRefModifier } from '../common/utils/components/hooks';

type LeafletMapContextValue = {
  map: L.Map | null;
};

type LeafletMarkerContextValue = {
  marker: L.Marker | null;
  position: L.LatLngExpression;
};

const LeafletMapContext = createContext<LeafletMapContextValue>({ map: null });
const LeafletMarkerContext = createContext<LeafletMarkerContextValue>({ marker: null, position: [0, 0] });

export type LeafletMapProps = PropsWithChildren<{
  mapRef?: Ref<L.Map>;
  id?: string;
  className?: string;
  ariaLabel?: string;
  center?: L.LatLngExpression,
  zoom?: number,
  options?: L.MapOptions;
  tileLayerUrl?: string | null;
  tileLayerOptions?: L.TileLayerOptions;
}>;

export const LeafletMap: FC<LeafletMapProps> = ({
  children,
  mapRef,
  id,
  className = 'leaflet-map',
  ariaLabel = 'Map',
  center = [20, 0],
  zoom = 2,
  options,
  tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileLayerOptions = {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [setMapRef, cleanupMapRef] = useRefModifier(mapRef);

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element) {
      return;
    }

    const leafletMap = L.map(element, options).setView(center, zoom);

    if (tileLayerUrl) {
      L.tileLayer(tileLayerUrl, tileLayerOptions).addTo(leafletMap);
    }

    setMap(leafletMap);
    setMapRef(leafletMap);

    return () => {
      cleanupMapRef();
      leafletMap.remove();
      setMap(null);
    };
  }, []);

  const contextValue = useMemo(() => ({ map }), [map]);

  return (
    <div ref={mapElementRef} id={id} className={className} aria-label={ariaLabel}>
      <LeafletMapContext.Provider value={contextValue}>
        {children}
      </LeafletMapContext.Provider>
    </div>
  );
};

export type LeafletMarkerProps = PropsWithChildren<{
  position: L.LatLngExpression;
  options?: L.MarkerOptions;
  onClick?: L.LeafletMouseEventHandlerFn;
}>;

export const LeafletMarker: FC<LeafletMarkerProps> = ({ children, position, options, onClick }) => {
  const { map } = useContext(LeafletMapContext);
  const [marker, setMarker] = useState<L.Marker | null>(null);

  useEffect(() => {
    if (!map) {
      return;
    }

    const leafletMarker = L.marker(position, options).addTo(map);
    setMarker(leafletMarker);

    return () => {
      leafletMarker.removeFrom(map);
      setMarker(null);
    };
  }, [map, options]);

  useEffect(() => {
    if (!marker) {
      return;
    }

    marker.setLatLng(position);
  }, [marker, position]);

  useEffect(() => {
    if (!marker || !onClick) {
      return;
    }

    marker.on('click', onClick);
    return () => {
      marker.off('click', onClick);
    };
  }, [marker, onClick]);

  const contextValue = useMemo(() => ({ marker, position }), [marker, position]);

  return (
    <LeafletMarkerContext.Provider value={contextValue}>
      {children}
    </LeafletMarkerContext.Provider>
  );
};

export type LeafletPopupProps = PropsWithChildren<{
  isOpen?: boolean;
  options?: L.PopupOptions;
  onOpen?: () => void;
  onClose?: () => void;
}>;

export const LeafletPopup: FC<LeafletPopupProps> = ({ children, isOpen, options, onOpen, onClose }) => {
  const { marker } = useContext(LeafletMarkerContext);
  const { map } = useContext(LeafletMapContext);
  const { position } = useContext(LeafletMarkerContext);
  const [contentElement] = useState(() => document.createElement('div'));
  const [popup, setPopup] = useState<L.Popup | null>(null);

  const handleOpen = useEffectEvent(() => onOpen?.());
  const handleClose = useEffectEvent(() => onClose?.());

  useEffect(() => {
    if (!marker) {
      return;
    }

    const leafletPopup = L.popup(options)
      .setLatLng(position)
      .setContent(contentElement)
      .on('add', handleOpen)
      .on('remove', handleClose);
    setPopup(leafletPopup);

    return () => {
      map?.closePopup(leafletPopup);
      setPopup(null);
    };
  }, [marker, map, options]);

  useEffect(() => {
    if (popup) {
      popup.setLatLng(position);
    }
  }, [popup, position]);

  useEffect(() => {
    if (!map || !marker || !popup || isOpen === undefined) {
      return;
    }

    if (isOpen) {
      map.openPopup(popup);
    } else {
      map.closePopup(popup);
    }
  }, [map, marker, popup, isOpen]);

  return popup ? createPortal(children, contentElement) : null;
};
