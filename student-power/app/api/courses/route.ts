import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongodb';
import Course from '@/lib/db/models/Course';
import Semester from '@/lib/db/models/Semester';
import { slugify } from '@/lib/utils/slugify';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/courses
 *
 * Query parameters
 * ─────────────────────────────────────────────────────────
 * universityId – (optional) filter courses for a specific university
 * search       – (optional) case-insensitive search on name, code, description
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const universityId = searchParams.get('universityId');
    const search = searchParams.get('search');

    const query: Record<string, any> = {};
    if (universityId) query.universityId = universityId;
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { code: searchRegex },
        { description: searchRegex },
      ];
    }

    const courses = await Course.find(query)
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(
      { success: true, data: courses },
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
    console.error('Error fetching courses:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch courses' },
      { status: 500 }
    );
  }
}

// Helper function to parse duration and calculate total semesters
function calculateSemesters(duration: string): number {
  // Extract number from duration string (e.g., "4 years", "3 year", "2.5 years")
  const match = duration.match(/(\d+\.?\d*)/);
  if (!match) return 0;

  const years = parseFloat(match[1]);
  // 1 year = 2 semesters
  return Math.floor(years * 2);
}

// POST - Create a new course with automatic semester generation
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    // Generate slug from name
    const slug = slugify(body.name);

    // Create the course
    const course = await Course.create({
      ...body,
      slug,
    });

    // Automatically generate semesters based on duration
    let semestersCreated = 0;
    if (course.duration) {
      const totalSemesters = calculateSemesters(course.duration);

      if (totalSemesters > 0) {
        // Create semesters
        const semesterPromises = [];
        for (let i = 1; i <= totalSemesters; i++) {
          const semesterSlug = slugify(`semester-${i}`);
          semesterPromises.push(
            Semester.create({
              courseId: course._id,
              number: i,
              name: `Semester ${i}`,
              slug: semesterSlug,
            })
          );
        }

        // Wait for all semesters to be created
        await Promise.all(semesterPromises);
        semestersCreated = totalSemesters;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: course,
        message: `Course created successfully with ${semestersCreated} semesters`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create course' },
      { status: 500 }
    );
  }
}
