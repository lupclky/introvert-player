# Tóm tắt lịch sử phát triển ZyPage Player

Tài liệu này tổng hợp các yêu cầu, thay đổi giao diện, sửa lỗi và cải tổ kiến trúc đã được thực hiện trong quá trình phát triển phiên bản 26.8.x.

## 1. Overlay và TFT Set 18

- Cải thiện khả năng hiển thị đầy đủ tên người donate khi còn đủ không gian.
- Thiết kế lại theme TFT Set 18 theo phong cách khu rừng kỳ bí.
- Thẻ “Tiếp theo” và “Donate mới” được chuyển sang phong cách điêu khắc gỗ, hình chữ nhật bo tròn bốn góc và bỏ các họa tiết thừa.
- Tăng nhẹ cỡ chữ tiêu đề và giá tiền của theme Set 18.
- Chuyển màu chữ chủ đạo của font, lời hết nhạc, tên bài hát và thời gian theo theme dứa hoặc theme hồng.
- Điều chỉnh animation fade in/fade out của bảng giá và lời hết nhạc chậm, mềm và tự nhiên hơn.
- Loại bỏ các animation mạnh, lặp hoặc mang cảm giác giao diện tạo tự động.
- Sửa animation đóng/mở overlay bị chạy hai lần.
- Bỏ hiệu ứng co giãn chiều cao gây giật; dùng chuyển cảnh fade phù hợp cho trạng thái hàng đợi 30–15 giây và đếm ngược 15 giây.
- Mở rộng khu vực lời hết nhạc để chứa khoảng 50 ký tự trong hai hoặc ba dòng.
- Đưa bảng giá ra giữa overlay khi không có nhạc.
- Tăng cỡ chữ tiêu đề và số tiền trên bảng giá.
- Bỏ chỉ báo trang `1/2`, `2/2` của bảng giá.
- Hiển thị giá mở playlist trực tiếp trên bảng giá, dạng `Playlist 70p` và số tiền tương ứng.
- Tạo cách hiển thị playlist ngắn gọn trên overlay:
  - Hiển thị `x/y`.
  - Hiển thị người donate và số tiền.
  - Đếm ngược “Tiếp theo m:ss”.
  - Bỏ chữ “còn”, dấu chấm giữa các thành phần và các khung thừa.
- Đồng bộ kích thước hai thẻ trạng thái playlist và thẻ đếm ngược 15 giây.
- Bỏ dòng `NEXT` ở cuối overlay.
- Thu gọn overlay về kích thước cũ và tự co lại khi playlist còn ít video.
- Bỏ các badge như “Nhận playlist”, “Đã phát playlist thành công” và thông báo hoàn tất playlist trên overlay.
- Bổ sung thông báo “Donate mới” khi nhận donation playlist, giữ nguyên bố cục thông báo donate hiện tại.
- Điều chỉnh hình nền để các góc và bảng giá không bị chìm hoặc trùng màu với nội dung.

## 2. Dashboard và giao diện chính

- Chuyển giao diện light mode sang phong cách TFT Set 18.
- Điều chỉnh bảng màu light mode dịu hơn khi stream ban đêm, giảm các mảng xanh quá mạnh và các vùng màu lệch nhau.
- Đổi hệ font giao diện sang font hỗ trợ tiếng Việt dễ đọc hơn.
- Giảm độ đậm của chữ sau khi bản font trước quá bold.
- Giữ riêng chữ “Pineapple Studio” bằng Be Vietnam Pro dáng bè ngang để tạo điểm nhấn Set 18.
- Bỏ kiểu khung cảnh báo có cảm giác máy móc và bỏ chú thích phụ dưới các tiêu đề chính.
- Làm gọn khu vực trình phát nhạc.
- Dòng thông tin donate của bài hát chỉ còn tên người donate và số tiền, bỏ các từ dài như “đã tặng”, “đã gửi” và “Gửi”.
- Thêm tên kênh YouTube dưới tiêu đề tại player và queue.
- Sửa lỗi hiển thị `ZyPage Player` thay cho tên kênh thật.
- Sửa lỗi tên kênh không cập nhật khi chuyển từ bài A sang bài B hoặc phát tiếp bài đang dở.
- Bỏ thanh tiến trình khỏi thẻ “Đang phát” bên trong danh sách queue; thanh tiến trình chính của player vẫn được giữ.
- Làm gọn tab Donate ở cạnh Trình phát:
  - Đổi tên thành “Lịch sử”.
  - Đổi icon phù hợp.
  - Thu gọn ô tìm kiếm.
  - Bỏ vạch kẻ.
  - Đồng bộ màu nền và màu thanh công cụ.
  - Hỗ trợ hai chế độ hiển thị dạng lưới và danh sách.
