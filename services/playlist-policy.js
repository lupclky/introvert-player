'use strict';

const PLAYLIST_PRICING = Object.freeze({
  minimumDonationVnd: 500000,
  baseDurationSec: 30 * 60,
  extraDonationStepVnd: 50000,
  extraDurationStepSec: 5 * 60
});

const DEFAULT_PLAYLIST_SETTINGS = Object.freeze({
  playlistEnabled: true,
  playlistMinimumDonationVnd: PLAYLIST_PRICING.minimumDonationVnd,
  playlistBaseDurationSec: PLAYLIST_PRICING.baseDurationSec,
  playlistExtraDonationStepVnd: PLAYLIST_PRICING.extraDonationStepVnd,
  playlistExtraDurationStepSec: PLAYLIST_PRICING.extraDurationStepSec,
  // Giá trị tương thích cho các luồng playlist thêm thủ công. Với donation,
  // PlaylistService sẽ tính lại giới hạn theo đúng số tiền của request.
  playlistMaximumDurationSec: PLAYLIST_PRICING.baseDurationSec,
  playlistMaximumItemsToResolve: 50,
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
    playlistMinimumDonationVnd: clampInteger(input.playlistMinimumDonationVnd, PLAYLIST_PRICING.minimumDonationVnd, 0, 1000000000),
    playlistBaseDurationSec: clampInteger(input.playlistBaseDurationSec, PLAYLIST_PRICING.baseDurationSec, 60, Number.MAX_SAFE_INTEGER),
    playlistExtraDonationStepVnd: clampInteger(input.playlistExtraDonationStepVnd, PLAYLIST_PRICING.extraDonationStepVnd, 1, 1000000000),
    playlistExtraDurationStepSec: clampInteger(input.playlistExtraDurationStepSec, PLAYLIST_PRICING.extraDurationStepSec, 1, Number.MAX_SAFE_INTEGER),
    playlistMaximumDurationSec: clampInteger(input.playlistMaximumDurationSec, PLAYLIST_PRICING.baseDurationSec, 60, Number.MAX_SAFE_INTEGER),
    playlistMaximumItemsToResolve: clampInteger(input.playlistMaximumItemsToResolve, 50, 1, 100),
    playlistAutoAccept: normalizeBoolean(input.playlistAutoAccept, DEFAULT_PLAYLIST_SETTINGS.playlistAutoAccept),
    playlistContinuousPlayback: normalizeBoolean(input.playlistContinuousPlayback, DEFAULT_PLAYLIST_SETTINGS.playlistContinuousPlayback),
    playlistDeduplicateTracks: normalizeBoolean(input.playlistDeduplicateTracks, DEFAULT_PLAYLIST_SETTINGS.playlistDeduplicateTracks)
  };
}

function calculatePlaylistDurationLimitSec(amount, settings = DEFAULT_PLAYLIST_SETTINGS) {
  const normalized = normalizePlaylistSettings(settings);
  const donationAmount = Math.max(0, Number(amount) || 0);
  if (donationAmount < normalized.playlistMinimumDonationVnd) return 0;

  const extraAmount = donationAmount - normalized.playlistMinimumDonationVnd;
  const extraSteps = Math.floor(extraAmount / normalized.playlistExtraDonationStepVnd);
  return normalized.playlistBaseDurationSec + (extraSteps * normalized.playlistExtraDurationStepSec);
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
  PLAYLIST_PRICING,
  DEFAULT_PLAYLIST_SETTINGS,
  normalizePlaylistSettings,
  calculatePlaylistDurationLimitSec,
  validatePlaylistAmount,
  selectTracksWithinDuration
};
