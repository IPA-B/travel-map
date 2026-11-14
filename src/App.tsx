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

// TODO create powershell script that accepts data.json with encryption key and generates new data.json with all files encrypted in the selected directory (or in encrypted-YYYYMMDD-HHMMSS)
// TODO create powershell script that accepts data.json with encryption key and generates new data.json with all files decrypted in the selected directory (or in decrypted-YYYYMMDD-HHMMSS)
// TODO detect encrypted video/image mime type by file metadata
// TODO BUG cannot open popup after closing it with clicking to marker
// TODO TravelMap refactor (create LeafletMap react component with LeafletMarker component). Remove L.Map dependency from TravelMap
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
      <SpotifyAuthDialog travelData={data} />
      <WelcomeDialog welcomeData={data?.welcome} />
    </div>
  );
};

export default App;
