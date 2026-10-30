import pdfParse from 'pdf-parse';
import { connectToDatabase } from './db';
import { generateEmbeddings } from './gemini';
import { DocumentRecord, ChunkRecord } from '../types';
import { ObjectId } from 'mongodb';
import { chunkSegments } from './video';
import { TranscriptSegment } from '../types';

type PendingChunk = {
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  startSeconds?: number;
  endSeconds?: number;
};

async function embedAndStoreChunks(
  docId: string,
  filename: string,
  chunks: PendingChunk[]
): Promise<number> {
  const { db } = await connectToDatabase();
  const chunksCollection = db.collection<ChunkRecord>('chunks');

  const chunkRecords: ChunkRecord[] = [];
  for (const chunk of chunks) {
    const embedding = await generateEmbeddings(chunk.content);
    if (!embedding || embedding.length !== 768) {
      throw new Error(
        `Generated embedding has incorrect dimensions: expected 768, got ${embedding?.length}`
      );
    }
    chunkRecords.push({
      id: new ObjectId().toString(),
      documentId: docId,
      filename,
      pageNumber: chunk.pageNumber,
      startSeconds: chunk.startSeconds,
      endSeconds: chunk.endSeconds,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding,
      createdAt: new Date(),
    });
  }

  if (chunkRecords.length > 0) {
    await chunksCollection.insertMany(chunkRecords);
  }
  return chunkRecords.length;
}

export function chunkText(
  text: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): { content: string; chunkIndex: number; pageNumber?: number }[] {
  const cleanText = text.replace(/\r\n/g, '\n');
  const chunks: { content: string; chunkIndex: number; pageNumber?: number }[] = [];
  
  let index = 0;
  let chunkIndex = 0;

  while (index < cleanText.length) {
    const end = Math.min(index + chunkSize, cleanText.length);
    let chunkContent = cleanText.slice(index, end);

    // Try to break at a newline or space if possible
    if (end < cleanText.length) {
      const lastNewline = chunkContent.lastIndexOf('\n');
      if (lastNewline > chunkSize * 0.5) {
        chunkContent = chunkContent.slice(0, lastNewline);
        index += lastNewline + 1;
      } else {
        const lastSpace = chunkContent.lastIndexOf(' ');
        if (lastSpace > chunkSize * 0.5) {
          chunkContent = chunkContent.slice(0, lastSpace);
          index += lastSpace + 1;
        } else {
          index = end;
        }
      }
    } else {
      index = end;
    }

    if (chunkContent.trim().length > 0) {
      chunks.push({
        content: chunkContent.trim(),
        chunkIndex: chunkIndex++,
      });
    }

    if (index >= cleanText.length) {
      break;
    }

    // Step back by overlap
    index = Math.max(0, index - chunkOverlap);
  }

  return chunks;
}

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; pageNumber?: number }[]> {
  if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
    try {
      const parsed = await pdfParse(buffer, {
        // Prevent default test file lookup if buffer is empty/test build
        max: 0
      } as any).catch(async () => {
        return await pdfParse(buffer);
      });
      const text = parsed.text ? parsed.text.trim() : '';
      if (!text || text.length < 5) {
        // If during next build prerender, return fallback text instead of failing build
        if (process.env.NEXT_PHASE === 'phase-production-build') {
          return [{ text: 'Placeholder build text for PDF preview.' }];
        }
        throw new Error('The uploaded PDF appears to be empty or scanned (image-only without text layer). OCR is required for scanned PDFs.');
      }
      return [{ text }];
    } catch (error) {
      const msg = (error as Error).message;
      if (process.env.NEXT_PHASE === 'phase-production-build') {
        return [{ text: 'Placeholder build text for PDF preview.' }];
      }
      if (msg.includes('empty or scanned') || msg.includes('OCR')) {
        throw error;
      }
      throw new Error(`Failed to parse PDF file: ${msg}`);
    }
  } else if (mimeType === 'text/plain' || filename.endsWith('.txt')) {
    const text = buffer.toString('utf-8').trim();
    if (!text || text.length < 2) {
      throw new Error('The uploaded text file is empty.');
    }
    return [{ text }];
  } else {
    throw new Error(`Unsupported file type: ${mimeType}. Only PDF and TXT are supported.`);
  }
}

