const { SyncedLyricsService } = require('../services/synced-lyrics-service');
const service = new SyncedLyricsService();

async function main() {
  const oembed = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=sHxWsIfOsm0&format=json').then(r => r.json());
  console.log('OEMBED:', oembed);

  const yt = await service.fetchYouTubeIdentity('sHxWsIfOsm0', { includeCredits: true });
  console.log('YT IDENTITY:', yt);

  const trace = await service.debug({ videoId: 'sHxWsIfOsm0', sourceUrl: 'https://music.youtube.com/watch?v=sHxWsIfOsm0' });
  console.log('TRACE:', JSON.stringify(trace, null, 2));
}

main().catch(console.error);
