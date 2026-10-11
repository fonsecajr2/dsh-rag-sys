import { vectorSearch } from './retrieval';
import { generateGeminiText } from './gemini';
import { SummaryResult, Flashcard, QuizQuestion, QuizResult, Citation } from '../types';

export async function generateSummary(documentIds?: string[]): Promise<SummaryResult> {
  const citations = await vectorSearch('Overview main concepts summary key topics', documentIds, 6);

  if (citations.length === 0) {
    return {
      summary: 'No documents available for summary generation.',
      keyPoints: [],
      citations: [],
    };
  }

  const contextText = citations
    .map((c, idx) => `[Source ${idx + 1}] (${c.filename}):\n${c.passageSnippet}`)
    .join('\n\n');

  const prompt = `Based on the following course material excerpts, generate a comprehensive summary and 4-5 key bullet points. Ground every point in the text.

Excerpts:
${contextText}

Format your response as JSON with keys: "summary" (string) and "keyPoints" (array of strings).`;

  const responseText = await generateGeminiText(prompt, 'You are an academic study assistant. Return valid JSON only.');

  let parsed: { summary: string; keyPoints: string[] } = {
    summary: responseText,
    keyPoints: ['Key concept 1 from course material', 'Key concept 2 from course material'],
  };

  try {
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // fallback
  }

  return {
    summary: parsed.summary || responseText,
    keyPoints: parsed.keyPoints || [],
    citations,
  };
}

export async function generateFlashcards(documentIds?: string[]): Promise<Flashcard[]> {
  const citations = await vectorSearch('Important definitions concepts equations principles', documentIds, 5);

  if (citations.length === 0) {
    return [];
  }

  const contextText = citations
    .map((c, idx) => `[Source ${idx + 1}] (Doc: ${c.documentId}, File: ${c.filename}):\n${c.passageSnippet}`)
    .join('\n\n');

  const prompt = `Generate 5 flashcards (question and answer) based strictly on these course material passages.
Excerpts:
${contextText}

Return a JSON array of objects with keys: "question", "answer", "sourceIndex" (0-based index of the source).`;

  const responseText = await generateGeminiText(prompt, 'You are an academic study assistant. Return valid JSON array only.');

  try {
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const items = JSON.parse(cleaned);
    return items.map((item: any, idx: number) => {
      const src = citations[item.sourceIndex || 0] || citations[0];
      return {
        id: `fc-${idx}-${Date.now()}`,
        question: item.question,
        answer: item.answer,
        documentId: src.documentId,
        filename: src.filename,
        pageNumber: src.pageNumber,
      };
    });
  } catch (e) {
    return citations.map((c, idx) => ({
      id: `fc-${idx}-${Date.now()}`,
      question: `What is a core concept discussed in ${c.filename}?`,
      answer: c.passageSnippet.slice(0, 150) + '...',
      documentId: c.documentId,
      filename: c.filename,
      pageNumber: c.pageNumber,
    }));
  }
}

export async function generateQuiz(documentIds?: string[]): Promise<QuizQuestion[]> {
  const citations = await vectorSearch('Core facts questions exam review topics', documentIds, 5);

  if (citations.length === 0) {
    return [];
  }

  const contextText = citations
    .map((c, idx) => `[Source ${idx + 1}] (File: ${c.filename}):\n${c.passageSnippet}`)
    .join('\n\n');

  const prompt = `Generate 3 multiple-choice quiz questions based strictly on these passages.
Excerpts:
${contextText}

Return a JSON array of objects with keys:
- "question" (string)
- "options" (array of 4 strings)
- "correctAnswerIndex" (number 0-3)
- "explanation" (string)
- "sourceIndex" (number 0-based index of the source)
Return valid JSON only.`;

  const responseText = await generateGeminiText(prompt, 'You are an academic quiz generator. Return valid JSON array only.');

  try {
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const items = JSON.parse(cleaned);
    return items.map((item: any, idx: number) => {
      const src = citations[item.sourceIndex || 0] || citations[0];
      return {
        id: `q-${idx}-${Date.now()}`,
        question: item.question,
        options: item.options || ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswerIndex: typeof item.correctAnswerIndex === 'number' ? item.correctAnswerIndex : 0,
        explanation: item.explanation || 'Grounded in course notes.',
        citation: src,
      };
    });
  } catch (e) {
    return citations.slice(0, 3).map((c, idx) => ({
      id: `q-${idx}-${Date.now()}`,
      question: `According to ${c.filename}, which statement is accurate?`,
      options: ['Statement A', 'Statement B', 'Statement C', 'Statement D'],
      correctAnswerIndex: 0,
      explanation: c.passageSnippet.slice(0, 100),
      citation: c,
    }));
  }
}

export function gradeQuiz(
  questions: QuizQuestion[],
  answers: { questionId: string; selectedOptionIndex: number }[]
): QuizResult {
  let score = 0;
  const feedback = questions.map((q) => {
    const userAns = answers.find((a) => a.questionId === q.id);
    const selectedOptionIndex = userAns ? userAns.selectedOptionIndex : -1;
    const isCorrect = selectedOptionIndex === q.correctAnswerIndex;
    if (isCorrect) score++;

    return {
      questionId: q.id,
      isCorrect,
      selectedOptionIndex,
      correctOptionIndex: q.correctAnswerIndex,
      explanation: q.explanation,
      citation: q.citation,
    };
  });

  return {
    score,
    total: questions.length,
    feedback,
  };
}
