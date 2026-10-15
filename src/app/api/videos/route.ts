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
    
    let allVideos: ReturnType<typeof parseM3U> = [];

    // 1. Load base playlist if present
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const baseVideos = parseM3U(fileContent);
      allVideos.push(...baseVideos);
    }

    // 2. Load any uploaded playlists for this category
    const uploadsDir = path.join(process.cwd(), 'data', 'uploads', type);
    if (fs.existsSync(uploadsDir)) {
      const uploadFiles = fs.readdirSync(uploadsDir);
      for (const uploadFile of uploadFiles) {
        if (!uploadFile.endsWith('.m3u') && !uploadFile.endsWith('.m3u8')) continue;

        try {
          const uploadPath = path.join(uploadsDir, uploadFile);
          const uploadContent = fs.readFileSync(uploadPath, 'utf-8');
          
          // Extract original filename if available
          let originalName = uploadFile;
          const metaMatch = uploadContent.match(/#PLAYLIST_META:\s*name=([^,\r\n]+)/);
          if (metaMatch && metaMatch[1]) {
            originalName = metaMatch[1].trim();
          }

          const uploadedVideos = parseM3U(uploadContent);
          for (const item of uploadedVideos) {
            item.isUploaded = true;
            item.uploadSource = originalName;
          }
          allVideos.push(...uploadedVideos);
        } catch (err) {
          console.warn(`Error reading uploaded playlist ${uploadFile}:`, err);
        }
      }
    }

    return NextResponse.json({ videos: allVideos, total: allVideos.length });
  } catch (error) {
    console.error('Failed to parse playlist:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
