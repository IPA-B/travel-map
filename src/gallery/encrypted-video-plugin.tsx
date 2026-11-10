import { useCallback, useEffect, useRef } from 'react';
import {
  ACTIVE_SLIDE_COMPLETE,
  ACTIVE_SLIDE_ERROR,
  ACTIVE_SLIDE_LOADING,
  ACTIVE_SLIDE_PLAYING,
  CLASS_FLEX_CENTER,
  CLASS_SLIDE_WRAPPER,
  SlideEncryptedVideo,
  useContainerRect,
  useEvents,
  useLightboxProps,
  type PluginProps,
  type RenderSlideProps,
} from 'yet-another-react-lightbox';
import EncryptedVideo from './encrypted-video';

declare module 'yet-another-react-lightbox' {
  export interface SlideEncryptedVideo {
    type: 'encrypted-video';
    src: string;
    contentType?: string;
    poster?: string;
    width?: number;
    height?: number;
    autoPlay?: boolean;
    controls?: boolean;
    controlsList?: string;
    crossOrigin?: string;
    preload?: string;
    loop?: boolean;
    muted?: boolean;
    playsInline?: boolean;
    disablePictureInPicture?: boolean;
    disableRemotePlayback?: boolean;
  }

  interface SlideTypes {
    'encrypted-video': SlideEncryptedVideo;
  }
}

const isSlideEncryptedVideo = (slide: unknown): slide is SlideEncryptedVideo =>
  typeof slide === 'object'
  && slide !== null
  && 'type' in slide
  && slide.type === 'encrypted-video';

const RenderEncryptedVideoSlide = ({
  slide,
  offset,
}: RenderSlideProps<SlideEncryptedVideo>) => {
  const { video } = useLightboxProps();
  const { publish } = useEvents();
  const { setContainerRef, containerRect } = useContainerRect();
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoPlay = slide.autoPlay ?? video?.autoPlay ?? false;
  const controls = slide.controls ?? video?.controls ?? true;
  const playsInline = slide.playsInline ?? video?.playsInline ?? true;
  const crossOrigin = slide.crossOrigin ?? video?.crossOrigin;

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    if (offset !== 0) {
      element.pause();
      return;
    }

    if (autoPlay) {
      publish(ACTIVE_SLIDE_LOADING);
      void element.play().catch(() => undefined);
    }
  }, [offset, autoPlay, publish]);

  const onError = useCallback(() => {
    if (offset === 0) {
      publish(ACTIVE_SLIDE_ERROR);
    }
  }, [offset, publish]);

  const onPlay = useCallback(() => {
    if (offset === 0) {
      publish(ACTIVE_SLIDE_PLAYING);
    } else {
      videoRef.current?.pause();
    }
  }, [offset, publish]);

  const onEnded = useCallback(() => {
    if (offset === 0) {
      publish(ACTIVE_SLIDE_COMPLETE);
    }
  }, [offset, publish]);

  const { width, height } = slide;
  const videoStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '100%',
  };
  if (width && height && containerRect) {
    const widthBound = width / height > containerRect.width / containerRect.height;
    const elementWidth = widthBound
      ? containerRect.width
      : Math.round((containerRect.height / height) * width);
    const elementHeight = widthBound
      ? Math.round((containerRect.width / width) * height)
      : containerRect.height;
    videoStyle.width = elementWidth;
    videoStyle.height = elementHeight;
  }

  return (
    <div
      ref={setContainerRef}
      className={`yarl__${CLASS_FLEX_CENTER} yarl__${CLASS_SLIDE_WRAPPER}`}
      style={{ width: '100%', height: '100%', ...(width ? { maxWidth: `${width}px` } : {}) }}
    >
      {containerRect && (
        <EncryptedVideo
          ref={videoRef}
          src={slide.src}
          contentType={slide.contentType}
          poster={slide.poster}
          width={width}
          height={height}
          autoPlay={autoPlay}
          controls={controls}
          controlsList={slide.controlsList ?? video?.controlsList}
          crossOrigin={crossOrigin === '' || crossOrigin === 'anonymous' || crossOrigin === 'use-credentials'
            ? crossOrigin
            : undefined}
          preload={slide.preload ?? video?.preload}
          loop={slide.loop ?? video?.loop}
          muted={slide.muted ?? video?.muted}
          playsInline={playsInline}
          disablePictureInPicture={slide.disablePictureInPicture ?? video?.disablePictureInPicture}
          disableRemotePlayback={slide.disableRemotePlayback ?? video?.disableRemotePlayback}
          style={videoStyle}
          onPlay={onPlay}
          onEnded={onEnded}
          onError={onError}
        />
      )}
    </div>
  );
};

/** Lightbox plugin for encrypted video slides. */
const EncryptedVideoPlugin = ({ augment }: PluginProps) => {
  augment(({ render: { slide: renderSlide, ...renderRest }, ...restProps }) => ({
    render: {
      slide: (props) => isSlideEncryptedVideo(props.slide)
        ? <RenderEncryptedVideoSlide
            key={props.slide.src}
            slide={props.slide}
            offset={props.offset}
            rect={props.rect}
          />
        : renderSlide?.(props),
      ...renderRest,
    },
    ...restProps,
  }));
};

export default EncryptedVideoPlugin;
