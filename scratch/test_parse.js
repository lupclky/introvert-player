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
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

testSearch('alan walker faded').then(data => {
  const jsonObj = JSON.parse(data);
  const contents = jsonObj.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
  if (!contents) {
    console.error("No contents");
    return;
  }
  
  let items = [];
  for (const content of contents) {
    if (content.itemSectionRenderer) {
      items = content.itemSectionRenderer.contents;
      break;
    }
  }
  
  const videos = [];
  for (const item of items) {
    if (item.videoRenderer) {
      const v = item.videoRenderer;
      const videoId = v.videoId;
      const title = v.title?.runs?.[0]?.text || '';
      const thumbnail = v.thumbnail?.thumbnails?.[0]?.url || '';
      const duration = v.lengthText?.simpleText || '0:00';
      const author = v.ownerText?.runs?.[0]?.text || '';
      const views = v.viewCountText?.simpleText || '';
      
      if (videoId && title) {
        videos.push({
          videoId,
          title,
          thumbnail,
          duration,
          author,
          views,
          url: `https://www.youtube.com/watch?v=${videoId}`
        });
      }
    }
  }
  
  console.log("Parsed videos:", videos.slice(0, 3));
}).catch(err => {
  console.error("Error:", err);
});