- Danh sách yêu thích cập nhật ngay sau khi nhấn yêu thích.
- Cho phép xóa bài yêu thích bằng menu chuột phải.
- Mở lại menu chuột phải và bổ sung nhiều thao tác hữu ích.
- Thiết kế lại trang Cài đặt khoa học hơn, giảm số ô, emoji và icon không cần thiết.

## 3. Walkthrough và giới thiệu phiên bản

- Thay bảng “Đã có cập nhật mới” bằng `landing/walkthrough.html` sau khi người dùng nâng cấp lên phiên bản mới.
- Walkthrough chỉ tự hiện khi phiên bản hiện tại khác phiên bản đã xem gần nhất.
- Bổ sung nội dung giới thiệu các chức năng mới, ví dụ thẻ X2 và các tính năng phục vụ phiên bản mới.
- Đổi walkthrough sang hình nền TFT Set 18 có sẵn.
- Cho phép chỉnh vị trí thẻ, kích thước ảnh và duyệt ảnh từ máy.
- Lưu tài nguyên tùy chỉnh ở local để không phải deploy lại server.

## 4. Bảng giá và trạng thái phát

- Khôi phục chức năng hiển thị bảng giá.
- Đổi chữ “Bảng giá” về kiểu chữ bình thường và đặt hợp lý trong bố cục.
- Viết tắt số tiền bằng `K` để giảm chiều ngang.
- Hiển thị bảng giá khi đang phát bài của chủ kênh.
- Hiển thị bảng giá ở giữa overlay khi không có bài hát.
- Làm hiệu ứng xuất hiện và biến mất mềm hơn.
- Bỏ phân trang bảng giá.
- Thêm một dòng giá riêng cho quyền phát YouTube Playlist.

## 5. YouTube Playlist

- Nhận diện playlist từ Quick Add, bao gồm URL dạng:
  - `/playlist?list=...`
  - `/watch?v=...&list=...`
- Ưu tiên nhận diện playlist trước video đơn khi URL `watch` chứa cả `v` và `list`.
- Nhận link playlist trong nội dung donation/chat thay vì chỉ lấy bài đầu tiên.
- Phân tích playlist thành một thực thể thống nhất và giữ nguyên thứ tự video.
- Giới hạn tổng thời gian playlist theo cấu hình.
- Lọc video trùng, video không khả dụng và video thuộc blacklist.
- Giữ playlist đang phát thành một khối liên tục: phát hết playlist trước khi chuyển sang bài ngoài, kể cả khi bài ngoài có số tiền cao hơn.
- Playlist có các thao tác tương tự bài đơn:
  - Phát ngay.
  - Tạm dừng/phát tiếp.
  - Ghim.
  - Di chuyển lên/xuống.
  - Xóa.
- Thiết kế danh sách video playlist dạng gọn, có thumbnail, tiêu đề, thời lượng và trạng thái bài đang phát.
- Bổ sung thanh cuộn cho danh sách playlist dài.
- Sửa lỗi bung playlist làm ép hoặc che thẻ bài đang phát.
- Bỏ khu vực “Không còn bài chờ” nằm dưới playlist.
- Chuẩn hóa đơn vị từ “x bài” thành “x video” trên toàn hệ thống.
- Thiết kế lại cấu hình playlist chỉ còn:
  - Mốc tiền kích hoạt playlist.
  - Thời gian tối đa phát playlist tính theo phút.
- Thông báo taskbar nhận biết rõ donation là playlist.

## 6. Queue, Vote Skip và thứ tự phát

- Vote Skip trước đây chọn bài có số tiền cao nhất tại thời điểm hoàn tất.
- Quy tắc sau đó được cập nhật: khi Vote Skip hoàn tất, phát bài đang đứng đầu theo thứ tự queue realtime hiện tại.
- Sửa lỗi người đã order nhạc tham gia Vote Skip nhưng bài order không được đưa vào queue.
- Sửa lỗi đồng bộ ZyPage đôi khi chèn lại hoặc phát lặp bài hát.
- Bổ sung cơ chế chống trùng donation và chống xử lý lại transaction cũ.
- Dọn các bản ghi queue trùng từ những phiên bản trước khi khởi tạo queue.
- Playlist đang phát được bảo vệ như một khối, không bị thuật toán sắp xếp tiền chia cắt.
- Donate mới được chèn sau toàn bộ playlist đang phát.
- Khôi phục playlist giữ đúng vị trí và số thứ tự video đã phát.

