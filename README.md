# AI-Powered Study Companion (RAG-First MVP)

A secure, high-performance, source-grounded learning application built from scratch using **Next.js**, **TypeScript**, **LangChain.js**, **MongoDB Atlas Vector Search**, and the **Gemini API**.

---

## Architecture & Features

1. **Document Ingestion (`src/services/ingestion.ts`)**:
   - Supports PDF (`pdf-parse`) and TXT files with server-side validation and size limits (15MB).
   - Recursive text chunking with configurable overlap (1000 chars chunk, 200 chars overlap).
   - Metadata preservation (filenames, document IDs, chunk indexes, page numbers).
   - Duplicate detection by filename and size.
   - Cascading deletion of documents and their corresponding embedding chunks.

2. **Vector Retrieval (`src/services/retrieval.ts`)**:
   - Integrates with **MongoDB Atlas Vector Search** using `gemini-embedding-001` (768 dimensions, cosine similarity).
   - Supports filtering searches to authorized/selected student documents.
   - Robust error fallback for disconnected environments.

3. **Grounded RAG Pipeline (`src/services/rag.ts`)**:
   - Secure server-side query processing using Gemini (`gemini-3.5-flash-lite`).
   - Strict grounding prompt templates that instruct the model to answer exclusively from provided course material.
   - Automatic citation validation linking answers to verified chunk passages and source filenames.
   - Insufficient evidence handling.

4. **Source-Grounded Study Tools (`src/services/study.ts`)**:
   - **Summaries:** Executive summaries and key bullet points grounded in retrieved passages.
   - **Flashcards:** Q&A study cards with review navigation and source linkage.
   - **Quizzes:** Multiple-choice question generation, auto-grading, and detailed answer explanations.

5. **User Interface (`src/app/page.tsx`)**:
   - Responsive dashboard featuring Q&A chat with clickable source citation modal previews, document library management, scope filters, and study tool panels.

---

## Setup & Installation

1. Clone or open the repository in the workspace.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Configure environment variables in `.env`:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
   MONGODB_DB_NAME=study_companion
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

---

## MongoDB Atlas Vector Search Index Configuration

To enable vector search in MongoDB Atlas, create a Vector Search index on the `chunks` collection named `vector_index`:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "documentId"
    }
  ]
}
```

---

## Running the Application & Tests

- **Development Server:**
  ```bash
  pnpm dev
  ```
- **Unit Tests:**
  ```bash
  pnpm test
  ```
- **Type Check:**
  ```bash
  pnpm exec tsc --noEmit
  ```
