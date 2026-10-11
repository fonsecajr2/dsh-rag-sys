import { NextResponse } from 'next/server';
import { answerQuestion } from '../../../services/rag';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { question, documentIds } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const result = await answerQuestion(question, documentIds);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
