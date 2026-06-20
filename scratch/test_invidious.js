const https = require('https');

const videoId = '_Ujey4s2aOQ';

// List of public Invidious API instances
const invidiousInstances = [
  'https://yewtu.be',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://inv.vern.cc'
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
  for (const instance of invidiousInstances) {
    const invidiousUrl = `${instance}/api/v1/videos/${videoId}`;
    console.log(`\nQuerying Invidious API at: ${invidiousUrl}`);
    try {
      const response = await fetchJson(invidiousUrl);
      console.log(`HTTP Status: ${response.statusCode}`);
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(`Title: ${data.title}`);
        
        // Invidious formats are in data.adaptiveFormats
        const adaptiveFormats = data.adaptiveFormats || [];
        console.log(`Found ${adaptiveFormats.length} adaptive formats.`);
        
        // Find audio formats (type start with audio/)
        const audioFormats = adaptiveFormats.filter(f => f.type && f.type.startsWith('audio/'));
        console.log(`Found ${audioFormats.length} audio formats.`);
        
        if (audioFormats.length > 0) {
          // Sort by bitrate desc
          audioFormats.sort((a, b) => {
            const bitrateA = parseInt(a.bitrate) || 0;
            const bitrateB = parseInt(b.bitrate) || 0;
            return bitrateB - bitrateA;
          });
          
          const bestAudio = audioFormats[0];
          console.log(`Best Audio Format: ${bestAudio.type}, Bitrate: ${bestAudio.bitrate}`);
          
          // Test stream URL
          let streamUrl = bestAudio.url;
          if (streamUrl.startsWith('/')) {
            // URL is relative to the instance
            streamUrl = instance + streamUrl;
          }
          
          console.log(`Testing stream playability of: ${streamUrl.substring(0, 100)}...`);
          
          const streamRes = await new Promise((resolve, reject) => {
            const parsedStreamUrl = new URL(streamUrl);
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
            console.log('🌟 SUCCESS: Found a working Invidious direct audio stream!');
            console.log(`URL: ${streamUrl}`);
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
  console.log('\n❌ FAILED: All public Invidious API instances failed.');
  process.exit(1);
}

testInstances();
