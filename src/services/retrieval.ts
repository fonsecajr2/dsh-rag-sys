import { connectToDatabase } from './db';
import { generateQueryEmbedding } from './gemini';
import { ChunkRecord, Citation } from '../types';

export async function vectorSearch(
  query: string,
  documentIds?: string[],
  topK: number = 4
): Promise<Citation[]> {
  const { db } = await connectToDatabase();
  const chunksCollection = db.collection<ChunkRecord>('chunks');

  const queryEmbedding = await generateQueryEmbedding(query);

  try {
    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: topK * 10,
          limit: topK,
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

    const results = await chunksCollection.aggregate<ChunkRecord & { score: number }>(pipeline).toArray();

    return results.map((r) => ({
      chunkId: r.id,
      documentId: r.documentId,
      filename: r.filename,
      pageNumber: r.pageNumber,
      passageSnippet: r.content,
      score: r.score,
    }));
  } catch (error) {
    console.warn('MongoDB Atlas Vector Search query failed or index not ready. Falling back to collection scan / mock retrieval:', error);

    const queryDoc: any = {};
    if (documentIds && documentIds.length > 0) {
      queryDoc.documentId = { $in: documentIds };
    }

    const allChunks = await chunksCollection.find(queryDoc).limit(topK).toArray();
    return allChunks.map((r) => ({
      chunkId: r.id,
      documentId: r.documentId,
      filename: r.filename,
      pageNumber: r.pageNumber,
      passageSnippet: r.content,
      score: 1.0,
    }));
  }
}
