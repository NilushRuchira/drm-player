import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseM3U } from '@/lib/parser';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'playlist.m3u8');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Playlist file not found' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const videos = parseM3U(fileContent);

    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Failed to parse playlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
