'use strict';

function isPlaylistTrack(song) {
  return Boolean(song && song.playlistRequestId && song.playlistTrackId);
}

class PlaylistQueueService {
  static songsFromRequest(request, timestamp = Date.now()) {
    const isManualOwnerAdd = request?.source === 'manual_owner';
    const isManualQuickAdd = request?.source === 'manual_quick_add';
    const acceptedTracks = (request?.tracks || []).filter(track =>
      !['unavailable'].includes(track.status) && !(track.status === 'error' && track.skipReason === 'unknown_duration')
    );
    const playableTracks = acceptedTracks.filter(track => track.status === 'queued' || track.status === 'playing');
    return playableTracks.map((track, index) => ({
      id: track.id,
      playlistTrackId: track.id,
      playlistRequestId: request.id,
      playlistTitle: request.title,
      playlistOwnerName: request.ownerName || '',
      playlistPosition: Math.max(1, acceptedTracks.findIndex(item => item.id === track.id) + 1),
      playlistTotalTracks: Number(request.acceptedItemCount || acceptedTracks.length),
      playlistSkippedItemCount: Number(request.skippedItemCount || 0),
      playlistTotalDurationSec: request.totalDurationSec,
      playlistThumbnailUrl: request.thumbnailUrl || '',
      type: 'youtube',
      videoId: track.videoId,
      title: track.title,
      author: track.channelName || '',
      thumbnail: track.thumbnailUrl || `https://img.youtube.com/vi/${track.videoId}/hqdefault.jpg`,
      duration: track.durationSec,
      donorName: request.donorName,
      amount: request.donationAmount,
      message: (isManualOwnerAdd || isManualQuickAdd) ? '' : (request.originalMessage || ''),
      timestamp: timestamp + index,
      localAddedAt: Date.now(),
      isPlaylistTrack: true,
      isOwnerAdd: isManualOwnerAdd,
      isQuickAdd: isManualQuickAdd
    }));
  }

  static enqueue(queue, request) {
    const result = Array.isArray(queue) ? [...queue] : [];
    const existingIds = new Set(result.map(song => String(song.id)));
    const songs = this.songsFromRequest(request).filter(song => !existingIds.has(String(song.id)));
    result.push(...songs);
    return { queue: result, added: songs };
  }

  static getNextSong(queue, currentSong = null) {
    const source = Array.isArray(queue) ? queue : [];
    const currentId = currentSong?.id === undefined || currentSong?.id === null
      ? null
      : String(currentSong.id);
    const pending = source.filter(song => song && (currentId === null || String(song.id) !== currentId));
    if (!currentSong?.playlistRequestId) return pending[0] || null;

    // Playlist đang phát là một thực thể liên tục. Mọi bài đơn hoặc playlist
    // khác, kể cả có số tiền cao hơn, chỉ được xét sau khi nhóm này kết thúc.
    return pending.find(song => song.playlistRequestId === currentSong.playlistRequestId)
      || pending[0]
      || null;
  }

  static prioritizeActivePlaylist(queue, currentSong = null) {
    const source = Array.isArray(queue) ? [...queue] : [];
    if (!currentSong?.playlistRequestId) return source;
    const currentId = currentSong?.id === undefined || currentSong?.id === null
      ? null
      : String(currentSong.id);
    const current = source.find(song => currentId !== null && String(song.id) === currentId);
    const samePlaylist = source.filter(song =>
      song.playlistRequestId === currentSong.playlistRequestId
      && (!current || String(song.id) !== String(current.id))
    );
    const otherSongs = source.filter(song =>
      (!current || String(song.id) !== String(current.id))
      && song.playlistRequestId !== currentSong.playlistRequestId
    );
    return current ? [current, ...samePlaylist, ...otherSongs] : [...samePlaylist, ...otherSongs];
  }

  static group(queue, currentSongId = null) {
    const groups = [];
    const groupMap = new Map();
    for (const song of queue || []) {
      if (currentSongId !== null && String(song.id) === String(currentSongId)) {
        groups.push({ type: 'current', key: `current:${song.id}`, songs: [song] });
        continue;
      }
      if (!isPlaylistTrack(song)) {
        groups.push({ type: 'song', key: `song:${song.id}`, songs: [song] });
        continue;
      }
      const key = `playlist:${song.playlistRequestId}`;
      let group = groupMap.get(key);
      if (!group) {
        group = { type: 'playlist', key, playlistRequestId: song.playlistRequestId, songs: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.songs.push(song);
    }
    return groups;
  }

  static movePlaylist(queue, playlistRequestId, direction, currentSongId = null) {
    const source = Array.isArray(queue) ? [...queue] : [];
    const current = source.find(song => currentSongId !== null && String(song.id) === String(currentSongId));
    const pending = source.filter(song => !current || String(song.id) !== String(current.id));
    const groups = this.group(pending);
    const index = groups.findIndex(group => group.playlistRequestId === playlistRequestId);
    if (index === -1) return source;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= groups.length) return source;
    [groups[index], groups[target]] = [groups[target], groups[index]];
    const flattened = groups.flatMap(group => group.songs);
    return current ? [current, ...flattened] : flattened;
  }

  static moveEntry(queue, songId, direction, currentSongId = null) {
    const source = Array.isArray(queue) ? [...queue] : [];
    const song = source.find(item => String(item.id) === String(songId));
    if (!song) return source;
    if (song.playlistRequestId) return this.movePlaylist(source, song.playlistRequestId, direction, currentSongId);

    const current = source.find(item => currentSongId !== null && String(item.id) === String(currentSongId));
    const pending = source.filter(item => !current || String(item.id) !== String(current.id));
    const groups = this.group(pending);
    const index = groups.findIndex(group => group.type === 'song' && String(group.songs[0]?.id) === String(songId));
    if (index === -1) return source;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= groups.length) return source;
    [groups[index], groups[target]] = [groups[target], groups[index]];
    const flattened = groups.flatMap(group => group.songs);
    return current ? [current, ...flattened] : flattened;
  }

  static removePlaylist(queue, playlistRequestId) {
    return (queue || []).filter(song => song.playlistRequestId !== playlistRequestId);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PlaylistQueueService, isPlaylistTrack };
if (typeof window !== 'undefined') window.PlaylistQueueService = PlaylistQueueService;
