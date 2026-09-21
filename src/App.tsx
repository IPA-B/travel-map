import { FC, useEffect } from 'react';
import { TravelMap } from './map';
import useTravelData, { TravelPlace } from './travel-data';
import { PlayerWidget } from './player/components/player-widget';
import { SpotifyAuthDialog } from './spotify/components/spotify-auth-dialog';
import { WelcomeDialog } from './welcome-dialog';
import { ShareButton } from './share-button';
import Player from './player';
import Utils from './common/utils';
import { SettingsButton } from './settings/components/settings-button';

// TODO add encrypted: support to gallery
// TODO implement video preview (maybe extend gallery items with objects support e.g. { "url": "....", "preview": "....." })
// TODO add playback logo, colors and service link to track to player as it may be required by some services (e.g. spotify)
// TODO add more playbacks (apple music, youtube music etc)
// TODO add alternative track source support (e.g. if no spotify available) (example { tracks: [['spotify:track:....', 'https://.....'], '', ['', '', ''], ....] })
// TODO implement parameters support in data.json (e.g. access_token)
// TODO remove settings input autofocus

async function updatePlaylists(places: TravelPlace[] | null | undefined) {
	places ??= [];

  const state = Player.getState();
  for (const playlist of state.playlists) {
    await Player.removePlaylist(playlist.id);
  }

	for (const place of places) {
		await Player.addPlaylist(
			place.id, 
			Array.isArray(place.tracks) ? place.tracks : []
		);
	}
}

const App: FC = () => {
  
  const { data } = useTravelData();

  useEffect(() => {
    Utils.waitAndExecute(
      'app-update-playlists', 
      updatePlaylists, 
      data?.places
    );
  }, [data?.places]);

  return (
    <div className="travel-map-shell">
      <TravelMap travelData={data} />
      <SettingsButton />
      <ShareButton />
      <PlayerWidget />
      <SpotifyAuthDialog />
      <WelcomeDialog welcomeData={data?.welcome} />
    </div>
  );
};

export default App;
