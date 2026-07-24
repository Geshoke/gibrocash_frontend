import { useEffect, useRef } from 'react';
import { useTabs } from '../context/TabsContext';

/**
 * Calls `onRefresh` when the user returns to the tab at `tabPath` — either by
 * switching back to it (it stays mounted via display:none while inactive, so
 * a plain mount effect only fires once) or by refocusing the browser window
 * while it's the active tab. Does not fire on the initial mount.
 */
export const useTabRefresh = (tabPath, onRefresh) => {
  const { activeTabId } = useTabs();
  const isActive = activeTabId === tabPath;
  const wasActiveRef = useRef(isActive);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      onRefreshRef.current();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        onRefreshRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isActive]);
};
