'use strict';

const crypto = require('crypto');
const { parsePlaylistDonationMessage, parseYoutubeUrl } = require('./playlist-message-parser');
const {
  normalizePlaylistSettings,
  calculatePlaylistDurationLimitSec,
  validatePlaylistAmount,
  selectTracksWithinDuration
} = require('./playlist-policy');

const REASON_TEXT = {
  insufficient_amount: 'Số tiền donate chưa đạt mức tối thiểu để tự động nhận playlist.',
  manual_accept_required: 'Playlist đang chờ streamer kiểm tra và chấp nhận.',
  unknown_duration: 'Có video chưa xác định được thời lượng.',
  no_valid_tracks: 'Playlist không còn video hợp lệ sau khi kiểm tra.',
  rejected_by_streamer: 'Streamer đã từ chối playlist.',
  skipped_by_streamer: 'Streamer đã bỏ qua toàn bộ playlist.',
  converted_to_single: 'Playlist đã được chuyển thành một bài đơn.',
  playlist_disabled: 'Tính năng nhận playlist đang tắt.'
};

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 18)}`;
}

class PlaylistService {
  constructor(options = {}) {
    this.repository = options.repository;
    this.provider = options.provider;
    this.emit = typeof options.emit === 'function' ? options.emit : () => {};
    if (!this.repository || !this.provider) throw new TypeError('repository and provider are required');
  }

  event(type, data) {
    this.emit(type, data);
  }

  async processDonation(donation, rawSettings = {}, blacklistVideoIds = []) {
    const settings = normalizePlaylistSettings(rawSettings);
    let parsed = parsePlaylistDonationMessage(donation?.message || '');
    // Một số event nhạc chính thức của ZyPage tách URL khỏi lời nhắn và đặt nó
    // trong songLink. Chỉ dùng nguồn này khi message chưa nhận diện playlist để
    // tránh đưa cùng một URL vào bộ phân tích hai lần.
    if (!parsed.matched && donation?.songLink) {
      parsed = parsePlaylistDonationMessage(donation.songLink);
    }
    if (!parsed.matched) return { matched: false };

    const donationId = String(donation?.id || '').trim();
    if (!donationId) return { matched: true, status: 'pending_review', error: 'missing_donation_id' };

    const existing = this.repository.getByDonationId(donationId);
    if (existing) return { matched: true, idempotent: true, request: existing };

    const now = Date.now();
    const requestId = stableId('playlist', donationId);
    const placeholder = {
      id: requestId,
      donationId,
      donorName: String(donation?.name || 'Khách'),
      donationAmount: Math.max(0, Number(donation?.amount) || 0),
      originalMessage: String(donation?.message || ''),
      source: 'youtube',
      externalPlaylistId: parsed.playlistId || '',
      title: '',
      status: 'received',
      rejectionReason: '',
      rejectionText: '',
      createdAt: now,
      updatedAt: now
    };
    const claim = this.repository.claim(placeholder);
    if (!claim.created) return { matched: true, idempotent: true, request: claim.request };

    this.event('playlist.detected', {
      playlistRequestId: requestId,
      donationId,
      donorName: placeholder.donorName,
      donationAmount: placeholder.donationAmount
    });

    if (!settings.playlistEnabled) {
      const request = this.repository.updateRequest(requestId, {
        status: 'rejected', rejectionReason: 'playlist_disabled', rejectionText: REASON_TEXT.playlist_disabled
      });
      this.event('playlist.rejected', { playlistRequestId: requestId, reason: 'playlist_disabled' });
      return { matched: true, request };
    }

    if (parsed.kind === 'pending_review') {
      const request = this.repository.updateRequest(requestId, {
        status: 'pending_review', rejectionReason: parsed.reason, rejectionText: parsed.reasonText
      });
      return { matched: true, request };
    }

    this.event('playlist.validating', { playlistRequestId: requestId, stage: 'validating_amount' });
    const amountResult = validatePlaylistAmount(placeholder.donationAmount, settings);
    if (!amountResult.valid) {
      const request = this.repository.updateRequest(requestId, {
        status: 'pending_review', rejectionReason: amountResult.reason, rejectionText: amountResult.reasonText
      });
      return { matched: true, request };
    }

    if (!settings.playlistAutoAccept) {
      const request = this.repository.updateRequest(requestId, {
        status: 'pending_review', rejectionReason: 'manual_accept_required', rejectionText: REASON_TEXT.manual_accept_required
      });
      return { matched: true, request };
    }

    return { matched: true, request: await this.resolveAndAccept(requestId, settings, blacklistVideoIds) };
  }

  async processManualPlaylist(sourceUrl, context = {}, rawSettings = {}, blacklistVideoIds = []) {
    const parsed = parseYoutubeUrl(sourceUrl);
    if (!parsed?.playlistId) {
      return { matched: false, error: 'invalid_playlist_url' };
    }

    const now = Date.now();
    const nonce = crypto.randomBytes(8).toString('hex');
    const donationId = `manual_playlist:${now}:${nonce}`;
    const requestId = stableId('playlist', donationId);
    const isOwnerAdd = Boolean(context.isOwnerAdd);
    const placeholder = {
      id: requestId,
      donationId,
      donorName: String(context.donorName || (isOwnerAdd ? 'Chủ kênh' : 'mèo 3k')),
      donationAmount: Math.max(0, Number(context.donationAmount) || 0),
      originalMessage: String(sourceUrl || ''),
      source: isOwnerAdd ? 'manual_owner' : 'manual_quick_add',
      externalPlaylistId: parsed.playlistId,
      title: '',
      status: 'received',
      rejectionReason: '',
      rejectionText: '',
      createdAt: now,
      updatedAt: now
    };

    const claim = this.repository.claim(placeholder);
    if (!claim.created) {
      return { matched: true, idempotent: true, request: claim.request };
    }

    this.event('playlist.detected', {
      playlistRequestId: requestId,
      donationId,
      donorName: placeholder.donorName,
      donationAmount: placeholder.donationAmount,
      manual: true
    });

    const settings = {
      ...rawSettings,
      playlistEnabled: true,
      playlistAutoAccept: true
    };
    const request = await this.resolveAndAccept(requestId, settings, blacklistVideoIds);
    return { matched: true, request };
  }

  async resolveAndAccept(requestId, rawSettings = {}, blacklistVideoIds = []) {
    const settings = normalizePlaylistSettings(rawSettings);
    let request = this.repository.getById(requestId);
    if (!request) throw new Error('playlist_request_not_found');
    if (!request.externalPlaylistId) {
      return this.repository.updateRequest(requestId, {
        status: 'pending_review', rejectionReason: 'invalid_playlist_url', rejectionText: 'Không có Playlist ID hợp lệ.'
      });
    }

    this.repository.updateRequest(requestId, { status: 'fetching_metadata', rejectionReason: '', rejectionText: '' });
    this.event('playlist.validating', { playlistRequestId: requestId, stage: 'fetching_metadata', resolvedItems: 0 });

    try {
      const resolved = await this.provider.resolve(request.externalPlaylistId, {
        maxItems: settings.playlistMaximumItemsToResolve,
        onProgress: progress => this.event('playlist.validating', {
          playlistRequestId: requestId,
          stage: 'fetching_metadata',
          resolvedItems: progress.resolvedItems,
          totalItems: progress.totalItems
        })
      });
      this.event('playlist.validating', {
        playlistRequestId: requestId,
        stage: 'fetching_metadata',
        resolvedItems: resolved.tracks.length,
        totalItems: resolved.sourceItemCount || resolved.tracks.length
      });

      // Playlist donate dùng hạn mức động theo số tiền. Playlist thêm thủ công
      // không có donation nên nhận đúng thời lượng cơ sở của chính sách.
      const pricingAmount = request.donationAmount >= settings.playlistMinimumDonationVnd
        ? request.donationAmount
        : settings.playlistMinimumDonationVnd;
      const durationLimitSec = calculatePlaylistDurationLimitSec(pricingAmount, settings);
      const selection = selectTracksWithinDuration(resolved.tracks, {
        ...settings,
        playlistMaximumDurationSec: durationLimitSec
      }, blacklistVideoIds);
      const skippedReasons = selection.skipped.reduce((summary, track) => {
        const reason = track.skipReason || 'unknown';
        summary[reason] = (summary[reason] || 0) + 1;
        return summary;
      }, {});
      this.event('playlist.validating', {
        playlistRequestId: requestId,
        stage: 'filtered',
        sourceItems: resolved.tracks.length,
        acceptedItems: selection.accepted.length,
        skippedItems: selection.skipped.length,
        durationLimitSec,
        skippedReasons
      });
      const acceptedTracks = selection.accepted.map(track => ({
        ...track,
        id: stableId('playlist_track', `${requestId}:${track.position}:${track.videoId}`),
        status: 'queued'
      }));
      const skippedTracks = selection.skipped.map(track => ({
        ...track,
        id: stableId('playlist_track', `${requestId}:${track.position}:${track.videoId || 'invalid'}`),
        status: track.skipReason === 'unknown_duration' ? 'error' : 'unavailable'
      }));
      const status = selection.status;
      const reason = selection.rejectionReason || '';
      request = this.repository.saveResolved({
        ...request,
        externalPlaylistId: resolved.externalPlaylistId,
        title: resolved.title,
        ownerName: resolved.ownerName,
        thumbnailUrl: resolved.thumbnailUrl,
        sourceItemCount: resolved.sourceItemCount,
        totalDurationSec: selection.totalDurationSec,
        status,
        rejectionReason: reason,
        rejectionText: REASON_TEXT[reason] || ''
      }, acceptedTracks, skippedTracks);

      if (status === 'ready') {
        this.event('playlist.accepted', this.toAcceptedEvent(request));
      } else if (status === 'rejected') {
        this.event('playlist.rejected', { playlistRequestId: requestId, reason: reason || 'no_valid_tracks' });
      }
      return request;
    } catch (error) {
      request = this.repository.updateRequest(requestId, {
        status: 'error', rejectionReason: 'metadata_error', rejectionText: `Không thể lấy playlist: ${error.message}`
      });
      this.event('playlist.rejected', { playlistRequestId: requestId, reason: 'metadata_error' });
      return request;
    }
  }

  overrideSource(requestId, sourceUrl) {
    const parsed = parseYoutubeUrl(sourceUrl);
    if (!parsed?.playlistId) throw new Error('invalid_playlist_url');
    return this.repository.updateRequest(requestId, {
      externalPlaylistId: parsed.playlistId,
      status: 'pending_review',
      rejectionReason: '',
      rejectionText: ''
    });
  }

  toAcceptedEvent(request) {
    return {
      playlistRequestId: request.id,
      playlistTitle: request.title,
      donorName: request.donorName,
      donationAmount: request.donationAmount,
      acceptedItemCount: request.acceptedItemCount,
      skippedItemCount: request.skippedItemCount,
      totalDurationSec: request.totalDurationSec,
      thumbnailUrl: request.thumbnailUrl
    };
  }

  markQueued(requestId) {
    const request = this.repository.updateRequest(requestId, { status: 'queued' });
    if (request) this.event('playlist.queued', this.toAcceptedEvent(request));
    return request;
  }

  reject(requestId, reason = 'rejected_by_streamer') {
    const request = this.repository.updateRequest(requestId, {
      status: 'rejected', rejectionReason: reason, rejectionText: REASON_TEXT[reason] || reason
    });
    if (request) this.event('playlist.rejected', { playlistRequestId: requestId, reason });
    return request;
  }

  async convertToSingle(requestId, settings = {}) {
    let request = this.repository.getById(requestId);
    if (!request) throw new Error('playlist_request_not_found');
    if (!request.tracks?.some(track => track.videoId && track.durationSec > 0)) {
      request = await this.resolveAndAccept(requestId, { ...settings, playlistAutoAccept: true });
    }
    const track = request.tracks?.find(item => item.videoId && item.durationSec > 0 && item.status !== 'unavailable');
    if (!track) return { success: false, error: 'no_valid_tracks' };
    this.reject(requestId, 'converted_to_single');
    return { success: true, request, track };
  }

  trackStarted(trackId) {
    const track = this.repository.updateTrack(trackId, 'playing');
    if (!track) return null;
    const request = this.repository.updateRequest(track.playlistRequestId, { status: 'playing' });
    const playable = request.tracks.filter(item =>
      item.status !== 'unavailable' && !(item.status === 'error' && item.skipReason === 'unknown_duration')
    );
    const currentIndex = Math.max(0, playable.findIndex(item => item.id === track.id));
    const remainingPlaylistSec = playable.slice(currentIndex).reduce((sum, item) => sum + item.durationSec, 0);
    const data = {
      playlistRequestId: request.id,
      playlistTitle: request.title,
      donorName: request.donorName,
      currentTrack: currentIndex + 1,
      totalTracks: Number(request.acceptedItemCount || playable.length),
      remainingPlaylistSec,
      totalDurationSec: request.totalDurationSec,
      track
    };
    this.event(currentIndex === 0 ? 'playlist.started' : 'playlist.track_started', data);
    if (currentIndex === 0) this.event('playlist.track_started', data);
    return { request, track, data };
  }

  trackFinished(trackId, status = 'played', reason = '') {
    const normalizedStatus = ['played', 'skipped', 'error'].includes(status) ? status : 'skipped';
    const track = this.repository.updateTrack(trackId, normalizedStatus, reason, reason ? (REASON_TEXT[reason] || reason) : '');
    if (!track) return null;
    let request = this.repository.getById(track.playlistRequestId);
    const playedDurationSec = request.tracks
      .filter(item => item.status === 'played')
      .reduce((sum, item) => sum + item.durationSec, 0);
    const remaining = request.tracks.filter(item => ['queued', 'playing'].includes(item.status));
    if (remaining.length === 0) {
      request = this.repository.updateRequest(request.id, { status: 'completed', playedDurationSec });
      this.event('playlist.completed', {
        playlistRequestId: request.id,
        playlistTitle: request.title,
        donorName: request.donorName,
        acceptedItemCount: request.acceptedItemCount,
        totalDurationSec: request.totalDurationSec
      });
    } else {
      request = this.repository.updateRequest(request.id, { playedDurationSec });
      this.event(normalizedStatus === 'played' ? 'playlist.track_progress' : 'playlist.track_skipped', {
        playlistRequestId: request.id,
        trackId,
        status: normalizedStatus,
        reason
      });
    }
    return { request, track };
  }

  pause(requestId) {
    const request = this.repository.updateRequest(requestId, { status: 'paused' });
    if (request) this.event('playlist.paused', { playlistRequestId: request.id });
    return request;
  }

  resume(requestId) {
    const request = this.repository.updateRequest(requestId, { status: 'playing' });
    if (request) this.event('playlist.resumed', { playlistRequestId: request.id });
    return request;
  }

  skipPlaylist(requestId) {
    const request = this.repository.getById(requestId);
    if (!request) return null;
    request.tracks.filter(track => ['queued', 'playing'].includes(track.status))
      .forEach(track => this.repository.updateTrack(track.id, 'skipped', 'skipped_by_streamer', REASON_TEXT.skipped_by_streamer));
    const updated = this.repository.updateRequest(requestId, {
      status: 'completed', rejectionReason: 'skipped_by_streamer', rejectionText: REASON_TEXT.skipped_by_streamer
    });
    this.event('playlist.completed', {
      playlistRequestId: updated.id,
      playlistTitle: updated.title,
      donorName: updated.donorName,
      acceptedItemCount: updated.acceptedItemCount,
      totalDurationSec: updated.totalDurationSec,
      skipped: true
    });
    return updated;
  }
}

module.exports = { PlaylistService, REASON_TEXT, stableId };
