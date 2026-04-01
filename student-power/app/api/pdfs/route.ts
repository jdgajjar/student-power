import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongodb';
import PDF from '@/lib/db/models/PDF';

// Disable Next.js caching so we always query the live database
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Number of PDFs returned per page when pagination is requested */
const DEFAULT_PAGE_SIZE = 10;

/**
 * GET /api/pdfs
 *
 * Query parameters
 * ─────────────────────────────────────────────────────────
 * subjectId  – (optional) filter PDFs belonging to a specific subject
 * category   – (optional) filter by category (notes | assignments | papers | other)
 * search     – (optional) full-text search on title and description (case-insensitive)
 * page       – (optional) 1-based page number; enables pagination
 * limit      – (optional) results per page (default: 10, max: 100)
 * paginate   – (optional) set to "true" to force paginated response even for page 1
 *
 * When `page` or `paginate=true` is present the response includes
 * pagination metadata:
 *   { success, data, pagination: { total, page, limit, totalPages, hasNextPage, hasPrevPage } }
 *
 * Without those params the original flat response is preserved for
 * backwards compatibility with non-admin routes (e.g. the public subject PDF list).
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);

    // ── Filter params ──────────────────────────────────
    const subjectId = searchParams.get('subjectId');
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // ── Pagination params ──────────────────────────────
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const paginateParam = searchParams.get('paginate');

    // Decide whether to paginate:
    // • explicit page= query → paginate
    // • paginate=true        → paginate (useful for admin panel first load)
    // • subjectId only       → legacy flat response (public subject pages)
    const shouldPaginate = pageParam !== null || paginateParam === 'true';

    // ── Build MongoDB query ────────────────────────────
    const query: Record<string, any> = {};

    if (subjectId) query.subjectId = subjectId;
    if (category && category !== 'all') query.category = category;
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    if (shouldPaginate) {
      // ── Paginated path ─────────────────────────────────
      const page = Math.max(1, parseInt(pageParam || '1', 10));
      const limit = Math.min(
        100,
        Math.max(1, parseInt(limitParam || String(DEFAULT_PAGE_SIZE), 10))
      );
      const skip = (page - 1) * limit;

      // Run count and data fetch in parallel for better performance
      const [total, pdfs] = await Promise.all([
        PDF.countDocuments(query),
        PDF.find(query)
          .select('-__v')
          .sort({ uploadedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return NextResponse.json(
        {
          success: true,
          data: pdfs,
          pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    } else {
      // ── Legacy flat path (backwards-compatible) ────────
      const pdfs = await PDF.find(query)
        .select('-__v')
        .sort({ uploadedAt: -1 })
        .lean();

      return NextResponse.json(
        { success: true, data: pdfs },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    }
  } catch (error: any) {
    console.error('Error fetching PDFs:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch PDFs' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pdfs
 * Create a new PDF record (file upload is handled by /api/pdfs/upload).
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    const pdf = await PDF.create(body);

    return NextResponse.json(
      {
        success: true,
        data: pdf,
        message: 'PDF metadata created successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating PDF:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create PDF' },
      { status: 500 }
    );
  }
}
