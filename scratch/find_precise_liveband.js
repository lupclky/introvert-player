const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_liveband.webm'));
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

          const frameSize = Math.floor(sampleRate * 0.02);
          const hopSize = Math.floor(sampleRate * 0.01);
          const env = [];
          for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            let sum = 0;
            for (let j = 0; j < frameSize; j++) {
              sum += channelData[i + j] * channelData[i + j];
            }
            const rms = Math.sqrt(sum / frameSize);
            env.push({ time: i / sampleRate, rms });
          }

          function findPeakInRange(tMin, tMax) {
            let bestTime = tMin;
            let maxDiff = -1;
            for (let i = 10; i < env.length - 10; i++) {
              const t = env[i].time;
              if (t >= tMin && t <= tMax) {
                const diff = env[i].rms - env[i - 5].rms;
                if (diff > maxDiff) {
                  maxDiff = diff;
                  bestTime = t;
                }
              }
            }
            return { time: Math.round(bestTime * 100) / 100, maxDiff: Math.round(maxDiff * 1000) / 1000 };
          }

          resolve({
            v1_1: findPeakInRange(59.5, 62.0),
            v1_2: findPeakInRange(62.0, 64.5),
            v1_3: findPeakInRange(65.0, 67.5),
            v1_4: findPeakInRange(68.0, 70.0),
            v1_5: findPeakInRange(71.0, 73.0),
            v1_6: findPeakInRange(74.0, 76.5),
            v1_7: findPeakInRange(77.5, 79.8),
            v1_8: findPeakInRange(80.5, 83.0),
            v1_9: findPeakInRange(83.5, 86.0),
            v1_10: findPeakInRange(86.5, 89.0),
            v1_11: findPeakInRange(89.5, 92.0),
            v1_12: findPeakInRange(92.5, 95.0),
            v1_13: findPeakInRange(95.5, 98.0),
            v1_14: findPeakInRange(98.5, 101.0),
            v1_15: findPeakInRange(101.5, 104.0),
            v1_16: findPeakInRange(104.5, 107.5),
            c1_1: findPeakInRange(110.5, 114.0),
            c1_2: findPeakInRange(114.5, 118.0),
            c1_3: findPeakInRange(119.5, 123.0),
            c1_4: findPeakInRange(124.5, 128.0),
            c1_5: findPeakInRange(128.0, 131.0),
            c1_6: findPeakInRange(132.0, 135.0),
            v2_1: findPeakInRange(135.0, 138.0),
            v2_2: findPeakInRange(138.0, 141.0),
            v2_3: findPeakInRange(141.5, 144.0),
            v2_4: findPeakInRange(144.5, 147.0),
            v2_5: findPeakInRange(147.0, 149.5),
            v2_6: findPeakInRange(150.0, 153.0),
            v2_7: findPeakInRange(153.5, 156.0),
            v2_8: findPeakInRange(156.5, 159.0),
            v2_9: findPeakInRange(160.0, 163.0),
            v2_10: findPeakInRange(163.0, 165.5),
            v2_11: findPeakInRange(166.0, 168.5),
            v2_12: findPeakInRange(169.0, 171.5),
            v2_13: findPeakInRange(172.0, 174.5),
            v2_14: findPeakInRange(175.0, 177.5),
            v2_15: findPeakInRange(178.0, 180.5),
            v2_16: findPeakInRange(181.0, 183.5),
            c2_1: findPeakInRange(184.0, 187.0),
            c2_2: findPeakInRange(188.0, 191.0),
            c2_3: findPeakInRange(192.0, 196.0),
            c2_4: findPeakInRange(198.0, 201.5),
            c2_5: findPeakInRange(202.0, 205.0),
            c2_6: findPeakInRange(206.0, 209.0),
            outro_1: findPeakInRange(225.0, 228.0),
            outro_2: findPeakInRange(236.0, 239.0),
            outro_3: findPeakInRange(240.0, 243.0),
            outro_4: findPeakInRange(244.0, 247.0),
          });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('MEASURED PRECISE ONSETS (Live Band vmJ9RZa-0wc):');
    for (const [k, v] of Object.entries(result)) {
      const m = Math.floor(v.time / 60);
      const s = (v.time % 60).toFixed(2).padStart(5, '0');
      console.log(`${k}: [${String(m).padStart(2, '0')}:${s}] (${v.time}s, diff=${v.maxDiff})`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
