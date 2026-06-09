# Nhật ký thay đổi (Changelog) - Introvert Player

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
