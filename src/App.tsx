import { useCallback, useState } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { AnswerCard } from './components/AnswerCard';
import { Header } from './components/Header';
import { PipelineSteps } from './components/PipelineSteps';
import { QuestionForm } from './components/QuestionForm';
import { SettingsDialog } from './components/SettingsDialog';
import { SourcesPanel } from './components/SourcesPanel';
import { VerificationPanel } from './components/VerificationPanel';
import { useKnowledgeBase } from './hooks/useKnowledgeBase';
import { usePipelineRun } from './hooks/usePipelineRun';
import { extractCitationNumbers } from './lib/citations';
import { loadSettings, saveSettings, type Settings } from './lib/settings';

function flashSource(n: number) {
  const el = document.getElementById(`src-${n}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

export default function App() {
  const kbState = useKnowledgeBase();
  const { state: run, start, cancel } = usePipelineRun();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [question, setQuestion] = useState('');

  const hasKey = settings.apiKey.length > 0;
  const running = run.status === 'running';

  const submit = useCallback(() => {
    if (kbState.status !== 'ready') return;
    if (!hasKey) {
      setSettingsOpen(true);
      return;
    }
    void start(question, kbState.kb, settings);
  }, [kbState, hasKey, question, settings, start]);

  const save = (next: Settings) => {
    saveSettings(next);
    setSettings(next);
    setSettingsOpen(false);
  };

  return (
    <>
      <Header kbState={kbState} hasKey={hasKey} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="layout">
        <div className="column">
          {kbState.status === 'error' && <p className="notice notice-error">{kbState.message}</p>}
          {!hasKey && (
            <p className="notice notice-info">
              답변 생성에는 Anthropic API 키가 필요합니다. 오른쪽 위 <b>API 키 입력</b>에서 설정해 주세요.
            </p>
          )}
          <QuestionForm
            value={question}
            running={running}
            disabled={kbState.status !== 'ready'}
            onChange={setQuestion}
            onSubmit={submit}
            onCancel={cancel}
          />
          {run.status !== 'idle' && (
            <section className="card">
              <PipelineSteps stages={run.stages} />
              {run.error && (
                <p className={`notice ${run.status === 'cancelled' ? 'notice-warn' : 'notice-error'}`} style={{ marginBottom: 0 }}>
                  {run.error}
                </p>
              )}
            </section>
          )}
          <AnswerCard key={run.startedAt ?? 0} run={run} onCitationClick={flashSource} />
          {run.analysis && <AnalysisPanel analysis={run.analysis} />}
        </div>
        <aside className="column">
          <VerificationPanel
            key={run.startedAt ?? 0}
            final={run.verification}
            draft={run.draftVerification}
            running={running}
            onCitationClick={flashSource}
          />
          <SourcesPanel sources={run.sources} cited={extractCitationNumbers(run.answer)} />
        </aside>
      </main>
      <SettingsDialog open={settingsOpen} settings={settings} onSave={save} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
