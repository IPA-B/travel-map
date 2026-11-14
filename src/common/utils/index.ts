export type Events = Record<string, unknown[]>;
export type EventBus<TEvents extends Events> = {
    addEventListener<TEvent extends keyof TEvents>(
        event: TEvent,
        listener: (...args: TEvents[TEvent]) => void,
    ): void;
    removeEventListener<TEvent extends keyof TEvents>(
        event: TEvent,
        listener: (...args: TEvents[TEvent]) => void,
    ): void;
    notifyEventListeners<TEvent extends keyof TEvents>(
        event: TEvent,
        ...args: TEvents[TEvent]
    ): void;
};
export type Event<TEvents extends Events = Events> = keyof TEvents; 
export type EventListener<TEvents extends Events = Events, TEvent extends Event<TEvents> = Event<TEvents>> = (...args: TEvents[TEvent]) => void;

export function createEventBus<TEvents extends Events>(): EventBus<TEvents> {
    const listenersByEvent = new Map<Event<TEvents>, EventListener<TEvents>[]>();
    const notifyingListenersByEvent = new Map<Event<TEvents>, EventListener<TEvents>[]>();

    function addEventListener<TEvent extends Event<TEvents>>(
        event: TEvent,
        listener: EventListener<TEvents, TEvent>,
    ) {
        let listeners = listenersByEvent.get(event) ?? [];
        if (notifyingListenersByEvent.get(event) === listeners) {
            listeners = [...listeners];
            listenersByEvent.set(event, listeners);
        }

        listeners.push(listener as EventListener<TEvents>);
        listenersByEvent.set(event, listeners);
    }

    function removeEventListener<TEvent extends Event<TEvents>>(
        event: TEvent,
        listener: EventListener<TEvents, TEvent>,
    ) {
        let listeners = listenersByEvent.get(event);
        if (!listeners) {
            return;
        }

        const index = listeners.indexOf(listener as EventListener<TEvents>);
        if (index !== -1) {
            if (notifyingListenersByEvent.get(event) === listeners) {
                listeners = [...listeners];
                listenersByEvent.set(event, listeners);
            }

            listeners.splice(index, 1);
        }
    }

    function notifyEventListeners<TEvent extends Event<TEvents>>(event: TEvent, ...args: TEvents[TEvent]) {
        const listeners = listenersByEvent.get(event);
        if (!listeners) {
            return;
        }

        notifyingListenersByEvent.set(event, listeners);
        try {
            listeners.forEach(listener => listener(...args));
        } finally {
            notifyingListenersByEvent.delete(event);
        }
    }

    return {
        addEventListener,
        removeEventListener,
        notifyEventListeners,
    };
}

const promisesByKey: Record<string, Promise<any> | null> = {};
function createWaitingExecutor<A extends unknown[], R>(key: string, func: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return (waitAndExecute as typeof waitAndExecute<A, R>).bind(null, key, func);
}
function createSkippingExecutor<A extends unknown[], R>(key: string, func: (...args: A) => Promise<R>): (...args: A) => Promise<R | undefined> {
    return (skipOrExecute as typeof skipOrExecute<A, R>).bind(null, key, func);
}
async function waitAndExecute<A extends unknown[], R>(key: string, func: (...args: A) => Promise<R>, ...args: A): Promise<R> {
    while (promisesByKey[key]) {
        try {
            await promisesByKey[key];
        } catch { }
    }

    return promisesByKey[key] = func(...args).finally(() => { promisesByKey[key] = null; });
}
async function skipOrExecute<A extends unknown[], R>(key: string, func: (...args: A) => Promise<R>, ...args: A): Promise<R | undefined> {
    if (promisesByKey[key]) {
        return;
    }

    return promisesByKey[key] = func(...args).finally(() => { promisesByKey[key] = null; });
}

function joinClassNames(...classNames: (string | null | undefined)[]): string {

    let result = '';
    let separator = '';

    for (const className of classNames) {
        if (typeof className === 'string' && className.trim().length > 0) {
            result += separator + className.trim();
            separator = ' ';
        }
    }

    return result;
}


const contentTypesByExtension: Record<string, string> = {
    aac: 'audio/aac',
    aiff: 'audio/aiff',
    ape: 'audio/ape',
    avif: 'image/avif',
    avi: 'video/x-msvideo',
    bmp: 'image/bmp',
    flac: 'audio/flac',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    ico: 'image/x-icon',
    jfif: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    m4a: 'audio/mp4',
    m4v: 'video/mp4',
    mid: 'audio/midi',
    midi: 'audio/midi',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    ogv: 'video/ogg',
    opus: 'audio/opus',
    png: 'image/png',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    wav: 'audio/wav',
    wave: 'audio/wav',
    weba: 'audio/webm',
    webm: 'video/webm',
    webp: 'image/webp',
    wma: 'audio/x-ms-wma',
    wmv: 'video/x-ms-wmv',
    woff: 'font/woff',
    woff2: 'font/woff2',
};

function getContentType(url: string) {
    const pathname = url.split(/[?#]/, 1)[0] ?? '';
    const fileName = pathname.split(/[\\/]/).pop() ?? '';
    const extension = fileName.split('.').pop()?.toLowerCase();
    return extension ? contentTypesByExtension[extension] : undefined;
}

const Utils = {
    createEventBus,
    createWaitingExecutor,
    createSkippingExecutor,
    waitAndExecute,
    skipOrExecute,
    joinClassNames,
    getContentType,
};

export default Utils;