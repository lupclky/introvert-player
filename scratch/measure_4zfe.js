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

          // Window of 50ms, step 25ms
          const winSize = Math.floor(sampleRate * 0.05);
          const step = Math.floor(sampleRate * 0.025);
          const peaks = [];
          let prevEnergy = 0;
          for (let i = 0; i < channelData.length - winSize; i += step) {
            let sum = 0;
            for (let j = 0; j < winSize; j++) sum += Math.abs(channelData[i + j]);
            const energy = sum / winSize;
            const time = i / sampleRate;
            const diff = energy - prevEnergy;
            if (diff > 0.06 && time >= 50 && time <= 250) {
              peaks.push({ time: Math.round(time * 100) / 100, energy: Math.round(energy * 1000) / 1000, diff: Math.round(diff * 1000) / 1000 });
            }
            prevEnergy = energy;
          }

          resolve(peaks);
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    // Group peaks within 1.0s
    const grouped = [];
    for (const p of result) {
      if (!grouped.length || p.time - grouped[grouped.length - 1].time >= 0.8) {
        grouped.push(p);
      }
    }

    console.log('Detected Vocal Onsets in 4ZFezhS5hZs:');
    console.log(grouped.map(g => {
      const m = Math.floor(g.time / 60);
      const s = (g.time % 60).toFixed(2).padStart(5, '0');
      return `[${String(m).padStart(2, '0')}:${s}] (${g.time}s) energy=${g.energy} diff=${g.diff}`;
    }).join('\n'));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
