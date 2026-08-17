const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    
    // We can also analyze the spectrogram / pitch to find vocal vs non-vocal sections!
    const html = `
      <!DOCTYPE html>
      <html><body>
      <script>
        window.transcribe = async function() {
          const webmBuffer = ${JSON.stringify(Array.from(fs.readFileSync(path.join(__dirname, 'mua_doi_cho.webm'))))};
          const audioCtx = new AudioContext();
          const audioBuffer = await audioCtx.decodeAudioData(new Uint8Array(webmBuffer).buffer);
          
          const channelData = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;
          
          // Let's compute short-term energy and spectral centroid across the song
          // Vocals typically have strong energy between 300Hz and 3400Hz.
          const results = [];
          const step = 0.5; // every 0.5s
          for (let t = 0; t < audioBuffer.duration - 1; t += step) {
            const start = Math.floor(t * sampleRate);
            const len = Math.floor(step * sampleRate);
            let sum = 0;
            let zeroCrossings = 0;
            for (let i = 0; i < len; i++) {
              sum += Math.abs(channelData[start + i]);
              if (i > 0 && ((channelData[start + i] >= 0 && channelData[start + i - 1] < 0) || (channelData[start + i] < 0 && channelData[start + i - 1] >= 0))) {
                zeroCrossings++;
              }
            }
            results.push({
              time: Math.round(t * 10) / 10,
              energy: Math.round((sum / len) * 1000) / 1000,
              zcr: zeroCrossings
            });
          }
          return results;
        };
      </script>
      </body></html>
    `;
    
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const data = await win.webContents.executeJavaScript('window.transcribe()');
    
    // Print sections where energy drops (silence/interlude) and rises (singing)
    console.log('Key transitions:');
    for (let i = 1; i < data.length; i++) {
      if (data[i].time >= 80 && data[i].time <= 235) {
        if (Math.abs(data[i].energy - data[i - 1].energy) > 0.05) {
          console.log(`t=${data[i].time}s (${Math.floor(data[i].time/60)}:${(data[i].time%60).toFixed(1).padStart(4, '0')}) energy=${data[i].energy}`);
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
