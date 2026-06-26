# 🍍 Danh sách Toàn bộ Chức năng Introvert Player (v1.0.0 - v26.8.0)

Tài liệu này tổng hợp toàn bộ các tính năng, giao diện, và cơ chế hoạt động của **Introvert Player** từ khi bắt đầu phát triển cho đến phiên bản **v26.8.0** mới nhất.

---

## 🎵 1. Tính năng Cốt lõi & Đồng bộ phát nhạc

*   **Phát nhạc theo yêu cầu từ ZyPage:** Tự động bắt và đồng bộ danh sách nhạc do người xem gửi tặng (donate) trực tiếp từ trang donate ZyPage của streamer.
*   **Đồng bộ Nội bộ Siêu tốc (Local Sync):** Dashboard điều khiển và OBS Overlay kết nối trực tiếp qua giao thức WebSocket/MQTT nội bộ trên máy tính. Không cần truyền qua máy chủ trung gian, phản hồi tức thì và hoạt động bình thường ngay cả khi mất kết nối Internet.
*   **Sắp xếp Hàng đợi Thông minh:** Hỗ trợ sắp xếp bài hát theo hai chế độ:
    *   *Thời gian gửi (FIFO):* Bài nào gửi trước phát trước.
    *   *Số tiền donate:* Bài có số tiền donate cao hơn sẽ được tự động đẩy lên phát trước. Nếu trùng số tiền, bài gửi trước sẽ được phát trước.
*   **Điều khiển Phát nhạc Toàn diện:** Streamer toàn quyền Phát/Tạm dừng, Bỏ qua (Skip), Tua nhanh (Seek/Scrubbing), và điều chỉnh âm lượng (0% - 100%) trực tiếp trên Dashboard.

---

## 🎨 2. Hệ thống Giao diện & Chủ đề (Themes) của OBS Overlay

OBS Overlay hỗ trợ nhiều chủ đề thiết kế đa dạng phù hợp với phong cách của từng streamer:
*   **Theme Dứa (Mặc định):** Tông màu vàng/cam năng động kèm hiệu ứng thanh cuộn đặc trưng.
*   **TFT Spacegods:** Thiết kế phong cách vũ trụ, viền neon cá tính.
*   **Cute Pink (Hồng dễ thương):** Tông hồng phấn ngọt ngào, nhẹ nhàng.
*   **Classic & Classic Dark (Cổ điển):**
    *   Mô phỏng máy hát đĩa than cổ điển.
    *   **Hiệu ứng cơ học thay đĩa (Vinyl Swap Animation):** Khi chuyển bài, cần đọc nhấc ra -> đĩa cũ trượt sang trái -> đĩa mới trượt vào -> cần đọc hạ xuống.
*   **Frosted Glass Light & Dark (Kính mờ):**
    *   Hiệu ứng kính mờ xuyên thấu hiện đại.
    *   Sử dụng ảnh bìa (thumbnail) vuông phẳng đứng yên không xoay tròn.
    *   Phông chữ **Inter** phẳng, thanh tiến trình siêu mỏng dẹt màu xanh pastel.
*   **Tùy chỉnh hiển thị Overlay:**
    *   **Zoom (Tỷ lệ):** Chọn từ 100% đến 200% để phóng to/thu nhỏ overlay trên stream.
    *   **Opacity (Độ mờ):** Kéo thanh trượt điều chỉnh độ trong suốt từ 0% đến 100%.
    *   **Lời chào khi hết nhạc:** Tự do tùy biến câu thông báo hiển thị trên OBS khi hàng đợi trống (VD: *"Quét mã QR để order nhạc"*).
    *   **Lời hành động Donate:** Tùy biến câu thông báo khi có donate mới (VD: *"gửi tặng một quả dứa"*, *"gửi tặng cốc trà sữa"*...).

---

## 📺 3. Giao diện Streamer Dashboard Cải tiến (v26.8.0)

*   **Thanh thêm nhanh (Quick Add) trên Titlebar:** Ô nhập URL và tìm kiếm nhạc được đưa lên trung tâm của Titlebar giúp tiết kiệm diện tích. Popover kết quả hiển thị tự động và tự ẩn đi khi click ra ngoài hoặc bấm `ESC`.
*   **Trình phát kiểu Spotify ở đáy màn hình:** Trình phát nhạc hiện tại (Now Playing Widget) được chuyển thành thanh phát ngang cố định dưới cùng với bố cục 3 phần trực quan (Thông tin bài hát & tin nhắn - Điều khiển phát & Tiến trình - Âm lượng & Sóng nhạc).
*   **Tối ưu hóa không gian Hàng đợi:** Loại bỏ các thành phần thừa giúp danh sách hàng đợi nhạc kéo dài hơn, hiển thị được nhiều bài hát cùng lúc mà không cần cuộn nhiều.
*   **Bố cục Sidebar Cài đặt (Tab Cấu hình):** Phân chia danh mục cài đặt khoa học thành 4 nhóm lớn:
    1.  *Kết nối & Đồng bộ*
    2.  *Hiển thị & Giao diện* (Cấu hình OBS Overlay, Dark/Light Mode)
    3.  *Giới hạn & Bộ lọc* (SponsorBlock, Giới hạn thời gian)
    4.  *Nhật ký hoạt động*

