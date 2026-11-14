import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../../settings/components/hooks';
import Encryption from '..';
import Utils from '../../common/utils';
import Mimetics from 'mimetics';

type EncryptedFile = {
    key: string;
    src?: string | null;
    blob?: Blob;
    error?: Error;
};

export function useEncryptedFile(
    src?: string | null,
    contentType?: string | null,
): { src: string | null | undefined; blob?: Blob; error: Error | undefined } {
    const [settings] = useSettings();
    const encryptionKey = settings.currentData?.encryptionKey ?? '';
    const fileKey = typeof src === 'string' ? `${src}\0${encryptionKey}\0${contentType ?? ''}` : 'null';
    const [encryptedFile, setEncryptedFile] = useState<EncryptedFile | null>(null);

    useEffect(() => {
        if (!Encryption.isEncryptedUri(src)) {
            setEncryptedFile({ key: fileKey, src });
            return;
        }

        let active = true;
        let objectUrl: string | undefined;

        setEncryptedFile(null);

        void (async () => {
            try {
                const fileUrl = Encryption.decryptUri(src);
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch encrypted file. Status: ${response.status}`);
                }

                const encryptedData = new Uint8Array(await response.arrayBuffer());
                const decryptedData = await Encryption.decrypt(encryptedData, encryptionKey);
                const contentTypeResolved = contentType ?? Utils.getContentType(fileUrl) ?? Mimetics.parse(decryptedData)?.mime;
                const blob = new Blob([decryptedData], { type: contentTypeResolved });

                if (active) {
                    objectUrl = URL.createObjectURL(blob);
                    setEncryptedFile({ key: fileKey, src: objectUrl, blob });
                }
            } catch (cause) {
                const causeMessage = cause instanceof Error ? cause.message : String(cause);
                const error = new Error(`Failed to load encrypted file "${src}": ${causeMessage}`, { cause });
                console.error(error);
                if (active) {
                    setEncryptedFile({ key: fileKey, error });
                }
            }
        })();

        return () => {
            active = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [src, encryptionKey, fileKey, contentType]);

    const result = useMemo(
        () => encryptedFile?.key === fileKey
            ? { src: encryptedFile.src, blob: encryptedFile.blob, error: encryptedFile.error }
            : { src: undefined, blob: undefined, error: undefined },
        [encryptedFile, fileKey]
    );

    return result;
}