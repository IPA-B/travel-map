import './player-widget.css';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import Translations from '../../translations';
import Player, { PlayerState } from '..';
import { PlayNextFilledIcon, VolumeOffFilledIcon, VolumeOnFilledIcon } from '../../common/icons';
import Utils from '../../common/utils';

export const PlayerWidget: FC = () => {
  const [playerState, setPlayerState] = useState<PlayerState>(() => Player.getState());

  const onPlayerStateChanged = useCallback(() => {
    const state = Player.getState();
    setPlayerState(state);
  }, []);

  useEffect(() => {
    Player.addEventListener('state_changed', onPlayerStateChanged);
    return () => {
      Player.removeEventListener('state_changed', onPlayerStateChanged);
    };
  }, []);

  const onVolumeClick = useCallback(async () => {
    try {
      if (playerState.volume > 0) {
        await Player.setVolume(0);
      } else {
        await Player.setVolume(1);
      }
    } catch (error) {
      console.error('Player action failed:', error);
    }
  }, [playerState]);

  const onNextClick = useCallback(async () => {
    try {
      await Player.next();
    } catch (error) {
      console.error('Next track action failed:', error);
    }
  }, []);

  const playlist = playerState.currentPlaylist;
  const trackState = playlist?.currentTrackState;

  const trackArtistsText = useMemo(
    () => (trackState?.artists ?? []).filter(n => n.length > 0).join(' • '), 
    [trackState?.artists]
  );

  const hidePlayer = !playerState.playlists
    .flatMap(p => p.tracks)
    .some(t => t.canPlay === true);

  return (
    <div className={Utils.joinClassNames('player-widget', hidePlayer ? 'player-widget-hidden' : '')}>
      <div className='player-widget-inner'>
        <div className='player-widget-track'>
          <div 
            className='player-widget-track-name'
            children={!playlist || !trackState 
              ? Translations.get('player-widget-track-name-empty') 
              : (trackState.name || Translations.get('player-widget-track-name-unknown'))
            }

          />
          <div 
            className='player-widget-track-artists'
            children={trackArtistsText}
            {...(!playlist || !trackState || !trackArtistsText ? { style: { display: 'none' } } : {})}
          />
        </div>
        <div className='player-widget-buttons-group'>
          <button 
            type='button' 
            className='player-widget-button' 
            aria-label='Toggle volume'
            onClick={onVolumeClick}
            children={playerState.volume > 0 
              ? <VolumeOnFilledIcon /> 
              : <VolumeOffFilledIcon />
            }
          />
          <button 
            type='button' 
            className='player-widget-button' 
            aria-label='Next track'
            disabled={!playlist || !trackState}
            onClick={onNextClick}
            children={<PlayNextFilledIcon />}
          />
        </div>
      </div>
    </div>
  );
};
