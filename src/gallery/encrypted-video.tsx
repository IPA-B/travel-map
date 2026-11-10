import { useEffect, useRef, type VideoHTMLAttributes } from 'react';
import { useEncryptedFile } from '../encryption/components/hooks';
import Utils from '../common/utils';

export type EncryptedVideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
  ref?: React.Ref<HTMLVideoElement>;
  src: string;
  contentType?: string;
};

const EncryptedVideo = ({ ref, src, contentType, ...videoProps }: EncryptedVideoProps) => {
  const { src: videoSrc, error } = useEncryptedFile(src, contentType);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mergedRef = Utils.useMergedRef(ref, videoRef);

  useEffect(() => {
    if (error && videoRef.current) {
      videoRef.current.dispatchEvent(new ErrorEvent('error', { error }));
    }
  }, [error]);

  return (
    <video
      {...videoProps}
      ref={mergedRef}
      src={error ? undefined : videoSrc ?? undefined}
    />
  );
};

export default EncryptedVideo;
