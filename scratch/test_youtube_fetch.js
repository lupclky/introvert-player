const fs = require('fs');

function extractVideoFromLockup(v) {
  if (v.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  
  const videoId = v.contentId;
  if (!videoId) return null;
  
  const m = v.metadata?.lockupMetadataViewModel;
  const title = m?.title?.content || '';
  
  let thumbnail = '';
  const sources = v.contentImage?.thumbnailViewModel?.image?.sources;
  if (sources && sources.length > 0) {
    thumbnail = sources[sources.length - 1].url;
  } else {
    thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  
  let duration = '0:00';
  const overlays = v.contentImage?.thumbnailViewModel?.overlays;
  if (overlays && overlays.length > 0) {
    for (const ov of overlays) {
      const text = ov.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
      if (text) {
        duration = text;
        break;
      }
    }
  }
  
  let author = '';
  let views = '';
  const rows = m?.metadata?.contentMetadataViewModel?.metadataRows;
  if (rows && rows.length > 0) {
    author = rows[0].metadataParts?.[0]?.text?.content || '';
    if (rows.length > 1) {
      views = rows[1].metadataParts?.[0]?.text?.content || '';
    }
  }
  
  return {
    videoId,
    title,
    thumbnail,
    duration,
    author,
    views,
    url: `https://www.youtube.com/watch?v=${videoId}`
  };
}

function extractPlaylistFromLockup(p) {
  if (p.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST') return null;
  
  const playlistId = p.contentId;
  if (!playlistId) return null;
  
  const m = p.metadata?.lockupMetadataViewModel;
  const title = m?.title?.content || '';
  
  let thumbnail = '';
  const sources = p.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources;
  if (sources && sources.length > 0) {
    thumbnail = sources[sources.length - 1].url;
  }
  
  let videoCount = '0';
  const overlays = p.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays;
  if (overlays && overlays.length > 0) {
    for (const ov of overlays) {
      const text = ov.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel?.text;
      if (text) {
        videoCount = text;
        break;
      }
    }
  }
  
  return {
    playlistId,
    title,
    thumbnail,
    videoCount
  };
}

function findKeysRecursive(obj, keys, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            findKeysRecursive(item, keys, results);
        }
    } else {
        for (const k of Object.keys(obj)) {
            if (keys.includes(k)) {
                results.push({ key: k, value: obj[k] });
            }
            findKeysRecursive(obj[k], keys, results);
        }
    }
    return results;
}

try {
    if (fs.existsSync('scratch/home_initial.json')) {
        const data = JSON.parse(fs.readFileSync('scratch/home_initial.json', 'utf8'));
        const keys = ['videoRenderer', 'gridVideoRenderer', 'compactVideoRenderer', 'lockupViewModel'];
        const results = findKeysRecursive(data, keys);
        const videos = [];
        const seenIds = new Set();
        
        for (const item of results) {
            if (item.key === 'lockupViewModel') {
                const v = extractVideoFromLockup(item.value);
                if (v && !seenIds.has(v.videoId)) {
                    seenIds.add(v.videoId);
                    videos.push(v);
                }
            }
        }
        console.log(`Parsed ${videos.length} videos from home feed lockupViewModels:`);
        videos.slice(0, 5).forEach((v, idx) => {
            console.log(`Video ${idx + 1}:`);
            console.log(`  ID: ${v.videoId}`);
            console.log(`  Title: ${v.title}`);
            console.log(`  Thumb: ${v.thumbnail.slice(0, 60)}...`);
            console.log(`  Duration: ${v.duration}`);
            console.log(`  Author: ${v.author}`);
            console.log(`  Views: ${v.views}`);
        });
    }

    if (fs.existsSync('scratch/playlists_initial.json')) {
        const data = JSON.parse(fs.readFileSync('scratch/playlists_initial.json', 'utf8'));
        const keys = ['playlistRenderer', 'gridPlaylistRenderer', 'lockupViewModel'];
        const results = findKeysRecursive(data, keys);
        const playlists = [];
        const seenIds = new Set();
        
        for (const item of results) {
            if (item.key === 'lockupViewModel') {
                const p = extractPlaylistFromLockup(item.value);
                if (p && !seenIds.has(p.playlistId)) {
                    seenIds.add(p.playlistId);
                    playlists.push(p);
                }
            }
        }
        console.log(`\nParsed ${playlists.length} playlists from playlists feed lockupViewModels:`);
        playlists.forEach((p, idx) => {
            console.log(`Playlist ${idx + 1}:`);
            console.log(`  ID: ${p.playlistId}`);
            console.log(`  Title: ${p.title}`);
            console.log(`  Thumb: ${p.thumbnail ? p.thumbnail.slice(0, 60) + '...' : 'none'}`);
            console.log(`  Count: ${p.videoCount}`);
        });
    }
} catch (e) {
    console.error("Error:", e.message);
}
