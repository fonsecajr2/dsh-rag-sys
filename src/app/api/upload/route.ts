import { NextResponse } from 'next/server';
import {
  ingestDocument,
  createVideoDocument,
  ingestVideoSegments,
} from '../../../services/ingestion';
import { parseSubtitles } from '../../../services/video';

const MAX_DOCUMENT_SIZE = 15 * 1024 * 1024; // PDF / TXT
const MAX_SUBTITLE_SIZE = 5 * 1024 * 1024;  // VTT / SRT

type FileKind = 'pdf' | 'txt' | 'subtitle';

function getFileKind(file: File): FileKind | null {
  const name = file.name.toLowerCase();

  // Check extensions first: browsers often report odd MIME types for .vtt/.srt
  if (name.endsWith('.vtt') || name.endsWith('.srt')) return 'subtitle';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type === 'text/plain' || name.endsWith('.txt')) return 'txt';
  return null;
}

async function handleDocument(file: File, kind: 'pdf' | 'txt') {
  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json({ error: 'File size exceeds 15MB limit' }, { status: 400 });
  }

  const mimeType = kind === 'pdf' ? 'application/pdf' : 'text/plain';
  const buffer = Buffer.from(await file.arrayBuffer());
  const doc = await ingestDocument(file.name, buffer, mimeType);

  return NextResponse.json({ success: true, document: doc });
}

async function handleSubtitles(file: File) {
  if (file.size > MAX_SUBTITLE_SIZE) {
    return NextResponse.json({ error: 'Subtitle file exceeds 5MB limit' }, { status: 400 });
  }

  const text = await file.text();
  const segments = parseSubtitles(text);

  if (segments.length === 0) {
    return NextResponse.json(
      { error: 'No subtitles found. Check that the file is a valid .vtt or .srt.' },
      { status: 400 }
    );
  }

  const doc = await createVideoDocument({
    filename: file.name,
    fileSize: file.size,
    mimeType: 'text/vtt',
  });

  // Not awaited: the response returns now and the library shows "processing".
  // The error is already saved on the document by ingestVideoSegments.
  ingestVideoSegments(doc.id, doc.filename, segments).catch((err) =>
    console.error('Video ingestion failed:', err)
  );

  return NextResponse.json({ success: true, document: doc });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const kind = getFileKind(file);
    if (!kind) {
      return NextResponse.json(
        { error: 'Only PDF, TXT, VTT and SRT files are supported' },
        { status: 400 }
      );
    }

    if (kind === 'subtitle') {
      return await handleSubtitles(file);
    }
    return await handleDocument(file, kind);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}