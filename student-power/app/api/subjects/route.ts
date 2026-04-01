import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongodb';
import Subject from '@/lib/db/models/Subject';
import { slugify } from '@/lib/utils/slugify';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/subjects
 *
 * Query parameters
 * ─────────────────────────────────────────────────────────
 * courseId    – (optional) filter subjects for a specific course
 * semesterId  – (optional) filter subjects for a specific semester
 * search      – (optional) case-insensitive search on name, code, description
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const semesterId = searchParams.get('semesterId');
    const search = searchParams.get('search');

    const query: Record<string, any> = {};
    if (courseId) query.courseId = courseId;
    if (semesterId) query.semesterId = semesterId;
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { code: searchRegex },
        { description: searchRegex },
      ];
    }

    const subjects = await Subject.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      { success: true, data: subjects },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Error fetching subjects:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch subjects' },
      { status: 500 }
    );
  }
}

// POST - Create a new subject
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    // Generate slug from name
    const slug = slugify(body.name);

    // Create subject
    const subject = await Subject.create({
      ...body,
      slug,
    });

    return NextResponse.json(
      {
        success: true,
        data: subject,
        message: 'Subject created successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating subject:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create subject' },
      { status: 500 }
    );
  }
}
