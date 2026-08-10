'use strict';

const { evaluateViewCount } = require('./view-count-policy');

const DEFAULT_PLAYLIST_SETTINGS = Object.freeze({
  playlistEnabled: true,
  playlistMinimumDonationVnd: 1500000,
  playlistMaximumDurationSec: 4200,
  playlistMaximumItemsToResolve: 50,
  minimumViewCount: 0,
  playlistAutoAccept: true,
  playlistContinuousPlayback: true,
  playlistDeduplicateTracks: true
});

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function normalizePlaylistSettings(input = {}) {
  return {
    playlistEnabled: normalizeBoolean(input.playlistEnabled, DEFAULT_PLAYLIST_SETTINGS.playlistEnabled),
    playlistMinimumDonationVnd: clampInteger(input.playlistMinimumDonationVnd, 1500000, 0, 1000000000),
    playlistMaximumDurationSec: clampInteger(input.playlistMaximumDurationSec, 4200, 60, 86400),
    playlistMaximumItemsToResolve: clampInteger(input.playlistMaximumItemsToResolve, 50, 1, 100),
    minimumViewCount: clampInteger(input.minimumViewCount, 0, 0, 1000000000000),
    playlistAutoAccept: normalizeBoolean(input.playlistAutoAccept, DEFAULT_PLAYLIST_SETTINGS.playlistAutoAccept),
    playlistContinuousPlayback: normalizeBoolean(input.playlistContinuousPlayback, DEFAULT_PLAYLIST_SETTINGS.playlistContinuousPlayback),
    playlistDeduplicateTracks: normalizeBoolean(input.playlistDeduplicateTracks, DEFAULT_PLAYLIST_SETTINGS.playlistDeduplicateTracks)
  };
}

function validatePlaylistAmount(amount, settings = DEFAULT_PLAYLIST_SETTINGS) {
  const normalized = normalizePlaylistSettings(settings);
  const donationAmount = Math.max(0, Number(amount) || 0);
  return {
    valid: donationAmount >= normalized.playlistMinimumDonationVnd,
    amount: donationAmount,
    minimum: normalized.playlistMinimumDonationVnd,
    reason: donationAmount >= normalized.playlistMinimumDonationVnd ? null : 'insufficient_amount',
    reasonText: donationAmount >= normalized.playlistMinimumDonationVnd
      ? ''
      : `Cần tối thiểu ${normalized.playlistMinimumDonationVnd.toLocaleString('vi-VN')}đ để mở playlist.`
  };
}

function selectTracksWithinDuration(tracks, settings = DEFAULT_PLAYLIST_SETTINGS, blacklistVideoIds = []) {
  const normalized = normalizePlaylistSettings(settings);
  const blacklist = new Set((blacklistVideoIds || []).map(String));
  const seen = new Set();
  const accepted = [];
  const skipped = [];
  let totalDurationSec = 0;
  let hasUnknownDuration = false;

  for (const sourceTrack of (tracks || []).slice(0, normalized.playlistMaximumItemsToResolve)) {
    const track = { ...sourceTrack };
    const videoId = String(track.videoId || '');

    if (!videoId) {
      skipped.push({ ...track, skipReason: 'invalid_video_id', skipReasonText: 'Video không có ID hợp lệ.' });
      continue;
    }
    if (track.unavailableReason) {
      skipped.push({ ...track, skipReason: track.unavailableReason, skipReasonText: track.unavailableReasonText || 'Video không khả dụng.' });
      continue;
    }
    if (track.isLive || track.isUpcoming) {
      skipped.push({ ...track, skipReason: track.isUpcoming ? 'upcoming' : 'livestream', skipReasonText: 'Không nhận livestream hoặc video sắp phát.' });
      continue;
    }
    if (blacklist.has(videoId) || track.blacklisted) {
      skipped.push({ ...track, skipReason: 'blacklisted', skipReasonText: 'Video nằm trong danh sách chặn.' });
      continue;
    }
    const viewPolicy = evaluateViewCount(track.viewCount ?? track.views, normalized.minimumViewCount);
    if (!viewPolicy.accepted) {
      const unknown = viewPolicy.reason === 'unknown_view_count';
      skipped.push({
        ...track,
        viewCount: viewPolicy.count,
        skipReason: viewPolicy.reason,
        skipReasonText: unknown
          ? 'Không xác định được lượt xem của video.'
          : `Video có ${viewPolicy.count.toLocaleString('vi-VN')} lượt xem, dưới mốc ${viewPolicy.minimum.toLocaleString('vi-VN')}.`
      });
      continue;
    }
    if (normalized.playlistDeduplicateTracks && seen.has(videoId)) {
      skipped.push({ ...track, skipReason: 'duplicate', skipReasonText: 'Video bị trùng trong playlist.' });
      continue;
    }
    seen.add(videoId);

    const durationSec = Number(track.durationSec);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      hasUnknownDuration = true;
      skipped.push({ ...track, skipReason: 'unknown_duration', skipReasonText: 'Không xác định được thời lượng video.' });
      continue;
    }

    if (totalDurationSec + durationSec > normalized.playlistMaximumDurationSec) {
      skipped.push({ ...track, skipReason: 'duration_limit', skipReasonText: 'Bài này làm playlist vượt giới hạn thời lượng.' });
      continue;
    }

    accepted.push({ ...track, durationSec });
    totalDurationSec += durationSec;
  }

  return {
    accepted,
    skipped,
    totalDurationSec,
    hasUnknownDuration,
    status: hasUnknownDuration ? 'pending_review' : (accepted.length > 0 ? 'ready' : 'rejected'),
    rejectionReason: accepted.length === 0 ? (hasUnknownDuration ? 'unknown_duration' : 'no_valid_tracks') : null
  };
}

module.exports = {
  DEFAULT_PLAYLIST_SETTINGS,
  normalizePlaylistSettings,
  validatePlaylistAmount,
  selectTracksWithinDuration
};