---

## ➕ 4. Thêm nhạc & Tìm kiếm YouTube cá nhân hóa

*   **Tìm kiếm YouTube siêu nhạy:** Tự động tìm kiếm và tải kết quả gần như lập tức với thời gian trễ debounce chỉ **150ms**.
*   **Đăng nhập & Đồng bộ tài khoản YouTube:** Đăng nhập trực tiếp qua cửa sổ trình duyệt tích hợp (OAuth) mà không cần cấu hình API key phức tạp.
*   **Đồng bộ danh sách phát cá nhân:** Hiển thị và cho phép streamer chọn phát các danh sách phát (Playlist) từ tài khoản YouTube của mình.
*   **Gợi ý video cá nhân hóa:** Tự động tải danh sách video gợi ý trên trang chủ YouTube dựa trên lịch sử xem của tài khoản streamer.
*   **Thao tác Thêm nhanh Cực tiện:** Chỉ cần click trực tiếp vào bất kỳ vị trí nào trên thẻ video (card) gợi ý hoặc playlist để thêm vào hàng đợi (không cần click nút nhỏ như trước).
*   **Vượt qua Google Consent & Chặn DNS:** 
    *   Cơ chế đệ quy tự động theo dõi chuyển hướng link (Redirects Follower) và tự vượt qua trang xác nhận điều khoản dịch vụ của Google (Google Consent Cookie).
    *   Áp dụng nhiều mẫu Regex fallback để luôn trích xuất thành công `ytInitialData` khi tìm kiếm.

---

## 🛡️ 5. Trình chặn SponsorBlock tự động

Tự động phát hiện và bỏ qua các đoạn không liên quan đến nhạc trong video YouTube:
*   **Tài trợ (Sponsor):** Đoạn quảng cáo cho nhãn hàng khác.
*   **Nhạc mở đầu (Intro) / Đoạn kết (Outro):** Đoạn giới thiệu hoặc kết thúc của video.
*   **Quảng cáo cá nhân (Self-Promo):** Tự quảng bá sản phẩm/kênh phụ.
*   **Kêu gọi đăng ký (Interaction):** Đăng ký, bấm chuông, bình luận.
*   **Đoạn đối thoại phụ (Off-topic):** Đoạn nhân vật nói chuyện ngoài lề trước và sau bài hát.

---

## ⏱️ 6. Giới hạn Thời gian phát nhạc

Streamer có thể kiểm soát thời lượng tối đa của các bài hát trong hàng đợi:
*   **Giới hạn Cố định:** Tất cả các bài hát chỉ được phát tối đa X giây.
*   **Giới hạn theo mốc Donate:** Tự động tính thời gian phát tối đa dựa vào số tiền donate (VD: Dưới 50k phát tối đa 3 phút, trên 100k phát hết bài).
*   **Bỏ qua giới hạn (Bypass Limit - "Vô cùng"):** Streamer có thể bấm nút "Vô cùng" trực tiếp trên Dashboard để bài hát hiện tại được phát hết mà không bị giới hạn thời gian cắt ngang.

---

## 🚨 7. Cảnh báo nội dung Nhạy cảm

Hệ thống cảnh báo thông minh giúp streamer tránh phát các video có nội dung không phù hợp hoặc nhạy cảm lên stream:
*   **Đọc cấu hình từ Gist JSON trực tuyến:** Đồng bộ danh sách ID video nhạy cảm trực tiếp từ GitHub Gist. Hỗ trợ cấu hình link Gist tùy chỉnh và tự động tải lại mỗi 10 phút.
*   **Bảo vệ phân tích cú pháp:** Đọc file Gist dưới dạng text thô trước khi parse JSON, tránh lỗi cú pháp làm crash app.
*   **Vượt ISP block bằng CORS Proxy:** Tải danh sách Gist qua các proxy (`corsproxy.io`, `api.allorigins.win`) kèm cơ chế fallback trực tiếp để tránh bị nhà mạng Việt Nam chặn DNS.
*   **Màn hình Cảnh báo OBS Overlay:** Khi phát bài hát nhạy cảm:
    *   Overlay hiển thị một màn che màu đỏ đè lên toàn màn hình với dòng thông điệp cảnh báo.
    *   Bộ đếm ngược 5 giây màu vàng rực rỡ nổi bật.
    *   Tự động tắt âm lượng trình phát (Volume = 0) trong 5 giây này để tránh tiếng.
    *   Nâng `z-index` lên tối đa (`999999`) để che toàn bộ các thông báo popup donate khác.
