import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseM3U } from '@/lib/parser';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'tv';

    // Restrict inputs to prevent directory traversal and validate parameters
    if (!['tv', 'series', 'movies'].includes(type)) {
      return NextResponse.json({ error: 'Invalid playlist type' }, { status: 400 });
    }

    const filename = `${type}.m3u8`;
    const filePath = path.join(process.cwd(), 'data', filename);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ videos: [] });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const videos = parseM3U(fileContent);

    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Failed to parse playlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