## 7. ZyPage và Firebase

- Kiểm tra luồng Firebase listener khi nhận donation và ảnh hưởng của nó lên queue.
- Bổ sung log sự kiện donation Firebase trong DevTools/F12.
- Chuẩn hóa payload donation giữa Firebase, ZyPage music và donation thường.
- Tách bước nhận dữ liệu, chuẩn hóa, chống trùng, lưu lịch sử và đưa vào queue.
- Listener bỏ qua snapshot khởi tạo và chỉ xử lý sự kiện mới.
- Đăng ký listener mới sẽ hủy listener cũ đúng cách.
- Một donation chỉ được claim và xử lý một lần.
- Sửa luồng đồng bộ API để không phát lặp bài sau khi snapshot được tải lại.
- Donation playlist được nhận diện trước khi xử lý như bài đơn.

## 8. Realtime Dashboard–Overlay

- Thay cơ chế Dashboard và Overlay gọi REST API liên tục bằng realtime database/changefeed.
- Duy trì snapshot mới nhất để Overlay nhận ngay trạng thái khi kết nối lại.
- Chỉ client cùng channel nhận event.
- Điều phối event hai chiều theo role và không echo lại nguồn gửi.
- Tiến trình phát cập nhật snapshot nhưng không làm phình lịch sử event.
- Cấu hình overlay được lưu trong snapshot để reconnect không cần gọi REST.
- Giảm tần suất đồng bộ liên tục giữa Dashboard và Overlay.
- Đồng bộ trạng thái playlist, bài hiện tại, bài tiếp theo, thời gian và cấu hình overlay theo thời gian thực.
- Tách xử lý `overlay_state` và `overlay_event` khỏi `handleMqttMessage`.

## 9. Phát nhạc và metadata

- Sửa SoundCloud URL dạng `on.soundcloud.com` không phát được.
- Chuẩn hóa việc resolve URL SoundCloud redirect và metadata.
- Sửa lỗi tiêu đề đã đổi nhưng tên kênh vẫn giữ từ bài trước.
- Cập nhật channel metadata đồng thời cho bài hiện tại và bài tương ứng trong queue.
- Khi phát tiếp bài đang dở, đồng bộ đúng `resumeFrom`, thời gian Dashboard và thời gian Overlay.
- Chỉ gửi lệnh kết thúc bài một lần; các phương thức vận chuyển được dùng theo thứ tự fallback và dừng ngay sau lần thành công đầu tiên.
- Sửa taskbar notification bị lặp lại thông báo cũ.
- Thông báo taskbar có nội dung riêng cho playlist.

## 10. Hotfix thanh tiến trình Dashboard

- Xác định nguyên nhân treo khi kéo thanh tiến trình: sự kiện `input` gửi một lệnh seek cho mỗi pixel, đồng thời ghi log và nhận phản hồi realtime.
- Đổi luồng xử lý:
  - Khi kéo chỉ cập nhật giao diện và thời gian xem trước.
  - Khi thả mới gửi đúng một lệnh seek.
  - Tạm khóa cập nhật ngược từ overlay trong lúc kéo và 800 ms sau khi seek.
  - Hỗ trợ hủy thao tác bằng `pointercancel`.
- Loại bỏ việc tạo hàng trăm log và lệnh realtime trong một lần kéo.

## 11. Hotfix timer và lỗi treo khi mở Dashboard

- Sửa lỗi `Illegal invocation` tại `DashboardPlaybackUiController.initModeUi`.
- Nguyên nhân là `window.setInterval` được lưu rồi gọi với controller làm `this` thay vì `Window`.
- Bọc `setInterval`, `setTimeout` và `clearTimeout` để luôn gọi với đúng Window context.
- Áp dụng phòng ngừa cho:
  - Dashboard Playback UI Controller.
  - Dashboard Settings UI Controller.
  - Dashboard Bootstrap Controller.
- Bổ sung kiểm thử mô phỏng lỗi native timer trong Electron.

## 12. Tái cấu trúc kiến trúc service

`app.js` và `main.js` ban đầu chứa nhiều khối nghiệp vụ lớn. Các phần đã được tách thành service/controller độc lập gồm:

