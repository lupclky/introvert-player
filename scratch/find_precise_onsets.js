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

          // Let's compute short-time energy envelope (frame = 20ms, hop = 10ms)
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

          // Let's find onsets with sudden energy rise in given ranges
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
            v1_1: findPeakInRange(58.0, 60.0), // Anh không nhớ
            v1_2: findPeakInRange(60.8, 62.5), // Em từng trách
            v1_3: findPeakInRange(63.8, 65.5), // Lúc đó anh
            v1_4: findPeakInRange(66.5, 68.0), // Cuối cùng thì
            v1_5: findPeakInRange(69.5, 71.5), // Ta từng bắt gặp
            v1_6: findPeakInRange(72.8, 74.8), // Không thể tin
            v1_7: findPeakInRange(76.0, 78.0), // Tình yêu mình
            v1_8: findPeakInRange(79.0, 81.0), // Cố gắng sống
            v1_9: findPeakInRange(82.0, 84.0), // Sao giờ em
            v1_10: findPeakInRange(85.0, 87.0), // Em từng cùng
            v1_11: findPeakInRange(88.0, 90.0), // Cũng từng nói
            v1_12: findPeakInRange(91.0, 93.0), // Anh từng hứa
            v1_13: findPeakInRange(94.0, 96.0), // Ngay lúc đó
            v1_14: findPeakInRange(97.0, 99.0), // Nhưng mà sao
            v1_15: findPeakInRange(100.0, 102.5), // Anh từng mong
            v1_16: findPeakInRange(103.5, 105.5), // Khi anh đứng
            c1_1: findPeakInRange(109.0, 112.0), // Em hiểu rằng
            c1_2: findPeakInRange(113.5, 116.0), // Chỉ là em
            c1_3: findPeakInRange(118.0, 121.0), // Mãi sau những
            c1_4: findPeakInRange(123.0, 126.0), // Vậy đâu còn
            c1_5: findPeakInRange(126.5, 129.0), // Đây sẽ là
            c1_6: findPeakInRange(130.5, 133.0), // So thanks for
            v2_1: findPeakInRange(133.5, 136.0), // Chưa nói tới
            v2_2: findPeakInRange(136.8, 139.0), // Anh đã không
            v2_3: findPeakInRange(139.8, 142.0), // Gặp một cô
            v2_4: findPeakInRange(142.8, 145.0), // Không dễ nhiều
            v2_5: findPeakInRange(145.8, 147.5), // Nên là cứ
            v2_6: findPeakInRange(148.0, 150.5), // Ước gì có
            v2_7: findPeakInRange(151.5, 153.8), // Thật khó để
            v2_8: findPeakInRange(154.5, 157.0), // Để bây giờ
            v2_9: findPeakInRange(158.5, 161.0), // Gom hết tất
            v2_10: findPeakInRange(161.0, 163.0), // Giọng em vang
            v2_11: findPeakInRange(164.0, 166.0), // Không cần phải
            v2_12: findPeakInRange(167.0, 169.0), // Em chỉ mất
            v2_13: findPeakInRange(170.0, 172.5), // 8515
            v2_14: findPeakInRange(173.0, 175.5), // Cũng tới lúc
            v2_15: findPeakInRange(176.0, 178.5), // Tiếc nhất không
            v2_16: findPeakInRange(179.0, 181.5), // Có lẽ phải
            c2_1: findPeakInRange(182.5, 185.0), // Em hiểu rằng
            c2_2: findPeakInRange(186.5, 189.0), // Chỉ là em
            c2_3: findPeakInRange(191.0, 194.0), // Mãi sau những
            c2_4: findPeakInRange(196.0, 199.0), // Vậy đâu còn
            c2_5: findPeakInRange(199.5, 202.5), // Đây sẽ là
            c2_6: findPeakInRange(204.0, 207.0), // So thanks for
            outro_1: findPeakInRange(223.0, 226.0), // Hãy gìn giữ 1
            outro_2: findPeakInRange(234.5, 237.5), // Hãy gìn giữ 2
            outro_3: findPeakInRange(238.0, 241.0), // I thank you
            outro_4: findPeakInRange(242.0, 245.0), // Thanks for
          });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    console.log('MEASURED PRECISE ONSETS:');
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
