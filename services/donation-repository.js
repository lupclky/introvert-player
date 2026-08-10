'use strict';

class DonationRepository {
  constructor(database) {
    this.db = database;
    this.migrate();
    this.statements = {
      list: this.db.prepare('SELECT * FROM donations ORDER BY timestamp DESC'),
      byId: this.db.prepare('SELECT * FROM donations WHERE id = ?'),
      duplicate: this.db.prepare('SELECT * FROM donations WHERE name = ? AND amount = ? AND abs(timestamp - ?) < 5000 LIMIT 1'),
      updateMusic: this.db.prepare('UPDATE donations SET songLink = ?, isMusicOrder = 1 WHERE id = ?'),
      insert: this.db.prepare(`
        INSERT INTO donations (id, name, amount, message, timestamp, isNew, songLink, isMusicOrder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      markRead: this.db.prepare('UPDATE donations SET isNew = 0 WHERE id = ?'),
      markAllRead: this.db.prepare('UPDATE donations SET isNew = 0 WHERE isNew = 1'),
      clear: this.db.prepare('DELETE FROM donations')
    };
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS donations (
        id TEXT PRIMARY KEY,
        name TEXT,
        amount REAL,
        message TEXT,
        timestamp INTEGER,
        isNew INTEGER,
        songLink TEXT,
        isMusicOrder INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_donations_timestamp ON donations(timestamp DESC);
    `);
  }

  static mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      amount: Number(row.amount),
      message: row.message || '',
      timestamp: Number(row.timestamp),
      isNew: row.isNew === 1,
      songLink: row.songLink || '',
      isMusicOrder: row.isMusicOrder === 1
    };
  }

  list() {
    return this.statements.list.all().map(DonationRepository.mapRow);
  }

  add(donation = {}) {
    const id = donation.id || `manual_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const name = donation.name || '';
    const amount = Number(donation.amount) || 0;
    const message = donation.message || '';
    const timestamp = Number(donation.timestamp) || Date.now();
    const isNew = donation.isNew !== undefined ? donation.isNew : true;
    const songLink = donation.songLink || '';
    const isMusicOrder = donation.isMusicOrder ? 1 : 0;
    const existing = (donation.id ? this.statements.byId.get(donation.id) : null)
      || this.statements.duplicate.get(name, amount, timestamp);

    if (existing) {
      if (songLink && !existing.songLink) {
        this.statements.updateMusic.run(songLink, existing.id);
        return { success: true, updated: true, id: existing.id };
      }
      return { success: true, updated: false, id: existing.id };
    }

    this.statements.insert.run(id, name, amount, message, timestamp, isNew ? 1 : 0, songLink, isMusicOrder);
    return { success: true, inserted: true, id };
  }

  markRead(id) {
    return this.statements.markRead.run(id).changes > 0;
  }

  markAllRead() {
    return this.statements.markAllRead.run().changes > 0;
  }

  clear() {
    this.statements.clear.run();
    return true;
  }
}

module.exports = { DonationRepository };
