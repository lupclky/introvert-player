const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.webm'));
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('about:blank');

    // Analyze first 100 seconds in detail
    const detail = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const raw = new Uint8Array(${JSON.stringify(Array.from(webmBuffer))}).buffer;
          const audioBuffer = await audioCtx.decodeAudioData(raw);

          const channelData = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;

          // Find energy bursts in 0 - 100s
          const bursts = [];
          const step = 0.2; // 200ms
          const winSize = Math.floor(sampleRate * step);
          for (let i = 0; i < Math.floor(100 * sampleRate); i += winSize) {
            let sum = 0;
            for (let j = 0; j < winSize; j++) {
              sum += Math.abs(channelData[i + j]);
            }
            const avg = sum / winSize;
            bursts.push({ time: Math.round((i / sampleRate) * 10) / 10, energy: Math.round(avg * 1000) / 1000 });
          }

          resolve(bursts);
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('Bursts from 0s to 100s:');
    for (const b of detail) {
      if (b.energy > 0.09) {
        console.log(`${Math.floor(b.time/60)}:${(b.time%60).toFixed(1).padStart(4, '0')} (${b.time}s) energy=${b.energy}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
