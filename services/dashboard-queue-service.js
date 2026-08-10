'use strict';

class DashboardQueueService {
  static sort(queue, options = {}) {
    const source = Array.isArray(queue) ? [...queue] : [];
    const currentSong = options.currentSong || null;
    const sortConfig = options.sortConfig || 'time';
    const forceSort = Boolean(options.forceSort);
    const currentId = currentSong?.id === undefined || currentSong?.id === null ? null : String(currentSong.id);
    const playingSong = currentSong
      ? source.find(song => String(song.id) === currentId) || currentSong
      : null;
    let pending = playingSong ? source.filter(song => String(song.id) !== currentId) : source;
    let activePlaylistSongs = [];

    if (playingSong?.playlistRequestId) {
      activePlaylistSongs = pending.filter(song => song.playlistRequestId === playingSong.playlistRequestId);
      pending = pending.filter(song => song.playlistRequestId !== playingSong.playlistRequestId);
    }

    if (forceSort) {
      pending.sort((left, right) => {
        if (left.isPinned && !right.isPinned) return -1;
        if (!left.isPinned && right.isPinned) return 1;
        if (sortConfig === 'amount' && Number(right.amount || 0) !== Number(left.amount || 0)) {
          return Number(right.amount || 0) - Number(left.amount || 0);
        }
        return Number(left.timestamp || 0) - Number(right.timestamp || 0);
      });
    }

    return playingSong ? [playingSong, ...activePlaylistSongs, ...pending] : pending;
  }

  static insert(queue, newSong, options = {}) {
    const source = Array.isArray(queue) ? [...queue] : [];
    if (!newSong) return source;
    if (source.length === 0) return [newSong];

    const currentSong = options.currentSong || null;
    const sortConfig = options.sortConfig || 'time';
    let startIndex = currentSong ? 1 : 0;
    if (currentSong?.playlistRequestId) {
      const lastPlaylistIndex = source.reduce((last, song, index) =>
        song.playlistRequestId === currentSong.playlistRequestId ? index : last, -1);
      startIndex = Math.max(startIndex, lastPlaylistIndex + 1);
    }

    if (sortConfig === 'amount') {
      let insertIndex = -1;
      for (let index = startIndex; index < source.length; index += 1) {
        const item = source[index];
        if (item.isPinned && !newSong.isPinned) continue;
        if (!item.isPinned && newSong.isPinned) {
          insertIndex = index;
          break;
        }
        if (Number(item.amount || 0) < Number(newSong.amount || 0)) {
          insertIndex = index;
          break;
        }
      }
      if (insertIndex >= 0) source.splice(insertIndex, 0, newSong);
      else source.push(newSong);
      return source;
    }

    if (newSong.isPinned) {
      let lastPinnedIndex = startIndex - 1;
      for (let index = startIndex; index < source.length; index += 1) {
        if (source[index].isPinned) lastPinnedIndex = index;
      }
      source.splice(lastPinnedIndex + 1, 0, newSong);
    } else {
      source.push(newSong);
    }
    return source;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { DashboardQueueService };
if (typeof window !== 'undefined') window.DashboardQueueService = DashboardQueueService;
