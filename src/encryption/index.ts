const ENCRYPTED_URI_PREFIX = 'encrypted:';

export type EncryptedUri = `${typeof ENCRYPTED_URI_PREFIX}${string}`;

function isEncryptedUri(value: unknown): value is EncryptedUri {
    return typeof value === 'string' && value.toLowerCase().startsWith(ENCRYPTED_URI_PREFIX);
}

function encryptUri(uri: string): EncryptedUri {
    return `${ENCRYPTED_URI_PREFIX}${encodeURIComponent(uri)}`;
}

function decryptUri(encryptedUri: EncryptedUri | (string & {})): string {
    if (!isEncryptedUri(encryptedUri)) {
        throw new Error(`URL must start with ${ENCRYPTED_URI_PREFIX}`);
    }

    return decodeURIComponent(encryptedUri.substring(ENCRYPTED_URI_PREFIX.length));
}

const IV_LENGTH = 12;

async function encrypt(data: Uint8Array<ArrayBuffer>, encryptionKey: string) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const keyData = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionKey));
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
    );
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data,
    );
    const encryptedData = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    encryptedData.set(iv);
    encryptedData.set(new Uint8Array(ciphertext), IV_LENGTH);

    return encryptedData;
}

async function decrypt(encryptedData: Uint8Array<ArrayBuffer>, encryptionKey: string) {
    const iv = encryptedData.slice(0, IV_LENGTH);
    const ciphertext = encryptedData.slice(IV_LENGTH);
    const keyData = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryptionKey));
    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
    );
    const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
    );

    return decryptedData;
}

const Encryption = {
    isEncryptedUri,
    encryptUri,
    decryptUri,
    encrypt,
    decrypt,
};

export default Encryption;