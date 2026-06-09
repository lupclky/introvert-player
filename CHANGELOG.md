# Nhật ký thay đổi (Changelog) - Introvert Player

## [2.0.7] - 2026-06-09
### Added
- Thay thế kết nối HiveMQ MQTT cloud bằng Local WebSocket Server chạy trực tiếp trong ứng dụng.
- OBS Overlay và Dashboard đồng bộ trực tiếp qua mạng nội bộ (localhost), loại bỏ phụ thuộc internet, tăng bảo mật và giảm độ trễ tối đa (< 2ms).
- Giữ nguyên định dạng link OBS hiện tại (`localhost:3000/overlay.html?key=...`), người dùng không cần cấu hình lại link trên OBS Studio.
- Loại bỏ các script import MQTT bên thứ ba giúp Overlay load nhanh và hoạt động offline 100%.

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
