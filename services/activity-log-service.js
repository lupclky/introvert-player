'use strict';

function registerActivityLogService({ ipcMain, app, shell, fs, path }) {
  const getLogPath = () => path.join(app.getPath('userData'), 'activity_logs.txt');
  ipcMain.on('save-log-entry', (event, text) => {
    try {
      const logPath = getLogPath();
      fs.appendFileSync(logPath, `[${new Date().toLocaleString('vi-VN')}] ${text}\n`, 'utf8');
      const stats = fs.statSync(logPath);
      if (stats.size > 2 * 1024 * 1024) {
        const lines = fs.readFileSync(logPath, 'utf8').split('\n');
        if (lines.length > 1000) fs.writeFileSync(logPath, lines.slice(-1000).join('\n'), 'utf8');
      }
    } catch (error) {
      console.error('Failed to save log entry:', error);
    }
  });

  ipcMain.handle('open-log-file', async () => {
    try {
      const logPath = getLogPath();
      if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, `[${new Date().toLocaleString('vi-VN')}] [System] Khởi tạo file log hoạt động thành công.\n`, 'utf8');
      }
      await shell.openPath(logPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to open log file:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerActivityLogService };
