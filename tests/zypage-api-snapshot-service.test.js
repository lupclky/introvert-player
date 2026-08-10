'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ZyPageApiSnapshotService = require('../services/zypage-api-snapshot-service');

test('parseContents đọc được các lớp JSON lồng dạng chuỗi', () => {
    const service = new ZyPageApiSnapshotService();
    const donate = {
        music: { list: { m1: { music: { id: 'video' } } } },
        list: { d1: { name: 'Khách' } }
    };
    const raw = JSON.stringify({ data: JSON.stringify({ donate: JSON.stringify(donate) }) });
    const snapshot = service.parseContents(raw);
    assert.deepEqual(snapshot.musicKeys, ['m1']);
    assert.deepEqual(snapshot.plainKeys, ['d1']);
    assert.equal(snapshot.musicList.m1.music.id, 'video');
});

test('donate JSON lỗi trả danh sách trống thay vì làm hỏng sync', () => {
    const service = new ZyPageApiSnapshotService();
    const snapshot = service.parseContents({ data: { donate: '{invalid' } });
    assert.deepEqual(snapshot.musicList, {});
    assert.deepEqual(snapshot.plainDonateList, {});
});

test('fetchSnapshot tạo URL an toàn và trả snapshot chuẩn hóa', async () => {
    let requestedUrl = '';
    const service = new ZyPageApiSnapshotService({
        now: () => 123,
        fetchPage: async url => {
            requestedUrl = url;
            return { contents: JSON.stringify({ data: { donate: { music: { list: {} }, list: {} } } }) };
        }
    });
    const snapshot = await service.fetchSnapshot({ domain: 'https://zypage.com/', shopId: 'shop id' });
    assert.equal(requestedUrl, 'https://zypage.com/api/get_data_by_id?table=shop&data=donate&id=shop%20id&v=123');
    assert.deepEqual(snapshot.musicKeys, []);
});
