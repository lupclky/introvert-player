'use strict';

function startPubgMonitorService(options = {}) {
  const exec = options.exec;
  const broadcast = options.broadcast || (() => {});
  const intervalMs = Number(options.intervalMs || 4000);
  if (process.platform !== 'win32' || typeof exec !== 'function') {
    return { getRunning: () => false, stop: () => {} };
  }
  let running = false;
  let stopped = false;

  const check = () => {
    if (stopped) return;
    exec('tasklist /FI "IMAGENAME eq TslGame.exe" /NH', (error, stdout) => {
      if (error || stopped) return;
      const next = String(stdout || '').toLowerCase().includes('tslgame.exe');
      if (next === running) return;
      running = next;
      broadcast({ type: 'pubg_state', data: { running } });
    });
  };
  const timer = setInterval(check, intervalMs);
  timer.unref?.();
  check();
  return {
    getRunning: () => running,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    }
  };
}

module.exports = { startPubgMonitorService };
