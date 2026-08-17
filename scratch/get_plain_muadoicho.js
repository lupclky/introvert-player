const { SyncedLyricsService } = require('../services/synced-lyrics-service');
const service = new SyncedLyricsService();

async function main() {
  const plain = await service.resolveYouTubeMusicPlainLyrics('sHxWsIfOsm0', { title: 'Mưa Đợi Chờ', artist: 'Miu Lê' });
  console.log('PLAIN LYRICS:');
  console.log(plain);
}

main().catch(console.error);
