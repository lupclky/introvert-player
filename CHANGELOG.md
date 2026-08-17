# Nhật ký thay đổi (Changelog) - Introvert Player

## [26.8.19] - 2026-08-16
### Đảo ngược cập nhật (Rollback)
- Khôi phục mã nguồn về nguyên bản phiên bản `26.8.18` gốc (trước các thay đổi thử nghiệm liên quan đến xử lý tự động phát âm lượng, đồng bộ lời, lỗi hiển thị `- Topic` và lỗi phát đè).

## [26.8.12] - 2026-08-12
### Lyrics realtime
- Sửa nhận diện lyrics cho bài Topic có danh sách cộng tác viên dài như `CLSUxac0F9Q`: đối chiếu tên lõi, credit YouTube và tên nghệ danh viết liền/cách (`CODYNAMVO`/`CODY NAM VÕ`), dùng thời lượng bản phát hành Apple 221,8 giây để khớp chính xác LRCLIB 222 giây.
- Extension bổ sung nút thêm nhanh cho từng bài và nút thêm toàn bộ playlist trên trang chủ, tìm kiếm và danh sách phát của YouTube Music; playlist được chuyển vào đúng pipeline playlist của ứng dụng.
- Khôi phục nguyên bố cục dọc toàn khung 280px trước đây cho thẻ Tiếp theo 15 giây khi bài đang phát không có lyrics; bố cục ngang thu gọn chỉ áp dụng khi cần giữ vùng lyrics.
- Sửa bài Topic có thời lượng lẻ như “Có Em Là Nhà” (`22opdLbDgM8`): chuẩn hóa thời lượng metadata về giây gần nhất trước khi đối chiếu tuyệt đối với LRCLIB, tránh loại nhầm bản lyrics 251 giây từ nguồn phát 250,5 giây.
- Khi bài có lyrics, hàng đợi 30–15 giây chỉ hiển thị hai bài tiếp theo; Donate mới và thẻ Tiếp theo tự đo mép trên vùng lyrics để phủ chính xác từ đỉnh Overlay tới ranh giới player–lyrics.
- Thiết kế lại Donate mới, hàng đợi 30–15 giây và thẻ tiếp theo thành lớp nội dung cố định trong vùng player; khi có lyrics, các màn này không tăng chiều cao Overlay và không che vùng lời.
- Khi bài không có lyrics, Donate mới, hàng đợi 30–15 giây và thẻ tiếp theo tiếp tục dùng giao diện toàn khung Overlay 280px như trước.
- Khôi phục thẻ “Đã thêm” của chủ kênh khi bài đang phát có lyrics: thẻ đè lên vùng player, giữ thumbnail và tiêu đề nhưng không làm dịch chuyển lyrics.
- Sửa nhận diện lyrics YouTube Music: ngăn iTunes đổi nhầm sang bài khác cùng nghệ sĩ/thời lượng và bổ sung tìm kiếm LRCLIB mở rộng theo tên bài.
- Giữ tên bài gốc của YouTube Music khi iTunes trả về một bản featuring/cộng tác khác, tránh làm truy vấn LRCLIB thất bại.
- Tổng quát hóa đối chiếu LRCLIB theo tên lõi và nghệ sĩ, đồng thời bắt buộc thời lượng LRCLIB trùng tuyệt đối theo giây nguyên với thời lượng thật từ player.
- Khi player chưa báo thời lượng hoặc vừa cập nhật thời lượng thật, Dashboard chờ rồi tự truy vấn lại lyrics thay vì chọn theo ước lượng.
- Đọc credit chính thức trong mô tả YouTube Music và đối chiếu với bản phát hành iTunes để giữ đúng nghệ sĩ cộng tác; không dùng lyrics của bản collab khác dù trùng tên và thời lượng.
- Mở rộng nhận diện lyrics cho link YouTube Music và video YouTube có tiêu đề âm nhạc; giữ URL nguồn xuyên suốt Quick Add/ZyPage để không mất dấu YouTube Music.
- Donate mới, đếm ngược 15 giây và danh sách hàng đợi 30–15 giây có bố cục mở rộng riêng, giữ lyrics của bài đang phát ở vùng phía dưới.
- Lyrics tiếng Hàn tự động ưu tiên phiên âm Latin trên Dashboard và OBS Overlay; giữ lời Hangul gốc trong payload để dự phòng.
- Thêm công tắc bật/tắt lyrics riêng cho OBS Overlay trong Cài đặt; trạng thái được lưu và đồng bộ realtime/snapshot, mặc định bật.
- Tăng nhẹ khoảng cách dọc giữa ba câu lyrics trên Overlay để nội dung thoáng và dễ đọc hơn.
- Căn câu lyrics đầu tiên vào chính giữa vùng lời ngay khi bắt đầu phát; thêm khoảng đệm timeline động ở đầu/cuối để không còn bị kẹp sát mép.
- Tăng nhẹ kích thước toàn bộ lyrics trên Overlay, gồm cả câu dài và câu đang hát, để dễ đọc hơn trong OBS mà vẫn giữ tối đa ba câu.
- Sửa định vị auto-scroll Dashboard theo tọa độ thực bên trong vùng lyrics, tránh cuộn lệch làm mất câu đang hát; mở rộng lyrics Overlay sát các mép card để tăng diện tích đọc.
- Overlay chỉ hiển thị tối đa ba câu quanh câu đang hát, nhưng mỗi câu dài vẫn có thể xuống tới bốn dòng để ưu tiên kích thước và nội dung đầy đủ.
- Dashboard hiển thị toàn bộ lyrics trong vùng cuộn; hỗ trợ bấm trực tiếp vào một câu để tua và tự bám lại câu đang hát sau khi người dùng ngừng cuộn.
- Thêm lyrics đồng bộ theo thời gian phát thật cho video YouTube Topic và nguồn Apple Music, dùng metadata Apple/iTunes cùng dữ liệu timestamp từ LRCLIB.
- Hiển thị câu trước, câu hiện tại và câu tiếp theo trên Dashboard lẫn OBS Overlay; tự bám theo tua, resume, SponsorBlock, iframe và DirectStream.
- Overlay tự tăng chiều cao khi có lyrics và trở về bố cục cũ khi bài không có lời đồng bộ.
- Loại bản lyrics timestamp bị thiếu bằng độ phủ nội dung/thời gian, ưu tiên bản đầy đủ nhất; cửa sổ lời luôn lấp đủ ba dòng ở đầu và cuối bài.
- Tăng chiều cao vùng lyrics trên Overlay, tăng cỡ chữ và cho phép câu dài xuống dòng để không còn bị nhỏ hoặc cắt mất nội dung.
- Giữ cố định chiều cao lyrics trên theme Set 18, không để CSS thu gọn 160px ghi đè sau animation; tự khôi phục nếu một trạng thái Overlay khác làm lệch chiều cao.
- Hiển thị ba chấm nhấp nháy theo màu theme trên Dashboard và Overlay khi LRCLIB xác nhận bài không có lời đồng bộ.
- Overlay lyrics có cùng chiều cao 280px với khung đếm ngược/donate mới; toàn bộ lời được dựng một lần và cuộn dọc liên tục theo timestamp như Apple Music, không còn xóa dựng lại gây nháy.
- Bài được xác nhận không có lyrics giữ nguyên Overlay gọn 160px; ba chấm chỉ hiện thành chỉ báo nhỏ dưới trình phát, không mở vùng trống 280px.
- Câu lyrics trên Overlay được xuống tối đa ba dòng và tự giảm font theo độ dài; bỏ chế độ một dòng kèm dấu ba chấm để ưu tiên hiển thị trọn câu.
- Thu gọn riêng header trình phát khi có lyrics: thumbnail, font bài/kênh/donate/tiền và thanh tiến trình nhỏ hơn; vùng lyrics dùng linh hoạt toàn bộ phần còn lại tới sát viền dưới của card 280px.
- Cân lại chế độ lyrics để câu dài vẫn xuống tối đa ba dòng, phần trình phát và vùng lời chia không gian rõ ràng trong card 280px.
- Tăng lại thứ bậc trình phát trong card lyrics: thumbnail 56px, title 1.05rem, kênh 0.84rem, donate/tiền 0.88rem; thanh tiến trình dùng lưới ba cột để hai mốc thời gian cân hàng. Câu đang hát tăng thật lên 1.24rem (tự hạ cho câu dài), đậm và sáng rõ hơn.
- Bỏ giới hạn chiều cao và `margin-top: auto` của vùng lyrics để phần trống dưới thanh tiến trình được dùng hoàn toàn cho lời bài hát.

