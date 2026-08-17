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
          const duration = audioBuffer.duration;

          const frameSize = Math.floor(sampleRate * 0.05); // 50ms
          const hopSize = Math.floor(sampleRate * 0.025); // 25ms

          const vocalOnsets = [];
          let prevEnergy = 0;
          for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            let energy = 0;
            for (let j = 0; j < frameSize; j++) {
              energy += Math.abs(channelData[i + j]);
            }
            energy /= frameSize;

            const time = i / sampleRate;
            const diff = energy - prevEnergy;
            if (diff > 0.07) {
              vocalOnsets.push({
                time: Math.round(time * 100) / 100,
                energy: Math.round(energy * 1000) / 1000,
                diff: Math.round(diff * 1000) / 1000
              });
            }
            prevEnergy = energy;
          }

          resolve({ duration, vocalOnsets });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('Total duration:', analysis.duration);
    console.log('Filtered onsets:');
    const grouped = [];
    for (const o of analysis.vocalOnsets) {
      if (!grouped.length || o.time - grouped[grouped.length - 1].time > 1.2) {
        grouped.push(o);
      }
    }
    console.log(grouped.map(g => {
      const min = Math.floor(g.time / 60);
      const sec = (g.time % 60).toFixed(2).padStart(5, '0');
      return `${min}:${sec} (${g.time}s) energy=${g.energy} diff=${g.diff}`;
    }).join('\n'));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
