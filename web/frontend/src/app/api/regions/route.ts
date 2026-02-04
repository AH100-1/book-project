import { NextResponse } from 'next/server';
import { REGIONS } from '@/lib/read365';

export async function GET() {
  return NextResponse.json({ regions: REGIONS });
}
