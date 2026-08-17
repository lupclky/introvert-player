const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'exit_sign_song26.webm'));
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    await win.loadURL('about:blank');

    const chunks = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const raw = new Uint8Array(${JSON.stringify(Array.from(webmBuffer))}).buffer;
          const audioBuffer = await audioCtx.decodeAudioData(raw);

          function getWavData(startSec, endSec) {
            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(startSec * sampleRate);
            const endSample = Math.min(audioBuffer.length, Math.floor(endSec * sampleRate));
            const numSamples = endSample - startSample;

            const buffer = new ArrayBuffer(44 + numSamples * 2);
            const view = new DataView(buffer);

            function writeString(offset, str) {
              for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
            }

            writeString(0, 'RIFF');
            view.setUint32(4, 36 + numSamples * 2, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true); // PCM
            view.setUint16(22, 1, true); // 1 channel
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(36, 'data');
            view.setUint32(40, numSamples * 2, true);

            const channelData = audioBuffer.getChannelData(0);
            let offset = 44;
            for (let i = 0; i < numSamples; i++) {
              let s = Math.max(-1, Math.min(1, channelData[startSample + i]));
              view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
              offset += 2;
            }

            return Array.from(new Uint8Array(buffer));
          }

          resolve({
            p0: getWavData(0, 45),
            p1: getWavData(30, 90),
            p2: getWavData(90, 150),
            p3: getWavData(150, 210),
            p4: getWavData(210, 260)
          });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);

    fs.writeFileSync(path.join(__dirname, 'song26_part_0_45.wav'), Buffer.from(chunks.p0));
    fs.writeFileSync(path.join(__dirname, 'song26_part_30_90.wav'), Buffer.from(chunks.p1));
    fs.writeFileSync(path.join(__dirname, 'song26_part_90_150.wav'), Buffer.from(chunks.p2));
    fs.writeFileSync(path.join(__dirname, 'song26_part_150_210.wav'), Buffer.from(chunks.p3));
    fs.writeFileSync(path.join(__dirname, 'song26_part_210_260.wav'), Buffer.from(chunks.p4));
    console.log('Saved all WAV parts successfully!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
