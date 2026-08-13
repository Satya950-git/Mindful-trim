import { useQuery } from '@tanstack/react-query';
import { getApiUrl } from '@/lib/query-client';

const FALLBACK_SHARE_URL = 'https://play.google.com/store/apps/details?id=com.mindfultrim.ojas';

interface AppConfig {
  appStoreUrl: string | null;
}

export function useShareUrl(): string {
  const { data } = useQuery<AppConfig>({
    queryKey: ['/api/config'],
    // Re-fetch every 15 minutes so URL changes on the server
    // reach the app without requiring a reinstall or restart.
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 30,
    retry: 2,
    queryFn: async () => {
      const url = new URL('/api/config', getApiUrl()).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
      return res.json();
    },
  });
  return data?.appStoreUrl ?? FALLBACK_SHARE_URL;
}
