const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'mua_doi_cho.webm'));
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
          
          // Function to encode WAV
          function encodeWAV(samples, sampleRate) {
            const buffer = new ArrayBuffer(44 + samples.length * 2);
            const view = new DataView(buffer);
            function writeString(offset, string) {
              for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
              }
            }
            writeString(0, 'RIFF');
            view.setUint32(4, 36 + samples.length * 2, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(36, 'data');
            view.setUint32(40, samples.length * 2, true);
            let offset = 44;
            for (let i = 0; i < samples.length; i++, offset += 2) {
              const s = Math.max(-1, Math.min(1, samples[i]));
              view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            return new Uint8Array(buffer);
          }
          
          // Let's create snippets for key sections:
          // 1:30 to 1:55 (Interlude to verse 2)
          // 1:50 to 2:15 (Verse 2)
          // 2:15 to 2:40 (Verse 2 to Chorus 2)
          // 2:40 to 3:05 (Chorus 2)
          // 3:05 to 3:30 (Chorus 3)
          // 3:30 to 3:58 (Outro)
          
          const slices = [
            { name: 'part_130_160', start: 90, end: 120 },
            { name: 'part_160_190', start: 120, end: 150 },
            { name: 'part_190_220', start: 150, end: 180 },
            { name: 'part_220_238', start: 180, end: 237.7 }
          ];
          
          const output = {};
          for (const slice of slices) {
            const startSample = Math.floor(slice.start * sampleRate);
            const endSample = Math.floor(slice.end * sampleRate);
            const sliced = channelData.slice(startSample, endSample);
            output[slice.name] = Array.from(encodeWAV(sliced, sampleRate));
          }
          
          resolve(output);
        } catch (e) {
          reject(e.toString());
        }
      });
    `);
    
    for (const [name, bytes] of Object.entries(analysis)) {
      fs.writeFileSync(path.join(__dirname, `${name}.wav`), Buffer.from(bytes));
      console.log(`Saved ${name}.wav (${bytes.length} bytes)`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