*   **Cảnh báo trên Dashboard:** Hộp cảnh báo màu đỏ `#dash-sensitive-warning` hiển thị bên trong Widget Player của Dashboard suốt thời gian phát bài hát nhạy cảm và tự biến mất khi chuyển bài.

---

## 🔐 8. Chế độ Tập trung (Focus Mode) (v3.0.0)

*   **Khóa tương tác Dashboard:** Khi bật Focus Mode, toàn bộ các bảng điều khiển phát nhạc, form thêm nhanh, danh sách gợi ý/playlist, cấu hình mốc thời gian và hàng đợi nhạc sẽ bị làm mờ (`opacity: 0.55`) và vô hiệu hóa tương tác chuột (`pointer-events: none`).
*   **Tự động Resume:** Lưu trạng thái phát dở dang qua `localStorage` (khóa `dua_was_playing_before_focus`). Khi tắt Focus Mode, trình phát sẽ tự động khôi phục và phát tiếp từ giây đã dừng.
*   **Hàng đợi Tĩnh:** Nếu nhạc kết thúc hoàn toàn trong lúc bật Focus Mode, khi tắt chế độ này hàng đợi vẫn ở trạng thái dừng (không tự động nhảy sang bài tiếp theo).

---

## 📺 9. Các tính năng OBS Overlay Nâng cao

*   **Chế độ Livestream Adaptability (v2.0.33):**
    *   Tự động phát hiện khi bài hát hiện tại là luồng phát trực tiếp (Live Stream) bằng cách kết hợp kiểm tra duration và thuộc tính `isLive` của YouTube SDK.
    *   Ẩn hoàn toàn thanh tiến trình (progress bar) trống.
    *   Hiển thị huy hiệu đếm ngược thời gian kết thúc live stream (`● KẾT THÚC SAU X:XX`) ngay tại vị trí thanh tiến trình đã ẩn. Huy hiệu có dấu chấm đỏ nhấp nháy, chữ số hiển thị rõ ràng trên cả Dark/Light Mode và được phóng to thêm 50%.
    *   Chặn reload tự động OBS Overlay khi đang chạy Live stream.
*   **Modal hiển thị danh sách bài tiếp theo (v2.0.33):** Khi bài hát hiện tại còn dưới 15 giây, một modal toàn màn hình hiển thị danh sách 3 bài tiếp theo sẽ xuất hiện đẹp mắt, đồng bộ màu sắc và font chữ theo theme đang chọn (Dứa, TFT, Pink...).
*   **Ẩn Overlay khi trống:** Tùy chọn ẩn hoàn toàn Widget hiển thị trên OBS khi không có nhạc đang phát trong hàng đợi.
*   **Thông báo bài tiếp theo dạng trượt:** Hiển thị thanh trượt nhỏ báo tên bài hát tiếp theo ở 10 giây cuối cùng của bài hát.
*   **Popup Donate mới:** Hiển thị popup hiệu ứng pháo hoa kéo dài 6 giây chứa thông tin bài hát, tên người gửi, số tiền và vị trí trong hàng đợi.
*   **Tính năng Chủ kênh thêm nhạc:** Khi streamer tự thêm bài hát, hệ thống có thể ẩn thông tin tên & tiền donate giả lập trên OBS Overlay, thay thế bằng thông báo chờ mặc định và nhãn "Chủ kênh thêm" màu vàng nổi bật.

---

## 🛠️ 10. Chăm sóc Hệ thống & Tiện ích khác

*   **Lưu Trạng thái Tua tiếp tục:** Cho phép phát tiếp tục bài hát từ giây trước đó khi streamer chuyển bài hoặc tải lại (Overlay hiển thị dòng chữ `⏳ Đang chờ tiếp tục...` và tự động tua phát chính xác).
*   **Popup Changelog tự động:** So sánh phiên bản cũ và mới sau khi cập nhật để hiển thị bảng Changelog trực quan khi streamer mở app phiên bản mới lần đầu.
*   **Tự động Kiểm tra & Cập nhật:** Tự động kết nối với GitHub Releases để kiểm tra, tải và cập nhật phiên bản mới nhất của ứng dụng.
*   **Hộp Nhật ký Hoạt động (Logs Panel):** Log thời gian thực hiển thị chi tiết các trạng thái hệ thống, bài hát được thêm và SponsorBlock đã bỏ qua.
