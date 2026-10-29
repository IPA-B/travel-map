import Utils, { Event, EventListener } from '../common/utils';
import Playbacks, { Playback, PlaybackState, Track } from './playbacks';

export type PlayerEvents = {
	'state_changed': [],	
};
export type PlayerEvent = Event<PlayerEvents>;
export type PlayerEventListener<TEvent extends PlayerEvent = PlayerEvent> = EventListener<PlayerEvents, TEvent>;

export type TrackState = {
	index: number;
	position: number;
	duration: number;
	name: string | undefined;
	artists: string[] | undefined;
	updatedAt: number;
}

export type TrackData = {
	track: Track;
	canPlay: boolean;
}

export type Playlist = {
	id: string;
	tracks: TrackData[];
	currentTrackState: TrackState | null;
}

export type PlayerState = {
	volume: number;
	playlists: Playlist[];
	currentPlaylist: Playlist | null;
}

type InternalTrackData = {
	track: Track;
	playback: Playback | null;
}

type InternalPlaylist = {
	id: string;
	tracks: InternalTrackData[];
	currentTrackState: TrackState | null;
}

type InternalState = {
	volume: number;
	playlists: InternalPlaylist[];
	currentPlaylist: InternalPlaylist | null;
}

const _state: InternalState = {
	volume: 0,
	playlists: [],
	currentPlaylist: null,
};

function getState(): PlayerState {
	const playlistsMapped = _state.playlists.map(p => ({
		id: p.id,
		tracks: p.tracks.map(t => ({
			track: t,
			canPlay: t.playback !== null,
		})),
		currentTrackState: p.currentTrackState && { ...p.currentTrackState },
	}));

	const currentPlaylistIndex = _state.currentPlaylist 
		? _state.playlists.indexOf(_state.currentPlaylist) 
		: -1;
	
	const currentPlaylistMapped = currentPlaylistIndex >= 0
		? playlistsMapped[currentPlaylistIndex]
		: null;

	return {
		volume: _state.volume,
		playlists: playlistsMapped,
		currentPlaylist: currentPlaylistMapped,
	};
}