- `overlay-song-payload-service.js`
- `overlay-sync-service.js`
- `overlay-event-service.js`
- `playback-controller.js`
- `playback-monitor-service.js`
- `queue-mutation-service.js`
- `quick-add-service.js`
- `quick-add-ui-controller.js`
- `dashboard-bootstrap-controller.js`
- `dashboard-settings-ui-controller.js`
- `dashboard-playback-ui-controller.js`
- `dashboard-settings-service.js`
- `dashboard-donation-history-service.js`
- `dashboard-notification-service.js`
- `dashboard-realtime-service.js`
- `favorites-service.js`
- `dolby-spatial-audio-service.js`
- `song-metadata-service.js`
- `sponsorblock-service.js`
- `sensitive-video-config-service.js`
- `taskbar-notification-service.js`
- `action-code-service.js`
- `youtube-playlist-provider.js`
- `playlist-message-parser.js`
- `playlist-policy.js`
- `playlist-service.js`
- `playlist-queue-service.js`
- `playlist-repository.js`
- `donation-repository.js`
- `firebase-realtime-bridge.js`
- `local-realtime-database-service.js`
- `realtime-event-service.js`
- `zypage-connection-service.js`
- `zypage-firebase-listener-service.js`
- `zypage-firebase-event-controller.js`
- `zypage-donation-event-processor.js`
- `zypage-donation-command-service.js`
- `zypage-queue-ingestion-service.js`
- `zypage-api-snapshot-service.js`
- `zypage-api-item-processor.js`
- `zypage-sync-coordinator.js`
- `zypage-sync-orchestrator.js`
- `zypage-song-end-service.js`

## 13. Dashboard Bootstrap Controller

Khối `DOMContentLoaded` ban đầu khoảng 1.123 dòng đã được chia thành các điểm vào:

- `initQuickAddUi()`
- `initSettingsUi()`
- `initQueueUi()`
- `initPlaybackUi()`

### Quick Add UI

- Tách listener tìm kiếm, debounce, nhận diện YouTube/playlist/SoundCloud, popover, nút xóa và Escape.
- Chống khởi tạo listener hai lần.
- Submit Quick Add hủy đúng debounce đang chờ.

### Settings UI

- Tách SponsorBlock, theme, opacity và các nội dung overlay.
- Tách cảnh báo nhạy cảm, yt-dlp, Adaptive Volume và chủ kênh thêm nhạc.
- Tách giới hạn thời gian cố định/theo mốc, gia hạn và Vote Skip.
- Tách cấu hình ZyPage và khôi phục YouTube Account.

### Queue UI

- Tách khởi tạo, render, dọn trùng, favorite và context menu.
- Tách callback native Electron cho queue và favorite.

### Playback UI

- Tách player visibility, volume, mute icon, Focus/Lucky Mode, Dolby và phím tắt.
- Tạo controller riêng để bootstrap không tiếp tục phình lớn.

## 14. Dọn theme và mã cũ

- Xóa các theme cổ điển.
- Xóa Spacegods.
- Xóa theme flex.
- Xóa theme mờ.
- Dọn CSS, nhánh logic và cấu hình liên quan đến các theme đã loại bỏ.

## 15. Trạng thái kiểm thử

- Các service quan trọng đều có kiểm thử độc lập.
- Có test cho playlist parsing, chính sách thời lượng, queue nguyên khối và chống trùng.
- Có test cho realtime snapshot, reconnect, channel routing và throttling progress.
- Có test cho Quick Add, Settings UI, Queue UI và Playback UI controller.
- Có test cho lỗi Window context của native timer.
- Tại lần kiểm tra gần nhất, toàn bộ **138/138 bài kiểm thử đều đạt**.

## 16. Trạng thái kiến trúc hiện tại

- `app.js` đã giảm từ hơn 9.000 dòng xuống khoảng 7.500 dòng sau các đợt tách gần nhất.
- Dashboard bootstrap hiện chủ yếu điều phối controller thay vì tự chứa listener dài.
- Nghiệp vụ playlist, queue, realtime, metadata và ZyPage đã có ranh giới service rõ hơn.
- Overlay nhận state qua realtime snapshot/event thay vì phụ thuộc vào vòng REST GET/PUT liên tục.
- Các bước tách tiếp theo nên tập trung vào những khối nghiệp vụ lớn còn lại trong `app.js`, đặc biệt render/UI orchestration và các handler chưa thuộc controller riêng.
## Bàn giao dự án

Workspace: `E:\Zypage_Player_prod\v26.8.0`  
Yêu cầu thường trực: **không đọc/chạy Git**. Chỉ dùng `apply_patch` khi sửa file.

### Trạng thái hiện tại

- App Electron `introvert-player`, `package.json` đang là **26.8.5**.
- Đã đóng gói thành công bản 26.8.5:
  - [IntrovertPlayer.Setup.26.8.5.exe](E:\Zypage_Player_prod\v26.8.0\dist-v2\IntrovertPlayer.Setup.26.8.5.exe)
  - SHA-256: `1A38CF9813AF2FB29AA7737F7D480D86C30FF6ED46E69E5FF8EB63E3BE0B1988`
