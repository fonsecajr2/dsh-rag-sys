'use client';

import React, { useState, useEffect } from 'react';
import { DocumentRecord, Citation, Flashcard, QuizQuestion, QuizResult } from '../types';

export default function StudyCompanionApp() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  const [activeTab, setActiveTab] = useState<'chat' | 'library' | 'summaries' | 'flashcards' | 'quizzes'>('chat');

  // Chat state
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; citations?: Citation[]; insufficientEvidence?: boolean }[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [activeCitationModal, setActiveCitationModal] = useState<Citation | null>(null);

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

  useEffect(() => {
    fetchDocuments();
  }, []);

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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      await fetchDocuments();
      setActiveTab('library');
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteDoc(id: string) {
    if (!confirm('Are you sure you want to delete this document and its chunks?')) return;
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      setDocuments(documents.filter((d) => d.id !== id));
      setSelectedDocIds(selectedDocIds.filter((docId) => docId !== id));
    } catch (err) {
      console.error('Failed to delete document', err);
    }
  }

  function toggleSelectDoc(id: string) {
    if (selectedDocIds.includes(id)) {
      setSelectedDocIds(selectedDocIds.filter((i) => i !== id));
    } else {
      setSelectedDocIds([...selectedDocIds, id]);
    }
  }

  async function handleAskQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!questionInput.trim() || asking) return;

    const q = questionInput;
    setQuestionInput('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setAsking(true);

    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to answer');

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
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setAsking(false);
    }
  }

  async function handleLoadSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summary', documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined }),
      });
      const data = await res.json();
      setSummaryData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function handleLoadFlashcards() {
    setLoadingFlashcards(true);
    setIsFlipped(false);
    setCurrentCardIdx(0);
    try {
      const res = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'flashcards', documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined }),
      });
      const data = await res.json();
      setFlashcards(data.flashcards || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFlashcards(false);
    }
  }

  async function handleLoadQuiz() {
    setLoadingQuiz(true);
    setQuizAnswers([]);
    setQuizResult(null);
    try {
      const res = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz_generate', documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined }),
      });
      const data = await res.json();
      setQuizQuestions(data.questions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuiz(false);
    }
  }

  async function handleSubmitQuiz() {
    try {
      const res = await fetch('/api/study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quiz_grade', questions: quizQuestions, answers: quizAnswers }),
      });
      const data = await res.json();
      setQuizResult(data);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="flex h-screen bg-slate-100">
      {/* Sidebar Navigation */}
      <aside className="w-72 bg-slate-900 text-slate-100 flex flex-col justify-between border-r border-slate-800">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-indigo-600 p-2.5 rounded-lg text-white font-bold text-lg">AI</div>
            <div>
              <h1 className="font-bold text-base leading-tight">Study Companion</h1>
              <p className="text-xs text-slate-400">RAG-First MVP</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              💬 Grounded Q&A Chat
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'library' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              📚 Document Library ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab('summaries')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'summaries' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              📝 Summaries
            </button>
            <button
              onClick={() => setActiveTab('flashcards')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'flashcards' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              🃏 Flashcards
            </button>
            <button
              onClick={() => setActiveTab('quizzes')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'quizzes' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              ✍️ Practice Quizzes
            </button>
          </nav>
        </div>

        {/* Document Scope Filter Box */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
            Scope ({selectedDocIds.length} selected)
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-slate-300">
            {documents.length === 0 ? (
              <p className="text-slate-500 italic">No documents uploaded.</p>
            ) : (
              documents.map((d) => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(d.id)}
                    onChange={() => toggleSelectDoc(d.id)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span className="truncate">{d.filename}</span>
                </label>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-200 px-6 flex items-center justify-between bg-white shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 capitalize">
            {activeTab === 'chat' && 'Source-Grounded RAG Q&A'}
            {activeTab === 'library' && 'Course Material Library & Ingestion'}
            {activeTab === 'summaries' && 'Generated Document Summaries'}
            {activeTab === 'flashcards' && 'Interactive Flashcard Review'}
            {activeTab === 'quizzes' && 'Self-Assessment Quizzes'}
          </h2>

          <div className="flex items-center gap-3">
            <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow transition flex items-center gap-2">
              <span>{uploading ? 'Processing...' : 'Upload PDF / TXT'}</span>
              <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
        </header>

        {/* Upload error banner */}
        {uploadError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm flex justify-between items-center">
            <span>{uploadError}</span>
            <button onClick={() => setUploadError('')} className="font-bold">&times;</button>
          </div>
        )}

        {/* Tab Views */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* CHAT TAB */}
          {activeTab === 'chat' && (
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                {messages.length === 0 && (
                  <div className="text-center py-20">
                    <div className="text-4xl mb-3">🎓</div>
                    <h3 className="text-lg font-bold text-slate-700">Ask anything about your course materials</h3>
                    <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                      Answers will be generated strictly from your uploaded notes and linked with verified clickable source passages.
                    </p>
                  </div>
                )}

                {messages.map((m, idx) => (
                  <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-2xl rounded-xl p-4 text-sm leading-relaxed shadow-sm ${
                        m.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>

                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
                          <span className="text-xs font-semibold text-slate-500 self-center">Sources:</span>
                          {m.citations.map((c, cIdx) => (
                            <button
                              key={cIdx}
                              onClick={() => setActiveCitationModal(c)}
                              className="text-xs bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded shadow-xs font-medium transition"
                            >
                              📄 {c.filename}{c.pageNumber ? ` (p.${c.pageNumber})` : ''}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {asking && (
                  <div className="flex items-center gap-2 text-slate-500 text-sm italic">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                    Searching course material and generating grounded answer...
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleAskQuestion} className="mt-auto flex gap-2">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder={selectedDocIds.length > 0 ? `Ask a question regarding ${selectedDocIds.length} selected doc(s)...` : "Ask a question regarding all course materials..."}
                  className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                />
                <button
                  type="submit"
                  disabled={asking || !questionInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium text-sm shadow transition"
                >
                  Send
                </button>
              </form>
            </div>
          )}

          {/* LIBRARY TAB */}
          {activeTab === 'library' && (
            <div className="max-w-5xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Uploaded Course Materials</h3>
                  <p className="text-xs text-slate-500">Manage your indexed PDF and TXT files</p>
                </div>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500 text-sm mb-3">No documents uploaded yet.</p>
                  <label className="cursor-pointer bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow">
                    Upload First Document
                    <input type="file" accept=".pdf,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        <th className="p-4">Select</th>
                        <th className="p-4">Filename</th>
                        <th className="p-4">Size</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Chunks</th>
                        <th className="p-4">Uploaded At</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-50 transition">
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={selectedDocIds.includes(doc.id)}
                              onChange={() => toggleSelectDoc(doc.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                            />
                          </td>
                          <td className="p-4 font-medium text-slate-800">{doc.filename}</td>
                          <td className="p-4 text-slate-500">{(doc.fileSize / 1024).toFixed(1)} KB</td>
                          <td className="p-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                doc.status === 'indexed'
                                  ? 'bg-green-100 text-green-800'
                                  : doc.status === 'processing'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {doc.status}
                            </span>
                          </td>
                          <td className="p-4 text-slate-600">{doc.chunkCount}</td>
                          <td className="p-4 text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SUMMARIES TAB */}
          {activeTab === 'summaries' && (
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Source-Grounded Summaries</h3>
                  <p className="text-xs text-slate-500">Generate executive summaries grounded in selected materials</p>
                </div>
                <button
                  onClick={handleLoadSummary}
                  disabled={loadingSummary}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"
                >
                  {loadingSummary ? 'Generating...' : 'Generate Summary'}
                </button>
              </div>

              {summaryData ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
                  <div>
                    <h4 className="font-semibold text-slate-700 text-sm mb-2 uppercase tracking-wider">Executive Summary</h4>
                    <p className="text-slate-800 leading-relaxed text-base">{summaryData.summary}</p>
                  </div>

                  {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-700 text-sm mb-2 uppercase tracking-wider">Key Bullet Points</h4>
                      <ul className="list-disc pl-5 space-y-1 text-slate-700">
                        {summaryData.keyPoints.map((pt, idx) => (
                          <li key={idx}>{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-500 block mb-2">Source Passages Referenced:</span>
                    <div className="flex flex-wrap gap-2">
                      {summaryData.citations.map((c, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveCitationModal(c)}
                          className="text-xs bg-slate-50 border border-indigo-200 text-indigo-700 px-2.5 py-1 rounded shadow-xs"
                        >
                          📄 {c.filename}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500 text-sm mb-3">Click Generate Summary to create an AI summary from your course documents.</p>
                </div>
              )}
            </div>
          )}

          {/* FLASHCARDS TAB */}
          {activeTab === 'flashcards' && (
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Study Flashcards</h3>
                  <p className="text-xs text-slate-500">Review key Q&A pairs grounded in source materials</p>
                </div>
                <button
                  onClick={handleLoadFlashcards}
                  disabled={loadingFlashcards}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"
                >
                  {loadingFlashcards ? 'Generating...' : 'Generate Flashcards'}
                </button>
              </div>

              {flashcards.length > 0 ? (
                <div className="space-y-6">
                  <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="h-72 bg-white rounded-2xl shadow-md border border-slate-200 p-8 flex flex-col justify-between cursor-pointer hover:border-indigo-400 transition select-none"
                  >
                    <div className="flex justify-between text-xs text-slate-400 font-medium">
                      <span>Card {currentCardIdx + 1} of {flashcards.length}</span>
                      <span>Click card to flip</span>
                    </div>

                    <div className="text-center my-auto">
                      <h4 className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                        {isFlipped ? 'Answer' : 'Question'}
                      </h4>
                      <p className="text-xl font-medium text-slate-800 leading-snug">
                        {isFlipped ? flashcards[currentCardIdx].answer : flashcards[currentCardIdx].question}
                      </p>
                    </div>

                    <div className="text-xs text-slate-400 text-center">
                      Source: {flashcards[currentCardIdx].filename}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        setCurrentCardIdx((prev) => (prev > 0 ? prev - 1 : flashcards.length - 1));
                      }}
                      className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium shadow-xs hover:bg-slate-50"
                    >
                      ← Previous Card
                    </button>
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        setCurrentCardIdx((prev) => (prev < flashcards.length - 1 ? prev + 1 : 0));
                      }}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow hover:bg-indigo-700"
                    >
                      Next Card →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500 text-sm mb-3">Click Generate Flashcards to build review cards from your documents.</p>
                </div>
              )}
            </div>
          )}

          {/* QUIZZES TAB */}
          {activeTab === 'quizzes' && (
            <div className="max-w-3xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Practice Quiz</h3>
                  <p className="text-xs text-slate-500">Test your mastery with source-grounded multiple choice questions</p>
                </div>
                <button
                  onClick={handleLoadQuiz}
                  disabled={loadingQuiz}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"
                >
                  {loadingQuiz ? 'Generating...' : 'Generate New Quiz'}
                </button>
              </div>

              {quizQuestions.length > 0 && !quizResult && (
                <div className="space-y-6">
                  {quizQuestions.map((q, qIdx) => (
                    <div key={q.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                      <h4 className="font-semibold text-slate-800 text-base">
                        {qIdx + 1}. {q.question}
                      </h4>
                      <div className="space-y-2">
                        {q.options.map((opt, optIdx) => {
                          const selected = quizAnswers.find((a) => a.questionId === q.id)?.selectedOptionIndex === optIdx;
                          return (
                            <button
                              key={optIdx}
                              onClick={() => {
                                const filtered = quizAnswers.filter((a) => a.questionId !== q.id);
                                setQuizAnswers([...filtered, { questionId: q.id, selectedOptionIndex: optIdx }]);
                              }}
                              className={`w-full text-left px-4 py-3 rounded-lg text-sm border transition flex items-center gap-3 ${
                                selected ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-medium' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span>{opt}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={handleSubmitQuiz}
                    disabled={quizAnswers.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold shadow transition"
                  >
                    Submit Quiz Answers
                  </button>
                </div>
              )}

              {quizResult && (
                <div className="space-y-6">
                  <div className="bg-indigo-900 text-white p-6 rounded-2xl text-center shadow-md">
                    <h4 className="text-xs uppercase tracking-wider font-semibold text-indigo-300 mb-1">Quiz Results</h4>
                    <div className="text-4xl font-bold mb-2">
                      {quizResult.score} / {quizResult.total}
                    </div>
                    <p className="text-sm text-indigo-200">
                      {quizResult.score === quizResult.total ? '🎉 Perfect score! Excellent mastery.' : 'Review explanations below to strengthen your understanding.'}
                    </p>
                  </div>

                  {quizResult.feedback.map((fb, idx) => {
                    const q = quizQuestions.find((item) => item.id === fb.questionId);
                    return (
                      <div key={idx} className={`bg-white rounded-xl shadow-sm border p-6 space-y-3 ${fb.isCorrect ? 'border-green-300 bg-green-50/20' : 'border-red-300 bg-red-50/20'}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-slate-800">Question {idx + 1}</span>
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${fb.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {fb.isCorrect ? 'Correct' : 'Incorrect'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800 font-medium">{q?.question}</p>
                        <div className="text-xs text-slate-600 space-y-1">
                          <p>Your choice: <span className="font-semibold">{fb.selectedOptionIndex >= 0 ? q?.options[fb.selectedOptionIndex] : 'None'}</span></p>
                          {!fb.isCorrect && <p>Correct choice: <span className="font-semibold text-green-700">{q?.options[fb.correctOptionIndex]}</span></p>}
                        </div>
                        <div className="pt-2 border-t border-slate-200 text-xs text-slate-700 bg-white p-3 rounded-lg border">
                          <span className="font-semibold text-indigo-600 block mb-1">Explanation & Source Reference:</span>
                          <p>{fb.explanation}</p>
                          <p className="mt-1 text-slate-500 font-medium">Source: {fb.citation.filename}</p>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => {
                      setQuizResult(null);
                      setQuizQuestions([]);
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-semibold shadow transition"
                  >
                    Take Another Quiz
                  </button>
                </div>
              )}

              {quizQuestions.length === 0 && !loadingQuiz && !quizResult && (
                <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <p className="text-slate-500 text-sm mb-3">Click Generate New Quiz to test your knowledge.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Citation Passage Modal */}
      {activeCitationModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-800 text-base">Source Passage Preview</h4>
                <p className="text-xs text-slate-500">{activeCitationModal.filename}{activeCitationModal.pageNumber ? ` • Page ${activeCitationModal.pageNumber}` : ''}</p>
              </div>
              <button
                onClick={() => setActiveCitationModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700 text-sm leading-relaxed max-h-60 overflow-y-auto">
              {activeCitationModal.passageSnippet}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveCitationModal(null)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
