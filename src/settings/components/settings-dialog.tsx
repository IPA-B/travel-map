import './settings-dialog.css';

import Spotify from '../../spotify';
import Encryption from '../../encryption';
import Translations from '../../translations';
import SettingsStorageInLocalStorage, { Settings, SettingsDataEntry, SettingsStorage } from '..';
import { ChangeEventHandler, FC, Ref, useCallback, useEffect, useEffectEvent, useState } from 'react';
import { Dialog } from '../../common/dialog';
import { Button } from '../../common/button';
import SpotifyIcons from '../../spotify/components/spotify-icons';
import { Loader } from '../../common/loader';
import { DeleteOutlinedIcon, LockFileOutlinedIcon } from '../../common/icons';
import { createSettingsStorageInMemory } from '../settings-storage-in-memory';
import { useMergedRef } from '../../common/utils/components/hooks';

export type SettingsDialogProps = {
    ref?: Ref<HTMLDialogElement>;
};

const SettingsDialogContent: FC<{ settingsStorage: SettingsStorage, isSpotifyAuthorized: boolean | null }> = ({ settingsStorage, isSpotifyAuthorized }) => {

    const [settings, setSettings] = useState<Settings>(() => settingsStorage.getSettings());

    const newDataOptionValue = -1;
    const emptyDataOptionValue = -2;

    const onCurrentDataChanged = useCallback<ChangeEventHandler<HTMLSelectElement>>((event) => {
        if (Number.isNaN(+event.target.value)) {
            return;
        }

        const selectedId = +event.target.value;

        if (selectedId === newDataOptionValue) {
            const settings = settingsStorage.getSettings();
            let newDataId = 1;
            while (settings.data.some(d => d.id === newDataId)) { newDataId++; }
            const newData: SettingsDataEntry = { id: newDataId, url: '', encryptionKey: '' };
            settingsStorage.setSettings({
                ...settings,
                data: [...settings.data, newData],
                currentData: newData,
            });
            return;
        }

        const settings = settingsStorage.getSettings();
        const currentData = settings.data.find(data => data.id === selectedId) ?? null;
        settingsStorage.setSettings({ ...settings, currentData });
    }, [settingsStorage]);

    const onDeleteDataClick = useCallback(() => {
        const settings = settingsStorage.getSettings();

        const currentDataOld = settings.currentData;
        if (currentDataOld === null) {
            return;
        }

        if (window.confirm(Translations.get('settings-dialog-delete-data-confirmation')) !== true) {
            return;
        }

        const data = settings.data.filter(entry => entry.id !== currentDataOld.id);
        const currentData = data[0] ?? null;
        settingsStorage.setSettings({ ...settings, data, currentData });
    }, [settingsStorage]);

    const onDataUrlChanged = useCallback<ChangeEventHandler<HTMLInputElement, HTMLInputElement>>((event) => {
        const dataUrl = event.target.value.trim();
        const settings = settingsStorage.getSettings();
        const currentData = settings.currentData;

        if (currentData === null) {
            return;
        }

        currentData.url = dataUrl;
        settingsStorage.setSettings(settings);
    }, [settingsStorage]);

    const onEncryptionKeyChanged = useCallback<ChangeEventHandler<HTMLInputElement, HTMLInputElement>>((event) => {
        const encryptionKey = event.target.value;
        const settings = settingsStorage.getSettings();
        const currentData = settings.currentData;

        if (currentData === null) {
            return;
        }

        currentData.encryptionKey = encryptionKey;
        settingsStorage.setSettings(settings);
    }, [settingsStorage]);

    const onEncryptClick = useCallback(() => {
        const settings = settingsStorage.getSettings();
        const encryptionKey = settings.currentData?.encryptionKey;
        if (typeof encryptionKey !== 'string') {
            return;
        }
        const fileInputElement = document.createElement('input');
        fileInputElement.type = 'file';
        fileInputElement.addEventListener('change', async () => {
            const file = fileInputElement.files?.[0];
            if (!file) {
                return;
            }

            const encryptedData = await Encryption.encrypt(
                new Uint8Array(await file.arrayBuffer()),
                encryptionKey,
            );
            const downloadUrl = URL.createObjectURL(new Blob([encryptedData]));
            const downloadElement = document.createElement('a');
            downloadElement.href = downloadUrl;
            downloadElement.download = `${file.name}.encrypted`;
            downloadElement.click();
            URL.revokeObjectURL(downloadUrl);
        });
        fileInputElement.click();
    }, [settingsStorage]);

    const onSpotifyLoginClick = useCallback(() => { 
        Spotify.authorize();
    }, []);

    const onSpotifyLogoutClick = useCallback(() => { 
        Spotify.logout().then(() => { window.location.reload(); });
    }, []);

    useEffect(() => {
        const onSettingsChanged = () => {
            const settings = settingsStorage.getSettings();
            setSettings(settings);
        };
        settingsStorage.addEventListener('changed', onSettingsChanged);
        onSettingsChanged();
        return () => {
            settingsStorage.removeEventListener('changed', onSettingsChanged);
        };
    }, [settingsStorage]);

    return (
        <div className='settings-dialog-content'>
            <div className='settings-input-group settings-current-data-group'>
                <label
                    className='settings-input-label settings-current-data-label'
                    htmlFor='settings-current-data-select'
                    children={Translations.get('settings-dialog-current-data-label')}
                />
                <select
                    id='settings-current-data-select'
                    className='settings-input settings-current-data-select'
                    value={settings.currentData?.id ?? emptyDataOptionValue}
                    onChange={onCurrentDataChanged}
                >
                    {settings.data.map(data => (
                        <option key={data.id} value={data.id}>{data.url.length > 30 ? `${data.url.substring(0, 20)}...` : data.url}</option>
                    ))}
                    <option key={emptyDataOptionValue} value={emptyDataOptionValue}>{Translations.get('settings-dialog-empty-data-option')}</option>
                    <option key={newDataOptionValue} value={newDataOptionValue}>{Translations.get('settings-dialog-new-data-option')}</option>
                </select>
                {settings.currentData !== null ? (
                    <Button
                        className='settings-input-button settings-delete-data-button'
                        variant='outlined'
                        aria-label={Translations.get('settings-dialog-delete-data-label')}
                        title={Translations.get('settings-dialog-delete-data-label')}
                        onClick={onDeleteDataClick}
                        children={<DeleteOutlinedIcon />}
                    />
                ) : null}
            </div>

            <div className='settings-input-group settings-data-url-group'>
                <label 
                    className='settings-input-label settings-data-url-label'
                    htmlFor='settings-data-url-input'
                    children={Translations.get('settings-dialog-data-url-label')}
                />
                <input
                    id='settings-data-url-input'
                    className='settings-input settings-data-url-input'
                    type='url'
                    disabled={settings.currentData === null}
                    value={settings.currentData?.url ?? ''}
                    onChange={onDataUrlChanged}
                />
            </div>

            <div className='settings-input-group settings-encryption-key-group'>
                <label
                    className='settings-input-label settings-encryption-key-label'
                    htmlFor='settings-encryption-key-input'
                    children={Translations.get('settings-dialog-encryption-key-label')}
                />

                <input
                    id='settings-encryption-key-input'
                    className='settings-input settings-encryption-key-input'
                    type='text'
                    disabled={settings.currentData === null}
                    value={settings.currentData?.encryptionKey ?? ''}
                    onChange={onEncryptionKeyChanged}
                />

                <Button
                    className='settings-input-button settings-encryption-key-button'
                    color='secondary'
                    variant='outlined'
                    onClick={onEncryptClick}
                    children={<LockFileOutlinedIcon />}
                />
            </div>

            <div className='settings-spotify-group'>
                <img
                    className='settings-spotify-logo'
                    src={SpotifyIcons.FullLogoGreen}
                    alt='Spotify'
                />

                <Button
                    className='settings-spotify-button'
                    color='primary'
                    variant='contained'
                    {...(isSpotifyAuthorized === true
                        ? {
                            onClick: onSpotifyLogoutClick,
                            children: Translations.get('settings-spotify-button-logout'),
                        } 
                        : isSpotifyAuthorized === false
                        ? {
                            onClick: onSpotifyLoginClick,
                            children: Translations.get('settings-spotify-button-authorize'),
                        } 
                        : {
                            disabled: true,
                            children: (<Loader />),
                        } 
                    )}
                />
            </div>
        </div>
    );
};

