'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { YouTubeStreamService } = require('../services/youtube-stream-service');

function createChild({ code = 0, stdout = '', stderr = '' } = {}) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => child.emit('close', 1);
    queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout));
        if (stderr) child.stderr.emit('data', Buffer.from(stderr));
        child.emit('close', code);
    });
    return child;
}

function createService(spawnImpl, overrides = {}) {
    return new YouTubeStreamService({
        spawnImpl,
        fsImpl: { existsSync: () => true },
        getYtDlpPath: () => 'yt-dlp.exe',
        nodeRuntimePath: 'C:\\app\\electron.exe',
        processEnv: { APP_TEST: '1' },
        timeoutMs: 1000,
        ...overrides
    });
}

test('trả URL DirectStream từ resolver mặc định', async () => {
    const calls = [];
    const service = createService((command, args) => {
        calls.push({ command, args });
        return createChild({ stdout: 'https://media.example/audio-video.mp4\n' });
    });

    const result = await service.resolve('YXkp77tR9vw');
    assert.equal(result.url, 'https://media.example/audio-video.mp4');
    assert.equal(result.resolver, 'default-audio');
    assert.equal(calls.length, 6);
    assert.ok(calls[0].args.includes('bestaudio[protocol=https]/bestaudio*[protocol=https]'));
    const runtimeIndex = calls[0].args.indexOf('--js-runtimes');
    assert.notEqual(runtimeIndex, -1);
    assert.equal(calls[0].args[runtimeIndex + 1], 'node:C:\\app\\electron.exe');
});

test('chạy yt-dlp với Electron ở chế độ Node để giải JavaScript challenge', async () => {
    const calls = [];
    const service = createService((command, args, options) => {
        calls.push({ command, args, options });
        return createChild({ stdout: 'https://media.example/audio.m4a\n' });
    });

    await service.resolve('UTYREFIOijM');
    assert.equal(calls.length, 6);
    for (const call of calls) {
        assert.equal(call.options.env.APP_TEST, '1');
        assert.equal(call.options.env.ELECTRON_RUN_AS_NODE, '1');
    }
});

test('thử client TV downgraded khi resolver mặc định bị yêu cầu xác thực', async () => {
    let callCount = 0;
    const service = createService((command, args) => {
        callCount += 1;
        if (args.includes('youtube:player_client=tv_downgraded')) {
            return createChild({ stdout: 'https://media.example/tv.mp4\n' });
        }
        return createChild({ code: 1, stderr: "Sign in to confirm you're not a bot" });
    });

    const result = await service.resolve('YXkp77tR9vw');
    assert.equal(result.resolver, 'tv-downgraded-audio');
    assert.equal(callCount, 6);
});

test('không kết luận DRM khi chỉ client TV báo DRM', async () => {
    const service = createService((command, args) => {
        return args.includes('youtube:player_client=tv_downgraded')
            ? createChild({ code: 1, stderr: 'This video is DRM protected' })
            : createChild({ code: 1, stderr: "Sign in to confirm you're not a bot" });
    });

    await assert.rejects(
        service.resolve('YXkp77tR9vw'),
        error => error.code === 'authentication_required' && error.statusCode === 502
    );
});

test('vẫn nhận DRM từ client web không thuộc A/B test TV', async () => {
    const service = createService(
        () => createChild({ code: 1, stderr: 'This video is DRM protected' }),
        { attempts: [{ name: 'web-safari', extractorArgs: 'youtube:player_client=web_safari' }] }
    );
    await assert.rejects(
        service.resolve('YXkp77tR9vw'),
        error => error.code === 'drm_protected' && error.statusCode === 422
    );
});

test('truyền file cookie phiên đăng nhập cho mọi resolver', async () => {
    const calls = [];
    const service = createService((command, args) => {
        calls.push(args);
        return createChild({ stdout: 'https://media.example/authenticated.mp4\n' });
    });

    await service.resolve('YXkp77tR9vw', { cookiesFilePath: 'C:\\temp\\youtube-cookies.txt' });
    assert.equal(calls.length, 6);
    for (const args of calls) {
        const index = args.indexOf('--cookies');
        assert.notEqual(index, -1);
        assert.equal(args[index + 1], 'C:\\temp\\youtube-cookies.txt');
    }
});

test('xuất cookie Electron đúng định dạng Netscape cho yt-dlp', () => {
    const contents = YouTubeStreamService.serializeNetscapeCookies([{
        domain: '.youtube.com',
        path: '/',
        secure: true,
        httpOnly: true,
        expirationDate: 2000.9,
        name: 'SID',
        value: 'secret-value'
    }]);
    assert.match(contents, /^# Netscape HTTP Cookie File/m);
    assert.match(contents, /#HttpOnly_\.youtube\.com\tTRUE\t\/\tTRUE\t2000\tSID\tsecret-value/);
});

test('từ chối video ID không hợp lệ trước khi chạy tiến trình', async () => {
    const service = createService(() => {
        throw new Error('không được gọi');
    });
    await assert.rejects(
        service.resolve('../bad'),
        error => error.code === 'invalid_video_id' && error.statusCode === 400
    );
});
