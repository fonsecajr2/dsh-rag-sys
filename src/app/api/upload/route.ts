import { NextResponse } from 'next/server';
import { ingestDocument } from '../../../services/ingestion';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds 15MB limit' }, { status: 400 });
    }

    const mimeType = file.type || 'text/plain';
    if (mimeType !== 'application/pdf' && mimeType !== 'text/plain' && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF and TXT files are supported' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const doc = await ingestDocument(file.name, buffer, mimeType);

    return NextResponse.json({ success: true, document: doc });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
