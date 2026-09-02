import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AnswerQuestionsRequest, RunQuestionRequest } from '@riskon/shared';

interface Props {
  round: RunQuestionRequest;
  onSubmit: (body: AnswerQuestionsRequest) => Promise<void>;
}

/**
 * The agent is blocked on these answers, so the card leads with the
 * recommendation already filled in: accepting the whole round is one click,
 * and changing a number is one edit. A blank form would be the slowest thing
 * we could put in front of someone.
 */
export function QuestionCard({ round, onSubmit }: Props) {
  const initial = useMemo(
    () =>
      Object.fromEntries(
        round.questions.map((question) => [
          question.id,
          question.recommended ?? question.options?.[0]?.value ?? '',
        ]),
      ),
    [round],
  );

  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState<'answer' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setAnswers(initial), [initial]);

  const unanswered = round.questions.filter(
    (question) => !answers[question.id]?.trim(),
  );

  async function send(body: AnswerQuestionsRequest, mode: 'answer' | 'decline') {
    setBusy(mode);
    setError(null);
    try {
      await onSubmit(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send that.');
    } finally {
      setBusy(null);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (unanswered.length > 0 || busy) return;
    void send({ answers }, 'answer');
  }

  return (
    <form className="question-card" onSubmit={handleSubmit}>
      <div className="question-card-body">
        <div className="question-card-head">
          <span className="question-badge">Waiting on you</span>
          <p className="question-intro">
            {round.intro ??
              'The agent needs a few things from you before it can model this.'}
          </p>
        </div>

        <ol className="question-list">
          {round.questions.map((question) => (
            <li key={question.id} className="question-item">
              <label className="question-label" htmlFor={`q-${round.id}-${question.id}`}>
                {question.question}
              </label>

              {question.whyItMatters && (
                <p className="question-why">{question.whyItMatters}</p>
              )}

              {question.options ? (
                <div className="question-options" role="radiogroup">
                  {question.options.map((option) => (
                    <label
                      key={option.value}
                      className={`question-option ${
                        answers[question.id] === option.value ? 'selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${round.id}-${question.id}`}
                        value={option.value}
                        checked={answers[question.id] === option.value}
                        onChange={() =>
                          setAnswers((current) => ({
                            ...current,
                            [question.id]: option.value,
                          }))
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="question-input-row">
                  <input
                    id={`q-${round.id}-${question.id}`}
                    className="question-input"
                    type="text"
                    value={answers[question.id] ?? ''}
                    placeholder={question.recommended ?? 'Your answer'}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                  />
                  {question.unit && (
                    <span className="question-unit">{question.unit}</span>
                  )}
                </div>
              )}

              {question.recommended && (
                <p className="question-recommended">
                  Suggested: <strong>{question.recommended}</strong>
                  {question.unit ? ` ${question.unit}` : ''}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="question-card-footer">
        {error && <p className="question-error">{error}</p>}

        <div className="question-actions">
          <button
            className="question-submit"
            type="submit"
            disabled={busy !== null || unanswered.length > 0}
          >
            {busy === 'answer' ? 'Sending…' : 'Send these answers'}
          </button>
          <button
            className="question-decline"
            type="button"
            disabled={busy !== null}
            onClick={() => void send({ decline: true }, 'decline')}
          >
            {busy === 'decline' ? 'Sending…' : 'You decide'}
          </button>
        </div>

        <p className="question-hint">
          “You decide” lets the agent use its own suggestions. It will flag every
          one of them in the report as its assumption rather than your instruction.
        </p>
      </div>
    </form>
  );
}