function getRandomInt(min: number, max: number) {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

function getPossibleTrackIndexes(playlist: InternalPlaylist) {
	
	const possibleTrackIndexes = playlist.tracks.map((_, i) => i).filter(
		(index) => playlist.tracks[index].playback 
	);

	return possibleTrackIndexes;
}

async function onPlaybackStateChanged(playback: Playback) {

	const playlist = _state.currentPlaylist;
	const trackState = playlist?.currentTrackState;

	if (!playlist || !trackState) {
		return;
	}

	const trackIndex = trackState.index;
	const track = playlist.tracks[trackIndex].track;
	const trackPlayback = playlist.tracks[trackIndex].playback;

	if (trackPlayback !== playback) {
		return;
	}

	let playbackState: PlaybackState;
	try {
		playbackState = playback.getState();
	} catch (error) {
		console.error(error);
		return;
	}

	if (playbackState.currentTrackState && track === playbackState.currentTrackState.track) {
		
		const positionNew = playbackState.currentTrackState.position;
		const updatedAtNew = playbackState.currentTrackState.updatedAt;

		if (typeof positionNew === 'number') {
			if (positionNew >= trackState.duration) {
				await next();
			} else if (updatedAtNew && trackState.updatedAt < updatedAtNew) {
				trackState.position = positionNew;
				trackState.updatedAt = updatedAtNew;
				notifyEventListenersDeferred('state_changed');
			}
		}
	}
}

const playbackStateChangedListeners: [Playback, Function][] = [];
function subscribeToPlaybackStateChanged(playback: Playback) {
	const hasListener = playbackStateChangedListeners.some(ph => ph[0] === playback);
	if (hasListener) {
		return false;
	}

	const listener = Utils.createWaitingExecutor('player-playback-state-changed', onPlaybackStateChanged.bind(null, playback));

	try {
		playback.addEventListener('state_changed', listener);
	} catch (error) {
		console.error(error);
		return false;
	}

	playbackStateChangedListeners.push([playback, listener]);

	return true;
}

/**
 * Add a new playlist with tracks
 */
async function addPlaylist(id: string, tracks: Track[]) {
	if (!id || !Array.isArray(tracks)) {
		console.warn('Invalid playlist data: id and tracks array required');
		return;
	}

	// Check if playlist already exists
	const existingPlaylist = _state.playlists.find(s => s.id === id);
	if (existingPlaylist) {
		console.warn(`Playlist with id "${id}" already exists`);
		return;
	}

	const trackDataArray: InternalTrackData[] = []; 
	
	for (const track of tracks) {
		let trackPlayback: Playback | null = null;

		for (const playback of Playbacks) {
			let canPlay = false;
			try {
				canPlay = await playback.canPlay(track)
			} catch (error) {
				console.error(error);
			}
			
			if (canPlay) {
				subscribeToPlaybackStateChanged(playback);
				trackPlayback = playback;
				break;
			}
		}

		trackDataArray.splice(
			getRandomInt(0, trackDataArray.length), 
			0, 
			{ track, playback: trackPlayback }
		);
	}

	const playlist: InternalPlaylist = {
		id,
		tracks: trackDataArray,
		currentTrackState: null,
	};

	_state.playlists.push(playlist);

	notifyEventListenersDeferred('state_changed');
}

/**
 * Remove a playlist
 */
async function removePlaylist(id: string) {
	if (_state.currentPlaylist?.id === id) {
		await stop();
	}

	const index = _state.playlists.findIndex(s => s.id === id);
	if (index === -1) {
		console.warn(`Playlist with id "${id}" not found`);
		return;
	}

	_state.playlists.splice(index, 1);

	notifyEventListenersDeferred('state_changed');
}

/**
 * Switch to a different playlist and start playing
 */
async function changePlaylist(id: string) {

	const tryPlayCurrentTrack = async (playlist: InternalPlaylist) => {

		const trackState = playlist.currentTrackState;

		if (!trackState) {
			return false;
		}
		
		const trackIndex = trackState.index;
		const track = playlist.tracks[trackIndex].track;
		const trackPlayback = playlist.tracks[trackIndex].playback;

		if (!trackPlayback) {
			return false;
		}

		const trackDuration = trackState.duration;
		const trackPositionNew = trackState.position + Date.now() - trackState.updatedAt;

		if (trackPositionNew >= trackDuration) {
			return false;
		}

		trackState.position = trackPositionNew;
		trackState.updatedAt = Date.now();

		_state.currentPlaylist = playlist;

		try {
			await trackPlayback.setVolume(_state.volume);
			await trackPlayback.play(track, trackPositionNew);
		} catch (error) {
			console.error(error);
		}

		return true;
	};

	const tryPlayNextTrack = async (playlist: InternalPlaylist) => {

		const trackState = playlist.currentTrackState;

		const possibleTrackIndexes = getPossibleTrackIndexes(playlist);

		if (possibleTrackIndexes.length === 0) {
			return false;
		}
		
		const trackIndexOld = trackState?.index ?? -1;
		const trackIndex = possibleTrackIndexes[
			(Math.max(possibleTrackIndexes.indexOf(trackIndexOld), -1) + 1) % possibleTrackIndexes.length
		];

		const track = playlist.tracks[trackIndex].track;
		const trackPlayback = playlist.tracks[trackIndex].playback!;

		let trackDetails;
		try {
			trackDetails = await trackPlayback.getTrackDetails(track);
		} catch (error) {
			console.error(error);
			return false;
		}
		const trackDuration = trackDetails.duration;

		const trackPositionOld = trackState?.position;
		const trackUpdatedAtOld = trackState?.updatedAt;
		const trackDurationOld = trackState?.duration;
		
		const trackPosition = [trackPositionOld, trackUpdatedAtOld, trackDurationOld].every(v => typeof v === 'number')
			? ((Math.min(trackPositionOld!, trackDurationOld!) + Date.now() - trackUpdatedAtOld!) % trackDurationOld! % trackDuration)
			: getRandomInt(0, trackDuration);

		playlist.currentTrackState = {
			index: trackIndex,
			position: trackPosition,
			duration: trackDuration,
			name: trackDetails.name,
			artists: trackDetails.artists,
			updatedAt: Date.now(),
		};

		_state.currentPlaylist = playlist;

		try {
			await trackPlayback.setVolume(_state.volume);
			await trackPlayback.play(track, trackPosition);
		} catch (error) {
			console.error(error);
		}

		return true;
	};

	await stop();

	if (id) {

		const playlist = _state.playlists.find(s => s.id === id);
		if (!playlist) {
			console.warn(`Playlist with id "${id}" not found`);
			return;
		}

		const playCurrentTrackResult = await tryPlayCurrentTrack(playlist);

		// Start playing the playlist
		if (playCurrentTrackResult !== true) {
			await tryPlayNextTrack(playlist);
		}

	}

	notifyEventListenersDeferred('state_changed');
}

/**
 * Set volume for the player
 */
async function setVolume(volume: number) {
	_state.volume = volume;

	const currentPlaylist = _state.currentPlaylist;
	const currentTrackState = currentPlaylist?.currentTrackState;
	
	if (currentPlaylist && currentTrackState) {
		const trackIndex = currentTrackState.index;
		const playback = currentPlaylist.tracks[trackIndex].playback!;

		try {
			await playback.setVolume(volume);
		} catch (error) {
			console.error(error);
		}
	}

	notifyEventListenersDeferred('state_changed');
}

/**
 * Play the next track in the current playlist
 */
async function next() {
	const playlist = _state.currentPlaylist;
	if (!playlist) {
		console.warn('No playlist currently playing');
		return false;
	}

	const possibleTrackIndexes = getPossibleTrackIndexes(playlist);

	const trackState = playlist.currentTrackState;
	const trackIndexOld = trackState?.index ?? -1;
	const trackIndex = possibleTrackIndexes[
		(Math.max(possibleTrackIndexes.indexOf(trackIndexOld), -1) + 1) % possibleTrackIndexes.length
	];

	const track = playlist.tracks[trackIndex].track;
	const trackPlayback = playlist.tracks[trackIndex].playback!;

	let trackDetails;
	try {
		trackDetails = await trackPlayback.getTrackDetails(track);
	} catch (error) {
		console.error(error);
		return false;
	}

	playlist.currentTrackState = {
		index: trackIndex,
		position: 0,
		duration: trackDetails.duration,
		name: trackDetails.name,
		artists: trackDetails.artists,
		updatedAt: Date.now(),
	};

	try {
		await trackPlayback.setVolume(_state.volume);
		await trackPlayback.play(track, 0);
	} catch (error) {
		console.error(error);
	}

	notifyEventListenersDeferred('state_changed');

	return true;
}

/**
 * Stops the player and saves current track state
 */
async function stop() {
	const trackPlaylist = _state.currentPlaylist;
	const currentTrackState = trackPlaylist?.currentTrackState;
	if (!trackPlaylist || !currentTrackState) {
		return;
	}

	const trackIndex = currentTrackState.index;
	const trackPlayback = trackPlaylist.tracks[trackIndex].playback!;

	_state.currentPlaylist = null;

	try {
		await trackPlayback.stop();
	} catch (error) {
		console.error(error);
	}

	notifyEventListenersDeferred('state_changed');
}

const playerEventBus = Utils.createEventBus<PlayerEvents>();
const notifyEventListeners = playerEventBus.notifyEventListeners;
const addEventListener = playerEventBus.addEventListener;
const removeEventListener = playerEventBus.removeEventListener;

let stateChangedTimeoutId: number | undefined;
function notifyEventListenersDeferred<TEvent extends PlayerEvent>(event: TEvent, ...args: PlayerEvents[TEvent]) {
	const timeoutId = setTimeout(notifyEventListeners, 0, event, ...args);

	if (event === 'state_changed') {
		clearTimeout(stateChangedTimeoutId);
		stateChangedTimeoutId = timeoutId;
	}
}

const Player = {
	getState,
	
	addPlaylist: Utils.createWaitingExecutor('player', addPlaylist),
	removePlaylist: Utils.createWaitingExecutor('player', removePlaylist),
	changePlaylist: Utils.createWaitingExecutor('player', changePlaylist),

	setVolume: Utils.createWaitingExecutor('player', setVolume),

	next: Utils.createWaitingExecutor('player', next),
	stop: Utils.createWaitingExecutor('player', stop),

	addEventListener,
	removeEventListener,
};

export default Player;