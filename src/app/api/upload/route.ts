import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parseM3U } from '@/lib/parser';

const VALID_TYPES = ['tv', 'series', 'movies'] as const;
type PlaylistType = typeof VALID_TYPES[number];

function getUploadsDir(type?: string): string {
  if (type) {
    return path.join(process.cwd(), 'data', 'uploads', type);
  }
  return path.join(process.cwd(), 'data', 'uploads');
}

// GET: List all uploaded playlists
export async function GET() {
  try {
    const playlists: Array<{
      id: string;
      filename: string;
      originalName: string;
      type: PlaylistType;
      size: number;
      itemsCount: number;
      uploadedAt: string;
    }> = [];

    for (const type of VALID_TYPES) {
      const dir = getUploadsDir(type);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.m3u') && !file.endsWith('.m3u8')) continue;

        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Extract original name from first lines if present
        let originalName = file;
        const metaMatch = content.match(/#PLAYLIST_META:\s*name=([^,\r\n]+)/);
        if (metaMatch && metaMatch[1]) {
          originalName = metaMatch[1].trim();
        } else {
          // Remove timestamp prefix if pattern matches timestamp_name
          const parts = file.split('_');
          if (parts.length > 1 && !isNaN(Number(parts[0]))) {
            originalName = parts.slice(1).join('_');
          }
        }

        const items = parseM3U(content);

        playlists.push({
          id: `${type}/${file}`,
          filename: file,
          originalName,
          type,
          size: stats.size,
          itemsCount: items.length,
          uploadedAt: stats.mtime.toISOString(),
        });
      }
    }

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error('Failed to list uploaded playlists:', error);
    return NextResponse.json({ error: 'Failed to list uploaded playlists' }, { status: 500 });
  }
}

// POST: Upload one or more M3U/M3U8 files
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const defaultType = (formData.get('type') as string) || 'tv';
    const typeMappingRaw = formData.get('typeMapping') as string | null;

    let typeMapping: Record<string, string> = {};
    if (typeMappingRaw) {
      try {
        typeMapping = JSON.parse(typeMappingRaw);
      } catch (e) {
        console.warn('Failed to parse typeMapping:', e);
      }
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploadedResults: Array<{
      originalName: string;
      filename: string;
      type: string;
      itemsCount: number;
    }> = [];

    for (const file of files) {
      const fileType = (typeMapping[file.name] || defaultType) as PlaylistType;
      
      if (!VALID_TYPES.includes(fileType)) {
        return NextResponse.json(
          { error: `Invalid playlist type "${fileType}" for file ${file.name}. Must be tv, series, or movies.` },
          { status: 400 }
        );
      }

      const text = await file.text();
      
      // Basic validation: ensure it has playlist structure or URLs
      const items = parseM3U(text);
      if (items.length === 0) {
        return NextResponse.json(
          { error: `File "${file.name}" does not contain any valid M3U stream entries.` },
          { status: 400 }
        );
      }

      // Ensure directory exists
      const targetDir = getUploadsDir(fileType);
      fs.mkdirSync(targetDir, { recursive: true });

      // Sanitize filename
      const safeOriginalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const timestamp = Date.now();
      const savedFilename = `${timestamp}_${safeOriginalName}`;
      const targetPath = path.join(targetDir, savedFilename);

      // Embed metadata header
      const metaHeader = `#PLAYLIST_META: name=${file.name}, uploadedAt=${new Date().toISOString()}, count=${items.length}\n`;
      const finalContent = metaHeader + text;

      fs.writeFileSync(targetPath, finalContent, 'utf-8');

      uploadedResults.push({
        originalName: file.name,
        filename: savedFilename,
        type: fileType,
        itemsCount: items.length,
      });
    }

    return NextResponse.json({
      success: true,
      count: uploadedResults.length,
      uploaded: uploadedResults,
    });
  } catch (error) {
    console.error('Failed to handle upload:', error);
    return NextResponse.json({ error: 'Internal Server Error during upload' }, { status: 500 });
  }
}

// DELETE: Delete an uploaded playlist
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id'); // format: "tv/filename.m3u8" or params
    const type = (searchParams.get('type') || '') as PlaylistType;
    const filename = searchParams.get('filename') || '';

    let targetType: PlaylistType;
    let targetFilename: string;

    if (id && id.includes('/')) {
      const parts = id.split('/');
      targetType = parts[0] as PlaylistType;
      targetFilename = path.basename(parts.slice(1).join('/'));
    } else {
      targetType = type;
      targetFilename = path.basename(filename);
    }

    if (!VALID_TYPES.includes(targetType) || !targetFilename) {
      return NextResponse.json({ error: 'Invalid type or filename' }, { status: 400 });
    }

    const filePath = path.join(getUploadsDir(targetType), targetFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, deleted: targetFilename });
    } else {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Failed to delete playlist:', error);
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
  }
}
