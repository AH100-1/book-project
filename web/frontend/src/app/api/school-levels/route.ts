import { NextResponse } from 'next/server';
import { SCHOOL_LEVELS } from '@/lib/read365';

export async function GET() {
  return NextResponse.json({ school_levels: SCHOOL_LEVELS });
}
