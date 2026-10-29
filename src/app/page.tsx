'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DocumentRecord, Citation, Flashcard, QuizQuestion, QuizResult } from '../types';

type Tab = 'chat' | 'library' | 'summaries' | 'flashcards' | 'quizzes';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  insufficientEvidence?: boolean;
};

const TABS: { id: Tab; label: string; title: string; blurb: string }[] = [
  { id: 'chat', label: 'Ask', title: 'Ask your documents', blurb: 'Answers come only from your uploaded material, with the passage they were found in.' },
  { id: 'library', label: 'Library', title: 'Library', blurb: 'Upload PDF or TXT files and choose which ones to search.' },
  { id: 'summaries', label: 'Summary', title: 'Summary', blurb: 'A short overview and the main points from your selected documents.' },
  { id: 'flashcards', label: 'Flashcards', title: 'Flashcards', blurb: 'Definitions and concepts to review. Use the arrow keys to move between cards.' },
  { id: 'quizzes', label: 'Quiz', title: 'Quiz', blurb: 'Multiple-choice questions based on your documents, graded with explanations.' },
];

const SUGGESTED_QUESTIONS = [
  'What are the main topics covered?',
  'Define the key terms in these documents.',
  'What should I focus on before an exam?',
];

// Shared button styles. One primary action per screen, everything else is secondary.
const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800';
const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const btnSecondary = `inline-flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postJson(url: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 px-6 py-14 text-center">
      <h3 className="font-serif text-lg text-zinc-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-600">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function ErrorNote({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <span>{message}</span>
      <button onClick={onDismiss} className={`shrink-0 text-red-900 underline ${focusRing}`}>
        Dismiss
      </button>
    </div>
  );
}

// Citations look like highlighter marks on a page, since that is what they are.
function CitationChip({ citation, index, onOpen }: { citation: Citation; index: number; onOpen: (c: Citation) => void }) {
  return (
    <button
      onClick={() => onOpen(citation)}
      className={`rounded-sm bg-yellow-200 px-2 py-1 text-xs text-zinc-900 transition-colors hover:bg-yellow-300 ${focusRing}`}
    >
      <span className="font-semibold">{index + 1}</span>
      <span className="ml-1.5">
        {citation.filename}
        {citation.pageNumber ? `, p. ${citation.pageNumber}` : ''}
      </span>
    </button>
  );
}

export default function StudyCompanionApp() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [menuOpen, setMenuOpen] = useState(false);
  const [studyError, setStudyError] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [activeCitationModal, setActiveCitationModal] = useState<Citation | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Summary state
  const [summaryData, setSummaryData] = useState<{ summary: string; keyPoints: string[]; citations: Citation[] } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Flashcards state
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<{ questionId: string; selectedOptionIndex: number }[]>([]);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [gradingQuiz, setGradingQuiz] = useState(false);

  const noDocs = documents.length === 0;
  const activeMeta = TABS.find((t) => t.id === activeTab)!;
  const scopeText =
    selectedDocIds.length === 0
      ? 'Searching all documents'
      : `Searching ${selectedDocIds.length} of ${documents.length} documents`;

  useEffect(() => {
    fetchDocuments();
  }, []);

  // While a file is still being indexed, check again every few seconds.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'processing')) return;
    const timer = setTimeout(fetchDocuments, 3000);
    return () => clearTimeout(timer);
  }, [documents]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  // Escape closes the source preview.
  useEffect(() => {
    if (!activeCitationModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveCitationModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeCitationModal]);

  // Arrow keys move through flashcards.
  useEffect(() => {
    if (activeTab !== 'flashcards' || flashcards.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') moveCard(1);
      if (e.key === 'ArrowLeft') moveCard(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, flashcards.length]);

  function moveCard(delta: number) {
    const len = flashcards.length;
    if (len === 0) return;
    setIsFlipped(false);
    setCurrentCardIdx((prev) => (prev + delta + len) % len);
  }

  function changeTab(tab: Tab) {
    setActiveTab(tab);
    setStudyError('');
    setMenuOpen(false);
  }

  async function fetchDocuments() {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Failed to load documents', err);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const valid = list.filter((f) => /\.(pdf|txt)$/i.test(f.name));

    if (valid.length < list.length) {
      setUploadError('Some files were skipped. Only PDF and TXT are supported.');
    }
    if (valid.length === 0) return;

    setUploading(true);
    const failures: string[] = [];

    // Sequential on purpose: your ingestion embeds chunk-by-chunk, and
    // parallel uploads can hit Gemini rate limits.
    for (const file of valid) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');
      } catch (err) {
        failures.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    await fetchDocuments();
    setUploading(false);
    if (failures.length) setUploadError(failures.join(' | '));
    else setActiveTab('library');
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) uploadFiles(e.target.files);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  }

  async function handleDeleteDoc(id: string) {
    // First click arms the button, second click deletes.
    if (pendingDeleteId !== id) {
      setPendingDeleteId(id);
      return;
    }
    setPendingDeleteId(null);
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setSelectedDocIds((prev) => prev.filter((docId) => docId !== id));
    } catch (err) {
      console.error('Failed to delete document', err);
      setUploadError('Could not delete that document. Try again.');
    }
  }

  function toggleSelectDoc(id: string) {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }

  const scopedIds = selectedDocIds.length > 0 ? selectedDocIds : undefined;

  async function askQuestion(q: string) {
    const question = q.trim();
    if (!question || asking) return;

    setQuestionInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setAsking(true);

    try {
      const data = await postJson('/api/qa', { question, documentIds: scopedIds });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations,
          insufficientEvidence: data.insufficientEvidence,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${(err as Error).message}` }]);
    } finally {
      setAsking(false);
    }
  }

  function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    askQuestion(questionInput);
  }

  function handleComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuestion(questionInput);
    }
  }

  async function handleLoadSummary() {
    setLoadingSummary(true);
    setStudyError('');
    try {
      const data = await postJson('/api/study', { action: 'summary', documentIds: scopedIds });
      setSummaryData(data);
    } catch (err) {
      setStudyError((err as Error).message);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleLoadFlashcards() {
    setLoadingFlashcards(true);
    setStudyError('');
    setIsFlipped(false);
    setCurrentCardIdx(0);
    try {
      const data = await postJson('/api/study', { action: 'flashcards', documentIds: scopedIds });
      setFlashcards(data.flashcards || []);
    } catch (err) {
      setStudyError((err as Error).message);
    } finally {
      setLoadingFlashcards(false);
    }
  }

  async function handleLoadQuiz() {
    setLoadingQuiz(true);
    setStudyError('');
    setQuizAnswers([]);
    setQuizResult(null);
    try {
      const data = await postJson('/api/study', { action: 'quiz_generate', documentIds: scopedIds });
      setQuizQuestions(data.questions || []);
    } catch (err) {
      setStudyError((err as Error).message);
    } finally {
      setLoadingQuiz(false);
    }
  }

  async function handleSubmitQuiz() {
    setGradingQuiz(true);
    setStudyError('');
    try {
      const data = await postJson('/api/study', { action: 'quiz_grade', questions: quizQuestions, answers: quizAnswers });
      setQuizResult(data);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setStudyError((err as Error).message);
    } finally {
      setGradingQuiz(false);
    }
  }

  const uploadButton = (
    <label
      className={`${btnPrimary} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-800 ${
        uploading ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      {uploading && <Spinner />}
      <span>{uploading ? 'Uploading…' : 'Upload file'}</span>
      <input type="file" accept=".pdf,.txt" multiple onChange={handleFileInput} disabled={uploading} className="sr-only" />
    </label>
  );

  const goToLibraryButton = (
    <button onClick={() => changeTab('library')} className={btnPrimary}>
      Go to Library
    </button>
  );

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900 antialiased">
      {/* Mobile overlay */}
      {menuOpen && <div className="fixed inset-0 z-30 bg-zinc-900/30 md:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-200 md:static md:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 pb-4 pt-6">
          <h1 className="font-serif text-xl text-zinc-900">Study Companion</h1>
        </div>

        <nav aria-label="Sections" className="px-3">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => changeTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center justify-between border-l-2 px-3 py-2 text-left text-sm transition-colors ${focusRing} ${
                  active
                    ? 'border-emerald-800 bg-zinc-100 font-medium text-zinc-900'
                    : 'border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'library' && <span className="text-xs tabular-nums text-zinc-500">{documents.length}</span>}
              </button>
            );
          })}
        </nav>

        {/* Search scope */}
        <div className="mt-auto border-t border-zinc-200 px-5 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-zinc-900">Search scope</h2>
            {selectedDocIds.length > 0 && (
              <button onClick={() => setSelectedDocIds([])} className={`text-xs text-emerald-800 underline ${focusRing}`}>
                Clear
              </button>
            )}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            {noDocs ? 'Upload a document to get started.' : 'Tick documents to limit where answers come from. Nothing ticked means all of them.'}
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {documents.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-zinc-700 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(d.id)}
                    onChange={() => toggleSelectDoc(d.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-800 focus:ring-emerald-800"
                  />
                  <span className="truncate" title={d.filename}>
                    {d.filename}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className={`rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm md:hidden ${focusRing}`}
            >
              Menu
            </button>
            <div className="min-w-0">
              <h2 className="font-serif text-xl text-zinc-900">{activeMeta.title}</h2>
              <p className="mt-0.5 hidden max-w-xl text-sm text-zinc-600 sm:block">{activeMeta.blurb}</p>
            </div>
          </div>
          {uploadButton}
        </header>

        {uploadError && (
          <div className="px-4 pt-4 md:px-8">
            <ErrorNote message={uploadError} onDismiss={() => setUploadError('')} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ASK */}
          {activeTab === 'chat' && (
            <div className="mx-auto flex h-full max-w-3xl flex-col">
              <div className="flex-1 space-y-8 overflow-y-auto px-4 py-8 md:px-6" role="log" aria-live="polite">
                {messages.length === 0 && (
                  <div className="py-10">
                    {noDocs ? (
                      <EmptyState
                        title="Add a document first"
                        body="Upload your lecture notes or a textbook chapter, then ask questions about them here."
                        action={goToLibraryButton}
                      />
                    ) : (
                      <div>
                        <h3 className="font-serif text-2xl text-zinc-900">What do you want to understand?</h3>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
                          Ask about anything in your documents. If the answer isn&apos;t in them, you&apos;ll be told so.
                        </p>
                        <ul className="mt-6 space-y-2">
                          {SUGGESTED_QUESTIONS.map((s) => (
                            <li key={s}>
                              <button
                                onClick={() => askQuestion(s)}
                                className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:bg-zinc-100 ${focusRing}`}
                              >
                                {s}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {messages.map((m, idx) =>
                  m.role === 'user' ? (
                    <div key={idx} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-zinc-900 px-4 py-2.5 text-sm leading-relaxed text-white">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={idx} className="max-w-prose">
                      {m.insufficientEvidence && (
                        <p className="mb-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                          Your documents don&apos;t seem to cover this well. Treat the answer below with caution, or try
                          selecting different documents.
                        </p>
                      )}
                      <div className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-900">{m.content}</div>
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs text-zinc-500">Found in</p>
                          <div className="flex flex-wrap gap-2">
                            {m.citations.map((c, cIdx) => (
                              <CitationChip key={cIdx} citation={c} index={cIdx} onOpen={setActiveCitationModal} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}

                {asking && (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Spinner />
                    <span>Reading your documents…</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleAskSubmit} className="border-t border-zinc-200 bg-zinc-50 px-4 py-4 md:px-6">
                <div className="flex items-end gap-3">
                  <textarea
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onKeyDown={handleComposerKey}
                    rows={2}
                    disabled={noDocs}
                    aria-label="Your question"
                    placeholder={noDocs ? 'Upload a document to start asking' : 'Type your question'}
                    className="min-h-[3.25rem] flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-800 disabled:bg-zinc-100"
                  />
                  <button type="submit" disabled={asking || noDocs || !questionInput.trim()} className={btnPrimary}>
                    Send
                  </button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {scopeText}. Enter to send, Shift+Enter for a new line.
                </p>
              </form>
            </div>
          )}

          {/* LIBRARY */}
          {activeTab === 'library' && (
            <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`mb-8 rounded-md border border-dashed px-6 py-8 text-center text-sm transition-colors ${
                  dragging ? 'border-emerald-800 bg-emerald-50 text-emerald-900' : 'border-zinc-300 bg-white text-zinc-600'
                }`}
              >
                {uploading ? 'Uploading and indexing…' : 'Drop a PDF or TXT file here, or use the Upload file button.'}
              </div>

              {noDocs ? (
                <EmptyState
                  title="Nothing here yet"
                  body="Uploaded files appear in this list once they are indexed. Larger PDFs can take a minute."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                        <th className="w-12 px-4 py-3 font-medium">
                          <span className="sr-only">Include in search</span>
                        </th>
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Size</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Chunks</th>
                        <th className="px-4 py-3 font-medium">Added</th>
                        <th className="px-4 py-3 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {documents.map((doc) => {
                        const armed = pendingDeleteId === doc.id;
                        return (
                          <tr key={doc.id} className="hover:bg-zinc-50">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                aria-label={`Include ${doc.filename} in search`}
                                checked={selectedDocIds.includes(doc.id)}
                                onChange={() => toggleSelectDoc(doc.id)}
                                className="h-4 w-4 rounded border-zinc-300 text-emerald-800 focus:ring-emerald-800"
                              />
                            </td>
                            <td className="max-w-xs truncate px-4 py-3 font-medium text-zinc-900" title={doc.filename}>
                              {doc.filename}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-zinc-600">{(doc.fileSize / 1024).toFixed(1)} KB</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 text-zinc-700">
                                <span
                                  aria-hidden="true"
                                  className={`h-2 w-2 rounded-full ${
                                    doc.status === 'indexed'
                                      ? 'bg-emerald-600'
                                      : doc.status === 'processing'
                                      ? 'animate-pulse bg-amber-500'
                                      : 'bg-red-600'
                                  }`}
                                />
                                {doc.status === 'indexed' ? 'Ready' : doc.status === 'processing' ? 'Indexing' : 'Failed'}
                              </span>
                            </td>
                            <td className="px-4 py-3 tabular-nums text-zinc-600">{doc.chunkCount}</td>
                            <td className="px-4 py-3 text-zinc-600">{new Date(doc.createdAt).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => handleDeleteDoc(doc.id)}
                                onBlur={() => setPendingDeleteId(null)}
                                className={`rounded px-2 py-1 text-sm ${focusRing} ${
                                  armed ? 'bg-red-700 font-medium text-white' : 'text-red-700 hover:bg-red-50'
                                }`}
                              >
                                {armed ? 'Click again to delete' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUMMARY */}
          {activeTab === 'summaries' && (
            <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <p className="text-sm text-zinc-600">{scopeText}</p>
                <button onClick={handleLoadSummary} disabled={loadingSummary || noDocs} className={btnPrimary}>
                  {loadingSummary && <Spinner />}
                  <span>{loadingSummary ? 'Writing summary…' : summaryData ? 'Regenerate' : 'Generate summary'}</span>
                </button>
              </div>

              {studyError && (
                <div className="mb-6">
                  <ErrorNote message={studyError} onDismiss={() => setStudyError('')} />
                </div>
              )}

              {loadingSummary && !summaryData && (
                <div className="space-y-3" aria-hidden="true">
                  {[100, 95, 90, 60].map((w) => (
                    <div key={w} className="h-4 animate-pulse rounded bg-zinc-200" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}

              {summaryData ? (
                <article className="space-y-8">
                  <section>
                    <h3 className="mb-3 font-serif text-lg text-zinc-900">Overview</h3>
                    <p className="max-w-prose font-serif text-[17px] leading-8 text-zinc-800">{summaryData.summary}</p>
                  </section>

                  {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                    <section>
                      <h3 className="mb-3 font-serif text-lg text-zinc-900">Main points</h3>
                      <ul className="max-w-prose list-disc space-y-2 pl-5 text-[15px] leading-7 text-zinc-800 marker:text-zinc-400">
                        {summaryData.keyPoints.map((pt, idx) => (
                          <li key={idx}>{pt}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {summaryData.citations && summaryData.citations.length > 0 && (
                    <section className="border-t border-zinc-200 pt-5">
                      <h3 className="mb-3 text-sm font-medium text-zinc-900">Based on</h3>
                      <div className="flex flex-wrap gap-2">
                        {summaryData.citations.map((c, idx) => (
                          <CitationChip key={idx} citation={c} index={idx} onOpen={setActiveCitationModal} />
                        ))}
                      </div>
                    </section>
                  )}
                </article>
              ) : (
                !loadingSummary && (
                  <EmptyState
                    title={noDocs ? 'Add a document first' : 'No summary yet'}
                    body={
                      noDocs
                        ? 'A summary needs at least one uploaded document.'
                        : 'Generate one to see an overview and the main points from your documents.'
                    }
                    action={noDocs ? goToLibraryButton : undefined}
                  />
                )
              )}
            </div>
          )}

          {/* FLASHCARDS */}
          {activeTab === 'flashcards' && (
            <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <p className="text-sm text-zinc-600">{scopeText}</p>
                <button onClick={handleLoadFlashcards} disabled={loadingFlashcards || noDocs} className={btnPrimary}>
                  {loadingFlashcards && <Spinner />}
                  <span>{loadingFlashcards ? 'Making cards…' : flashcards.length > 0 ? 'Make new set' : 'Generate flashcards'}</span>
                </button>
              </div>

              {studyError && (
                <div className="mb-6">
                  <ErrorNote message={studyError} onDismiss={() => setStudyError('')} />
                </div>
              )}

              {flashcards.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-1 flex-1 rounded bg-zinc-200">
                      <div
                        className="h-1 rounded bg-emerald-800 transition-all duration-200"
                        style={{ width: `${((currentCardIdx + 1) / flashcards.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-zinc-500">
                      {currentCardIdx + 1} of {flashcards.length}
                    </span>
                  </div>

                  <button
                    onClick={() => setIsFlipped((f) => !f)}
                    aria-label={isFlipped ? 'Showing answer. Click to show question.' : 'Showing question. Click to show answer.'}
                    className={`flex h-72 w-full flex-col justify-between rounded-md border bg-white p-8 text-left transition-colors ${focusRing} ${
                      isFlipped ? 'border-emerald-800' : 'border-zinc-300 hover:border-zinc-400'
                    }`}
                  >
                    <span className="text-xs text-zinc-500">{isFlipped ? 'Answer' : 'Question'}</span>
                    <span className="font-serif text-2xl leading-snug text-zinc-900">
                      {isFlipped ? flashcards[currentCardIdx].answer : flashcards[currentCardIdx].question}
                    </span>
                    <span className="flex justify-between text-xs text-zinc-500">
                      <span className="truncate">From {flashcards[currentCardIdx].filename}</span>
                      <span>{isFlipped ? 'Click to see the question' : 'Click to reveal the answer'}</span>
                    </span>
                  </button>

                  <div className="mt-5 flex items-center justify-between">
                    <button onClick={() => moveCard(-1)} className={btnSecondary}>
                      Previous
                    </button>
                    <span className="hidden text-xs text-zinc-500 sm:inline">Left and right arrow keys also work</span>
                    <button onClick={() => moveCard(1)} className={btnPrimary}>
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                !loadingFlashcards && (
                  <EmptyState
                    title={noDocs ? 'Add a document first' : 'No flashcards yet'}
                    body={
                      noDocs
                        ? 'Flashcards are built from your uploaded documents.'
                        : 'Generate a set to review the key definitions and concepts.'
                    }
                    action={noDocs ? goToLibraryButton : undefined}
                  />
                )
              )}
            </div>
          )}

          {/* QUIZ */}
          {activeTab === 'quizzes' && (
            <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <p className="text-sm text-zinc-600">{scopeText}</p>
                <button onClick={handleLoadQuiz} disabled={loadingQuiz || noDocs} className={quizQuestions.length > 0 ? btnSecondary : btnPrimary}>
                  {loadingQuiz && <Spinner />}
                  <span>{loadingQuiz ? 'Building quiz…' : quizQuestions.length > 0 ? 'Start a new quiz' : 'Generate quiz'}</span>
                </button>
              </div>

              {studyError && (
                <div className="mb-6">
                  <ErrorNote message={studyError} onDismiss={() => setStudyError('')} />
                </div>
              )}

              {quizQuestions.length > 0 && !quizResult && (
                <div>
                  <div className="divide-y divide-zinc-200 border-y border-zinc-200">
                    {quizQuestions.map((q, qIdx) => {
                      const chosen = quizAnswers.find((a) => a.questionId === q.id)?.selectedOptionIndex;
                      return (
                        <fieldset key={q.id} className="py-7">
                          <legend className="mb-4 flex gap-3 font-serif text-lg leading-snug text-zinc-900">
                            <span className="text-zinc-400">{qIdx + 1}.</span>
                            <span>{q.question}</span>
                          </legend>
                          <div role="radiogroup" aria-label={`Question ${qIdx + 1}`} className="space-y-2 pl-8">
                            {q.options.map((opt, optIdx) => {
                              const selected = chosen === optIdx;
                              return (
                                <button
                                  key={optIdx}
                                  role="radio"
                                  aria-checked={selected}
                                  onClick={() => {
                                    const others = quizAnswers.filter((a) => a.questionId !== q.id);
                                    setQuizAnswers([...others, { questionId: q.id, selectedOptionIndex: optIdx }]);
                                  }}
                                  className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors ${focusRing} ${
                                    selected
                                      ? 'border-emerald-800 bg-emerald-50 text-zinc-900'
                                      : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
                                  }`}
                                >
                                  <span className={`font-semibold ${selected ? 'text-emerald-800' : 'text-zinc-400'}`}>
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>

                  <div className="sticky bottom-0 -mx-4 mt-6 flex items-center justify-between gap-4 border-t border-zinc-200 bg-zinc-50/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
                    <span className="text-sm text-zinc-600">
                      {quizAnswers.length} of {quizQuestions.length} answered
                    </span>
                    <button
                      onClick={handleSubmitQuiz}
                      disabled={quizAnswers.length < quizQuestions.length || gradingQuiz}
                      className={btnPrimary}
                    >
                      {gradingQuiz && <Spinner />}
                      <span>{gradingQuiz ? 'Grading…' : 'Check answers'}</span>
                    </button>
                  </div>
                </div>
              )}

              {quizResult && (
                <div className="space-y-8">
                  <div>
                    <p className="text-sm text-zinc-600">Your score</p>
                    <p className="mt-1 font-serif text-5xl text-zinc-900">
                      {quizResult.score} <span className="text-zinc-400">of {quizResult.total}</span>
                    </p>
                    <p className="mt-2 text-sm text-zinc-600">
                      {quizResult.score === quizResult.total
                        ? 'Every answer was right.'
                        : 'Read the explanations below for the ones you missed.'}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {quizResult.feedback.map((fb, idx) => {
                      const q = quizQuestions.find((item) => item.id === fb.questionId);
                      return (
                        <div
                          key={idx}
                          className={`border-l-4 bg-white py-4 pl-5 pr-4 ${fb.isCorrect ? 'border-emerald-600' : 'border-red-600'}`}
                        >
                          <p className="text-xs font-medium text-zinc-500">
                            Question {idx + 1}: {fb.isCorrect ? 'correct' : 'incorrect'}
                          </p>
                          <p className="mt-1 font-serif text-base text-zinc-900">{q?.question}</p>
                          <p className="mt-3 text-sm text-zinc-700">
                            You chose: {fb.selectedOptionIndex >= 0 ? q?.options[fb.selectedOptionIndex] : 'No answer'}
                          </p>
                          {!fb.isCorrect && (
                            <p className="mt-1 text-sm font-medium text-emerald-800">
                              Correct answer: {q?.options[fb.correctOptionIndex]}
                            </p>
                          )}
                          <p className="mt-3 text-sm leading-relaxed text-zinc-700">{fb.explanation}</p>
                          <p className="mt-2 text-xs text-zinc-500">Source: {fb.citation.filename}</p>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => {
                      setQuizResult(null);
                      setQuizQuestions([]);
                      setQuizAnswers([]);
                    }}
                    className={btnPrimary}
                  >
                    Take another quiz
                  </button>
                </div>
              )}

              {quizQuestions.length === 0 && !loadingQuiz && !quizResult && (
                <EmptyState
                  title={noDocs ? 'Add a document first' : 'No quiz yet'}
                  body={
                    noDocs
                      ? 'Quizzes are built from your uploaded documents.'
                      : 'Generate a quiz to test yourself. You will see explanations after you submit.'
                  }
                  action={noDocs ? goToLibraryButton : undefined}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Source preview */}
      {activeCitationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          onClick={() => setActiveCitationModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-md bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h4 id="source-title" className="truncate font-serif text-lg text-zinc-900">
                  {activeCitationModal.filename}
                </h4>
                {activeCitationModal.pageNumber ? (
                  <p className="text-sm text-zinc-500">Page {activeCitationModal.pageNumber}</p>
                ) : null}
              </div>
              <button
                autoFocus
                onClick={() => setActiveCitationModal(null)}
                className={`${btnSecondary} shrink-0 px-3 py-1.5`}
              >
                Close
              </button>
            </div>
            <blockquote className="max-h-80 overflow-y-auto border-l-4 border-yellow-300 bg-yellow-50 px-4 py-3 font-serif text-[15px] leading-relaxed text-zinc-900">
              {activeCitationModal.passageSnippet}
            </blockquote>
          </div>
        </div>
      )}
    </div>
  );
}