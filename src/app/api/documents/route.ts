import { NextResponse } from 'next/server';
import { connectToDatabase } from '../../../services/db';
import { DocumentRecord } from '../../../types';
import { deleteDocument } from '../../../services/ingestion';

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const documents = await db.collection<DocumentRecord>('documents').find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const success = await deleteDocument(id);
    if (!success) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
