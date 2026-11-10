import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '../../settings/components/hooks';
import Encryption from '..';
import Utils from '../../common/utils';

type EncryptedFile = {
    key: string;
    url?: string | null;
    error?: Error;
};

export function useEncryptedFile(
    src?: string | null,
    contentType?: string | null,
): { src: string | null | undefined; error: Error | undefined } {
    const [settings] = useSettings();
    const encryptionKey = settings.currentData?.encryptionKey ?? '';
    const fileKey = typeof src === 'string' ? `${src}\0${encryptionKey}\0${contentType ?? ''}` : 'null';
    const [encryptedFile, setEncryptedFile] = useState<EncryptedFile | null>(null);

    useEffect(() => {
        if (!Encryption.isEncryptedUri(src)) {
            setEncryptedFile({ key: fileKey, url: src });
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
                const blob = new Blob([decryptedData], { type: contentType ?? Utils.getContentType(fileUrl) });

                if (active) {
                    objectUrl = URL.createObjectURL(blob);
                    setEncryptedFile({ key: fileKey, url: objectUrl });
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
            ? { src: encryptedFile.url, error: encryptedFile.error }
            : { src: undefined, error: undefined },
        [encryptedFile, fileKey]
    );

    return result;
}