### Sửa Quick Add Playlist và SponsorBlock
- Sửa lỗi thanh tìm kiếm nhận diện playlist YouTube nhưng không gửi yêu cầu thêm vào hàng đợi khi chưa có bài đang phát.
- Khóa dữ liệu SponsorBlock theo từng bài và kết thúc trực tiếp khi phân đoạn outro chạm đuôi video, tránh iframe phát lại từ đầu.

## [26.8.11] - 2026-08-11
### Playlist Beta, đồng bộ phát và Overlay Set 18
- Cải thiện đồng bộ trạng thái phát, kết bài, tiếp tục phát và âm lượng giữa Dashboard với OBS Overlay.
- Bổ sung luồng Playlist Beta, cấu hình thời lượng theo số tiền donate và hiển thị bảng giá riêng trên Overlay.
- Hoàn thiện giao diện Set 18 cho hàng đợi, bài tiếp theo, donate mới và bảng giá.
- Cải thiện thông báo taskbar, metadata thời lượng, SponsorBlock và fallback Direct Stream.

## [26.8.0] - 2026-06-24
### 🎨 Tái cấu trúc Bố cục Giao diện & Tinh giản Dashboard
- **Thanh thêm nhanh trên Titlebar**: Tích hợp ô nhập URL và tìm kiếm nhạc nhanh (`#quick-add-form`) lên trung tâm của Titlebar. Thiết kế thanh tìm kiếm dạng tối giản kèm Popover thông minh tự động hiển thị các tùy chọn (Tên người gửi, Số tiền, Chủ kênh) và kết quả gợi ý tìm kiếm khi người dùng focus, click ra ngoài hoặc bấm Escape sẽ tự động ẩn đi.
- **Trình phát nhạc kiểu Spotify ở đáy màn hình**: Chuyển đổi toàn bộ trình phát nhạc hiện tại (Now Playing Widget) thành một thanh phát nhạc nằm ngang cố định dưới cùng của ứng dụng. Bố cục 3 phần trực quan: Thông tin bài hát & tin nhắn ở bên trái; Điều khiển phát nhạc & thanh tiến trình ở giữa; Sóng nhạc & điều khiển âm lượng ở bên phải.
- **Tái cấu trúc Tab Cấu hình**: Tổ chức lại các danh mục trong thanh bên cài đặt một cách logic hơn. Đổi tên nhóm "Cấu hình OBS Overlay" thành "Hiển thị & Giao diện" để phù hợp với việc cấu hình cả Dark Mode và OBS Overlay. Đổi tên nhóm "Chặn & Lọc nhạc" thành "Giới hạn & Bộ lọc" để phù hợp với các cài đặt SponsorBlock và giới hạn thời gian phát nhạc.
- **Sửa lỗi hiển thị kính lúp tìm kiếm**: Khắc phục lỗi icon kính lúp trên thanh thêm nhanh hiển thị thành ô vuông do CSS ghi đè font-family của FontAwesome.
- **Tối ưu không gian hiển thị**: Loại bỏ các card dư thừa trên Dashboard giúp danh sách hàng đợi nhạc kéo dài hơn, tối đa hóa chiều dọc trống của Dashboard.

