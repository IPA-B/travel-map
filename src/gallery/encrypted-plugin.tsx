import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVE_SLIDE_COMPLETE,
  ACTIVE_SLIDE_ERROR,
  ACTIVE_SLIDE_LOADING,
  ACTIVE_SLIDE_PLAYING,
  CLASS_FLEX_CENTER,
  CLASS_SLIDE_WRAPPER,
  useEvents,
  useLightboxProps,
  type PluginProps,
  type RenderSlideProps,
} from 'yet-another-react-lightbox';
import { useEncryptedFile } from '../encryption/components/hooks';
import EncryptedImage from './encrypted-image';
import EncryptedVideo from './encrypted-video';

export interface SlideEncrypted {
  type: 'encrypted';
  src: string;
  contentType?: string;
  alt?: string;
  video?: {
    poster?: string;
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
  };
}

declare module 'yet-another-react-lightbox' {
  interface SlideTypes {
    encrypted: SlideEncrypted;
  }
}

export const isSlideEncrypted = (slide: unknown): slide is SlideEncrypted =>
  typeof slide === 'object'
  && slide !== null
  && 'type' in slide
  && slide.type === 'encrypted'
  && 'src' in slide
  && typeof slide.src === 'string';

export const isSlideEncryptedImage = (
  slide: unknown,
): slide is SlideEncrypted & { contentType: string } =>
  isSlideEncrypted(slide)
  && typeof slide.contentType === 'string'
  && slide.contentType.startsWith('image/');

export const isSlideEncryptedVideo = (
  slide: unknown,
): slide is SlideEncrypted & { contentType: string } =>
  isSlideEncrypted(slide)
  && typeof slide.contentType === 'string'
  && slide.contentType.startsWith('video/');

const RenderEncryptedImageSlide = ({ slide, offset }: RenderSlideProps<SlideEncrypted>) => {
  const { publish } = useEvents();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (offset === 0) {
      publish(failed ? ACTIVE_SLIDE_ERROR : loaded ? ACTIVE_SLIDE_COMPLETE : ACTIVE_SLIDE_LOADING);
    }
  }, [offset, loaded, failed, publish]);

  return (
    <EncryptedImage
      src={slide.src}
      alt={slide.alt}
      contentType={slide.contentType}
      className="yarl__slide_image"
      onLoad={() => setLoaded(true)}
      onError={onError}
    />
  );
};

const RenderEncryptedVideoSlide = ({
  slide,
  offset,
}: RenderSlideProps<SlideEncrypted>) => {
  const { video } = useLightboxProps();
  const { publish } = useEvents();
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoPlay = slide.video?.autoPlay ?? video?.autoPlay ?? false;
  const controls = slide.video?.controls ?? video?.controls ?? true;
  const playsInline = slide.video?.playsInline ?? video?.playsInline ?? true;
  const crossOrigin = slide.video?.crossOrigin ?? video?.crossOrigin;

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

  return (
    <div
      className={`yarl__${CLASS_FLEX_CENTER} yarl__${CLASS_SLIDE_WRAPPER}`}
      style={{ width: '100%', height: '100%' }}
    >
      <EncryptedVideo
        ref={videoRef}
        src={slide.src}
        contentType={slide.contentType}
        poster={slide.video?.poster}
        autoPlay={autoPlay}
        controls={controls}
        controlsList={slide.video?.controlsList ?? video?.controlsList}
        crossOrigin={crossOrigin === '' || crossOrigin === 'anonymous' || crossOrigin === 'use-credentials'
          ? crossOrigin
          : undefined}
        preload={slide.video?.preload ?? video?.preload}
        loop={slide.video?.loop ?? video?.loop}
        muted={slide.video?.muted ?? video?.muted}
        playsInline={playsInline}
        disablePictureInPicture={slide.video?.disablePictureInPicture ?? video?.disablePictureInPicture}
        disableRemotePlayback={slide.video?.disableRemotePlayback ?? video?.disableRemotePlayback}
        onPlay={onPlay}
        onEnded={onEnded}
        onError={onError}
      />
    </div>
  );
};

const ResolveEncryptedSlide = ({
  slide,
  offset,
  rect,
}: RenderSlideProps<SlideEncrypted>) => {
  const { publish } = useEvents();
  const { src, blob, error } = useEncryptedFile(slide.src);
  const contentType = blob?.type;

  useEffect(() => {
    if (offset !== 0) {
      return;
    }

    if (error) {
      publish(ACTIVE_SLIDE_ERROR);
    } else if (!blob) {
      publish(ACTIVE_SLIDE_LOADING);
    } else if (!contentType?.startsWith('image/') && !contentType?.startsWith('video/')) {
      const cause = new Error(`Unsupported encrypted slide content type: "${contentType ?? ''}"`);
      console.error(cause);
      publish(ACTIVE_SLIDE_ERROR);
    }
  }, [blob, contentType, error, offset, publish]);

  if (!src || !blob || !contentType) {
    return null;
  }

  const resolvedSlide = { ...slide, src, contentType };
  if (isSlideEncryptedVideo(resolvedSlide)) {
    return <RenderEncryptedVideoSlide slide={resolvedSlide} offset={offset} rect={rect} />;
  }

  if (isSlideEncryptedImage(resolvedSlide)) {
    return <RenderEncryptedImageSlide slide={resolvedSlide} offset={offset} rect={rect} />;
  }

  return null;
};

/** Lightbox plugin for encrypted image and video slides. */
const EncryptedPlugin = ({ augment }: PluginProps) => {
  augment(({ render: { slide: renderSlide, ...renderRest }, ...restProps }) => ({
    render: {
      slide: (props) => {
        if (isSlideEncryptedVideo(props.slide)) {
          return (
            <RenderEncryptedVideoSlide
              key={props.slide.src}
              slide={props.slide}
              offset={props.offset}
              rect={props.rect}
            />
          );
        }

        if (isSlideEncryptedImage(props.slide)) {
          return (
            <RenderEncryptedImageSlide
              key={props.slide.src}
              slide={props.slide}
              offset={props.offset}
              rect={props.rect}
            />
          );
        }

        if (isSlideEncrypted(props.slide) && !props.slide.contentType) {
          return (
            <ResolveEncryptedSlide
              key={props.slide.src}
              slide={props.slide}
              offset={props.offset}
              rect={props.rect}
            />
          );
        }

        return renderSlide?.(props);
      },
      ...renderRest,
    },
    ...restProps,
  }));
};

export default EncryptedPlugin;
