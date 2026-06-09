# Dứa Corner Player — Trình Phát Nhạc Donate Tích Hợp SponsorBlock (Phiên bản Live Sync)

Hệ thống hàng đợi nhạc donate tự chế mang phong cách **"Góc của Dứa"** (Cute Anime Cartoon), hỗ trợ bỏ qua tự động các phần quảng cáo, nhạc dạo đầu/kết thúc bằng API của **SponsorBlock** và **kết nối đồng bộ thời gian thực với tài khoản ZyPage của bạn**.

---

## ✨ Tính năng nổi bật

1. **Phong cách thiết kế Dứa & Đảm bảo Font chữ:** Tông màu vàng cam dễ thương, phông chữ bo tròn `Nunito` và `Quicksand` tiếng Việt chuẩn xác không bị vỡ hay lỗi hiển thị dấu phức tạp. Hoạt ảnh xoay đĩa nhạc, dứa lắc lư, sóng nhạc nhảy múa.
2. **OBS Overlay tách biệt (`overlay.html`):** 
   - Được thiết kế hoàn toàn thành một trang độc lập riêng biệt (`overlay.html`).
   - Kết nối thời gian thực với trang Dashboard của streamer (`index.html`) qua bộ nhớ cục bộ `localStorage` (không cần máy chủ trung gian, hoạt động tức thì ngay trên máy của bạn).
   - Nền trong suốt hoàn toàn, chỉ hiển thị hộp thông tin bài nhạc bo tròn xinh xắn khi có nhạc phát và tự động ẩn khi hàng đợi trống.
3. **Đồng bộ Live với tài khoản ZyPage:**
   - Hỗ trợ nhập đường dẫn trang donate nhạc ZyPage của bạn (ví dụ: `https://zypage.com/donate-music/your-shop-token`).
   - Tự động kết nối tới Firebase Database của ZyPage để lắng nghe sự kiện phát nhạc live, donate mới và nạp bài hát vào hàng đợi hoàn toàn tự động.
4. **Tự động bỏ qua quảng cáo (SponsorBlock):**
   - Gọi API SponsorBlock lấy các mốc thời gian không mong muốn của video YouTube.
   - Hỗ trợ bỏ qua: Tài trợ (Sponsor), Nhạc dạo đầu (Intro), Đoạn kết (Outro), Quảng cáo cá nhân (Self-Promo), Kêu gọi tương tác, Đoạn đối thoại phụ (Off-topic).
5. **Trình điều khiển tiện lợi:**
   - Hỗ trợ Pause/Resume, Skip, kéo thanh thời gian tua bài hát trực tiếp, chỉnh âm lượng.
   - Cho phép đặt mốc Bắt đầu và Kết thúc (ví dụ chỉ muốn phát từ giây thứ 10 đến 90 của bài hát).
   - Mô phỏng Donate với số tiền và lời nhắn tùy chỉnh để test ngoại tuyến.
   - Hai chế độ sắp xếp hàng đợi phát nhạc: theo thời gian gửi (FIFO) hoặc ưu tiên theo số tiền donate cao xếp trước.

---

## 🚀 Hướng dẫn khởi chạy nhanh

1. Nhấp đúp chuột vào tệp `index.html` trong thư mục này để mở trang điều khiển Dashboard dành cho Streamer.
2. Ở phần **"Đồng bộ Live ZyPage"**:
   - Dán liên kết trang hiển thị nhạc donate ZyPage của bạn vào ô nhập liệu (Ví dụ: `https://zypage.com/donate-music/e3e3e17213e6c6a51b249949fac5f2732dfa2ebe`).
   - Ấn **"Kết nối Live"**. Trạng thái sẽ chuyển sang màu xanh **"Đã kết nối Live"**.
   - Hàng đợi bài hát đang chờ trên ZyPage sẽ được tự động tải về Dashboard.
3. Khi có người xem gửi donate bài hát mới trên trang ZyPage của bạn, hệ thống sẽ tự động bắt sự kiện và thêm bài hát đó vào hàng đợi ngay lập tức!
4. Ấn nút **"Mở OBS Overlay (Cửa sổ riêng)"** ở góc trên bên phải để kiểm tra giao diện hiển thị cho OBS.

---

## 🎥 Cách thêm vào phần mềm Livestream (OBS Studio)

Để hiển thị widget nhạc đẹp mắt lên màn hình livestream:

1. Sao chép toàn bộ đường dẫn URL của tệp `overlay.html` trên máy của bạn (Ví dụ: `file:///D:/zypage_player/overlay.html`).
2. Mở **OBS Studio**, tại phần **Sources (Nguồn)** ấn nút dấu cộng `+` -> Chọn **Browser (Trình duyệt)**.
3. Thiết lập thuộc tính của nguồn Browser đó:
   - **URL:** Dán đường dẫn đã copy ở bước 1 vào.
   - **Width (Chiều rộng):** `450`
   - **Height (Chiều cao):** `220`
   - Đảm bảo tích chọn **"Refresh browser when scene becomes active"**.
4. Lúc này, widget nhạc sẽ nổi đẹp mắt trên luồng livestream của bạn. Khi không có bài hát nào chạy, widget sẽ tự động ẩn đi và hiện lại mượt mà khi có donate mới!