## [3.0.0] - 2026-06-13
đó là những gì em đã ghi ở file pdf ròi, có gì chị tìm hiểu nha

## [2.0.32] - 2026-06-12
### 🎨 Thiết kế lại giao diện Tab Cấu hình
- **Giao diện dạng Phân Mục (Sidebar Layout):** Chuyển từ kiểu danh sách cuộn dọc dài sang bố cục chia đôi màn hình: sidebar bên trái chứa các thẻ danh mục lớn, bên phải hiển thị nội dung cài đặt chi tiết của mục đang chọn. Giúp giao diện cực kỳ ngăn nắp, dễ quản lý.
- **Phân nhóm chức năng logic:** Gom các thẻ cài đặt vào 4 nhóm trực quan:
  1. *Kết nối & Đồng bộ:* Tích hợp cài đặt đồng bộ Live ZyPage và Đăng nhập/đồng bộ tài khoản YouTube.
  2. *Cấu hình OBS Overlay:* Chứa link OBS Browser Source, các bộ tùy chỉnh (Zoom, Theme, Opacity) và cài đặt thông báo/tin nhắn hiển thị.
  3. *Chặn & Lọc nhạc:* Nơi cấu hình các bộ lọc SponsorBlock.
  4. *Nhật ký hoạt động:* Hộp log ghi nhận lịch sử hệ thống.
- **Tương thích Responsive tốt:** Bố cục tự động chuyển sang chế độ thanh điều hướng ngang cuộn mượt mà trên màn hình nhỏ.

## [2.0.31] - 2026-06-11
### 🚀 Cải tiến Cảnh báo Nhạy cảm & Tải Cấu hình Gist đáng tin cậy
- **Đồng bộ Warning nằm trong Player:** Giữ nguyên cảnh báo nhạy cảm hiển thị bên trong Widget Player trên Dashboard, duy trì hiển thị suốt thời gian chạy bài hát và tự động ẩn khi đổi bài.
- **Tải tệp tin cấu hình Gist qua CORS Proxy:** Tích hợp bộ giải quyết Proxy CORS (`corsproxy.io` & `api.allorigins.win`) ở cả Dashboard (`app.js`) và Overlay (`overlay.html`) để đảm bảo không bao giờ bị nghẽn mạng hay lỗi chặn DNS Gist từ phía các ISP ở Việt Nam.
- **Cơ chế Fallback thông minh:** Thêm cảnh báo fallback mặc định cho video ID thử nghiệm `Wv7t22rx7Ik` trên Dashboard nếu lỗi kết nối mạng xảy ra.
- **Cá nhân hóa & Tăng tốc tìm kiếm YouTube:** Tự động gửi kèm thông tin đăng nhập của tài khoản YouTube khi thực hiện tìm kiếm bài hát, đồng thời giảm thời gian trễ phản hồi (debounce delay) từ `300ms` xuống còn `150ms` giúp kết quả hiển thị cực kỳ nhanh chóng.
- **Khắc phục triệt để lỗi ytInitialData:** Xây dựng cơ chế tải đệ quy tự động theo dõi chuyển hướng (Redirects Follower), tự động vượt qua trang xác nhận điều khoản dịch vụ (Google Consent SOCS Cookie) và áp dụng nhiều mẫu biểu thức chính quy (Regex fallback patterns) để trích xuất dữ liệu `ytInitialData` thành công trong mọi trường hợp, giải quyết hoàn toàn lỗi thỉnh thoảng không thể tìm kiếm.
- **Tối giản Giao diện Cấu hình:** Ẩn ô nhập Gist JSON trong phần Cài đặt để bảng điều khiển trực quan và gọn gàng hơn.

