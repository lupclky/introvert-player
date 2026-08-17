const { SyncedLyricsService } = require('../services/synced-lyrics-service');
const service = new SyncedLyricsService();

async function main() {
  const page = await fetch('https://www.youtube.com/watch?v=-cbGww7sL_s', {
    headers: { 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0' }
  }).then(r => r.text());
  
  const captionMatch = page.match(/"captionTracks":\s*(\[[^\]]+\])/);
  console.log('Captions:', captionMatch ? captionMatch[1] : 'No captions');

  const trace = await service.debug({ videoId: '-cbGww7sL_s' });
  console.log('TRACE providers:', trace.providers);
  console.log('TRACE canonical:', trace.canonical);
  console.log('TRACE identity:', trace.identity);
  console.log('TRACE apple:', trace.apple);
  console.log('TRACE exactCandidate:', trace.exactCandidate);
}

main().catch(console.error);
