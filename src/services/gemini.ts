import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || 'mock-api-key';
const genAI = new GoogleGenerativeAI(apiKey);

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

export async function generateEmbeddings(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return new Array(EMBEDDING_DIMENSIONS).fill(0.1);
  }

  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT' as any,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    } as any);

    const values = result.embedding.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid embedding dimensions received: expected ${EMBEDDING_DIMENSIONS}, got ${values?.length}`);
    }
    return values;
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw new Error(`Failed to generate embedding from Gemini API: ${(error as Error).message}`);
  }
}

export async function generateQueryEmbedding(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return new Array(EMBEDDING_DIMENSIONS).fill(0.1);
  }

  try {
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent({
      content: { role: 'user', parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY' as any,
      outputDimensionality: EMBEDDING_DIMENSIONS,
    } as any);

    const values = result.embedding.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Invalid query embedding dimensions received: expected ${EMBEDDING_DIMENSIONS}, got ${values?.length}`);
    }
    return values;
  } catch (error) {
    console.error('Query embedding generation error:', error);
    throw new Error(`Failed to generate query embedding from Gemini API: ${(error as Error).message}`);
  }
}

export async function generateGeminiText(prompt: string, systemInstruction?: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return 'Mock Gemini response: Please configure GEMINI_API_KEY for live AI responses.';
  }

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
    });

    const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini text generation error:', error);
    throw new Error(`Failed to generate text from Gemini API: ${(error as Error).message}`);
  }
}
