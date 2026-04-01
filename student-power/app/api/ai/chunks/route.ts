/**
 * /api/ai/chunks — RAG Chunk Storage & Retrieval
 *
 * ═══════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════
 *
 * This route is the server-side backbone of the RAG pipeline.
 * It has two responsibilities:
 *
 *   POST  — Called ONCE per PDF (on upload / first open).
 *            Receives extracted text, cleans it, splits it into
 *            300–500-word chunks, and persists them to MongoDB.
 *
 *   GET   — Called on every user question.
 *            Queries MongoDB using full-text search to find the
 *            top-K most relevant chunks for the question.
 *            Returns ONLY those chunks — NOT the full PDF text.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TOKEN SAVING (server side)
 * ═══════════════════════════════════════════════════════════════════
 *
 *   BEFORE: client sent pdfText (up to 10 000 chars) in every /api/ai/chat request
 *   AFTER:
 *     • pdfText is stored once in MongoDB (not re-sent on every question)
 *     • Only 3–5 relevant chunk strings are returned per question
 *     • Chunk strings total ≈ 1 500–2 500 chars (vs 10 000 before)
 *     • The /api/ai/chat route receives only the selected chunks, not full text
 *
 * ═══════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════
 *
 *   POST /api/ai/chunks
 *   Body: { pdfId: string, pdfText: string }
 *   • Cleans and chunks the text
 *   • Upserts chunks into MongoDB (safe to call multiple times)
 *   • Returns: { success, chunkCount }
 *
 *   GET /api/ai/chunks?pdfId=<id>&question=<text>&topK=<number>
 *   • Retrieves top-K relevant chunks from MongoDB for a question
 *   • Uses MongoDB $text search (full-text index on chunkText field)
 *   • Falls back to keyword scoring if $text search returns no results
 *   • Returns: { success, chunks: TextChunk[], retrievalMethod }
 *
 *   DELETE /api/ai/chunks?pdfId=<id>
 *   • Removes all chunks for a PDF (called when the PDF is deleted)
 *   • Returns: { success, deletedCount }
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongodb';
import PDFChunk from '@/lib/db/models/PDFChunk';
import {
  cleanExtractedText,
  splitIntoChunks,
  retrieveRelevantChunks,
  TextChunk,
} from '@/lib/ai/pdf-analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── POST: Store chunks ───────────────────────────────────────────────────────

/**
 * POST /api/ai/chunks
 *
 * Called when a PDF is opened for the first time in the viewer.
 * The client extracts the raw text (using pdf.js), sends it here,
 * and we store the chunks in MongoDB.
 *
 * Idempotent: if chunks already exist for this pdfId they are deleted
 * and re-inserted (avoids duplicates if called again with updated text).
 *
 * TOKEN SAVING:
 *   By storing chunks server-side, subsequent AI requests need only
 *   send a short question string + pdfId — not the entire PDF text.
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { pdfId, pdfText } = body;

    if (!pdfId || typeof pdfId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'pdfId is required' },
        { status: 400 }
      );
    }

    if (!pdfText || typeof pdfText !== 'string' || pdfText.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'pdfText is required and must be non-empty' },
        { status: 400 }
      );
    }

    // ── 1. Clean the extracted text ──────────────────────────────────────────
    // Removes headers, footers, page numbers, and excessive whitespace.
    // TOKEN SAVING: cleaning reduces raw text by ~10–20 % before chunking.
    const cleanedText = cleanExtractedText(pdfText);

    if (cleanedText.length < 50) {
      return NextResponse.json(
        { success: false, error: 'PDF text is too short after cleaning' },
        { status: 400 }
      );
    }

    // ── 2. Split into chunks ─────────────────────────────────────────────────
    // Word-bounded chunks of ~400 words with 30-word overlap.
    const chunks: TextChunk[] = splitIntoChunks(cleanedText);

    if (chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate chunks from PDF text' },
        { status: 422 }
      );
    }

    // ── 3. Upsert chunks (delete old, insert new) ────────────────────────────
    // deleteMany first ensures idempotency — safe to re-process the same PDF.
    await PDFChunk.deleteMany({ pdfId });

    const chunkDocs = chunks.map((chunk) => ({
      pdfId,
      chunkText: chunk.chunkText,
      chunkIndex: chunk.chunkIndex,
      wordCount: chunk.wordCount,
      pageNumbers: chunk.pageNumbers || '',
    }));

    await PDFChunk.insertMany(chunkDocs, { ordered: false });

    console.log(
      `✅ Stored ${chunks.length} chunks for PDF ${pdfId} (${cleanedText.length} chars cleaned)`
    );

    return NextResponse.json(
      {
        success: true,
        chunkCount: chunks.length,
        message: `Stored ${chunks.length} chunks for PDF ${pdfId}`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('❌ Chunk storage error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to store chunks' },
      { status: 500 }
    );
  }
}

// ─── GET: Retrieve relevant chunks ───────────────────────────────────────────

/**
 * GET /api/ai/chunks?pdfId=<id>&question=<text>&topK=<number>
 *
 * Primary retrieval layer for the RAG pipeline.
 *
 * Strategy 1 — MongoDB $text search (preferred):
 *   MongoDB's built-in full-text index scores documents by term frequency
 *   and returns the most relevant chunks in O(log n) time.
 *
 * Strategy 2 — In-memory keyword scoring (fallback):
 *   If $text search returns 0 results (e.g., very short query), we fetch
 *   all chunks for the PDF and run our lightweight keyword scorer.
 *
 * TOKEN SAVING:
 *   Returns at most topK (default 5) chunks.
 *   These ~2 000 chars replace the ~10 000-char full-text payload.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const pdfId = searchParams.get('pdfId');
    const question = searchParams.get('question') || '';
    const topK = Math.min(10, Math.max(1, parseInt(searchParams.get('topK') || '5', 10)));

    if (!pdfId) {
      return NextResponse.json(
        { success: false, error: 'pdfId query parameter is required' },
        { status: 400 }
      );
    }

    // Validate that chunks exist for this pdfId
    const totalChunks = await PDFChunk.countDocuments({ pdfId });

    if (totalChunks === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No chunks found for this PDF. Please re-open the PDF to process it.',
          code: 'CHUNKS_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    let chunks: TextChunk[] = [];
    let retrievalMethod = 'text_search';

    if (question.trim().length > 0) {
      // ── Strategy 1: MongoDB full-text search ────────────────────────────────
      // $text uses the index created on chunkText for fast keyword scoring.
      // { score: { $meta: 'textScore' } } attaches the relevance score.
      try {
        const textSearchResults = await PDFChunk.find(
          {
            pdfId,
            $text: { $search: question },
          },
          { score: { $meta: 'textScore' }, chunkText: 1, chunkIndex: 1, wordCount: 1, pageNumbers: 1 }
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(topK)
          .lean();

        if (textSearchResults.length > 0) {
          // Re-sort by chunkIndex so context is in document order for the AI
          chunks = (textSearchResults as any[])
            .sort((a, b) => a.chunkIndex - b.chunkIndex)
            .map((doc) => ({
              chunkIndex: doc.chunkIndex,
              chunkText: doc.chunkText,
              wordCount: doc.wordCount,
              pageNumbers: doc.pageNumbers,
            }));

          retrievalMethod = 'mongodb_text_search';
        }
      } catch (textSearchError) {
        // Text index may not be created yet — fall through to keyword fallback
        console.warn('⚠️ MongoDB text search failed, using keyword fallback:', textSearchError);
      }

      // ── Strategy 2: In-memory keyword scoring fallback ──────────────────────
      if (chunks.length === 0) {
        const allChunks = await PDFChunk.find({ pdfId })
          .select('chunkText chunkIndex wordCount pageNumbers')
          .sort({ chunkIndex: 1 })
          .lean();

        const chunkList: TextChunk[] = (allChunks as any[]).map((doc) => ({
          chunkIndex: doc.chunkIndex,
          chunkText: doc.chunkText,
          wordCount: doc.wordCount,
          pageNumbers: doc.pageNumbers,
        }));

        chunks = retrieveRelevantChunks(question, chunkList, topK);
        retrievalMethod = 'keyword_scoring';
      }
    } else {
      // No question provided — return first topK chunks (e.g. for summarize)
      const firstChunks = await PDFChunk.find({ pdfId })
        .select('chunkText chunkIndex wordCount pageNumbers')
        .sort({ chunkIndex: 1 })
        .limit(topK)
        .lean();

      chunks = (firstChunks as any[]).map((doc) => ({
        chunkIndex: doc.chunkIndex,
        chunkText: doc.chunkText,
        wordCount: doc.wordCount,
        pageNumbers: doc.pageNumbers,
      }));

      retrievalMethod = 'first_n_chunks';
    }

    const totalWords = chunks.reduce((sum, c) => sum + (c.wordCount || 0), 0);

    return NextResponse.json(
      {
        success: true,
        chunks,
        meta: {
          retrievalMethod,
          chunkCount: chunks.length,
          totalWords,
          totalChunksInPdf: totalChunks,
          // Approximate token count: 1 word ≈ 1.33 tokens
          estimatedTokens: Math.round(totalWords * 1.33),
        },
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error: any) {
    console.error('❌ Chunk retrieval error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve chunks' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove chunks for a PDF ─────────────────────────────────────────

/**
 * DELETE /api/ai/chunks?pdfId=<id>
 *
 * Called when a PDF document is deleted from the system.
 * Cleans up all associated chunk documents to avoid orphaned data.
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const pdfId = searchParams.get('pdfId');

    if (!pdfId) {
      return NextResponse.json(
        { success: false, error: 'pdfId query parameter is required' },
        { status: 400 }
      );
    }

    const result = await PDFChunk.deleteMany({ pdfId });

    return NextResponse.json(
      {
        success: true,
        deletedCount: result.deletedCount,
        message: `Deleted ${result.deletedCount} chunks for PDF ${pdfId}`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ Chunk deletion error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete chunks' },
      { status: 500 }
    );
  }
}