## [2.0.29] - 2026-06-11
### 🚀 Cảnh báo nhạy cảm trực tiếp trên Streamer Dashboard
- **Hộp cảnh báo nhạy cảm đồng bộ trên Dashboard:** Bổ sung phần tử cảnh báo trực quan `#dash-sensitive-warning` nằm ngay phía dưới trình phát hiện tại của Dashboard.
- **Hiển thị xuyên suốt bài hát:** Cảnh báo này sẽ tự động hiển thị và giữ nguyên trạng thái cho đến khi bài hát nhạy cảm kết thúc hoặc bị skip (khác với OBS Overlay chỉ hiển thị cảnh báo đỏ đè 5 giây đầu).
- **Hỗ trợ đồng bộ hóa & tự động tải:** Đồng bộ hóa bộ lọc và dữ liệu nhạy cảm tự động trên Dashboard (tải định kỳ mỗi 10 phút, tự tải lại khi lưu link Gist mới).
- **Thiết kế Pineapple & Dark Mode:** Được thiết kế với viền đỏ đậm và đổ bóng 3D đặc trưng của giao diện Dứa, đồng thời đổi màu nền tối sẫm khi kích hoạt chế độ Dark Mode.

## [2.0.28] - 2026-06-11
### 🔧 Bảo vệ lỗi cú pháp JSON Gist & Thông báo log chi tiết
- **Bảo vệ chống crash phân tích JSON:** Cập nhật hàm `fetchSensitiveVideosConfig` phân tích tệp Gist dưới dạng text thô trước, sau đó mới giải mã JSON bên trong một khối try-catch an toàn. Giúp ứng dụng không bị lỗi ngắt quãng khi tệp JSON trực tuyến của Gist bị thiếu dấu phẩy, thừa ngoặc hay sai cú pháp, đồng thời in rõ chi tiết lỗi ra màn hình kiểm tra (Console) để streamer dễ nhận biết và sửa nội dung Gist.

## [2.0.27] - 2026-06-11
### 🚀 Fix Cache Gist và Loại bỏ tự động reset Overlay khi mở Dashboard
- **Cache-busting cho đường dẫn Gist:** Thêm tham số chống lưu đệm (cache-busting query parameter `?t=timestamp`) và thiết lập thuộc tính `{ cache: 'no-store' }` cho cuộc gọi `fetch()` khi lấy dữ liệu Gist JSON. Đảm bảo dữ liệu mới nhất được tải về trực tiếp từ GitHub Gist kể cả khi không dùng hash phiên bản trong URL.
- **Loại bỏ tự động reset Overlay khi khởi chạy:** Gỡ bỏ hoàn toàn lệnh tự động gửi yêu cầu F5/reload OBS Overlay mỗi khi mở ứng dụng Dashboard. Người dùng có thể yên tâm bật/tắt Dashboard khi đang livestream mà không lo OBS bị nháy đen giao diện. (Lệnh reload chỉ chạy khi người dùng chủ động click nút "Reset Overlay" thủ công).

## [2.0.26] - 2026-06-11
### 🔧 Chống reload OBS Overlay khi đang phát Live Stream
- **Bảo vệ OBS Overlay khi đang chạy Live:** Bổ sung điều kiện chặn lệnh reload (Reset) trên OBS Overlay nếu đang trong quá trình phát Live Stream. Giúp ngăn chặn tuyệt đối tình trạng luồng hiển thị trên OBS bị khởi động lại hoặc ngắt quãng ngoài ý muốn khi streamer mở/đóng Dashboard.

## [2.0.25] - 2026-06-11
### 🚀 Tự động cập nhật danh sách Video nhạy cảm mỗi 10 phút
- **Cập nhật định kỳ 10 phút:** Thêm cơ chế tự động gửi truy vấn `fetch()` tải lại danh sách cấu hình video nhạy cảm từ Gist JSON trực tuyến định kỳ mỗi 10 phút một lần. Giúp streamer cập nhật các bài hát cấm/nhạy cảm mới ngay trên Gist mà không cần tải lại trang OBS Overlay.

## [2.0.24] - 2026-06-11
### 🚀 Tích hợp mặc định danh sách Video cảnh báo nhạy cảm trực tuyến
- **Mặc định hóa danh sách nhạy cảm trực tuyến:** Tích hợp trực tiếp link Gist JSON chứa danh sách video nhạy cảm chính thức của streamer (`https://gist.githubusercontent.com/lupclky/55e17b98530c70085aaece7e2a0289b7/raw/sensitive_videos.json`) làm cấu hình mặc định (fallback) cho hệ thống, giúp phần mềm hoạt động ngay lập tức mà không cần cấu hình thủ công.

