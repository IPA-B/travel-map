import { useEffect, useState } from "react";
import SettingsStorage, { Settings } from "..";

let settingsReadOnly: Settings = SettingsStorage.getSettings();
const onSettingsChanged = () => {
    settingsReadOnly = SettingsStorage.getSettings(); 
};
SettingsStorage.addEventListener('changed', onSettingsChanged);

export type SettingsSetter = (settingsProvider: Settings | null | ((settings: Settings) => Settings | null)) => void;

const setSettingsInternal: SettingsSetter = (settingsProvider) => {
    const settings = typeof settingsProvider === 'function'
        ? settingsProvider(SettingsStorage.getSettings())
        : settingsProvider;

    if (typeof settings === 'object' && settings !== null) {
        SettingsStorage.setSettings(settings);
    } else {
        SettingsStorage.clearSettings();
    }
};

export const useSettings = (): [Settings, SettingsSetter] => {
    const [settings, setSettings] = useState<Settings>(() => SettingsStorage.getSettings());

    useEffect(() => {
        const onSettingsChanged = () => {
            setSettings(SettingsStorage.getSettings()); 
        };
        SettingsStorage.addEventListener('changed', onSettingsChanged);
        onSettingsChanged();

        return () => {
            SettingsStorage.removeEventListener('changed', onSettingsChanged);
        };
    }, []);

    return [settings, setSettingsInternal];
};

export type SettingsCurrentPlaceIdSetter = (currentPlaceIdProvider: string | null | ((currentPlaceId: string | null) => string | null)) => void;

const setSettingsCurrentPlaceIdInternal: SettingsCurrentPlaceIdSetter = (currentPlaceIdProvider) => {
    const settings = SettingsStorage.getSettings();
    
    const currentPlaceId = typeof currentPlaceIdProvider === 'function'
        ? currentPlaceIdProvider(settings.currentPlaceId)
        : currentPlaceIdProvider;

    if (currentPlaceId === settings.currentPlaceId) {
        return;
    }

    settings.currentPlaceId = currentPlaceId;

    SettingsStorage.setSettings(settings);
};

export const useSettingsCurrentPlaceId = (): [string | null, SettingsCurrentPlaceIdSetter] => {
    const [settingsCurrentPlaceId, setSettingsCurrentPlaceId] = useState<string | null>(settingsReadOnly.currentPlaceId);

    useEffect(() => {
        const onSettingsChanged = () => {
            setSettingsCurrentPlaceId(settingsReadOnly.currentPlaceId);
        };
        SettingsStorage.addEventListener('changed', onSettingsChanged);
        onSettingsChanged();

        return () => {
            SettingsStorage.removeEventListener('changed', onSettingsChanged);
        };
    }, []);

    return [settingsCurrentPlaceId, setSettingsCurrentPlaceIdInternal];
};
