import { type DependencyList, useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
}

/** Runs `load` when `deps` change and exposes its result. Stale responses are ignored. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then(
      (data) => current && setState({ data, loading: false }),
      (error: Error) => current && setState({ error: error.message, loading: false }),
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
