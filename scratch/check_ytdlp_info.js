const { execFile } = require('child_process');
const path = require('path');

const ytdlp = path.join(__dirname, 'yt-dlp.exe');
const videoUrl = 'https://www.youtube.com/watch?v=sHxWsIfOsm0';

console.log('Fetching stream info for sHxWsIfOsm0...');
execFile(ytdlp, ['-j', videoUrl], (err, stdout, stderr) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  const data = JSON.parse(stdout);
  console.log('Title:', data.title);
  console.log('Duration:', data.duration);
  console.log('Description:', data.description);
  console.log('Subtitles:', data.subtitles);
  console.log('Automatic captions:', Object.keys(data.automatic_captions || {}));
});
