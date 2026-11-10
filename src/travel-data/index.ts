import { useMemo } from "react";
import Translations from "../translations";
import Utils from "../common/utils";
import Encryption from "../encryption";
import { useSettings } from "../settings/components/hooks";

export type TravelData = {
  welcome?: {
    title?: string,
    message?: string,
  },
  places: TravelPlace[],
};

export type TravelPlace = {
  id: string,
  date: Date,
  title: string,
  latitude: number,
  longitude: number,
  tracks: string[],
  gallery: string[],
};

export type UseTravelDataResult = {
    data: TravelData | null,
    isLoading: boolean,
    error: string | null,
}

const useTravelData = (): UseTravelDataResult => {
    const [settings] = useSettings();
    const dataUrl = settings.currentData?.url ?? '';

    const { data, isLoading, error } = Utils.useFetch<unknown>(dataUrl, (r) => r.json());

    const travelData = useMemo<TravelData | null>(() => {
        if (typeof data !== 'object' || data === null) {
            return null;
        }

        const result: TravelData = {
            places: [],
        };

        if ('welcome' in data && typeof data.welcome === 'object' && data.welcome !== null) {
            result.welcome = {};
            if ('title' in data.welcome && (typeof data.welcome.title === 'string' || Translations.isLocalizedString(data.welcome.title))) {
                result.welcome.title = Translations.getFromValue(data.welcome.title);
            }
            if ('message' in data.welcome && (typeof data.welcome.message === 'string' || Translations.isLocalizedString(data.welcome.message))) {
                result.welcome.message = Translations.getFromValue(data.welcome.message);
            }
        }

        if ('places' in data && Array.isArray(data.places)) {
            data.places.forEach((place: unknown) => {
                if (typeof place !== 'object' || place === null) return;

                if (!('id' in place)) return;
                if (typeof place.id !== 'string') return;
                if (place.id.length === 0) return;

                if (!('date' in place)) return;
                if (typeof place.date !== 'string') return;

                if (!('title' in place)) return;
                if (typeof place.title !== 'string' && !Translations.isLocalizedString(place.title)) return;

                if (!('latitude' in place)) return;
                if (typeof place.latitude !== 'number') return;

                if (!('longitude' in place)) return;
                if (typeof place.longitude !== 'number') return;

                const parsedDate = Date.parse(place.date);
                if (Number.isNaN(parsedDate)) return;

                const travelPlace: TravelPlace = {
                    id: place.id,
                    date: new Date(parsedDate),
                    title: Translations.getFromValue(place.title),
                    latitude: place.latitude,
                    longitude: place.longitude,

                    ...('tracks' in place && Array.isArray(place.tracks) && place.tracks.every(t => typeof t === 'string') ? {
                        tracks: place.tracks,
                    } : { tracks: [] }),

                    ...('gallery' in place && Array.isArray(place.gallery) && place.gallery.every(g => typeof g === 'string') ? {
                        gallery: place.gallery,
                    } : { gallery: [] }),
                };

                result.places!.push(travelPlace);
            });
        }

        replaceCurrentDirectory(result, dataUrl);

        return result;
    }, [data]);

    return { data: travelData, isLoading, error };

    function replaceCurrentDirectory(data: TravelData, dataUrl: string) {
        if (!Array.isArray(data.places)) {
            return;
        }

        const currentDirectory = getCurrentDirectory(dataUrl);

        const replaceCurrentDirectoryInUri = (uri: string): string => {
            if (Encryption.isEncryptedUri(uri)) {
                const decryptedUri = Encryption.decryptUri(uri);
                return decryptedUri.startsWith('./') || decryptedUri.startsWith('.\\')
                    ? Encryption.encryptUri(currentDirectory + decryptedUri.substring(2))
                    : uri;
            }

            return typeof uri === 'string' && (uri.startsWith('./') || uri.startsWith('.\\'))
                ? currentDirectory + uri.substring(2)
                : uri;
        }

        data.places.forEach(place => {
            if (Array.isArray(place?.gallery)) place.gallery = place.gallery.map(replaceCurrentDirectoryInUri);
            if (Array.isArray(place?.tracks)) place.tracks = place.tracks.map(replaceCurrentDirectoryInUri);
        });
    }
    function getCurrentDirectory(dataUrl: string) {
        const lastSlashIndex = Math.max(dataUrl.lastIndexOf('/'), dataUrl.lastIndexOf('\\'));
        if (lastSlashIndex === -1) {
            return '';
        }

        const result = dataUrl.substring(0, lastSlashIndex + 1);
        return result;
    }
}

export default useTravelData;