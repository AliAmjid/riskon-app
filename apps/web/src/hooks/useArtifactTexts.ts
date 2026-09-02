import { useEffect, useState } from 'react';
import type { RunArtifactSummary } from '@riskon/shared';
import { previewArtifact } from '../api';

/**
 * The text of every published file the results page reads.
 *
 * Fetched once for the whole run rather than per tab: the page charts the
 * decision and the limits regardless of which tab is open, and refetching on
 * every tab click would make switching feel slower than it is.
 */
export function useArtifactTexts(
  runId: string | null,
  artifacts: RunArtifactSummary[],
  wanted: string[],
): { texts: Record<string, string>; loading: boolean } {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const targets = artifacts.filter(
    (artifact) => artifact.isPreviewable && wanted.includes(artifact.path),
  );
  // Refetch only when the set of files actually changes, not on every render.
  const signature = targets.map((artifact) => artifact.id).join('|');

  useEffect(() => {
    if (!runId || !signature) {
      setTexts({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.all(
      targets.map(async (artifact) => {
        try {
          const result = await previewArtifact(artifact.runId, artifact.id);
          return [artifact.path, result.text] as const;
        } catch {
          // One unreadable file should not blank the whole page.
          return [artifact.path, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [path, text] of entries) {
        if (typeof text === 'string') next[path] = text;
      }
      setTexts(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, signature]);

  return { texts, loading };
}