export async function ingestDocument(
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<DocumentRecord> {
  const { db } = await connectToDatabase();
  const documentsCollection = db.collection<DocumentRecord>('documents');

  // Check duplicate by filename and size
  const existing = await documentsCollection.findOne({ filename, fileSize: buffer.length });
  if (existing) {
    if (existing.status === 'indexed' || existing.status === 'processing') {
      return existing;
    }
    if (existing.status === 'error') {
      // Remove failed doc record to allow re-ingestion
      await documentsCollection.deleteOne({ id: existing.id });
    }
  }

  const docId = new ObjectId().toString();
  const newDoc: DocumentRecord = {
    id: docId,
    filename,
    fileSize: buffer.length,
    mimeType,
    status: 'processing',
    chunkCount: 0,
    createdAt: new Date(),
    sourceType: mimeType === 'application/pdf' ? 'pdf' : 'txt',
  };

  await documentsCollection.insertOne(newDoc);

  try {
    const extractedPages = await extractTextFromFile(buffer, mimeType, filename);
    const allChunks: PendingChunk[] = [];

    let globalChunkIdx = 0;
    for (const page of extractedPages) {
      const pageChunks = chunkText(page.text, 1000, 200);
      for (const pc of pageChunks) {
        allChunks.push({
          content: pc.content,
          chunkIndex: globalChunkIdx++,
          pageNumber: page.pageNumber,
        });
      }
    }

    if (allChunks.length === 0) {
      throw new Error('No text content could be extracted from the document.');
    }

    const count = await embedAndStoreChunks(docId, filename, allChunks);

    await documentsCollection.updateOne(
      { id: docId },
      { $set: { status: 'indexed', chunkCount: count } }
    );

    newDoc.status = 'indexed';
    newDoc.chunkCount = count;
    return newDoc;
  } catch (error) {
    await documentsCollection.updateOne(
      { id: docId },
      { $set: { status: 'error', errorMessage: (error as Error).message } }
    );
    throw error;
  }
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  const { db } = await connectToDatabase();
  const documentsCollection = db.collection<DocumentRecord>('documents');
  const chunksCollection = db.collection<ChunkRecord>('chunks');

  await chunksCollection.deleteMany({ documentId });
  const result = await documentsCollection.deleteOne({ id: documentId });
  return result.deletedCount ? result.deletedCount > 0 : false;
}

export async function createVideoDocument(params: {
  filename: string;
  fileSize: number;
  mimeType: string;
  videoUrl?: string;
  videoFilePath?: string;
}): Promise<DocumentRecord> {
  const { db } = await connectToDatabase();
  const documentsCollection = db.collection<DocumentRecord>('documents');

  const doc: DocumentRecord = {
    id: new ObjectId().toString(),
    filename: params.filename,
    fileSize: params.fileSize,
    mimeType: params.mimeType,
    status: 'processing',
    chunkCount: 0,
    createdAt: new Date(),
    sourceType: 'video',
    videoUrl: params.videoUrl,
    videoFilePath: params.videoFilePath,
  };
  await documentsCollection.insertOne(doc);
  return doc;
}

export async function ingestVideoSegments(
  docId: string,
  filename: string,
  segments: TranscriptSegment[]
): Promise<void> {
  const { db } = await connectToDatabase();
  const documentsCollection = db.collection<DocumentRecord>('documents');

  try {
    const videoChunks = chunkSegments(segments);
    if (videoChunks.length === 0) {
      throw new Error('The transcript is empty, so there is nothing to index.');
    }

    const pending: PendingChunk[] = videoChunks.map((c, i) => ({
      content: c.text,
      chunkIndex: i,
      startSeconds: c.startSeconds,
      endSeconds: c.endSeconds,
    }));

    const count = await embedAndStoreChunks(docId, filename, pending);
    await documentsCollection.updateOne(
      { id: docId },
      { $set: { status: 'indexed', chunkCount: count } }
    );
  } catch (error) {
    await documentsCollection.updateOne(
      { id: docId },
      { $set: { status: 'error', errorMessage: (error as Error).message } }
    );
    throw error;
  }
}
