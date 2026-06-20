const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const videoId = '_Ujey4s2aOQ';
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');

// Helper to download a file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading yt-dlp.exe from ${url}...`);
    const file = fs.createWriteStream(dest);
    
    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest); // Delete partial file
        return downloadFile(response.headers.location, dest).then(resolve, reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('Download complete.');
        resolve();
      });
    });
    
    request.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {}); // Clean up
      reject(err);
    });
  });
}

// Helper to run local yt-dlp.exe
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    console.log(`Running yt-dlp.exe with args: ${args.join(' ')}`);
    const proc = spawn(ytDlpPath, args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());
    
    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`yt-dlp failed with exit code ${code}\nStderr: ${stderr}`));
      }
    });
  });
}

async function test() {
  try {
    // 1. Download yt-dlp.exe if it doesn't exist
    if (!fs.existsSync(ytDlpPath)) {
      const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
      await downloadFile(downloadUrl, ytDlpPath);
    } else {
      console.log('yt-dlp.exe already exists.');
    }
    
    // 2. Extract best audio stream url
    console.log(`Extracting stream URL for: ${videoUrl}`);
    // -g returns the stream url
    // -f ba selects best audio
    const streamUrl = await runYtDlp(['-g', '-f', 'ba', videoUrl]);
    console.log(`\nResolved Stream URL: ${streamUrl.substring(0, 100)}...`);
    
    // 3. Test HTTP status of resolved stream URL
    console.log(`\nTesting stream URL playability...`);
    const parsedUrl = new URL(streamUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    
    https.get(options, (res) => {
      console.log(`HTTP Response Status Code: ${res.statusCode}`);
      console.log(`Content-Type: ${res.headers['content-type']}`);
      console.log(`Content-Length: ${res.headers['content-length']} bytes`);
      
      if (res.statusCode === 200 || res.statusCode === 206) {
        console.log('\n🌟 SUCCESS: yt-dlp.exe successfully resolved a working stream URL!');
        console.log(`Full Stream URL: ${streamUrl}`);
      } else {
        console.log('\n❌ ERROR: Stream URL is not playable (Status ' + res.statusCode + ')');
      }
      process.exit(0);
    }).on('error', (err) => {
      console.error('Connection error on stream URL:', err);
      process.exit(1);
    });
    
  } catch (e) {
    console.error('\n--- TEST FAILED ---');
    console.error(e);
    process.exit(1);
  }
}

test();
