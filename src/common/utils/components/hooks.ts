import { useEffect, useState, Ref, RefObject, useCallback, useRef, useLayoutEffect } from 'react';

export type FetchState<T> = {
    data: T | null;
    isLoading: boolean;
    error: string | null;
};

export function useFetch<T>(url: string, parse: (response: Response) => Promise<T>): FetchState<T> {
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

export function useIsVisible<T extends Element>(
    ref: RefObject<T | null>,
    shouldObserve = true,
): boolean {
    const [isVisible, setIsVisible] = useState(!shouldObserve);

    useEffect(() => {
        if (!shouldObserve) {
            setIsVisible(true);
            return;
        }

        const element = ref.current;
        if (!element) {
            return;
        }

        if (typeof IntersectionObserver === 'undefined') {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) {
                setIsVisible(true);
                observer.disconnect();
            }
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, [ref, shouldObserve]);

    return isVisible;
}


export function setRef<T>(ref: Ref<T> | undefined, current: T | null): (() => void) {
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

export function useMergedRef<T>(
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

export function useRefModifier<T>(
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