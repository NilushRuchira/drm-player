export interface PlaylistItem {
  id: string;
  title: string;
  duration: number;
  tvgName?: string;
  groupTitle?: string;
  tvgLogo?: string;
  description?: string;
  manifestType?: string;
  licenseType?: string;
  licenseKey?: string;
  mimetype?: string;
  url: string;
  isUploaded?: boolean;
  uploadSource?: string;
}

export function parseM3U(content: string): PlaylistItem[] {
  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const items: PlaylistItem[] = [];
  const lines = content.split(/\r?\n/);
  
  let currentItem: Partial<PlaylistItem> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // If we already had an item under construction but hit a new EXTINF before a URL line
      if (currentItem && currentItem.url) {
        items.push(currentItem as PlaylistItem);
      }
      
      currentItem = {};
      
      const extinfContent = line.substring(8); // Remove "#EXTINF:"
      
      // Find the comma separating attributes and title (must be outside quoted strings)
      let inQuote = false;
      let commaIndex = -1;
      for (let j = 0; j < extinfContent.length; j++) {
        const ch = extinfContent[j];
        if (ch === '"') {
          inQuote = !inQuote;
        } else if (ch === ',' && !inQuote) {
          commaIndex = j;
          break;
        }
      }
      
      let attrsPart = extinfContent;
      let titlePart = '';
      if (commaIndex !== -1) {
        attrsPart = extinfContent.substring(0, commaIndex);
        titlePart = extinfContent.substring(commaIndex + 1).trim();
      }
      
      currentItem.title = titlePart;
      
      const attrsTrimmed = attrsPart.trim();
      const firstSpaceIndex = attrsTrimmed.indexOf(' ');
      let durationStr = attrsTrimmed;
      let attributesStr = '';
      if (firstSpaceIndex !== -1) {
        durationStr = attrsTrimmed.substring(0, firstSpaceIndex).trim();
        attributesStr = attrsTrimmed.substring(firstSpaceIndex).trim();
      }
      
      currentItem.duration = parseFloat(durationStr) || 0;
      
      // Parse key="value" attributes
      const attrRegex = /([\w-]+)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(attributesStr)) !== null) {
        const key = match[1];
        const val = match[2];
        if (key === 'tvg-name') {
          currentItem.tvgName = val;
        } else if (key === 'group-title') {
          currentItem.groupTitle = val;
        } else if (key === 'tvg-logo') {
          currentItem.tvgLogo = val;
        }
      }
    } else if (line.startsWith('#DESCRIPTION:')) {
      if (currentItem) {
        currentItem.description = line.substring(13).trim();
      }
    } else if (line.startsWith('#KODIPROP:')) {
      if (currentItem) {
        const propContent = line.substring(10).trim();
        const equalsIndex = propContent.indexOf('=');
        if (equalsIndex !== -1) {
          const key = propContent.substring(0, equalsIndex).trim();
          const val = propContent.substring(equalsIndex + 1).trim();
          
          if (key === 'inputstream.adaptive.manifest_type') {
            currentItem.manifestType = val;
          } else if (key === 'inputstream.adaptive.license_type') {
            currentItem.licenseType = val;
          } else if (key === 'inputstream.adaptive.license_key') {
            currentItem.licenseKey = val;
          } else if (key === 'mimetype') {
            currentItem.mimetype = val;
          }
        }
      }
    } else if (!line.startsWith('#')) {
      if (currentItem) {
        currentItem.url = line;
        
        // Generate an ID based on url + title
        const hashSeed = currentItem.url + (currentItem.title || '');
        let hash = 0;
        for (let j = 0; j < hashSeed.length; j++) {
          hash = (hash << 5) - hash + hashSeed.charCodeAt(j);
          hash |= 0; // Convert to 32bit integer
        }
        currentItem.id = Math.abs(hash).toString(36);
        
        items.push(currentItem as PlaylistItem);
        currentItem = null;
      }
    }
  }

  // Handle trailing item
  if (currentItem && currentItem.url) {
    items.push(currentItem as PlaylistItem);
  }

  return items;
}
