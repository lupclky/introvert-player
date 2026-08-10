const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardBootstrapController = require('../services/dashboard-bootstrap-controller');

function element() {
    const listeners = {};
    return {
        value: '',
        style: {},
        innerHTML: '',
        children: [],
        listeners,
        classList: {
            values: new Set(),
            add(value) { this.values.add(value); },
            remove(value) { this.values.delete(value); }
        },
        addEventListener(type, listener) {
            (listeners[type] ||= []).push(listener);
        },
        contains(target) { return target === this; },
        blur() { this.blurred = true; }
    };
}

function fixture() {
    const nodes = {
        'donor-url': element(),
        'quick-add-search-results': element(),
        'search-clear-btn': element(),
        'quick-add-popover': element(),
        'quick-add-form': element()
    };
    const documentListeners = {};
    const document = {
        getElementById: id => nodes[id] || null,
        addEventListener(type, listener) {
            (documentListeners[type] ||= []).push(listener);
        }
    };
    return { nodes, document, documentListeners };
}

test('initQuickAddUi chỉ gắn listener một lần', () => {
    const { nodes, document, documentListeners } = fixture();
    const controller = new DashboardBootstrapController({ document });

    controller.initQuickAddUi();
    controller.initQuickAddUi();

    assert.equal(nodes['donor-url'].listeners.input.length, 1);
    assert.equal(nodes['donor-url'].listeners.focus.length, 1);
    assert.equal(documentListeners.click.length, 1);
    assert.equal(documentListeners.keydown.length, 1);
});

test('Quick Add nhận diện playlist YouTube trong luồng debounce', async () => {
    const { nodes, document } = fixture();
    const pending = [];
    const controller = new DashboardBootstrapController({
        document,
        parseYoutubePlaylistId: value => value.includes('list=') ? 'playlist-id' : null,
        setTimeout: callback => { pending.push(callback); return 1; },
        clearTimeout: () => {}
    });
    controller.initQuickAddUi();

    nodes['donor-url'].value = 'https://youtube.com/watch?v=abc&list=playlist-id';
    nodes['donor-url'].listeners.input[0]();
    await pending[0]();

    assert.match(nodes['quick-add-search-results'].innerHTML, /Đã nhận diện playlist YouTube/);
    assert.equal(nodes['quick-add-search-results'].style.display, 'flex');
});

test('Escape đóng Quick Add popover và trả focus', () => {
    const { nodes, document, documentListeners } = fixture();
    const controller = new DashboardBootstrapController({ document });
    controller.initQuickAddUi();
    nodes['quick-add-popover'].classList.add('visible');

    documentListeners.keydown[0]({ key: 'Escape' });

    assert.equal(nodes['quick-add-popover'].classList.values.has('visible'), false);
    assert.equal(nodes['donor-url'].blurred, true);
});

test('initSettingsUi lưu nội dung overlay và không gắn listener lặp', () => {
    const input = element();
    const button = element();
    const counter = element();
    const stored = new Map();
    const published = [];
    const state = { emptyQueueMessage: 'Nội dung cũ' };
    const nodes = {
        'overlay-empty-msg-input': input,
        'btn-overlay-empty-msg-apply': button,
        'overlay-empty-msg-counter': counter
    };
    const controller = new DashboardBootstrapController({
        document: { getElementById: id => nodes[id] || null },
        state,
        storage: { setItem: (key, value) => stored.set(key, value) },
        publishMqtt: (topic, payload) => published.push({ topic, payload }),
        setTimeout: () => 1
    });

    controller.initSettingsUi();
    controller.initSettingsUi();
    input.value = 'Nội dung mới';
    input.listeners.input[0]();
    button.listeners.click[0]();

    assert.equal(input.listeners.input.length, 1);
    assert.equal(button.listeners.click.length, 1);
    assert.equal(counter.textContent, '12/50');
    assert.equal(state.emptyQueueMessage, 'Nội dung mới');
    assert.equal(stored.get('dua_empty_queue_message'), 'Nội dung mới');
    assert.deepEqual(published[0], { topic: 'empty_queue_message', payload: { text: 'Nội dung mới' } });
});

test('initSettingsUi đồng bộ SponsorBlock', () => {
    const checkbox = element();
    const stored = new Map();
    const published = [];
    const categories = { sponsor: true };
    const controller = new DashboardBootstrapController({
        document: { getElementById: id => id === 'sb-sponsor' ? checkbox : null },
        sponsorBlockCategories: categories,
        categoryLabels: { sponsor: 'Tài trợ' },
        storage: { setItem: (key, value) => stored.set(key, value) },
        publishMqtt: (topic, payload) => published.push({ topic, payload })
    });
    controller.initSettingsUi();
    checkbox.checked = false;
    checkbox.listeners.change[0]({ target: checkbox });

    assert.equal(categories.sponsor, false);
    assert.equal(stored.get('dua_sb_categories'), '{"sponsor":false}');
    assert.equal(published[0].topic, 'sb_categories');
});

test('initQueueUi khởi tạo queue và listener Electron đúng một lần', () => {
    const favoriteButton = element();
    const queueCard = element();
    const sortSelect = element();
    const callbacks = {};
    const calls = [];
    const document = {
        getElementById(id) {
            return {
                'btn-player-favorite': favoriteButton,
                'card-queue': queueCard,
                'queue-sort-select': sortSelect
            }[id] || null;
        }
    };
    const state = { sortConfig: 'amount', currentSong: { id: 'song-1' }, luckyMode: false, queue: [] };
    const controller = new DashboardBootstrapController({
        document,
        window: { electronAPI: {
            onFavoriteContextAction: callback => { callbacks.favorite = callback; },
            onQueueContextAction: callback => { callbacks.queue = callback; }
        } },
        state,
        dedupeZyPageQueue: () => 0,
        renderQueue: () => calls.push('render'),
        initQueue: () => calls.push('init'),
        updateTestModeUI: () => calls.push('test-mode'),
        toggleFavoriteStatus: song => calls.push(`favorite:${song.id}`),
        triggerManualZyPageSync: () => calls.push('sync')
    });

    controller.initQueueUi();
    controller.initQueueUi();
    favoriteButton.listeners.click[0]();
    callbacks.queue({ action: 'sync' });

    assert.equal(sortSelect.value, 'amount');
    assert.equal(favoriteButton.listeners.click.length, 1);
    assert.deepEqual(calls, ['render', 'init', 'test-mode', 'favorite:song-1', 'sync']);
});
