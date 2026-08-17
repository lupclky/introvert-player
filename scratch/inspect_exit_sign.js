const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.webm'));
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('about:blank');

    const segments = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const raw = new Uint8Array(${JSON.stringify(Array.from(webmBuffer))}).buffer;
          const audioBuffer = await audioCtx.decodeAudioData(raw);

          const channelData = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;
          const duration = audioBuffer.duration;

          // Let's sample energy in 0.5s windows across the entire 260s
          const profile = [];
          const step = 0.5;
          for (let t = 0; t < duration - step; t += step) {
            const start = Math.floor(t * sampleRate);
            const len = Math.floor(step * sampleRate);
            let sum = 0;
            for (let i = 0; i < len; i++) {
              sum += Math.abs(channelData[start + i]);
            }
            profile.push({ time: Math.round(t * 10) / 10, energy: Math.round((sum / len) * 1000) / 1000 });
          }

          resolve({ duration, profile });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('Energy profile around start of singing (0s - 120s):');
    for (const p of segments.profile) {
      if (p.time <= 120 && p.energy > 0.08) {
        console.log(`t=${p.time}s (${Math.floor(p.time/60)}:${(p.time%60).toFixed(1).padStart(4, '0')}) energy=${p.energy}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
