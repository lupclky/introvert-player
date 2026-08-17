const { SyncedLyricsService } = require('../services/synced-lyrics-service');
const service = new SyncedLyricsService();

async function main() {
  const yt = await service.fetchYouTubeIdentity('-cbGww7sL_s', { includeCredits: true });
  console.log('YT:', yt);
  const result = await service.resolve({ videoId: '-cbGww7sL_s' });
  console.log('RESOLVE RESULT:', {
    available: result.available,
    source: result.source,
    synced: result.synced,
    track: result.trackName,
    artist: result.artistName,
    linesCount: result.lines?.length,
    first3: result.lines?.slice(0, 3)
  });
}

main().catch(console.error);
