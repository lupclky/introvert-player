const https = require('https');

const videoId = '_Ujey4s2aOQ';

// List of public Piped API instances
const pipedInstances = [
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.lunar.icu',
  'https://pipedapi.kavin.rocks',
  'https://piped-api.glitch.me'
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function testInstances() {
  for (const instance of pipedInstances) {
    const pipedUrl = `${instance}/streams/${videoId}`;
    console.log(`\nQuerying Piped API at: ${pipedUrl}`);
    try {
      const response = await fetchJson(pipedUrl);
      console.log(`HTTP Status: ${response.statusCode}`);
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`Title: ${data.title}`);
        const audioStreams = data.audioStreams || [];
        console.log(`Found ${audioStreams.length} audio streams.`);
        
        if (audioStreams.length > 0) {
          audioStreams.sort((a, b) => b.bitrate - a.bitrate);
          const bestAudio = audioStreams[0];
          console.log(`Best Audio Bitrate: ${bestAudio.bitrate} bps, Format: ${bestAudio.mimeType}`);
          console.log(`Testing stream playability...`);
          
          const streamRes = await new Promise((resolve, reject) => {
            const parsedStreamUrl = new URL(bestAudio.url);
            const streamOptions = {
              hostname: parsedStreamUrl.hostname,
              path: parsedStreamUrl.pathname + parsedStreamUrl.search,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            };
            https.get(streamOptions, resolve).on('error', reject);
          });
          
          console.log(`Stream Status: ${streamRes.statusCode}`);
          if (streamRes.statusCode === 200 || streamRes.statusCode === 206) {
            console.log('🌟 SUCCESS: Found a working direct audio stream!');
            console.log(`URL: ${bestAudio.url}`);
            return;
          } else {
            console.log('❌ Stream URL failed with status: ' + streamRes.statusCode);
          }
        }
      } else {
        console.log(`Instance failed or blocked (Cloudflare / Rate Limit)`);
      }
    } catch (e) {
      console.log(`Error on this instance: ${e.message}`);
    }
  }
  console.log('\n❌ FAILED: All public Piped API instances failed.');
  process.exit(1);
}

testInstances();