- Lưu ý: bộ cài 26.8.5 được build **trước** bản sửa parser playlist mới nhất; cần build lại nếu phát hành bản chứa fix đó.
- Test hiện tại: **157/157 passed** (`npm.cmd test`).

### Sửa mới nhất: lỗi playlist trong nội dung donate

User gửi cùng playlist ở dạng Markdown/HTML:

```text
https://www.youtube.com/watch?v=22RqlqEWxpE&amp;list=PLbscJlpbMW88&amp;pp=sAgC
https://www.youtube.com/watch?v=22RqlqEWxpE&list=PLbscJlpbMW88&pp=sAgC
```

Lỗi cũ: parser xem hai URL là khác nhau, khiến playlist thành `ambiguous_urls`/không nhận diện.

Đã sửa trong:

- [playlist-message-parser.js](E:\Zypage_Player_prod\v26.8.0\services\playlist-message-parser.js)
- [playlist-message-parser.test.js](E:\Zypage_Player_prod\v26.8.0\tests\playlist-message-parser.test.js)

Nội dung sửa:

- Decode `&amp;`, `&#38;`, `&#x26;` thành `&`.
- Regex URL không nuốt cú pháp Markdown `[]()`.
- Gộp các URL trùng logic theo `playlistId + videoId`.
- Có test cho URL HTML entity lặp và Markdown `[label](URL)`.

Playlist thông thường vẫn nhận đúng; YouTube Mix tự sinh `list=RD...` vẫn được xem là bài đơn nếu không có `!playlist`.

### Kiến trúc đáng chú ý

Đã tách nhiều logic khỏi `app.js` sang `services/`, trong đó có:

- `playlist-message-parser.js`: trích URL và nhận diện playlist.
- `playlist-service.js`: tiếp nhận/kiểm tra playlist, ngưỡng tiền, repository.
- `playlist-policy.js`: policy về thời lượng, video, view.
- `youtube-playlist-provider.js`: tải metadata/video playlist.
- `zypage-*`: Firebase, API snapshot, queue ingest, song-end, sync.
- `dashboard-realtime-service.js`: realtime giữa dashboard/overlay.
- `overlay-state-service.js`, `overlay-event-service.js`, `overlay-sync-service.js`.
- `duration-retry-service.js`: retry metadata duration đến khi có thời lượng.
- `quick-add-service.js`, `queue-mutation-service.js`, `playback-controller.js`.

`app.js` vẫn còn lớn, nhưng các service trọng yếu đã được tách dần.

### Các hotfix quan trọng trước đó

- Dashboard ↔ overlay dùng realtime snapshot/event thay vì polling REST liên tục.
- Playlist là một khối: khi playlist đang phát, bài donate giá cao hơn không chen vào giữa playlist.
- Vote Skip chọn bài đầu hàng đợi theo thứ tự realtime khi vote kết thúc.
- Sửa duplicate donate/queue từ Firebase và reconcile `musicKey` ZyPage API.
- Lệnh kết thúc bài lên ZyPage chỉ gửi một lần; có log F12 `[ZyPage End]`; `status: 2` là `invalid_music_key`, không phải thành công.
- Bổ sung log Firebase donate trong F12.
- Lọc view có cấu hình Settings, mặc định 10.000; áp dụng cho link trong chat donate và video playlist.
- Khi duration metadata chưa có, retry 1.5s → 3s → 5s → 10s → 15s tiếp tục cho đến khi có duration hoặc bài bị bỏ.
- Overlay ưu tiên metadata YouTube thay vì tiêu đề/lời nhắn donate.
- DirectStream fallback:
  - Overlay chuyển sang DirectStream trước khi skip khi YouTube player lỗi/stuck.
  - `main.js` endpoint `/api/yt-stream` dùng `yt-dlp --no-playlist -g -f ba`.
  - Đã sửa lỗi kill yt-dlp sớm từ `req.close` sang quản lý `res.close`.
- Quick Add URL `watch?v=...&list=...` là playlist, trừ `list=RD...` là Mix/bài đơn.

### Đóng gói lại bản mới

Do fix parser mới chưa có trong `.exe`, nếu cần build lại:

```powershell
npm.cmd test
npm.cmd run build
```

File sẽ ghi đè:

```text
dist-v2\IntrovertPlayer.Setup.26.8.5.exe
```

Cấu hình artifact hiện đúng tên trong [package.json](E:\Zypage_Player_prod\v26.8.0\package.json).