'use strict';

class PlaylistRepository {
  constructor(database) {
    if (!database) throw new TypeError('database is required');
    this.db = database;
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS playlist_requests (
        id TEXT PRIMARY KEY,
        donation_id TEXT NOT NULL UNIQUE,
        donor_name TEXT NOT NULL,
        donation_amount INTEGER NOT NULL DEFAULT 0,
        original_message TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'youtube',
        external_playlist_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        owner_name TEXT,
        thumbnail_url TEXT,
        source_item_count INTEGER NOT NULL DEFAULT 0,
        accepted_item_count INTEGER NOT NULL DEFAULT 0,
        skipped_item_count INTEGER NOT NULL DEFAULT 0,
        total_duration_sec INTEGER NOT NULL DEFAULT 0,
        played_duration_sec INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        rejection_reason TEXT,
        rejection_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_requests_status ON playlist_requests(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id TEXT PRIMARY KEY,
        playlist_request_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        channel_name TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT,
        duration_sec INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        skip_reason TEXT,
        skip_reason_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(playlist_request_id, position),
        FOREIGN KEY(playlist_request_id) REFERENCES playlist_requests(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_tracks_request ON playlist_tracks(playlist_request_id, position);
    `);
  }

  mapRequest(row) {
    if (!row) return null;
    return {
      id: row.id,
      donationId: row.donation_id,
      donorName: row.donor_name,
      donationAmount: Number(row.donation_amount || 0),
      originalMessage: row.original_message || '',
      source: row.source || 'youtube',
      externalPlaylistId: row.external_playlist_id || '',
      title: row.title || '',
      ownerName: row.owner_name || '',
      thumbnailUrl: row.thumbnail_url || '',
      sourceItemCount: Number(row.source_item_count || 0),
      acceptedItemCount: Number(row.accepted_item_count || 0),
      skippedItemCount: Number(row.skipped_item_count || 0),
      totalDurationSec: Number(row.total_duration_sec || 0),
      playedDurationSec: Number(row.played_duration_sec || 0),
      status: row.status,
      rejectionReason: row.rejection_reason || '',
      rejectionText: row.rejection_text || '',
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  mapTrack(row) {
    if (!row) return null;
    return {
      id: row.id,
      playlistRequestId: row.playlist_request_id,
      position: Number(row.position),
      videoId: row.video_id,
      title: row.title,
      channelName: row.channel_name || '',
      thumbnailUrl: row.thumbnail_url || '',
      durationSec: Number(row.duration_sec || 0),
      status: row.status,
      skipReason: row.skip_reason || '',
      skipReasonText: row.skip_reason_text || '',
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    };
  }

  getTracks(requestId) {
    return this.db.prepare('SELECT * FROM playlist_tracks WHERE playlist_request_id = ? ORDER BY position ASC')
      .all(requestId).map(row => this.mapTrack(row));
  }

  hydrate(row) {
    const request = this.mapRequest(row);
    if (!request) return null;
    request.tracks = this.getTracks(request.id);
    return request;
  }

  getByDonationId(donationId) {
    return this.hydrate(this.db.prepare('SELECT * FROM playlist_requests WHERE donation_id = ?').get(String(donationId)));
  }

  getById(id) {
    return this.hydrate(this.db.prepare('SELECT * FROM playlist_requests WHERE id = ?').get(String(id)));
  }

  claim(request) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO playlist_requests (
        id, donation_id, donor_name, donation_amount, original_message, source,
        external_playlist_id, title, status, rejection_reason, rejection_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id, request.donationId, request.donorName, request.donationAmount,
      request.originalMessage, request.source || 'youtube', request.externalPlaylistId || '',
      request.title || '', request.status || 'received', request.rejectionReason || null,
      request.rejectionText || null, request.createdAt, request.updatedAt
    );
    return { created: Number(result.changes || 0) > 0, request: this.getByDonationId(request.donationId) };
  }

  saveResolved(request, acceptedTracks, skippedTracks) {
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`
        UPDATE playlist_requests SET external_playlist_id = ?, title = ?, owner_name = ?, thumbnail_url = ?,
          source_item_count = ?, accepted_item_count = ?, skipped_item_count = ?, total_duration_sec = ?,
          status = ?, rejection_reason = ?, rejection_text = ?, updated_at = ? WHERE id = ?
      `).run(
        request.externalPlaylistId || '', request.title || '', request.ownerName || '', request.thumbnailUrl || '',
        request.sourceItemCount || 0, acceptedTracks.length, skippedTracks.length, request.totalDurationSec || 0,
        request.status, request.rejectionReason || null, request.rejectionText || null, now, request.id
      );
      this.db.prepare('DELETE FROM playlist_tracks WHERE playlist_request_id = ?').run(request.id);
      const insert = this.db.prepare(`
        INSERT INTO playlist_tracks (
          id, playlist_request_id, position, video_id, title, channel_name, thumbnail_url,
          duration_sec, status, skip_reason, skip_reason_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      [...acceptedTracks.map(track => ({ ...track, status: 'queued' })), ...skippedTracks.map(track => ({ ...track, status: track.status || 'unavailable' }))]
        .forEach((track, index) => insert.run(
          track.id, request.id, Number(track.position || index + 1), track.videoId || '', track.title || '',
          track.channelName || '', track.thumbnailUrl || '', Number(track.durationSec || 0), track.status,
          track.skipReason || null, track.skipReasonText || null, now, now
        ));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getById(request.id);
  }

  updateRequest(id, fields = {}) {
    const allowed = {
      status: 'status', rejectionReason: 'rejection_reason', rejectionText: 'rejection_text',
      playedDurationSec: 'played_duration_sec', title: 'title', ownerName: 'owner_name', thumbnailUrl: 'thumbnail_url',
      externalPlaylistId: 'external_playlist_id'
    };
    const entries = Object.entries(fields).filter(([key]) => allowed[key]);
    if (entries.length === 0) return this.getById(id);
    const assignments = entries.map(([key]) => `${allowed[key]} = ?`);
    const values = entries.map(([, value]) => value);
    assignments.push('updated_at = ?');
    values.push(Date.now(), id);
    this.db.prepare(`UPDATE playlist_requests SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  updateTrack(id, status, reason = '', reasonText = '') {
    this.db.prepare(`UPDATE playlist_tracks SET status = ?, skip_reason = ?, skip_reason_text = ?, updated_at = ? WHERE id = ?`)
      .run(status, reason || null, reasonText || null, Date.now(), id);
    const row = this.db.prepare('SELECT * FROM playlist_tracks WHERE id = ?').get(id);
    return this.mapTrack(row);
  }

  listPending() {
    return this.db.prepare("SELECT * FROM playlist_requests WHERE status = 'pending_review' ORDER BY created_at ASC")
      .all().map(row => this.hydrate(row));
  }

  listActive() {
    return this.db.prepare("SELECT * FROM playlist_requests WHERE status IN ('ready','queued','playing','paused') ORDER BY created_at ASC")
      .all().map(row => this.hydrate(row));
  }
}

module.exports = { PlaylistRepository };
