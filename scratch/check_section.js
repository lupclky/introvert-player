const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.webm'));
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('about:blank');

    const result = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const raw = new Uint8Array(${JSON.stringify(Array.from(webmBuffer))}).buffer;
          const audioBuffer = await audioCtx.decodeAudioData(raw);

          const channelData = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;

          // Let's find every 1-second energy from 30s to 90s
          const out = [];
          for (let s = 30; s <= 90; s += 1) {
            const start = Math.floor(s * sampleRate);
            const len = sampleRate;
            let sum = 0;
            for (let i = 0; i < len; i++) sum += Math.abs(channelData[start + i]);
            out.push({ sec: s, energy: (sum / len).toFixed(3) });
          }
          resolve(out);
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('Energy per second (30s - 90s):');
    console.log(result.map(r => `${r.sec}s: ${r.energy}`).join('\n'));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
