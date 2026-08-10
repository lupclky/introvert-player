'use strict';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be'
]);

function trimUrlPunctuation(value) {
  return String(value || '').replace(/[),.;!?\]}>'"]+$/g, '');
}

function decodeHtmlUrl(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&#x0*26;/gi, '&');
}

function extractUrls(message) {
  const matches = [];
  const expression = /https?:\/\/[^\s<>"'\[\]()*]+/gi;
  let match;
  while ((match = expression.exec(String(message || ''))) !== null) {
    const url = decodeHtmlUrl(trimUrlPunctuation(match[0]));
    matches.push({ url, index: match.index, end: match.index + url.length });
  }
  return matches;
}

function parseYoutubeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(decodeHtmlUrl(trimUrlPunctuation(rawUrl)));
  } catch (_) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) return null;

  const playlistId = String(parsed.searchParams.get('list') || '').trim();
  const videoId = hostname.endsWith('youtu.be')
    ? parsed.pathname.split('/').filter(Boolean)[0] || ''
    : String(parsed.searchParams.get('v') || '').trim();
  const isPlaylistPage = parsed.pathname.replace(/\/+$/, '') === '/playlist';
  const validPlaylistId = /^[A-Za-z0-9_-]{10,64}$/.test(playlistId);

  return {
    originalUrl: rawUrl,
    playlistId: validPlaylistId ? playlistId : '',
    videoId,
    isPlaylistPage,
    isWatchWithPlaylist: Boolean(videoId && validPlaylistId),
    normalizedPlaylistUrl: validPlaylistId
      ? `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
      : ''
  };
}

function pending(reason, details = {}) {
  return {
    kind: 'pending_review',
    matched: true,
    reason,
    reasonText: {
      playlist_command_missing_url: 'Lệnh !playlist chưa có đường dẫn ngay phía sau.',
      invalid_playlist_url: 'Đường dẫn playlist YouTube không hợp lệ.',
      ambiguous_urls: 'Tin nhắn có nhiều đường dẫn nên hệ thống không thể xác định playlist an toàn.'
    }[reason] || 'Cần streamer kiểm tra yêu cầu playlist.',
    ...details
  };
}

function parsePlaylistDonationMessage(message) {
  const text = String(message || '').trim();
  if (!text) return { kind: 'none', matched: false };

  const urls = extractUrls(text);
  const commandMatch = /!playlist\b/gi.exec(text);

  if (commandMatch) {
    const afterCommand = text.slice(commandMatch.index + commandMatch[0].length);
    const leadingWhitespace = afterCommand.length - afterCommand.trimStart().length;
    const commandUrlStart = commandMatch.index + commandMatch[0].length + leadingWhitespace;
    const commandUrl = urls.find(item => item.index === commandUrlStart);
    if (!commandUrl) return pending('playlist_command_missing_url');

    const parsed = parseYoutubeUrl(commandUrl.url);
    if (!parsed || !parsed.playlistId) {
      return pending('invalid_playlist_url', { candidateUrl: commandUrl.url });
    }

    return {
      kind: 'playlist',
      matched: true,
      commanded: true,
      playlistId: parsed.playlistId,
      normalizedUrl: parsed.normalizedPlaylistUrl,
      sourceUrl: commandUrl.url
    };
  }

  if (urls.length === 0) return { kind: 'none', matched: false };

  const parsedUrls = urls.map(item => ({ ...item, parsed: parseYoutubeUrl(item.url) }));
  const directPlaylists = parsedUrls.filter(item => {
    if (!item.parsed?.playlistId) return false;
    // Không có lệnh !playlist: watch URL chứa list=RD... chỉ là Mix/radio
    // YouTube tự sinh quanh video đang xem, không phải yêu cầu playlist.
    return !(item.parsed.videoId && /^RD/i.test(item.parsed.playlistId));
  });

  // YouTube thường chia sẻ playlist dưới dạng watch?v=...&list=.... Nếu bỏ qua
  // tham số list, luồng order bài đơn sẽ chỉ lấy video đầu tiên trong URL.
  if (directPlaylists.length === 0) return { kind: 'none', matched: false };

  // Chat có thể chứa đồng thời nhãn Markdown và URL đích, trong đó dấu & ở
  // nhãn được encode thành &amp;. Gộp các bản sao logic trước khi kiểm tra mơ hồ.
  const uniqueUrlKeys = new Set(parsedUrls.map(item => {
    if (!item.parsed) return item.url;
    return [item.parsed.playlistId, item.parsed.videoId].join(':');
  }));
  const uniquePlaylists = [];
  const seenPlaylistIds = new Set();
  for (const item of directPlaylists) {
    if (seenPlaylistIds.has(item.parsed.playlistId)) continue;
    seenPlaylistIds.add(item.parsed.playlistId);
    uniquePlaylists.push(item);
  }

  if (uniqueUrlKeys.size !== 1 || uniquePlaylists.length !== 1) {
    const candidate = uniquePlaylists[0];
    return pending('ambiguous_urls', {
      candidateUrls: uniquePlaylists.map(item => item.url),
      candidatePlaylistId: candidate?.parsed?.playlistId || '',
      playlistId: candidate?.parsed?.playlistId || ''
    });
  }

  const selected = uniquePlaylists[0];
  return {
    kind: 'playlist',
    matched: true,
    commanded: false,
    playlistId: selected.parsed.playlistId,
    normalizedUrl: selected.parsed.normalizedPlaylistUrl,
    sourceUrl: selected.url
  };
}

module.exports = {
  extractUrls,
  parseYoutubeUrl,
  parsePlaylistDonationMessage
};
