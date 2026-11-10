import { useCallback, useEffect, useState } from 'react';
import {
  ACTIVE_SLIDE_COMPLETE,
  ACTIVE_SLIDE_ERROR,
  ACTIVE_SLIDE_LOADING,
  SlideEncryptedImage,
  useEvents,
  type PluginProps,
  type RenderSlideProps,
} from 'yet-another-react-lightbox';
import EncryptedImage from './encrypted-image';

declare module 'yet-another-react-lightbox' {
  export interface SlideEncryptedImage {
    type: 'encrypted-image';
    src: string;
    alt?: string;
    contentType?: string;
  }

  interface SlideTypes {
    'encrypted-image': SlideEncryptedImage;
  }
}

const isSlideEncryptedImage = (slide: unknown): slide is SlideEncryptedImage =>
  typeof slide === 'object'
  && slide !== null
  && 'type' in slide
  && slide.type === 'encrypted-image';

const RenderEncryptedImageSlide = ({ slide, offset }: RenderSlideProps<SlideEncryptedImage>) => {
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

/** Lightbox plugin for encrypted image slides. */
const EncryptedImagePlugin = ({ augment }: PluginProps) => {
  augment(({ render: { slide: renderSlide, ...renderRest }, ...restProps }) => ({
    render: {
      slide: (props) => isSlideEncryptedImage(props.slide)
        ? <RenderEncryptedImageSlide
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

export default EncryptedImagePlugin;
