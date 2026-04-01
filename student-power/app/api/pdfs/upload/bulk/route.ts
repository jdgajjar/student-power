import { NextRequest, NextResponse } from 'next/server';
import { uploadPDFToCloudinary } from '@/lib/cloudinary/upload';
import { validateFileUpload } from '@/lib/validation/schemas';
import { handleApiError } from '@/lib/utils/errors';
import { checkRateLimit, getClientIp, RateLimitConfigs } from '@/lib/middleware/rateLimit';
import connectDB from '@/lib/db/mongodb';
import PDF from '@/lib/db/models/PDF';

// Configure route segment for large file uploads
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max execution time
export const dynamic = 'force-dynamic'; // Disable caching for uploads

/**
 * POST /api/pdfs/upload/bulk
 *
 * Accepts multipart/form-data with the following fields:
 *   files[]      – one or more PDF file fields (required)
 *   subjectId    – MongoDB ObjectId of the subject (required)
 *   category     – 'notes' | 'assignments' | 'papers' | 'other' (optional, default: 'other')
 *   description  – shared description for all files (optional)
 *                  If empty, each PDF's description defaults to its own filename.
 *
 * Each file becomes a separate PDF record in MongoDB.
 * Title for every record is automatically derived from the filename (without extension).
 *
 * Response shape:
 *   {
 *     success: true,
 *     data: { uploaded: number, failed: number, results: Array<{ fileName, success, error? }> },
 *     message: string
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting ────────────────────────────────────────────────────────
    // Re-use the same upload rate-limit config as single upload (5 req/min per IP)
    // For bulk we treat the entire bulk request as ONE upload request.
    const clientIp = getClientIp(request);
    const rateLimit = checkRateLimit(`pdf-upload-${clientIp}`, RateLimitConfigs.upload);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many upload requests. Please wait before trying again.',
          code: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
          },
        }
      );
    }

    // ── Parse multipart form ──────────────────────────────────────────────────
    const formData = await request.formData();

    const subjectId   = formData.get('subjectId')   as string | null;
    const category    = formData.get('category')    as string | null;
    const description = formData.get('description') as string | null;

    // Validate required fields
    if (!subjectId || subjectId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'subjectId is required', code: 'MISSING_SUBJECT' },
        { status: 400 }
      );
    }

    // Collect all uploaded files – the client sends them as repeated 'files' entries
    const files: File[] = [];
    formData.forEach((value, key) => {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    });

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one PDF file is required', code: 'MISSING_FILES' },
        { status: 400 }
      );
    }

    // ── Validate each file before uploading anything ─────────────────────────
    for (const file of files) {
      const validation = validateFileUpload(file);
      if (!validation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: `Invalid file "${file.name}": ${validation.error}`,
            code: 'INVALID_FILE',
          },
          { status: 400 }
        );
      }
    }

    // ── Connect to DB once for all inserts ───────────────────────────────────
    await connectDB();

    const validCategory = ['notes', 'assignments', 'papers', 'other'].includes(category || '')
      ? (category as 'notes' | 'assignments' | 'papers' | 'other')
      : 'other';

    // ── Process each file sequentially to avoid hammering Cloudinary ─────────
    const results: Array<{ fileName: string; success: boolean; error?: string }> = [];
    let uploadedCount = 0;
    let failedCount   = 0;

    for (const file of files) {
      try {
        // Additional security: verify PDF magic bytes
        const bytes  = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const isPDF =
          buffer[0] === 0x25 &&
          buffer[1] === 0x50 &&
          buffer[2] === 0x44 &&
          buffer[3] === 0x46;

        if (!isPDF) {
          results.push({
            fileName: file.name,
            success:  false,
            error:    'Invalid PDF file format (bad magic bytes)',
          });
          failedCount++;
          continue;
        }

        console.log(`[bulk] Uploading PDF: ${file.name} (${file.size} bytes)`);

        // Upload to Cloudinary (reuse existing helper)
        const cloudinaryResult = await uploadPDFToCloudinary(buffer, file.name);

        console.log(`[bulk] Cloudinary success: ${cloudinaryResult.secure_url}`);

        // Derive title from filename (strip extension)
        const title = file.name.replace(/\.pdf$/i, '').trim() || file.name;

        // Description: use provided value if non-empty, otherwise fall back to filename
        const resolvedDescription =
          description && description.trim() !== '' ? description.trim() : file.name;

        // Create MongoDB record
        await PDF.create({
          subjectId,
          title,
          description: resolvedDescription,
          fileName:    file.name,
          fileUrl:     cloudinaryResult.secure_url,
          fileSize:    cloudinaryResult.bytes,
          cloudinaryPublicId: cloudinaryResult.public_id,
          category:    validCategory,
        });

        results.push({ fileName: file.name, success: true });
        uploadedCount++;
      } catch (fileError: any) {
        console.error(`[bulk] Error processing ${file.name}:`, fileError);
        results.push({
          fileName: file.name,
          success:  false,
          error:    fileError?.message || 'Upload failed',
        });
        failedCount++;
      }
    }

    // ── Return summary ────────────────────────────────────────────────────────
    const allFailed = uploadedCount === 0 && failedCount > 0;
    const status    = allFailed ? 500 : 200;

    return NextResponse.json(
      {
        success: !allFailed,
        data: {
          uploaded: uploadedCount,
          failed:   failedCount,
          results,
        },
        message: allFailed
          ? `All ${failedCount} file(s) failed to upload`
          : failedCount > 0
          ? `${uploadedCount} file(s) uploaded successfully, ${failedCount} failed`
          : `${uploadedCount} file(s) uploaded successfully`,
      },
      {
        status,
        headers: {
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        },
      }
    );
  } catch (error: any) {
    console.error('[bulk] Unexpected error:', error);
    const errorResponse = handleApiError(error);
    return NextResponse.json(
      {
        success: false,
        error:   errorResponse.error,
        code:    errorResponse.code,
      },
      { status: errorResponse.statusCode }
    );
  }
}
