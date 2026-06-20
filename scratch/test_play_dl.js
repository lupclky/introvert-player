const play = require('play-dl');
const https = require('https');

const videoId = '_Ujey4s2aOQ';
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

console.log(`Attempting to extract info for: ${videoUrl} using play-dl`);

async function run() {
  try {
    // play-dl stream method
    const streamInfo = await play.stream(videoUrl);
    console.log('\n--- SUCCESS ---');
    console.log(`Stream Type: ${streamInfo.type}`);
    console.log(`Stream URL: ${streamInfo.url.substring(0, 100)}...`);
    
    console.log(`\nTesting playability of the stream URL...`);
    
    const parsedUrl = new URL(streamInfo.url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    https.get(options, (res) => {
      console.log(`\nHTTP Response Status Code: ${res.statusCode}`);
      console.log(`HTTP Response Headers:`);
      console.log(`- Content-Type: ${res.headers['content-type']}`);
      console.log(`- Content-Length: ${res.headers['content-length']} bytes`);
      
      if (res.statusCode === 200 || res.statusCode === 206) {
        console.log('\n🌟 GREAT NEWS: play-dl successfully obtained a WORKING stream URL!');
        console.log(`Full URL: ${streamInfo.url}`);
      } else {
        console.log('\n❌ ERROR: The stream URL returned an error status code: ' + res.statusCode);
      }
      process.exit(0);
    }).on('error', (err) => {
      console.error('Connection error:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('\n--- FAILED ---');
    console.error(err);
    process.exit(1);
  }
}

run();
