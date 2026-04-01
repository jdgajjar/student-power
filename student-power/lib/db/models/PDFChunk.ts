/**
 * PDFChunk Model — RAG (Retrieval-Augmented Generation) Storage
 *
 * Each document stored in this collection represents one text chunk
 * extracted from a PDF during upload.  Only the relevant top-K chunks
 * (not the full PDF) are forwarded to the AI, which dramatically cuts
 * token usage.
 *
 * Token savings example:
 *   BEFORE: full PDF (~8 000–10 000 chars) sent every request
 *   AFTER : 3–5 chunks (~300–500 words each) = ~1 500–2 500 chars
 *   Savings: ~70–85 % fewer input tokens per AI request
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IPDFChunk extends Document {
  /** References the PDF document this chunk belongs to */
  pdfId: mongoose.Types.ObjectId;

  /** The actual text content of this chunk (300–500 words) */
  chunkText: string;

  /**
   * Zero-based index of this chunk within the PDF.
   * Useful for ordering reconstructed context windows.
   */
  chunkIndex: number;

  /**
   * Optional: page number(s) from which this chunk was extracted.
   * Stored as a comma-separated string, e.g. "1" or "2,3".
   */
  pageNumbers?: string;

  /** Word count of this chunk – kept for fast token-budget calculations */
  wordCount: number;

  /** ISO timestamp of when this chunk was stored */
  createdAt: Date;
}

const PDFChunkSchema = new Schema<IPDFChunk>(
  {
    pdfId: {
      type: Schema.Types.ObjectId,
      ref: 'PDF',
      required: [true, 'pdfId is required'],
      index: true, // index for fast retrieval by pdfId
    },

    chunkText: {
      type: String,
      required: [true, 'chunkText is required'],
      trim: true,
    },

    chunkIndex: {
      type: Number,
      required: [true, 'chunkIndex is required'],
      min: 0,
    },

    pageNumbers: {
      type: String,
      default: '',
    },

    wordCount: {
      type: Number,
      default: 0,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Disable automatic `__v` field to keep documents lean
    versionKey: false,
  }
);

// ── Compound index: pdfId + chunkIndex ensures uniqueness and fast ordered fetch
PDFChunkSchema.index({ pdfId: 1, chunkIndex: 1 }, { unique: true });

/**
 * Full-text search index on chunkText.
 * MongoDB text search is used as the retrieval strategy (keyword matching).
 * This is the backbone of the RAG retrieval layer — only relevant chunks
 * are scored and returned, not the full document.
 */
PDFChunkSchema.index({ chunkText: 'text' });

export default mongoose.models.PDFChunk ||
  mongoose.model<IPDFChunk>('PDFChunk', PDFChunkSchema);