## [2.0.23] - 2026-06-11
### 🚀 Cấu hình danh sách Video cảnh báo từ Gist/JSON trực tuyến
- **Tích hợp bộ lọc video cảnh báo nhạy cảm trực tuyến:** Thêm ô nhập URL Gist JSON trực tiếp trong phần Cấu hình hiển thị trên Dashboard. Streamer có thể dán link Raw Gist/JSON để tự động đồng bộ danh sách bài hát nhạy cảm và thông báo hiển thị tùy chỉnh mà không cần sửa code.
- **Tự động đồng bộ và Fallback an toàn:** Đường dẫn Gist được đồng bộ tức thì sang OBS Overlay qua LocalStorage và MQTT. Nếu link trống hoặc tải thất bại, hệ thống tự động sử dụng danh sách fallback mặc định để đảm bảo luôn an toàn.

## [2.0.22] - 2026-06-11
### 🔧 Khắc phục âm thanh tự động phát & Tránh đè giao diện thông báo
- **Tắt âm thanh triệt để khi đang đếm ngược:** Xử lý triệt để việc nhạc vẫn tự động phát hoặc tự động tiếp tục (auto-resume) của YouTube Player trong suốt 5 giây đếm ngược bằng cách bắt và tự động dừng (pause) video trong cả `onReady` và `onPlayerStateChange` nếu bộ đếm ngược đang kích hoạt.
- **Ngăn chặn thông báo Donate đè lên màn hình cảnh báo:** Sử dụng CSS `:has()` selector để tự động nâng `z-index` của Player Widget lên mức tối đa (`999999`) khi màn hình cảnh báo đang kích hoạt, giúp che hoàn toàn các thông báo Donate mới trượt đè lên ở tất cả các theme (Dứa, TFT, Cute Pink, Frosted Glass).

## [2.0.21] - 2026-06-11
### 🔧 Cải tiến cảnh báo nhạy cảm
- **Đổi đếm ngược còn 5 giây:** Thời gian trì hoãn phát bài hát nhạy cảm giảm từ 10 giây xuống còn 5 giây.
- **Tăng kích thước chữ & Nổi bật đếm ngược:** Cỡ chữ nội dung cảnh báo được phóng to (`1.05rem` đậm) giúp dễ đọc hơn. Con số đếm ngược cũng được thiết kế lại to hơn (`1.15rem` cực đậm) màu vàng chói rực rỡ có viền vàng nổi bật trên nền đỏ.
- **Sửa lỗi đếm ngược bị kẹt:** Khắc phục triệt để lỗi bộ đếm thời gian bị reset liên tục dẫn đến không hoạt động khi Dashboard gửi yêu cầu đồng bộ liên tục.
- **Bỏ tiêu đề cảnh báo:** Loại bỏ phần tiêu đề `"CẢNH BÁO NHẠY CẢM"` theo yêu cầu của người dùng để giảm thiểu chi tiết thừa.

## [2.0.20] - 2026-06-11
### 🔧 Cảnh báo nội dung nhạy cảm
- **Cảnh báo nhạy cảm trước khi phát:** Đối với video đặc biệt chứa nội dung nhạy cảm (Video ID: `Wv7t22rx7Ik`), ứng dụng sẽ tự động trì hoãn phát nhạc 10 giây và hiển thị màn hình cảnh báo đỏ rực rỡ kèm bộ đếm ngược `"Nội dung chuẩn bị phát rất nhạy cảm, không phù hợp với người có vấn đề tâm lý. Vui lòng cân nhắc trước khi nghe."` trước khi tự động chạy video đó.

## [2.0.19] - 2026-06-11
### 🔧 Tính năng Ẩn Overlay khi trống & Tối ưu Pop-up Changelog
- **Ẩn Overlay hoàn toàn khi không có nhạc:** Thêm tùy chọn checkbox `"Ẩn Overlay hoàn toàn khi không có nhạc"` trong mục Cấu hình hiển thị Overlay ở Dashboard. Khi bật, toàn bộ Widget hiển thị trên OBS sẽ ẩn đi (không hiển thị khung chờ) khi hàng đợi nhạc trống.
- **Loại bỏ hiệu ứng hover trên Changelog:** Loại bỏ hoàn toàn hiệu ứng xoay nảy và thay đổi bóng đổ (animation) khi di chuột vào bảng Pop-up nhật ký thay đổi để mang lại trải nghiệm đọc mượt mà, tĩnh và chuyên nghiệp hơn.

