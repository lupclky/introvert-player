const ytdl = require('@distube/ytdl-core');
const https = require('https');

const videoId = '_Ujey4s2aOQ';
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

console.log(`Attempting to extract info for: ${videoUrl}`);

ytdl.getInfo(videoUrl)
  .then(info => {
    console.log('\n--- INFO SUCCESS ---');
    console.log(`Title: ${info.videoDetails.title}`);
    
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    console.log(`Found ${audioFormats.length} audio-only formats.`);
    
    if (audioFormats.length > 0) {
      audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      const bestAudio = audioFormats[0];
      const streamUrl = bestAudio.url;
      
      console.log(`Best MimeType: ${bestAudio.mimeType}`);
      console.log(`Attempting to fetch headers of the stream URL...`);
      
      const req = https.get(streamUrl, (res) => {
        console.log(`\nHTTP Response Status Code: ${res.statusCode}`);
        console.log(`HTTP Response Headers:`);
        console.log(`- Content-Type: ${res.headers['content-type']}`);
        console.log(`- Content-Length: ${res.headers['content-length']} bytes`);
        
        if (res.statusCode === 200 || res.statusCode === 206) {
          console.log('\n🌟 GREAT NEWS: The stream URL is VALID and working!');
        } else {
          console.log('\n❌ ERROR: The stream URL returned an error status code (e.g. 403 Forbidden).');
        }
        process.exit(0);
      });
      
      req.on('error', (err) => {
        console.error('Connection error:', err);
        process.exit(1);
      });
    } else {
      console.log('No audio formats found!');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n--- INFO FAILED ---');
    console.error(err);
    process.exit(1);
  });
