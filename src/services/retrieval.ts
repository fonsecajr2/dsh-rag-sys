import { connectToDatabase } from './db';
import { generateQueryEmbedding } from './gemini';
import { ChunkRecord, Citation } from '../types';

/**
 * Round-robin: take the best chunk from each document, then the
 * next best from each, and so on, until we have topK results.
 */
function diversify(items: Citation[], topK: number): Citation[] {
  const byDoc = new Map<string, Citation[]>();

  for (const c of items) {
    if (!byDoc.has(c.documentId)) byDoc.set(c.documentId, []);
    byDoc.get(c.documentId)!.push(c);
  }

  const queues = [...byDoc.values()];
  const out: Citation[] = [];

  while (out.length < topK && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < topK) out.push(next);
    }
  }

  return out;
}

export async function vectorSearch(
  query: string,
  documentIds?: string[],
  topK: number = 4
): Promise<Citation[]> {
  const { db } = await connectToDatabase();
  const chunksCollection = db.collection<ChunkRecord>('chunks');

  const queryEmbedding = await generateQueryEmbedding(query);

  // Over-fetch when several documents are selected, so every PDF
  // has a chance to appear before we trim down to topK.
  const multiDoc = !!documentIds && documentIds.length > 1;
  const fetchK = multiDoc ? topK * 3 : topK;

  try {
    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: fetchK * 10,
          limit: fetchK,
        },
      },
      {
        $project: {
          id: 1,
          documentId: 1,
          filename: 1,
          pageNumber: 1,
          content: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    if (documentIds && documentIds.length > 0) {
      pipeline[0].$vectorSearch.filter = {
        documentId: { $in: documentIds },
      };
    }

    const results = await chunksCollection
      .aggregate<ChunkRecord & { score: number }>(pipeline)
      .toArray();

    const mapped: Citation[] = results.map((r) => ({
      chunkId: r.id,
      documentId: r.documentId,
      filename: r.filename,
      pageNumber: r.pageNumber,
      passageSnippet: r.content,
      score: r.score,
    }));

    return multiDoc ? diversify(mapped, topK) : mapped.slice(0, topK);
  } catch (error) {
    console.warn(
      'MongoDB Atlas Vector Search query failed or index not ready. Falling back to collection scan / mock retrieval:',
      error
    );

    const queryDoc: any = {};
    if (documentIds && documentIds.length > 0) {
      queryDoc.documentId = { $in: documentIds };
    }

    const allChunks = await chunksCollection.find(queryDoc).limit(fetchK).toArray();

    const mapped: Citation[] = allChunks.map((r) => ({
      chunkId: r.id,
      documentId: r.documentId,
      filename: r.filename,
      pageNumber: r.pageNumber,
      passageSnippet: r.content,
      score: 1.0,
    }));

    return multiDoc ? diversify(mapped, topK) : mapped.slice(0, topK);
  }
}