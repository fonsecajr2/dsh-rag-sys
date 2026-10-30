import { chunkText, extractTextFromFile } from '../services/ingestion';
import { gradeQuiz } from '../services/study';
import { QuizQuestion } from '../types';
import { formatTimestamp, parseTimestamp, chunkSegments } from "@/services/video";

describe("video helpers", () => {
  test("formatTimestamp", () => {
    expect(formatTimestamp(754)).toBe("12:34");
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });

  test("parseTimestamp", () => {
    expect(parseTimestamp("12:34")).toBe(754);
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });

  test("chunkSegments keeps start times and overlaps", () => {
    const segs = Array.from({ length: 20 }, (_, k) => ({
      start: k * 10,
      end: k * 10 + 10,
      text: `sentence ${k}`,
    }));
    const chunks = chunkSegments(segs, 60, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startSeconds).toBe(0);
    expect(chunks[1].startSeconds).toBeLessThan(chunks[0].endSeconds); // overlap
  });
});

describe('RAG Study Companion Core Services Unit Tests', () => {
  test('chunkText splits long text with overlap correctly', () => {
    const text = 'A'.repeat(2500);
    const chunks = chunkText(text, 1000, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(1000);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  test('extractTextFromFile handles plain text successfully', async () => {
    const buffer = Buffer.from('Hello world test document content.', 'utf-8');
    const result = await extractTextFromFile(buffer, 'text/plain', 'test.txt');
    expect(result.length).toBe(1);
    expect(result[0].text).toContain('Hello world');
  });

  test('extractTextFromFile rejects empty text', async () => {
    const buffer = Buffer.from('', 'utf-8');
    await expect(extractTextFromFile(buffer, 'text/plain', 'empty.txt')).rejects.toThrow('empty');
  });

  test('gradeQuiz correctly calculates scores and feedback', () => {
    const mockQuestions: QuizQuestion[] = [
      {
        id: 'q1',
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctAnswerIndex: 1,
        explanation: 'Basic math',
        citation: { chunkId: 'c1', documentId: 'd1', filename: 'math.txt', passageSnippet: '2+2=4' },
      },
    ];

    const result = gradeQuiz(mockQuestions, [{ questionId: 'q1', selectedOptionIndex: 1 }]);
    expect(result.score).toBe(1);
    expect(result.total).toBe(1);
    expect(result.feedback[0].isCorrect).toBe(true);
    expect(result.feedback[0].correctOptionIndex).toBe(1);

    const incorrectResult = gradeQuiz(mockQuestions, [{ questionId: 'q1', selectedOptionIndex: 0 }]);
    expect(incorrectResult.score).toBe(0);
    expect(incorrectResult.feedback[0].isCorrect).toBe(false);
  });
});
