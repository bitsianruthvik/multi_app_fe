import { createContext, useContext, useEffect } from 'react';

/**
 * Lets a detail page tell the shell what to show as its breadcrumb leaf.
 *
 * Without it the breadcrumb falls back to the URL's last segments — so an order
 * detail reads "Orders / 81" instead of "Orders / SO-20260715-0002". The id is
 * meaningless to a reader and identical-looking across entity types.
 *
 * The shell can't derive this itself: it has no idea which resource a given id
 * belongs to, and refetching the record just to title a breadcrumb would double
 * every detail page's requests. The page already has the record, so it hands
 * the label up.
 */
export const DetailTitleContext = createContext<(title: string | null) => void>(() => {});

/**
 * Publish this page's breadcrumb leaf. Pass null/undefined while loading to
 * keep the URL fallback. Clears on unmount, so a stale title can never leak
 * onto the next screen.
 */
export function useDetailTitle(title: string | null | undefined) {
  const publish = useContext(DetailTitleContext);
  useEffect(() => {
    publish(title ?? null);
    return () => publish(null);
  }, [publish, title]);
}
