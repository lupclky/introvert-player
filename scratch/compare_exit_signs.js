const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const perfBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.webm'));
    const liveBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_liveband.webm'));
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('about:blank');

    const result = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const rawPerf = new Uint8Array(${JSON.stringify(Array.from(perfBuffer))}).buffer;
          const rawLive = new Uint8Array(${JSON.stringify(Array.from(liveBuffer))}).buffer;
          const bufPerf = await audioCtx.decodeAudioData(rawPerf);
          const bufLive = await audioCtx.decodeAudioData(rawLive);

          function findStart(buf) {
            const data = buf.getChannelData(0);
            const sr = buf.sampleRate;
            const step = Math.floor(sr * 0.1);
            let prev = 0;
            const onsets = [];
            for (let i = 0; i < Math.floor(120 * sr); i += step) {
              let sum = 0;
              for (let j = 0; j < step; j++) sum += Math.abs(data[i + j]);
              const avg = sum / step;
              const time = i / sr;
              if (avg - prev > 0.05 && time > 20) {
                onsets.push({ time: Math.round(time * 100) / 100, energy: Math.round(avg * 1000) / 1000 });
              }
              prev = avg;
            }
            return onsets;
          }

          resolve({
            perfDuration: bufPerf.duration,
            liveDuration: bufLive.duration,
            perfOnsets: findStart(bufPerf),
            liveOnsets: findStart(bufLive)
          });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('Perf duration:', result.perfDuration, 'Live duration:', result.liveDuration);
    console.log('\nFirst onsets in Performance (4ZFezhS5hZs):');
    console.log(result.perfOnsets.slice(0, 10));
    console.log('\nFirst onsets in Live Band (vmJ9RZa-0wc):');
    console.log(result.liveOnsets.slice(0, 10));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
