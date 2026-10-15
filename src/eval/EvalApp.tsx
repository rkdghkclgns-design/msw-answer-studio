// 골든 평가 실행 화면(개발 서버 전용). 화면에 저장된 API 키로 실제 파이프라인을 돌려 채점한다.
// 키는 이 브라우저 안에서만 쓰이며, 결과(답변 포함)는 이 브라우저의 localStorage 에만 남는다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { gradeOutcome, GoldenItemSchema, summarizeGrades, validateGoldenSet, type GoldenItem } from '../lib/golden';
import { loadKnowledgeBaseOnce } from '../lib/kb';
import type { KnowledgeBase } from '../lib/kb-core';
import { loadSettings } from '../lib/settings';
import { runGoldenItem, type ItemRun } from './run-item';

const RUNS_KEY = 'msw-eval-runs';
type Subset = 'all' | 'trap' | 'ko' | 'en' | 'zh';

function readRuns(): Record<string, ItemRun> {
  try {
    return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '{}') as Record<string, ItemRun>;
  } catch {
    return {};
  }
}

function writeRuns(runs: Record<string, ItemRun>) {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch {
    // 저장 실패해도 화면 결과는 유지된다
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function EvalApp() {
  const [items, setItems] = useState<GoldenItem[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [runs, setRuns] = useState<Record<string, ItemRun>>(readRuns);
  const [subset, setSubset] = useState<Subset>('all');
  const [limit, setLimit] = useState(100);
  const [concurrency, setConcurrency] = useState(2);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const settings = useMemo(loadSettings, []);

  useEffect(() => {
    fetch('/eval/golden.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((raw: unknown[]) => {
        setProblems(validateGoldenSet(raw));
        setItems(raw.flatMap((x) => (GoldenItemSchema.safeParse(x).success ? [GoldenItemSchema.parse(x)] : [])));
      })
      .catch((e: unknown) => setProblems([`eval/golden.json 을 읽지 못했습니다: ${String(e)}`]));
    loadKnowledgeBaseOnce().then(setKb, (e: unknown) => setProblems((p) => [...p, `지식베이스: ${String(e)}`]));
  }, []);

  const selected = useMemo(
    () => items.filter((it) => (subset === 'all' ? true : subset === 'trap' ? Boolean(it.trap) : it.lang === subset)).slice(0, limit),
    [items, subset, limit],
  );
  const grades = useMemo(() => selected.filter((it) => runs[it.id]).map((it) => gradeOutcome(it, runs[it.id])), [selected, runs]);
  const summary = useMemo(() => summarizeGrades(grades), [grades]);

  useEffect(() => {
    (window as unknown as { __mswEval: unknown }).__mswEval = { done: grades.length, selected: selected.length, running, summary, grades };
  }, [grades, selected.length, running, summary]);

  const start = async (rerun: boolean) => {
    if (!kb) return;
    const queue = selected.filter((it) => rerun || !runs[it.id]);
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    const worker = async () => {
      for (let it = queue.shift(); it && !controller.signal.aborted; it = queue.shift()) {
        const result = await runGoldenItem(it, kb, settings, controller.signal);
        setRuns((prev) => {
          const next = { ...prev, [result.id]: result };
          writeRuns(next);
          return next;
        });
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    setRunning(false);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ summary, grades, runs: selected.map((it) => runs[it.id]).filter(Boolean) }, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `golden-eval-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="main" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <h1>골든 평가</h1>
      <p className="hint">
        문항 {items.length}개 · 지식베이스 {kb ? '준비됨' : '불러오는 중'} · API 키 {settings.apiKey ? '있음' : '없음(메인 화면 설정에서 입력)'} · 문항당 약 1~2분, 비용은
        모델 단가에 따라 문항당 수십 센트 수준(추정)
      </p>
      {problems.length > 0 && (
        <ul className="reasons">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="form-row">
        <select value={subset} onChange={(e) => setSubset(e.target.value as Subset)} disabled={running}>
          <option value="all">전체</option>
          <option value="trap">함정 문항</option>
          <option value="ko">한국어</option>
          <option value="en">영어</option>
          <option value="zh">중국어</option>
        </select>
        <label>
          최대 <input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 1)} disabled={running} style={{ width: 64 }} />개
        </label>
        <label>
          동시 실행{' '}
          <select value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} disabled={running}>
            {[1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary" disabled={running || !kb || !settings.apiKey} onClick={() => void start(false)}>
          남은 문항 실행 ({selected.filter((it) => !runs[it.id]).length})
        </button>
        <button type="button" className="btn" disabled={running || !kb || !settings.apiKey} onClick={() => void start(true)}>
          선택 전체 다시 실행
        </button>
        <button type="button" className="btn" disabled={!running} onClick={() => abortRef.current?.abort()}>
          중지
        </button>
        <button type="button" className="btn btn-ghost" disabled={!grades.length} onClick={download}>
          결과 JSON
        </button>
      </div>
      <section className="card">
        <h2>
          결과 {grades.length}/{selected.length} {running && <span className="spinner" aria-hidden />}
        </h2>
        <p>
          정답률 <b>{pct(summary.accuracy)}</b> · 금지 주장 답변 <b>{summary.forbiddenAnswers}</b>건 · 통과인데 오답 <b>{summary.passedButWrong}</b>건(
          {pct(summary.passedButWrongRate)}) · 정답인데 실패 처리 {pct(summary.falseFailRate)} · 근거 검색 적중 {pct(summary.sourceHitRate)} · 오류 {summary.errors}
        </p>
        <p className="hint">상태별: {JSON.stringify(summary.byStatus)} · 언어별: {JSON.stringify(summary.byLang)}</p>
        <table className="eval-table">
          <thead>
            <tr>
              <th>id</th>
              <th>언어</th>
              <th>상태</th>
              <th>채점</th>
              <th>누락 요지 · 금지 주장</th>
              <th>근거</th>
              <th>초</th>
            </tr>
          </thead>
          <tbody>
            {grades.map((g) => (
              <tr key={g.id} title={selected.find((it) => it.id === g.id)?.expected.gist}>
                <td>{g.id}</td>
                <td>{g.lang}</td>
                <td>{g.status}</td>
                <td>{g.correct ? '✓' : '✗'}</td>
                <td>
                  {g.missingGroups.map((m) => `누락: ${m.join('/')}`).join(' · ')}
                  {g.forbiddenHits.map((f) => ` 금지: ${f}`).join('')}
                  {g.error && ` 오류: ${g.error}`}
                </td>
                <td>{g.sourceHit === null ? '-' : g.sourceHit ? '✓' : '✗'}</td>
                <td>{runs[g.id]?.seconds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
