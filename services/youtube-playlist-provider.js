'use strict';

function textValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value.simpleText === 'string') return value.simpleText.trim();
  if (Array.isArray(value.runs)) return value.runs.map(run => run?.text || '').join('').trim();
  if (typeof value.content === 'string') return value.content.trim();
  return '';
}

function durationTextToSeconds(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,3}(?::\d{1,2}){1,2}$/.test(text)) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function findThumbnail(node, videoId = '') {
  const candidates = [
    node?.thumbnail?.thumbnails,
    node?.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails,
    node?.contentImage?.thumbnailViewModel?.image?.sources
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) return list[list.length - 1]?.url || '';
  }
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
}

function getDurationText(node) {
  const direct = textValue(node?.lengthText);
  if (direct) return direct;
  for (const overlay of node?.thumbnailOverlays || []) {
    const text = textValue(overlay?.thumbnailOverlayTimeStatusRenderer?.text);
    if (text) return text;
  }
  for (const overlay of node?.contentImage?.thumbnailViewModel?.overlays || []) {
    const text = overlay?.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text;
    if (text) return String(text).trim();
  }
  return '';
}

function walk(value, visitor) {
  if (!value || typeof value !== 'object') return;
  visitor(value);
  if (Array.isArray(value)) {
    value.forEach(item => walk(item, visitor));
  } else {
    Object.values(value).forEach(item => walk(item, visitor));
  }
}

function isUnavailableTitle(title) {
  return /(private video|deleted video|video unavailable|video (riêng tư|đã bị xóa|không khả dụng))/i.test(title);
}

function normalizeVideoRenderer(renderer, position) {
  const videoId = String(renderer?.videoId || renderer?.contentId || '').trim();
  if (!videoId) return null;
  const metadata = renderer?.metadata?.lockupMetadataViewModel;
  const title = textValue(renderer?.title) || textValue(metadata?.title) || 'Video không có tiêu đề';
  const channelName = textValue(renderer?.shortBylineText) || textValue(renderer?.ownerText) ||
    textValue(metadata?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text);
  const durationText = getDurationText(renderer);
  const overlayStyle = JSON.stringify(renderer?.thumbnailOverlays || renderer?.contentImage?.thumbnailViewModel?.overlays || []);
  const isLive = renderer?.isLiveNow === true || /LIVE|TRỰC TIẾP/i.test(durationText) || /LIVE/i.test(overlayStyle);
  const isUpcoming = Boolean(renderer?.upcomingEventData) || /UPCOMING|SẮP CÔNG CHIẾU/i.test(durationText + overlayStyle);
  const playable = renderer?.isPlayable !== false;
  let unavailableReason = '';
  let unavailableReasonText = '';
  if (!playable || isUnavailableTitle(title)) {
    unavailableReason = /private|riêng tư/i.test(title) ? 'private' : (/deleted|xóa/i.test(title) ? 'deleted' : 'unavailable');
    unavailableReasonText = 'Video riêng tư, đã xóa hoặc không có quyền phát.';
  }

  return {
    position,
    videoId,
    title,
    channelName,
    thumbnailUrl: findThumbnail(renderer, videoId),
    durationSec: durationTextToSeconds(durationText),
    durationText,
    isLive,
    isUpcoming,
    unavailableReason,
    unavailableReasonText
  };
}

function extractPlaylistMetadata(data, playlistId) {
  let title = '';
  let ownerName = '';
  let thumbnailUrl = '';
  let sourceItemCount = 0;

  walk(data, node => {
    if (!title && node.playlistMetadataRenderer) {
      title = textValue(node.playlistMetadataRenderer.title);
    }
    if (node.playlistSidebarPrimaryInfoRenderer) {
      const primary = node.playlistSidebarPrimaryInfoRenderer;
      if (!title) title = textValue(primary.title);
      if (!thumbnailUrl) thumbnailUrl = findThumbnail(primary);
      const stats = primary.stats || [];
      for (const stat of stats) {
        const match = textValue(stat).match(/[\d.,]+/);
        if (match && !sourceItemCount) sourceItemCount = Number(match[0].replace(/\D/g, '')) || 0;
      }
    }
    if (!ownerName && node.playlistSidebarSecondaryInfoRenderer) {
      ownerName = textValue(node.playlistSidebarSecondaryInfoRenderer.videoOwner?.videoOwnerRenderer?.title);
    }
  });

  return {
    externalPlaylistId: playlistId,
    title: title || `YouTube Playlist ${playlistId}`,
    ownerName,
    thumbnailUrl,
    sourceItemCount
  };
}

function extractPlaylistTracks(data, maxItems = 50, onProgress = null, totalItems = 0) {
  const tracks = [];
  const seenRendererObjects = new Set();
  walk(data, node => {
    if (tracks.length >= maxItems) return;
    let renderer = null;
    if (node.playlistVideoRenderer) renderer = node.playlistVideoRenderer;
    else if (node.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && node.contentId) renderer = node;
    if (!renderer || seenRendererObjects.has(renderer)) return;
    seenRendererObjects.add(renderer);
    const track = normalizeVideoRenderer(renderer, tracks.length + 1);
    if (track) {
      tracks.push(track);
      if (typeof onProgress === 'function' && (tracks.length === 1 || tracks.length % 5 === 0 || tracks.length === totalItems)) {
        onProgress({ resolvedItems: tracks.length, totalItems: totalItems || maxItems });
      }
    }
  });
  return tracks;
}

class YouTubePlaylistProvider {
  constructor(options = {}) {
    if (typeof options.fetchPlaylistData !== 'function') {
      throw new TypeError('fetchPlaylistData is required');
    }
    this.fetchPlaylistData = options.fetchPlaylistData;
    this.fetchVideoStats = typeof options.fetchVideoStats === 'function' ? options.fetchVideoStats : null;
  }

  async resolve(playlistId, options = {}) {
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(String(playlistId || ''))) {
      throw new Error('invalid_playlist_id');
    }
    const maxItems = Math.min(100, Math.max(1, Number(options.maxItems) || 50));
    const data = await this.fetchPlaylistData(String(playlistId));
    const metadata = extractPlaylistMetadata(data, String(playlistId));
    let tracks = extractPlaylistTracks(data, maxItems, options.onProgress, Math.min(metadata.sourceItemCount || maxItems, maxItems));
    if (this.fetchVideoStats && tracks.length > 0) {
      const enriched = new Array(tracks.length);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(5, tracks.length) }, async () => {
        while (cursor < tracks.length) {
          const index = cursor++;
          const track = tracks[index];
          try {
            const stats = await this.fetchVideoStats(track.videoId);
            enriched[index] = {
              ...track,
              viewCount: Number.isFinite(Number(stats?.viewCount)) ? Number(stats.viewCount) : null,
              durationSec: track.durationSec || Number(stats?.durationSec) || 0
            };
          } catch (_) {
            enriched[index] = { ...track, viewCount: null };
          }
        }
      });
      await Promise.all(workers);
      tracks = enriched;
    }
    if (!metadata.thumbnailUrl && tracks[0]) metadata.thumbnailUrl = tracks[0].thumbnailUrl;
    if (!metadata.sourceItemCount) metadata.sourceItemCount = tracks.length;
    return { ...metadata, tracks };
  }
}

module.exports = {
  YouTubePlaylistProvider,
  durationTextToSeconds,
  extractPlaylistMetadata,
  extractPlaylistTracks,
  normalizeVideoRenderer
};
