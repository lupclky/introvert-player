const https = require('https');

async function testSearch(query) {
  const postData = JSON.stringify({
    query: query,
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20210621.02.00'
      }
    }
  });

  const reqOpts = {
    hostname: 'www.youtube.com',
    port: 443,
    path: '/youtubei/v1/search',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(reqOpts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

testSearch('alan walker faded').then(res => {
  console.log("Status:", res.statusCode);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));
  console.log("Body length:", res.body.length);
  if (res.statusCode !== 200) {
    console.log("Error Body:", res.body.substring(0, 1000));
  } else {
    try {
      const parsed = JSON.parse(res.body);
      console.log("Success! Parsed JSON keys:", Object.keys(parsed));
      if (parsed.contents) {
        console.log("Contents found!");
      } else {
        console.log("No contents. Full body snippet:", res.body.substring(0, 500));
      }
    } catch (e) {
      console.log("Failed to parse JSON:", e.message);
      console.log("Body snippet:", res.body.substring(0, 500));
    }
  }
}).catch(err => {
  console.error("Request Error:", err);
});