## [2.0.18] - 2026-06-11
### 🔧 Tự động Reset Overlay khi mở App & Hiện bảng Thay đổi (Changelog)
- **Tự động reset/reload overlay mỗi khi mở App:** Chuyển đổi cơ chế gửi yêu cầu tải lại trang đến màn hình hiển thị OBS Overlay từ "chỉ thực hiện sau khi cập nhật" thành **"tự động kích hoạt mỗi lần mở ứng dụng (Dashboard)"**. Streamer chỉ cần khởi động phần mềm và OBS Overlay sẽ tự động đồng bộ làm mới ngay lập tức.
- **Hiển thị bảng cập nhật (Changelog Modal):** Khi ứng dụng được nâng cấp lên phiên bản mới thành công, ứng dụng sẽ tự động tải tệp tin `CHANGELOG.md` đi kèm gói cài đặt, trích xuất chính xác các thay đổi của phiên bản mới và hiển thị dưới dạng một bảng thông báo Pop-up đẹp mắt ngay trong lần đầu khởi chạy phiên bản mới.

## [2.0.17] - 2026-06-11
### 🔧 Phóng to Countdown & Tự động Reset Overlay khi cập nhật
- **Phóng to đếm ngược Live Stream thêm 50%:** Trên màn hình OBS Overlay, tăng kích thước của chữ nhãn `"KẾT THÚC SAU"`, số đếm thời gian và chấm đỏ đập nháy lớn hơn 50% để streamer và khán giả dễ theo dõi hơn.
- **Tự động làm mới (Reset) OBS Overlay:** Khi ứng dụng được nâng cấp lên phiên bản mới và khởi chạy lần đầu, Dashboard điều khiển sẽ tự động nhận diện sự thay đổi phiên bản và gửi lệnh tự động tải lại (reload) màn hình OBS Overlay. Không còn cần streamer bấm nút reset thủ công sau mỗi lần update.

## [2.0.16] - 2026-06-11
### 🔧 Sửa lỗi Màu chữ Countdown ở chế độ Tối (Dark Mode)
- **Sửa lỗi chữ trắng trên nền hồng:** Khắc phục lỗi hiển thị thời gian số của đồng hồ đếm ngược Live Stream (`dash-cd-time`) bị chuyển sang màu trắng/xám sáng khi bật chế độ Tối (Dark Mode), khiến chữ bị chìm vào nền hồng nhạt của badge đếm ngược. Giờ đây màu số đếm ngược luôn hiển thị màu tối rõ ràng trong cả hai chế độ sáng/tối.

## [2.0.15] - 2026-06-11
### 🔧 Nâng cấp Giao diện Live Stream & Đồng bộ Countdown
- **Ẩn thanh tiến trình khi có live stream:** Trên OBS Overlay, khi phát live stream sẽ tự động ẩn thanh thời lượng (progress bar) trống vô nghĩa.
- **Di chuyển Countdown Live vào Widget:** Phần hiển thị thời gian kết thúc live stream còn lại (`● KẾT THÚC SAU X:XX`) được chuyển hẳn vào bên trong widget player, thay thế chính xác vị trí của thanh tiến trình đã ẩn giúp bố cục gọn gàng, liền mạch.
- **Sửa lỗi hiển thị Countdown trên Dashboard:** Sửa triệt để lỗi không hiển thị đồng hồ đếm ngược live stream trên Dashboard điều khiển do thiếu xử lý dữ liệu live stream trong bộ lắng nghe sự kiện MQTT.
- **Đồng bộ cơ chế bỏ qua giới hạn (Bypass Limit):** Đảm bảo nút "Vô cùng" (Bypass) hoạt động đồng bộ và mượt mà trên cả bộ lắng nghe local storage và MQTT.

## [2.0.12] - 2026-06-11
### 🔧 Sắp xếp lại thứ tự Dashboard dọc
- **Di chuyển Hàng đợi Nhạc xuống dưới Player:** Khi co giao diện lại thành 1 cột dọc (trên màn hình nhỏ hoặc khi thu hẹp cửa sổ), thẻ "Hàng đợi Nhạc" giờ đây sẽ xuất hiện trực tiếp ngay dưới trình phát "Đang Phát" để streamer dễ quản lý bài hát hiện tại và hàng đợi phát, trước khi cuộn xuống phần Thêm nhanh và Gợi ý.

## [2.0.11] - 2026-06-11
### ✨ Tăng số lượng gợi ý, Thêm nút Làm mới & Đồng bộ thanh cuộn
- **Tăng số lượng gợi ý gấp đôi (x2):** Tự động tải thêm trang gợi ý tiếp theo từ YouTube bằng API continuation, nâng tổng số gợi ý hiển thị từ 18-20 lên tới tối đa 60 video.
- **Thêm nút Làm mới (Refresh) gợi ý:** Bổ sung nút "Làm mới gợi ý" ở góc trên bên phải tab Gợi ý giúp streamer dễ dàng tìm kiếm những gợi ý mới khác từ YouTube.
- **Đồng bộ thanh cuộn dứa dễ thương:** Áp dụng phông cách thiết kế thanh cuộn màu cam/vàng đặc trưng của Dứa cho cả hai danh sách Gợi ý và Playlist cá nhân.

