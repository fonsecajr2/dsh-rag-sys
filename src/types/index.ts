export interface DocumentRecord {
  _id?: string;
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: 'processing' | 'indexed' | 'error' | 'ready' | 'failed';
  errorMessage?: string;
  chunkCount: number;
  createdAt: Date;
  sourceType: "pdf" | "txt" | "video";
  videoUrl?: string;      // YouTube link, if any
  videoFilePath?: string; // local file, if uploaded
}

export interface ChunkRecord {
  _id?: string;
  id: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
  createdAt: Date;
  startSeconds?: number;
  endSeconds?: number;
}

export interface Citation {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
  passageSnippet: string;
  score?: number;
  startSeconds?: number;
  endSeconds?: number;
}

export interface RAGAnswer {
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  citations: Citation[];
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  citation: Citation;
}

export interface QuizResult {
  score: number;
  total: number;
  feedback: {
    questionId: string;
    isCorrect: boolean;
    selectedOptionIndex: number;
    correctOptionIndex: number;
    explanation: string;
    citation: Citation;
  }[];
}

export interface TranscriptSegment {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}