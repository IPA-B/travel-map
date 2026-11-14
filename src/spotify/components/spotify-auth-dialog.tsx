import './spotify-auth-dialog.css';

import Translations from '../../translations';
import { Dialog } from '../../common/dialog';
import Spotify from '..';
import { FC, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import SpotifyIcons from './spotify-icons';
import { Button } from '../../common/button';
import SpotifyAuthStorage from '../spotify-auth-storage';
import { TravelData } from '../../travel-data';

export type SpotifyAuthDialogProps = {
	travelData: TravelData | null | undefined;
};

export const SpotifyAuthDialog: FC<SpotifyAuthDialogProps> = ({ travelData }) => {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
	const hasSpotifyTracks = useMemo(
		() => travelData?.places.some(p => p.tracks.some(Spotify.isSpotifyTrackUri)) ?? false, 
		[travelData?.places]
	);

	const showDialog = useEffectEvent((checkShownAt: boolean) => {
		if (checkShownAt) {
			const shownAt = SpotifyAuthStorage.getAuthDialogShownAt();
			SpotifyAuthStorage.setAuthDialogShownAt(Date.now());
			if (typeof shownAt === 'number' && Date.now() - shownAt < 30 * 60 * 1000) {
				return;
			}
		}

		dialogRef.current?.showModal();
	});

	useEffect(() => {
		Spotify.init().then(r => setIsAuthorized(r.isAuthorized));
	}, []);

	useEffect(() => {
		if (isAuthorized === false && hasSpotifyTracks === true) {
			showDialog(true);
		}
	}, [isAuthorized, hasSpotifyTracks]);

	const onAuthorizeClick = useCallback(() => {
		Spotify.authorize();
	}, []);

	const onCloseClick = useCallback(() => {
		dialogRef.current?.close();
	}, []);

	return (
		<Dialog
			ref={dialogRef}
			className='spotify-auth-dialog'
			header={<img className='spotify-auth-dialog-logo' alt='Spotify' src={SpotifyIcons.FullLogoGreen} />}
			message={Translations.get('spotify-auth-dialog-message')}
			showCloseButton={false}
			buttons={(
				<>
					<Button
						className='spotify-auth-dialog-button-authorize'
						color='primary'
						variant='contained'
						onClick={onAuthorizeClick}
						children={Translations.get('spotify-auth-dialog-button-authorize')}
					/>

					<Button
						color='secondary'
						variant='outlined'
						onClick={onCloseClick}
						children={Translations.get('spotify-auth-dialog-button-close')}
					/>
				</>
			)}
		/>
	);
};