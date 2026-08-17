const { app } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const webmBuffer = fs.readFileSync(path.join(__dirname, 'mua_doi_cho.webm'));
    const arrayBuffer = webmBuffer.buffer.slice(webmBuffer.byteOffset, webmBuffer.byteOffset + webmBuffer.byteLength);
    
    // We can use a hidden BrowserWindow or Web Audio in renderer
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    
    await win.loadURL('about:blank');
    
    const result = await win.webContents.executeJavaScript(`
      new Promise(async (resolve, reject) => {
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const raw = new Uint8Array(${JSON.stringify(Array.from(webmBuffer))}).buffer;
          const audioBuffer = await audioCtx.decodeAudioData(raw);
          
          console.log('Decoded duration:', audioBuffer.duration, 'channels:', audioBuffer.numberOfChannels, 'sampleRate:', audioBuffer.sampleRate);
          
          const channelData = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;
          const windowSize = Math.floor(sampleRate * 0.1); // 100ms
          const stepSize = Math.floor(sampleRate * 0.05); // 50ms
          
          const energyProfile = [];
          for (let i = 0; i < channelData.length - windowSize; i += stepSize) {
            let sum = 0;
            for (let j = 0; j < windowSize; j++) {
              sum += channelData[i + j] * channelData[i + j];
            }
            const rms = Math.sqrt(sum / windowSize);
            const time = i / sampleRate;
            energyProfile.push({ time: Math.round(time * 100) / 100, rms: Math.round(rms * 1000) / 1000 });
          }
          
          resolve({ duration: audioBuffer.duration, energyProfile: energyProfile.filter(p => p.time >= 80 && p.time <= 235) });
        } catch (e) {
          reject(e.toString());
        }
      });
    `);
    
    fs.writeFileSync(path.join(__dirname, 'energy_profile.json'), JSON.stringify(result, null, 2));
    console.log('Successfully extracted energy profile for Mua Doi Cho, duration:', result.duration);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
