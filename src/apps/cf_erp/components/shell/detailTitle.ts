import { createContext, useContext, useEffect } from 'react';

/**
 * A detail page publishes its own label (an item code, a definition name) so
 * the shell's breadcrumb reads "Items / PL-E250-10-01" instead of an id.
 */
export const DetailTitleContext = createContext<(title: string | null) => void>(() => {});

export function useDetailTitle(title: string | null | undefined) {
  const publish = useContext(DetailTitleContext);
  useEffect(() => {
    publish(title ?? null);
    return () => publish(null);
  }, [title, publish]);
}
