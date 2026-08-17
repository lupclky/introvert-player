const https = require('https');
https.get('https://www.youtube.com/watch?v=CLSUxac0F9Q', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/"lengthSeconds":"(\d+)"/);
    console.log('Duration:', match ? match[1] : 'Not found');
  });
});
