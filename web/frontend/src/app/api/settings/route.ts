import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    region: process.env.DEFAULT_REGION || '전체',
    school_level: process.env.DEFAULT_SCHOOL_LEVEL || '초등학교',
    headless: true,
    has_api_key: !!process.env.ALADIN_TTB_KEY,
    mode: 'api',
  });
}
