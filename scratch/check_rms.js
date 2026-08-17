const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.webm'));
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('about:blank');

    const analysis = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const raw = new Uint8Array(${JSON.stringify(Array.from(webmBuffer))}).buffer;
          const audioBuffer = await audioCtx.decodeAudioData(raw);

          const channelData = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;

          // Compute RMS in 100ms windows
          const winSize = Math.floor(sampleRate * 0.1);
          const data = [];
          for (let i = 0; i < channelData.length - winSize; i += winSize) {
            let sum = 0;
            for (let j = 0; j < winSize; j++) {
              sum += channelData[i + j] * channelData[i + j];
            }
            const rms = Math.sqrt(sum / winSize);
            data.push({ time: Math.round((i / sampleRate) * 10) / 10, rms: Math.round(rms * 1000) / 1000 });
          }

          resolve(data);
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('RMS peaks:');
    for (let i = 1; i < analysis.length; i++) {
      if (analysis[i].rms - analysis[i-1].rms > 0.04) {
        const t = analysis[i].time;
        const min = Math.floor(t / 60);
        const sec = (t % 60).toFixed(1).padStart(4, '0');
        console.log(`${min}:${sec} (${t}s) rms=${analysis[i].rms}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
