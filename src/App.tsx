import { useCallback, useEffect, useState } from 'react';
import { AnalysisPanel } from './components/AnalysisPanel';
import { AnswerCard } from './components/AnswerCard';
import { Header } from './components/Header';
import { OpsNotesPanel } from './components/OpsNotesPanel';
import { PipelineSteps } from './components/PipelineSteps';
import { QuestionForm } from './components/QuestionForm';
import { SettingsDialog } from './components/SettingsDialog';
import { SourcesPanel } from './components/SourcesPanel';
import { VerificationPanel } from './components/VerificationPanel';
import { useKnowledgeBase } from './hooks/useKnowledgeBase';
import { usePipelineRun } from './hooks/usePipelineRun';
import { extractCitationNumbers } from './lib/citations';
import { prepareImage } from './lib/image-prep';
import { checkImageFile, MAX_IMAGES, type ImageInput } from './lib/images';
import { loadOpsNotes, type OpsNotes } from './lib/ops-notes';
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
  // 로컬 개발 서버에서만 운영 메모(대외비)를 읽는다. 배포본에서는 항상 null.
  const [opsNotes, setOpsNotes] = useState<OpsNotes | null>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  useEffect(() => {
    void loadOpsNotes().then(setOpsNotes);
  }, []);

  const hasKey = settings.apiKey.length > 0;
  const running = run.status === 'running';

  const submit = useCallback(() => {
    if (kbState.status !== 'ready') return;
    if (!hasKey) {
      setSettingsOpen(true);
      return;
    }
    void start(question, kbState.kb, settings, { opsNotes, images });
  }, [kbState, hasKey, question, settings, start, opsNotes, images]);

  // 첨부 이미지: 형식·개수·크기를 확인하고, 큰 이미지는 축소해 base64 로 준비한다
  const addImages = async (files: File[]) => {
    setAttachError(null);
    setAttaching(true);
    const problems: string[] = [];
    const prepared: ImageInput[] = [];
    for (const file of files) {
      const problem = checkImageFile(file, images.length + prepared.length);
      if (problem) {
        problems.push(problem);
        continue;
      }
      try {
        prepared.push(await prepareImage(file));
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    }
    setImages((prev) => [...prev, ...prepared].slice(0, MAX_IMAGES));
    setAttachError(problems.length ? [...new Set(problems)].join(' ') : null);
    setAttaching(false);
  };
  const removeImage = (id: string) => setImages((prev) => prev.filter((img) => img.id !== id));

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
          {opsNotes && <OpsNotesPanel notes={opsNotes} />}
          <QuestionForm
            value={question}
            running={running}
            disabled={kbState.status !== 'ready'}
            onChange={setQuestion}
            onSubmit={submit}
            onCancel={cancel}
            images={images}
            attaching={attaching}
            attachError={attachError}
            onAddImages={(files) => void addImages(files)}
            onRemoveImage={removeImage}
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
