const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'overlay.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const query = process.argv[2] || 'obs-direct-audio-player';
console.log(`Searching for: "${query}" in overlay.html...`);

lines.forEach((line, idx) => {
  if (line.toLowerCase().includes(query.toLowerCase())) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
