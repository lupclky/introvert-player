const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.vi-orig.vtt'), 'utf8');

// Parse timestamp tags like <00:01:00.280>
const lines = content.split('\n');
const results = [];
let currentText = '';
let currentStart = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  const timeMatch = line.match(/^(\d{2}):(\d{2}):(\d{2}\.\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}\.\d{3})/);
  if (timeMatch) {
    const s = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
    currentStart = s;
  } else if (line && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
    // Strip tags and [âm nhạc]
    const clean = line.replace(/<[^>]+>/g, '').replace(/\[âm nhạc\]/g, '').replace(/^>>\s*/, '').trim();
    if (clean && currentStart >= 55) {
      results.push({ time: currentStart, text: clean });
    }
  }
}

console.log('Subtitles from 55s onwards:');
let prev = '';
for (const r of results) {
  if (r.text !== prev) {
    const m = Math.floor(r.time / 60);
    const s = (r.time % 60).toFixed(2).padStart(5, '0');
    console.log(`[${String(m).padStart(2, '0')}:${s}] ${r.text}`);
    prev = r.text;
  }
}