export const SettingsDialog: FC<SettingsDialogProps> = ({ ref }) => {
    const [settingsStorage, setSettingsStorage] = useState<SettingsStorage>(() => createSettingsStorageInMemory(SettingsStorageInLocalStorage.getSettings()));
    const [isSettingsStorageChanged, setIsSettingsStorageChanged] = useState<boolean>(false);
    const [isOpened, setIsOpened] = useState<boolean>(false);
    
    const [isSpotifyAuthorized, setIsSpotifyAuthorized] = useState<boolean | null>(null);

    const dialogRefCallback = useCallback((dialog: HTMLDialogElement | null) => {
        if (!dialog) {
            return;
        }

        let observer = new MutationObserver(function(mutations)  {
            if (dialog.open) {
                setIsOpened(true);
            } else {
                setIsOpened(false);
            }
        });
        observer.observe(dialog, { attributes: true, attributeFilter: ['open'] })

        return () => {
            observer.disconnect();
        };
    }, []);
    const dialogRef = useMergedRef(ref, dialogRefCallback);

    const onOpenedEffectEvent = useEffectEvent(() => {
        const settings = SettingsStorageInLocalStorage.getSettings();
        const settingsStorage = createSettingsStorageInMemory(settings);
        setSettingsStorage(settingsStorage);
        setIsSettingsStorageChanged(false);
        Spotify.isAuthorized().then(setIsSpotifyAuthorized);
    });

    const onClosedEffectEvent = useEffectEvent(() => {
        if (isSettingsStorageChanged) {
            const settings = settingsStorage.getSettings();
            SettingsStorageInLocalStorage.setSettings(settings);
        }
    });

    useEffect(() => {
        if (isOpened) {
            onOpenedEffectEvent();
        } else {
            onClosedEffectEvent();
        }
    }, [isOpened]);

    useEffect(() => {
        const onSettingsStorageChanged = () => { setIsSettingsStorageChanged(true); };
        settingsStorage.addEventListener('changed', onSettingsStorageChanged);
        return () => {
            settingsStorage.removeEventListener('changed', onSettingsStorageChanged);
        };
    }, [settingsStorage]);

    return (
        <Dialog
            ref={dialogRef}
            className='settings-dialog'
            header={Translations.get('settings-dialog-title')}
            showCloseButton={true}
            autoFocusCloseButton={true}
        >
            <SettingsDialogContent 
                settingsStorage={settingsStorage}
                isSpotifyAuthorized={isSpotifyAuthorized}
            />
        </Dialog>
    );
}