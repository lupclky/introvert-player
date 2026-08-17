const { SyncedLyricsService } = require('../services/synced-lyrics-service');
const service = new SyncedLyricsService();

async function main() {
  const result = await service.resolve({ videoId: '-cbGww7sL_s' });
  console.log(result.lines.map(l => `[${l.time}] ${l.text}`).join('\n'));
}

main().catch(console.error);
