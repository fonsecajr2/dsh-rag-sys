import { chunkText, extractTextFromFile } from '../services/ingestion';
import { gradeQuiz } from '../services/study';
import { QuizQuestion } from '../types';

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
