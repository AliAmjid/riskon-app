import { useEffect, useState } from 'react';
import type { RunArtifactSummary } from '@riskon/shared';
import { ArtifactList } from './ArtifactList';
import { ArtifactViewer } from './ArtifactViewer';

interface Props {
  artifacts: RunArtifactSummary[];
}

/**
 * Everything the run published, including anything the tabs above do not know
 * about — a sensitivity table or a second scenario the agent chose to add.
 */
export function FilesPanel({ artifacts }: Props) {
  const [selected, setSelected] = useState<RunArtifactSummary | null>(null);

  useEffect(() => {
    setSelected((current) =>
      current && artifacts.some((artifact) => artifact.id === current.id)
        ? current
        : null,
    );
  }, [artifacts]);

  return (
    <div className="files-layout">
      <div>
        <p className="model-copy">
          Everything this run published. The other tabs already open the ones
          worth reading; this list is for downloading, and for anything extra
          the agent attached.
        </p>
        <ArtifactList
          artifacts={artifacts}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
      </div>
      <ArtifactViewer artifact={selected} />
    </div>
  );
}
