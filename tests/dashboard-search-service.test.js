const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardSearchService = require('../services/dashboard-search-service');

function createService(overrides = {}) {
    const calls = [];
    const service = new DashboardSearchService({
        state: { focusMode: false, currentSong: null },
        electronAPI: { searchYouTube: async query => ({ success: true, videos: [{ id: query }] }) },
        getApiUrl: path => `http://localhost:3000${path}`,
        createSong: (video, options) => ({ ...video, ...options, id: 'queued-song' }),
        readQuickAddOptions: () => ({ donorName: 'Mèo', amount: 50000, isOwnerAdd: true }),
        insertSong: song => calls.push(['insert', song]),
        broadcastNewDonationAlert: song => calls.push(['alert-overlay', song]),
        saveQueue: () => calls.push(['save']),
        sortAndRefreshQueue: () => calls.push(['sort']),
        clearQuickSearch: () => calls.push(['clear']),
        logSystem: (...args) => calls.push(['log', ...args]),
        showDashboardSystemAlert: (...args) => calls.push(['dashboard-alert', ...args]),
        playNextInQueue: () => calls.push(['play-next']),
        ...overrides.options
    });
    return { service, calls };
}

test('ưu tiên tìm kiếm YouTube qua Electron IPC', async () => {
    const { service } = createService();
    const result = await service.searchYouTube('nhạc thử');
    assert.deepEqual(result, { success: true, videos: [{ id: 'nhạc thử' }] });
});

test('fallback sang HTTP API khi Electron IPC không khả dụng', async () => {
    const requested = [];
    const { service } = createService({
        options: {
            electronAPI: null,
            fetchImpl: async url => {
                requested.push(url);
                return { json: async () => ({ success: true, videos: [] }) };
            }
        }
    });
    const result = await service.searchYouTube('a b');
    assert.equal(result.success, true);
    assert.equal(requested[0], 'http://localhost:3000/api/youtube-search?q=a%20b');
});

test('thêm kết quả tìm kiếm dùng đúng tùy chọn Quick Add và chuỗi side effect', () => {
    const { service, calls } = createService();
    const song = service.addResultToQueue({ title: 'Bài hát', videoId: 'abcdefghijk' });
    assert.equal(song.donorName, 'Mèo');
    assert.equal(song.amount, 50000);
    assert.deepEqual(calls.map(call => call[0]), [
        'insert', 'alert-overlay', 'save', 'sort', 'log', 'dashboard-alert', 'clear', 'play-next'
    ]);
});

test('không thêm kết quả khi chế độ tập trung đang bật', () => {
    const { service, calls } = createService({ options: { state: { focusMode: true } } });
    assert.equal(service.addResultToQueue({ title: 'Bài hát' }), null);
    assert.deepEqual(calls, []);
});

test('hiển thị trạng thái trống khi không có kết quả', () => {
    const container = { innerHTML: '', dataset: {} };
    const { service } = createService({
        options: { document: { getElementById: () => container } }
    });
    service.renderResults([], 'quick-add-search-results');
    assert.match(container.innerHTML, /Không tìm thấy video nào/);
});
