const play = require('play-dl');

const videoId = '_Ujey4s2aOQ';
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

console.log(`Getting video info for: ${videoUrl}`);

async function run() {
  try {
    const videoInfo = await play.video_info(videoUrl);
    console.log('\n--- SUCCESS ---');
    console.log(`Title: ${videoInfo.video_details.title}`);
    console.log(`Formats Available: ${videoInfo.format.length}`);
    
    // Find audio only formats
    const audioFormats = videoInfo.format.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));
    console.log(`Found ${audioFormats.length} audio formats.`);
    
    if (audioFormats.length > 0) {
      console.log(`Best audio stream url: ${audioFormats[0].url ? 'Found' : 'Missing (undefined)'}`);
    }
  } catch (err) {
    console.error('\n--- FAILED ---');
    console.error(err);
  }
}

run();
