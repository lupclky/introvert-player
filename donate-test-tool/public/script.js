// Khởi chạy ban đầu
document.addEventListener('DOMContentLoaded', () => {
    // Tải cấu hình URL app chính từ localStorage
    const savedUrl = localStorage.getItem('dua_sim_main_url');
    if (savedUrl) {
        document.getElementById('main-app-url').value = savedUrl;
    }
    
    // Tự động kiểm tra kết nối sau 1 giây
    setTimeout(checkConnection, 1000);
});

// Thiết lập số tiền nhanh
function setAmount(amount) {
    document.getElementById('donate-amount').value = amount;
    showToast('info', `Đã chọn số tiền: ${amount.toLocaleString('vi-VN')} ₫`);
}

// Kiểm tra kết nối tới ứng dụng Introvert Player chính
async function checkConnection() {
    const statusDot = document.querySelector('#connection-status .status-dot');
    const statusText = document.querySelector('#connection-status .status-text');
    const btnCheck = document.getElementById('btn-check-conn');
    const mainUrl = document.getElementById('main-app-url').value.trim();

    statusDot.className = 'status-dot checking';
    statusText.textContent = 'Đang kiểm tra...';
    btnCheck.disabled = true;
    btnCheck.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        // Thử gọi API config để kiểm tra xem server có đang chạy không
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${mainUrl}/api/config`, { 
            method: 'GET',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Đã kết nối với App chính';
            showToast('success', 'Kết nối thành công tới Introvert Player!');
            localStorage.setItem('dua_sim_main_url', mainUrl);
        } else {
            throw new Error('Server phản hồi lỗi');
        }
    } catch (err) {
        console.error('Lỗi kết nối:', err);
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Mất kết nối với App chính';
        showToast('error', 'Không thể kết nối. Hãy kiểm tra xem Introvert Player đã bật chưa!');
    } finally {
        btnCheck.disabled = false;
        btnCheck.innerHTML = '<i class="fa-solid fa-rotate"></i> Check';
    }
}

// Áp dụng mẫu test nhanh
function applyTemplate(type) {
    const donorInput = document.getElementById('donor-name');
    const amountInput = document.getElementById('donate-amount');
    const messageInput = document.getElementById('donate-message');
    const songInput = document.getElementById('song-link');

    switch (type) {
        case 'normal':
            donorInput.value = 'Hùng Dũng';
            amountInput.value = 20000;
            messageInput.value = 'Streamer hôm nay năng lượng quá, chúc buổi tối vui vẻ nha!';
            songInput.value = '';
            showToast('success', 'Đã áp dụng: Mẫu Donate Thường');
            break;
        case 'yt-order':
            donorInput.value = 'Fan Cứng Nhạc Trẻ';
            amountInput.value = 50000;
            messageInput.value = 'Order bài nhạc này tặng cả phòng stream nhé anh!';
            songInput.value = 'https://www.youtube.com/watch?v=p239tV7hMio'; // Nhạc mẫu (ví dụ)
            showToast('success', 'Đã áp dụng: Mẫu Order nhạc YouTube');
            break;
        case 'sc-order':
            donorInput.value = 'Lofi Listener';
            amountInput.value = 50000;
            messageInput.value = 'Một bản nhạc SoundCloud nhẹ nhàng nghe đêm khuya.';
            songInput.value = 'https://soundcloud.com/chillhopmusic/l-indecis-soulful';
            showToast('success', 'Đã áp dụng: Mẫu Order nhạc SoundCloud');
            break;
        case 'vote-skip':
            donorInput.value = 'Anti Fan Bài Này';
            amountInput.value = 35000;
            messageInput.value = 'Đóng góp vote skip bài hát này để chuyển bài khác đi anh ơi!';
            songInput.value = '';
            showToast('success', 'Đã áp dụng: Mẫu Đóng góp Vote Skip');
            break;
        case 'extend':
            donorInput.value = 'Người Giàu Có';
            amountInput.value = 100000;
            messageInput.value = 'Gia hạn bài hát đang chạy. Mã: [Copy mã code hiển thị ở Player chính dán vào đây]';
            songInput.value = '';
            showToast('success', 'Đã áp dụng: Mẫu Gia hạn thời gian phát');
            break;
    }
}

// Gửi thông tin test donate giả lập
async function sendDonation(event) {
    event.preventDefault();

    const mainUrl = document.getElementById('main-app-url').value.trim();
    const donorName = document.getElementById('donor-name').value.trim();
    const amount = parseInt(document.getElementById('donate-amount').value) || 0;
    const message = document.getElementById('donate-message').value.trim();
    const songLink = document.getElementById('song-link').value.trim();
    const btnSubmit = document.getElementById('btn-submit-form');

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Đang gửi giả lập...</span> <i class="fa-solid fa-spinner fa-spin"></i>';

    const payload = {
        donorName,
        amount,
        message,
        songLink: songLink || null
    };

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    try {
        const response = await fetch(`${mainUrl}/api/test-donate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showToast('success', 'Đã gửi donate giả lập thành công sang App chính!');
                addLogEntry('success', timeStr, `Gửi thành công: ${donorName} +${amount.toLocaleString('vi-VN')} ₫ - "${message || 'Không có lời nhắn'}"`);
            } else {
                throw new Error(data.error || 'Server trả về success: false');
            }
        } else {
            throw new Error(`HTTP status: ${response.status}`);
        }
    } catch (err) {
        console.error('Lỗi khi gửi donate giả lập:', err);
        showToast('error', `Gửi thất bại: ${err.message}. Kiểm tra kết nối app chính!`);
        addLogEntry('error', timeStr, `Lỗi: ${err.message} (Gửi từ ${donorName})`);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Gửi Donate Giả Lập</span> <i class="fa-solid fa-angles-right btn-icon-arrow"></i>';
    }
}

// Thêm dòng log vào bảng lịch sử log
function addLogEntry(status, time, text) {
    const container = document.getElementById('log-container');
    const emptyMsg = container.querySelector('.log-empty-msg');
    
    if (emptyMsg) {
        container.innerHTML = '';
    }

    const logEl = document.createElement('div');
    logEl.className = `log-entry ${status}`;
    
    logEl.innerHTML = `
        <span class="log-time">[${time}]</span>
        <span class="log-msg">${text}</span>
        <span class="log-badge ${status}">${status === 'success' ? 'OK' : 'Lỗi'}</span>
    `;

    container.insertBefore(logEl, container.firstChild);
}

// Xóa trắng bảng log
function clearLogs() {
    const container = document.getElementById('log-container');
    container.innerHTML = '<div class="log-empty-msg">Chưa có lượt gửi thử nghiệm nào.</div>';
    showToast('info', 'Đã xóa toàn bộ lịch sử logs!');
}

// Hiển thị Toast thông báo
let toastTimeout = null;
function showToast(type, msg) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const message = document.getElementById('toast-message');

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toast.className = `toast ${type}`;
    message.textContent = msg;

    if (type === 'success') {
        icon.className = 'fa-solid fa-circle-check';
    } else if (type === 'error') {
        icon.className = 'fa-solid fa-circle-xmark';
    } else {
        icon.className = 'fa-solid fa-circle-info';
    }

    toast.classList.remove('hidden');

    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
}
