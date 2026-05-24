import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Use Vercel's x-forwarded-for header or fallback to other headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  
  // Vercel usually provides a comma separated list, the first one is the client IP
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || 'unknown');

  return NextResponse.json({ ip });
}
