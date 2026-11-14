import SpotifyAuth from './spotify-auth';

export type SpotifyInitResult = {
  isAuthorized: boolean;
}

export type SpotifyTrackUri = `spotify:track:${string}`;

let player: SpotifySdk.Player | null = null;
let deviceId: string | null = null;

let ensureSdkPromise;
function ensureSdkLoaded() {
  return ensureSdkPromise ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    document.body.appendChild(script);
  });
}

let ensureSpotifyPlayerReadyPromise: Promise<void> | null = null;
async function ensureSpotifyPlayerReady() {
  if (player) {
    return;
  }

  if (ensureSpotifyPlayerReadyPromise) {
    return ensureSpotifyPlayerReadyPromise;
  }

  return ensureSpotifyPlayerReadyPromise ??= (async () => {
    if (!window.Spotify?.Player) {
      await ensureSdkLoaded();
    }

    if (!window.Spotify?.Player) {
      throw new Error('Spotify Web Playback SDK is not available.');
    }

    const accessToken = await SpotifyAuth.getAccessToken();
    if (!accessToken) {
      throw new Error('Spotify access token is missing. Unable to initialize Spotify player');
    }

    const spotifyPlayer = new window.Spotify.Player({
      name: 'TravelMap Spotify Player',
      getOAuthToken: (cb) => SpotifyAuth.getAccessToken().then(at => cb(at ?? '')),
      volume: 1,
    });

    spotifyPlayer.addListener('initialization_error', ({ message }) => console.warn(message));
    spotifyPlayer.addListener('account_error', ({ message }) => console.warn(message));
    spotifyPlayer.addListener('playback_error', ({ message }) => console.warn(message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.warn(message));

    try {

      await new Promise((resolve, reject) => {
        spotifyPlayer.addListener('ready', ({ device_id }) => {
          deviceId = device_id;
          resolve(spotifyPlayer);
        });

        spotifyPlayer.addListener('initialization_error', ({ message }) => reject(new Error(message)));
        spotifyPlayer.addListener('account_error', ({ message }) => reject(new Error(message)));
        spotifyPlayer.addListener('playback_error', ({ message }) => reject(new Error(message)));
        spotifyPlayer.addListener('authentication_error', ({ message }) => reject(new Error(message)));

        spotifyPlayer.connect().catch(reject);
      });

    } catch (error) {
      try { spotifyPlayer.disconnect(); } catch {}
      throw error;
    }

    player = spotifyPlayer;
  })().catch((error) => { 
    try { player?.disconnect(); } catch {}
    player = null;
    deviceId = null;
    ensureSpotifyPlayerReadyPromise = null; 
    throw error;
  });
}

async function setVolume(volume: number) {
  await ensureSpotifyPlayerReady();
  await player!.setVolume(volume);
}

async function getVolume() {
  await ensureSpotifyPlayerReady();
  return await player!.getVolume();
}

async function pause() {
  await ensureSpotifyPlayerReady();
  await player!.pause();
}

async function resume() {
  await ensureSpotifyPlayerReady();
  await player!.resume();
}

async function next() {
  await ensureSpotifyPlayerReady();
  await player!.nextTrack();
}

async function seek(positionMs: number) {
  await ensureSpotifyPlayerReady();
  await player!.seek(positionMs);
}

async function getCurrentState() {
  await ensureSpotifyPlayerReady();
  return await player!.getCurrentState();
}

async function subscribeToPlayerState(callback: SpotifySdk.PlaybackStateListener) {
  if (!callback || typeof callback !== 'function') {
    return;
  }

  await ensureSpotifyPlayerReady();
  player!.addListener('player_state_changed', callback);
}

const trackByTrackUriCache: Record<string, unknown> = {}
async function getTrack(trackUri: string): Promise<unknown> {
  if (trackByTrackUriCache[trackUri]) {
    return trackByTrackUriCache[trackUri];
  }

  const accessToken = await SpotifyAuth.getAccessToken();
  if (!accessToken) {
    throw 'Spotify access token is missing, cannot fetch track.';
  }

  const trackIdMatch = String(trackUri || '').match(
    /(?:spotify:track:|https?:\/\/open\.spotify\.com\/track\/)?([A-Za-z0-9]+)(?:\?.*)?/
  );
  const trackId = trackIdMatch ? trackIdMatch[1] : null;

  if (!trackId) {
    throw `Invalid Spotify track URI: ${trackUri}`;
  }

  const response = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw `Spotify track request failed (${response.status}): ${errorText}`;
  }

  const result = await response.json();

  trackByTrackUriCache[trackUri] = result;

  return result;
}

async function play(trackUri: string, position: number = 0) {
  const accessToken = await SpotifyAuth.getAccessToken();
  if (!accessToken) {
    throw 'Spotify access token is missing, cannot play track.';
  }

  await ensureSpotifyPlayerReady();

  if (!deviceId) {
    throw 'Spotify device ID not available.';
  }

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [trackUri], position_ms: position }),
  });

  console.info(`Playing Spotify track: ${trackUri}`);
}

let isAuthorizedPromise: Promise<boolean> | null = null;
function isAuthorized(): Promise<boolean> {
  return isAuthorizedPromise ??= (async () => {
    const accessToken = await SpotifyAuth.getAccessToken();
    return typeof accessToken === 'string' && accessToken !== '';
  })().finally(() => { isAuthorizedPromise = null; });
}

function isSpotifyTrackUri(value: unknown): value is SpotifyTrackUri {
  return typeof value === 'string' && value.startsWith('spotify:track:');
}

async function init() {
  const isAuthorized = await SpotifyAuth.init();

  const result: SpotifyInitResult = {
    isAuthorized,
  };

  return result;
}

const Spotify = {
  init,
  isSpotifyTrackUri,
  isAuthorized,
  authorize: SpotifyAuth.authorize,
  logout: SpotifyAuth.logout,
  play,
  pause,
  resume,
  next,
  seek,
  setVolume,
  getVolume,
  getTrack,
  getCurrentState,
  subscribeToPlayerState,
};

export default Spotify;