## [2.0.10] - 2026-06-11
### 🔧 Sửa lỗi Icon & Tăng tốc độ Tìm kiếm
- **Sửa lỗi hiển thị icon:** Khắc phục triệt để lỗi các icon FontAwesome trong tab gợi ý/playlist bị chuyển thành ô vuông trống do quy tắc ghi đè phông chữ (`font-family`) quá rộng trong CSS.
- **Tăng tốc độ tìm kiếm nhanh:** Giảm thời gian phản hồi chờ tìm kiếm (debounce delay) từ `600ms` xuống còn `300ms` giúp hiển thị kết quả tìm kiếm YouTube gần như lập tức khi người dùng nhập từ khóa.
- **Bỏ nút "Thêm bài" trong ô gợi ý/playlist:** Đơn giản hóa và làm gọn giao diện bằng cách cho phép click trực tiếp vào toàn bộ thẻ video để thêm nhanh bài hát vào hàng đợi.

## [2.0.9] - 2026-06-11
### ✨ Đồng bộ tài khoản YouTube: Lấy gợi ý & Danh sách phát cá nhân
- **Kết nối tài khoản YouTube nhanh chóng:** Thêm khu vực kết nối tài khoản tại trang Cấu hình (Settings). Chỉ cần bấm đăng nhập, điền tài khoản như trên trình duyệt thông thường là bạn đã có thể đồng bộ hóa dữ liệu mà không cần tạo khóa API phức tạp.
- **Đồng bộ danh sách phát (Playlists):** Trong bảng "Thêm nhanh" tại Bàn điều khiển, giờ đây bạn có thể chọn trực tiếp danh sách phát cá nhân của mình để xem và chọn bài hát nhanh chóng.
- **Gợi ý video cá nhân hóa:** Tự động tải danh sách video gợi ý trên trang chủ YouTube dựa trên sở thích và thói quen nghe nhạc của tài khoản của bạn, giúp bạn tìm nhạc nhanh hơn bao giờ hết.
- **Bảo mật & Tiện lợi:** Đăng xuất tài khoản an toàn bất cứ lúc nào để xóa sạch cookie phiên đăng nhập khỏi bộ nhớ của ứng dụng.

## [2.0.8] - 2026-06-10
### ✨ Thêm giao diện Kính Mờ (Frosted Glass) phẳng hiện đại
- **Thêm 2 Tông màu Kính Mờ:** 
  - **Tông Tối (Frosted Glass Dark):** Đã được điều chỉnh tăng độ đậm (từ opacity `0.55` lên `0.82`) giúp giao diện nổi bật, rõ nét và dễ đọc thông tin hơn rất nhiều trên các cảnh phát trực tiếp sáng màu.
  - **Tông Sáng (Frosted Glass Light):** Thêm biến thể tông màu sáng mới sử dụng nền kính mờ trắng đục trang nhã (`rgba(255,255,255,0.8)`) đi kèm chữ tối màu tương phản tốt cho những streamer yêu thích phong cách tối giản, tươi sáng.
- **Ảnh bài hát dạng vuông phẳng:** Ảnh bìa (thumbnail) bài hát hiển thị dưới dạng hình vuông bo nhẹ 4 góc và đứng yên (không xoay tròn), mang lại phong cách thiết kế phẳng (flat design) sạch sẽ.
- **Phông chữ phẳng dễ nhìn:** Sử dụng phông chữ hiện đại **Inter**, giúp các dòng tiêu đề, thông tin người tặng và tin nhắn hiển thị vô cùng sắc nét và dễ đọc ngay cả khi thu nhỏ widget trên màn hình livestream.
- **Chữ khi hết bài to hơn:** Font chữ thông báo chờ khi hết bài nhạc (ví dụ: `Order nhạc tự động Zypage 50k`) được tăng kích thước lên `1.85rem` to rõ, dễ nhìn từ xa.
- **Thanh chạy nhạc tinh gọn:** Thanh tiến trình thời gian được thiết kế mỏng dẹt phẳng, màu xanh dương pastel dịu mắt, loại bỏ hoàn toàn các viền dày thô cứng để tăng tính thẩm mỹ tối giản.
- **Hiệu ứng chuyển bài phẳng, mượt mà:** Thay đổi bài hát bằng hiệu ứng trượt nhẹ và mờ dần (fade/slide) tinh tế, gọn gàng.
- **Sửa nút Vô cùng (Bypass Limit) trên Dashboard:** Cho phép bật/tắt (toggle) linh hoạt giới hạn thời gian của bài hát hiện tại bằng cách bấm lại nút "Vô cùng" để khôi phục giới hạn ban đầu dễ dàng.

