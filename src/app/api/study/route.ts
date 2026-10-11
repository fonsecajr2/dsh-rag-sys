import { NextResponse } from 'next/server';
import { generateSummary, generateFlashcards, generateQuiz, gradeQuiz } from '../../../services/study';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, documentIds, answers, questions } = body;

    if (action === 'summary') {
      const result = await generateSummary(documentIds);
      return NextResponse.json(result);
    } else if (action === 'flashcards') {
      const result = await generateFlashcards(documentIds);
      return NextResponse.json({ flashcards: result });
    } else if (action === 'quiz_generate') {
      const result = await generateQuiz(documentIds);
      return NextResponse.json({ questions: result });
    } else if (action === 'quiz_grade') {
      const result = gradeQuiz(questions, answers);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: 'Invalid study action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
