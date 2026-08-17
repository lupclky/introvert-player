const fs = require('fs');
const path = require('path');

function printCues(filename) {
  const content = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  const lines = content.split('\n');
  let currentStart = '';
  const list = [];
  for (const line of lines) {
    const m = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->/);
    if (m) {
      currentStart = m[1];
    } else if (currentStart && line.trim() && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
      const clean = line.replace(/<[^>]+>/g, '').replace(/\[âm nhạc\]/g, '').replace(/^>>\s*/, '').trim();
      if (clean) {
        list.push(`${currentStart} | ${clean}`);
      }
    }
  }

  const filtered = [];
  let last = '';
  for (const item of list) {
    const text = item.split('|')[1].trim();
    if (text !== last) {
      filtered.push(item);
      last = text;
    }
  }
  return filtered;
}

console.log('=== Live Band Cues ===');
console.log(printCues('exit_sign_liveband.vi-orig.vtt').join('\n'));
