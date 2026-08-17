const { SyncedLyricsService } = require('../services/synced-lyrics-service');
const service = new SyncedLyricsService();

async function main() {
  const canonical = {
    title: '2 Phút Hơn (Make It Hot) [KAIZ Remix]',
    artist: 'Pháo & Tyga',
    album: '2 Phút Hơn (Make It Hot) [KAIZ Remix] - Single',
    duration: 159
  };
  
  const searchUrl = 'https://lrclib.net/api/search?q=' + encodeURIComponent('2 Phút Hơn Make It Hot');
  const matches = await fetch(searchUrl).then(r => r.json());
  
  for (const item of matches) {
    if (!item.syncedLyrics) continue;
    const score = service.scoreLyricsCandidate(item, canonical);
    const related = service.isLyricsCandidateRelated(item, canonical);
    const versionMatches = SyncedLyricsService.hasNamedVersionCredits(item, canonical);
    const compatDuration = service.hasCompatibleDuration(item, canonical);
    const quality = SyncedLyricsService.getLyricsQuality(item);
    const hasRequiredArtists = SyncedLyricsService.hasRequiredArtists(item, canonical);
    console.log({
      id: item.id,
      name: item.trackName,
      artist: item.artistName,
      score,
      related,
      hasRequiredArtists,
      versionMatches,
      compatDuration,
      linesCount: quality.lines.length
    });
  }
}

main().catch(console.error);
