import { type FormEvent, useState } from 'react';
import type { CreateRunRequest } from '@riskon/shared';
import { createRun } from '../api';

interface Props {
  onCreated: (runId: string) => void;
}

export function NewRunForm({ onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [businessQuestion, setBusinessQuestion] = useState('');
  const [dataSource, setDataSource] = useState('data/mpg.csv');
  const [template, setTemplate] = useState('selection_milp');
  const [runtime, setRuntime] = useState<'local' | 'cloud'>('local');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateRunRequest = {
        title,
        businessQuestion,
        dataSource: dataSource || undefined,
        template: template || undefined,
        runtime,
        repositoryUrl: runtime === 'cloud' ? repositoryUrl || undefined : undefined,
      };
      const run = await createRun(payload);
      onCreated(run.id);
      setTitle('');
      setBusinessQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>New optimization run</h2>
      <p className="muted">
        Triggers the riskon-agent workspace via Cursor SDK. The agent follows AGENTS.md and
        writes deliverables under <code>runs/</code>.
      </p>

      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      </label>

      <label>
        Business question
        <textarea
          value={businessQuestion}
          onChange={(e) => setBusinessQuestion(e.target.value)}
          required
          minLength={10}
          rows={4}
          placeholder="Which vehicles should we buy to maximize fleet MPG under a $250k budget?"
        />
      </label>

      <label>
        Data source (path or URL for riskon load)
        <input value={dataSource} onChange={(e) => setDataSource(e.target.value)} />
      </label>

      <label>
        Template hint
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="selection_milp">selection_milp</option>
          <option value="assignment_cpsat">assignment_cpsat</option>
          <option value="scheduling_cpsat">scheduling_cpsat</option>
          <option value="blend_lp">blend_lp</option>
        </select>
      </label>

      <label>
        Runtime
        <select value={runtime} onChange={(e) => setRuntime(e.target.value as 'local' | 'cloud')}>
          <option value="local">Local (riskon-agent on disk)</option>
          <option value="cloud">Cloud (Cursor VM + repo)</option>
        </select>
      </label>

      {runtime === 'cloud' && (
        <label>
          Repository URL
          <input
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder="https://github.com/org/riskon-agent"
            required
          />
        </label>
      )}

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Starting agent…' : 'Start agent run'}
      </button>
    </form>
  );
}
