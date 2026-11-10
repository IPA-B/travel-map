import { useEffect, useState, Ref, useCallback, useRef, useLayoutEffect } from 'react';

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

export type FetchState<T> = {
    data: T | null;
    isLoading: boolean;
    error: string | null;
};

function useFetch<T>(url: string, parse: (response: Response) => Promise<T>): FetchState<T> {
    const [state, setState] = useState<FetchState<T>>({
        data: null,
        isLoading: true,
        error: null,
    });

    useEffect(() => {
        (async () => {
            if (typeof url !== 'string' || url.length === 0) {
                setState({ data: null, isLoading: false, error: 'Empty url provided' });
                return;
            }

            setState({ data: null, isLoading: true, error: null });

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Unable to fetch (${response.status})`);
                }

                const data = await parse(response);

                setState({ data, isLoading: false, error: null });
            } catch (error) {
                setState({
                    data: null,
                    isLoading: false,
                    error: 'Failed to fetch data'

                });
            }
        })();

    }, [url]);

    return state;
}


function setRef<T>(ref: Ref<T> | undefined, current: T | null): (() => void) {
    if (typeof ref === 'function') {
        return ref(current) ?? (() => { ref(null); });
    } else if (typeof ref === 'object' && ref !== null) {
        ref.current = current;
        return () => { ref.current = null; };
    }

    return () => { };
}

type AttachedRef<T> = {
    ref: React.Ref<T>;
    cleanup: () => void;
};

function useMergedRef<T>(
    ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
    const stateRef = useRef<{
        value: T | null;
        refs: AttachedRef<T>[];
    }>({
        value: null,
        refs: [],
    });

    // This is updated only after a render has committed.
    const refsRef = useRef<React.Ref<T>[]>(null);
    if (refsRef.current === null) {
        refsRef.current = uniqueRefs(refs);
    }

    useLayoutEffect(() => {
        const state = stateRef.current;
        const nextRefs = uniqueRefs(refs);

        refsRef.current = nextRefs;

        // Nothing is attached yet.
        if (state.value === null) {
            return;
        }

        const previousRefs = state.refs;
        const nextSet = new Set(nextRefs);

        // 1. Detach refs that disappeared.
        // Iterating previousRefs preserves the previous ref order.
        for (const attached of previousRefs) {
            if (!nextSet.has(attached.ref)) {
                attached.cleanup();
            }
        }

        // 2. Keep existing refs and attach new refs.
        // Iterating nextRefs preserves the new ref order.
        const previousMap = new Map(
            previousRefs.map((attached) => [attached.ref, attached]),
        );

        const nextAttached: AttachedRef<T>[] = [];

        for (const ref of nextRefs) {
            const existing = previousMap.get(ref);

            if (existing) {
                // Same ref: leave it attached.
                nextAttached.push(existing);
            } else {
                // New ref: attach it.
                nextAttached.push({
                    ref,
                    cleanup: setRef(ref, state.value),
                });
            }
        }

        state.refs = nextAttached;
    });

    const mergedRef = useCallback<React.RefCallback<T>>((value) => {
        const state = stateRef.current;

        state.value = value;

        if (value === null) {
            for (const attached of state.refs) {
                attached.cleanup();
            }

            state.refs = [];
            return () => {};
        }

        // Initial attachment.
        state.refs = refsRef.current!.map((ref) => ({
            ref,
            cleanup: setRef(ref, value),
        }));

        return () => {
            const refs = state.refs;
            state.refs = [];
            state.value = null;

            for (const attached of refs) {
                attached.cleanup();
            }
        };
    }, []);

    return mergedRef;

    function uniqueRefs<T>(
        refs: (React.Ref<T> | undefined)[],
    ): React.Ref<T>[] {
        const result: React.Ref<T>[] = [];
        refs.forEach(ref => {
            if (ref !== null && ref !== undefined && !result.includes(ref)) {
                result.push(ref);
            }
        });
        return result;
    }
}

function useRefModifier<T>(
    ref: React.Ref<T> | undefined,
): [setRef: (value: T) => void, cleanupRef: () => void] {
    const refRef = useRef<React.Ref<T> | undefined>(ref);
    const valueRef = useRef<T | null>(null);
    const cleanupRefRef = useRef<(() => void) | null>(null);

    const setRefValue = useRef((value: T) => {
        cleanupRefRef.current?.();
        valueRef.current = value;
        cleanupRefRef.current = setRef(refRef.current, value);
    }).current;

    const cleanupRef = useRef(() => {
        cleanupRefRef.current?.();
        cleanupRefRef.current = null;
        valueRef.current = null;
    }).current;

    useLayoutEffect(() => {
        if (refRef.current === ref) {
            return;
        }

        const value = valueRef.current;

        refRef.current = ref;

        // Attach existing value to new ref.
        if (value !== null) {
            setRefValue(value);
        }

        return () => {
            // Detach from old ref.
            cleanupRefRef.current?.();
            cleanupRefRef.current = null;
        };
    }, [ref]);

    return [
        setRefValue,
        cleanupRef,
    ];
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
    useFetch,
    useMergedRef,
    useRefModifier,
    createWaitingExecutor,
    createSkippingExecutor,
    waitAndExecute,
    skipOrExecute,
    joinClassNames,
    getContentType,
};

export default Utils;