## [2.0.7] - 2026-06-09
### 🔧 Cải thiện kết nối giữa Trình phát nhạc và màn hình OBS
- **Ổn định hơn:** Trình phát nhạc và màn hình hiển thị trên OBS giờ đây giao tiếp trực tiếp với nhau ngay trên máy tính của bạn, thay vì phải đi vòng qua một máy chủ trung gian ở nước ngoài. Nhờ vậy, hiện tượng **mất kết nối đột ngột** hoặc **lệnh bị nuốt** (bấm chuyển bài mà OBS không phản hồi) sẽ không còn xảy ra.
- **Không cần Internet để đồng bộ:** Kể cả khi mạng Internet của bạn bị chập chờn hoặc mất hoàn toàn, việc điều khiển nhạc trên Dashboard vẫn đồng bộ sang OBS bình thường.
- **Phản hồi nhanh hơn:** Khi bạn bấm Play, Pause, chuyển bài hoặc thay đổi âm lượng, OBS sẽ phản hồi gần như **tức thì** (nhanh hơn khoảng 50-100 lần so với trước).
- **An toàn hơn:** Không ai bên ngoài có thể can thiệp vào luồng nhạc của bạn nữa vì dữ liệu chỉ truyền trong máy tính của bạn.
- **Không cần thay đổi link OBS:** Bạn **không cần** cấu hình lại link Browser Source trên OBS Studio. Link cũ vẫn hoạt động bình thường.

## [2.0.6] - 2026-06-09
### Added
- Giữ lại hiệu ứng chuyển chữ (trượt & mờ dần đàn hồi), lược bỏ các hiệu ứng đĩa xoay nảy và lắc widget ở theme Dứa mặc định.
- Mở rộng hỗ trợ hiệu ứng chữ chuyển bài hát này cho các theme: TFT Spacegods (`theme-spacegods`) và Cute Pink (`theme-cutepink`).

## [2.0.5] - 2026-06-09
### Added
- Thêm hiệu ứng đổi bài hạt ngầu & dễ thương cho giao diện Dứa mặc định (Pineapple Theme): Đĩa album co giãn/xoay tròn nảy động, chữ thông tin trượt đàn hồi, và lắc nhẹ toàn bộ widget.

## [2.0.4] - 2026-06-09
### Added
- Phát hành phiên bản 2.0.4 phục vụ thử nghiệm tính năng tự động kiểm tra và nâng cấp.

## [2.0.3] - 2026-06-09
### Fixed
- Khôi phục cơ chế tự động kiểm tra và tải bản cập nhật trực tiếp từ GitHub Releases (truy vấn từ kho phát hành công khai `lupclky/dua-corner-player`).
- Sửa lỗi thiếu các IPC handler (`check-for-updates`, `start-update`) và API tương ứng trong preload script và main process.

## [2.0.2] - 2026-06-09
### Added
- Thêm checkbox bật/tắt **"Chủ kênh thêm nhạc"** trong phần Thêm nhanh ngoài Dashboard. Khi kích hoạt, các bài hát do Streamer thêm thủ công sẽ ẩn thông tin tên & tiền donate giả lập trên OBS Overlay, thay thế bằng lời nhắn chờ mặc định (VD: `Order nhạc tự động Zypage 50k`).
- Tự động lưu và đồng bộ trạng thái checkbox "Chủ kênh thêm nhạc" qua `localStorage`.

### Fixed
- Sửa lỗi chuỗi thông điệp chờ hiển thị bị cắt bớt (`text-overflow: ellipsis`) và không xuống hàng trên theme Classic/Classic Dark.
- Sửa lỗi đè hiển thị dòng tiền `0 VNĐ` dưới thông điệp chờ khi tự thêm nhạc bằng cách ép thuộc tính `!important` ẩn phần tử này.
- Đóng gói bản cài đặt chính thức: `IntrovertPlayer Setup 2.0.2.exe` và đẩy mã nguồn lên kho Git.

---

## [2.0.1] - 2026-06-09
### Improved
- Tăng cỡ chữ hiển thị khi không có nhạc đang phát (Empty Queue Message) trên OBS Overlay để dễ đọc hơn trên livestream:
  - Theme Cổ điển (Classic & Classic Dark): Tăng font size từ `1.4rem` lên `2.0rem` (~40%).
  - Theme khác (Space God, Cute Pink): Tăng từ `2.2rem` lên `2.5rem`.
- Đóng gói bản cài đặt chính thức: `IntrovertPlayer Setup 2.0.1.exe`.

---

## [2.0.0] - 2026-06-08
### Added
- **Cấu hình custom alert hành động donate:** Cho phép cấu hình tùy chọn nội dung thay vì mặc định `"gửi một quả dứa"` trong phần thiết lập Dashboard.
- **Hoạt cảnh thay đĩa (Vinyl Swap Animation):** Thiết kế hiệu ứng đổi đĩa than cơ học chân thực cho theme Classic & Classic Dark (Cần đọc nhấc ra -> Đĩa cũ trượt sang trái biến mất -> Đĩa mới trượt từ phải vào -> Cần đọc hạ xuống).
- **Phần thêm nhanh cải tiến:** Hỗ trợ nhập nhanh các nút mốc tiền chia làm 2 hàng gọn gàng.
- **Tìm kiếm YouTube siêu nhạy:** Tự động lắng nghe và tải kết quả tìm kiếm ngay lập tức khi gõ từ khóa.

### Removed
- Loại bỏ hoàn toàn màn hình chờ khởi động (Splash Screen), cho phép mở thẳng ứng dụng tức thì.

### Deploy
- Đóng gói bản cài đặt chính thức: `IntrovertPlayer Setup 2.0.0.exe`.
