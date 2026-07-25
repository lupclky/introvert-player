/**
 * Pineapple WYSIWYG Rich Text Editor Controller (Light Mode)
 * Features:
 * 1. Rich Text Document Editing (Bold, Italic, Underline, H1, H2, UL, OL, Blockquote).
 * 2. Custom KBD Shortcut and Figure-box Image Insertion.
 * 3. Command state query for active formatting buttons feedback.
 * 4. LocalStorage persistence for drafts.
 * 5. Node API integration to write edited HTML to disk and trigger Vercel deploy.
 */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Selector Elements
    const editorCanvas = document.getElementById("editor-canvas");
    const btnSave = document.getElementById("btn-save-html");
    const btnReset = document.getElementById("btn-reset-html");
    const btnDeploy = document.getElementById("btn-deploy-vercel");
    const saveStatus = document.getElementById("save-status");
    
    // Formatting buttons
    const formatButtons = document.querySelectorAll(".format-btn[data-command]");
    const btnInsertKbd = document.getElementById("btn-insert-kbd");
    const btnInsertImage = document.getElementById("btn-insert-image");
    
    // Image Modal Elements
    const imageModal = document.getElementById("image-modal");
    const inputImgSrc = document.getElementById("input-img-src");
    const inputImgCaption = document.getElementById("input-img-caption");
    const btnModalCancel = document.getElementById("btn-modal-cancel");
    const btnModalSave = document.getElementById("btn-modal-save");

    // YouTube Modal Elements
    const btnInsertYoutube = document.getElementById("btn-insert-youtube");
    const youtubeModal = document.getElementById("youtube-modal");
    const inputYtUrl = document.getElementById("input-yt-url");
    const inputYtCaption = document.getElementById("input-yt-caption");
    const btnYtCancel = document.getElementById("btn-yt-cancel");
    const btnYtSave = document.getElementById("btn-yt-save");

    let hasUnsavedChanges = false;
    let savedRange = null;

    // Default HTML template for the simple article
    const defaultHTML = `<h1>🍍 Bản Tin Cập Nhật Introvert Player v26.7.0</h1>
<p class="lead">Chào mừng các streamer! Phiên bản v26.7.0 mang đến một cuộc cải cách giao diện toàn diện, tinh giản các thành phần không cần thiết để tối ưu hóa không gian hiển thị hàng đợi và bổ sung các tính năng nâng cao trải nghiệm âm nhạc.</p>

<div class="figure-box">
    <img src="image/home.png" alt="Giao diện chính Dashboard v26.7.0">
    <div class="caption">Hình 1: Bố cục Dashboard tinh gọn mới hiển thị hàng đợi dài hơn.</div>
</div>

<h2>1. Trình phát nhạc kiểu Spotify ở cạnh dưới</h2>
<p>Toàn bộ widget <strong>Đang Phát (Now Playing)</strong> cũ đã được chuyển đổi thành thanh phát nhạc nằm ngang cố định sát viền đáy màn hình tương tự như Spotify. Thiết kế chia làm 3 phần trực quan:</p>
<ul>
    <li><strong>Bên trái:</strong> Ảnh đĩa nhạc, tên bài hát và tin nhắn donate của khán giả.</li>
    <li><strong>Ở giữa:</strong> Thanh tiến trình phát nhạc và cụm nút điều khiển chính (Phát, Tạm dừng, Skip).</li>
    <li><strong>Bên phải:</strong> Sóng nhạc visualizer chuyển động và thanh trượt điều chỉnh âm lượng nhanh.</li>
</ul>

<h2>2. Thanh thêm nhanh Titlebar thông minh</h2>
<p>Để tối ưu hóa không gian, ô nhập link và tìm kiếm nhạc đã được đưa lên trung tâm của Titlebar ứng dụng. Khi nhấp vào, một popover thông minh sẽ xuất hiện để streamer chỉnh sửa tên người gửi, số tiền donate hoặc đánh dấu là chủ kênh thêm nhạc.</p>

<div class="figure-box">
    <img src="image/search.png" alt="Thanh thêm nhạc nhanh trên Titlebar">
    <div class="caption">Hình 2: Form thêm nhanh nhạc tích hợp gọn gàng tại thanh tiêu đề.</div>
</div>

<h2>3. Bốc nhạc ngẫu nhiên với Lucky Mode</h2>
<p>Nếu bạn muốn giữ cho không khí stream luôn sôi động ngay cả khi hàng đợi nhạc donate trống, tính năng <strong>Lucky Mode</strong> sẽ tự động chọn ngẫu nhiên bài hát trong danh sách phát hoặc nhạc đề cử của YouTube để tiếp tục phát.</p>

<div class="figure-box">
    <img src="image/LuckyMode.png" alt="Cấu hình Lucky Mode">
    <div class="caption">Hình 3: Nút bật tắt Lucky Mode trực quan ngoài Dashboard.</div>
</div>

<h2>4. Vote Skip và Gia Hạn Thời Gian</h2>
<p>Tăng tương tác giữa Streamer và Khán giả thông qua hai hình thức donate mới:</p>
<ul>
    <li><strong>Vote Skip:</strong> Người xem donate để bỏ qua bài hát đang phát nếu họ không thích.</li>
    <li><strong>Gia hạn thời gian:</strong> Donate để kéo dài thời lượng của bài hát đang phát nếu bị giới hạn thời gian cố định.</li>
</ul>

<h2>5. Phím tắt điều khiển nhanh chóng</h2>
<p>Điều khiển trình phát tiện lợi bằng bàn phím tương tự như xem phim trên YouTube:</p>
<p>
    Sử dụng phím <kbd>Space</kbd> hoặc <kbd>K</kbd> để Tạm dừng / Phát nhạc.<br>
    Sử dụng phím <kbd>→</kbd> hoặc <kbd>L</kbd> để Tua nhanh 10 giây.<br>
    Sử dụng phím <kbd>←</kbd> hoặc <kbd>J</kbd> để Tua lại 10 giây.<br>
    Sử dụng phím <kbd>M</kbd> để Tắt / Bật tiếng nhanh.
</p>

<div class="divider"></div>
<p style="text-align: center; color: #8A7E70; font-size: 0.85rem;">© 2026 Dứa Corner. Bản tin giới thiệu được dựng trực tiếp bằng mã nguồn HTML.</p>`;

    function saveSelection() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            if (editorCanvas.contains(range.commonAncestorContainer)) {
                savedRange = range;
            }
        }
    }

    function restoreSelection() {
        if (savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
        }
    }

    function insertHTMLAtCursor(html) {
        let sel, range;
        if (window.getSelection) {
            sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);
                
                if (editorCanvas.contains(range.commonAncestorContainer)) {
                    range.deleteContents();
                    
                    const el = document.createElement("div");
                    el.innerHTML = html;
                    
                    const frag = document.createDocumentFragment();
                    let node, lastNode;
                    while ((node = el.firstChild)) {
                        lastNode = frag.appendChild(node);
                    }
                    
                    range.insertNode(frag);
                    
                    if (lastNode) {
                        range = range.cloneRange();
                        range.setStartAfter(lastNode);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                    return;
                }
            }
        }
        
        // Fallback: Append to the end of editor canvas if selection was lost/outside
        const el = document.createElement("div");
        el.innerHTML = html;
        while (el.firstChild) {
            editorCanvas.appendChild(el.firstChild);
        }
    }

    // 3. Status Indicator updates
    function setUnsaved(unsaved) {
        hasUnsavedChanges = unsaved;
        if (unsaved) {
            saveStatus.textContent = "Có thay đổi chưa lưu";
            saveStatus.classList.add("unsaved");
            btnSave.removeAttribute("disabled");
        } else {
            saveStatus.textContent = "Đã lưu thay đổi";
            saveStatus.classList.remove("unsaved");
            btnSave.setAttribute("disabled", "true");
        }
    }

    // 4. Formatting Command Executors (WYSIWYG)
    formatButtons.forEach(btn => {
        // We use mousedown to prevent loss of focus from editorCanvas
        btn.addEventListener("mousedown", (e) => {
            e.preventDefault(); 
            
            const command = btn.getAttribute("data-command");
            const value = btn.getAttribute("data-value") || null;
            
            document.execCommand(command, false, value);
            setUnsaved(true);
            updateButtonStates();
        });
    });

    // Custom helper to insert Kbd key shortcuts
    btnInsertKbd.addEventListener("mousedown", (e) => {
        e.preventDefault();
        saveSelection();
        
        const keyName = prompt("Nhập tên phím tắt (Ví dụ: Space, Ctrl+K):") || "Key";
        restoreSelection();
        
        const kbdHTML = `<kbd>${keyName}</kbd>`;
        insertHTMLAtCursor(kbdHTML);
        setUnsaved(true);
    });

    // Custom helper to show insert image modal
    btnInsertImage.addEventListener("click", () => {
        saveSelection();
        inputImgSrc.value = "";
        inputImgCaption.value = "";
        imageModal.classList.add("show");
        inputImgSrc.focus();
    });

    btnModalCancel.addEventListener("click", () => {
        imageModal.classList.remove("show");
    });

    btnModalSave.addEventListener("click", () => {
        const src = inputImgSrc.value.trim() || "image/home.png";
        const caption = inputImgCaption.value.trim() || "Hình ảnh minh họa";
        
        restoreSelection();
        const figHTML = `<div class="figure-box"><img src="${src}"><div class="caption">${caption}</div></div><p><br></p>`;
        insertHTMLAtCursor(figHTML);
        
        imageModal.classList.remove("show");
        setUnsaved(true);
        showToast("Đã chèn hình ảnh thành công!", "success");
    });

    // Helper to parse YouTube Video ID
    function getYoutubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // Custom helper to show insert YouTube modal
    btnInsertYoutube.addEventListener("click", () => {
        saveSelection();
        inputYtUrl.value = "";
        inputYtCaption.value = "";
        youtubeModal.classList.add("show");
        inputYtUrl.focus();
    });

    btnYtCancel.addEventListener("click", () => {
        youtubeModal.classList.remove("show");
    });

    btnYtSave.addEventListener("click", () => {
        const url = inputYtUrl.value.trim();
        const caption = inputYtCaption.value.trim() || "Liên kết YouTube";
        
        if (!url) {
            showToast("Vui lòng nhập đường dẫn YouTube!", "error");
            return;
        }
        
        restoreSelection();
        
        const videoId = getYoutubeId(url);
        let htmlNode = "";
        if (videoId) {
            // It's a YouTube video: insert embedded iframe
            htmlNode = `<div class="figure-box" contenteditable="false"><iframe src="https://www.youtube.com/embed/${videoId}" style="width:100%; aspect-ratio:16/9; border:none;" allowfullscreen></iframe><div class="caption" contenteditable="true">${caption}</div></div><p><br></p>`;
            showToast("Đã chèn video YouTube thành công!", "success");
        } else {
            // It's a generic link: insert beautiful YouTube hyperlink button
            htmlNode = `<a href="${url}" target="_blank" class="dua-btn dua-btn-primary" contenteditable="false" style="margin: 0.5rem 0; display: inline-flex; align-items: center; gap: 0.4rem;"><i class="fa-brands fa-youtube" style="color: #FF0000;"></i><span contenteditable="true">${caption}</span></a><p><br></p>`;
            showToast("Đã chèn liên kết YouTube thành công!", "success");
        }
        
        insertHTMLAtCursor(htmlNode);
        youtubeModal.classList.remove("show");
        setUnsaved(true);
    });

    // Update active button state styling based on cursor position
    function updateButtonStates() {
        formatButtons.forEach(btn => {
            const command = btn.getAttribute("data-command");
            if (command && command !== "formatBlock" && command !== "removeFormat") {
                if (document.queryCommandState(command)) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            }
        });
    }

    editorCanvas.addEventListener("keyup", updateButtonStates);
    editorCanvas.addEventListener("click", updateButtonStates);

    // Track when user types in editor to set unsaved changes
    editorCanvas.addEventListener("input", () => {
        setUnsaved(true);
    });

    // 5. Local Server API Interaction
    function saveToFileSystem(deploy = false) {
        // Clone document to prepare clean HTML file
        const docClone = document.documentElement.cloneNode(true);
        
        // Populate the edited HTML inside the clone's editor canvas
        const clonedCanvas = docClone.querySelector("#editor-canvas");
        if (clonedCanvas) {
            clonedCanvas.innerHTML = editorCanvas.innerHTML;
        }
        
        const clonedDeployBtn = docClone.querySelector("#btn-deploy-vercel");
        if (clonedDeployBtn) {
            clonedDeployBtn.removeAttribute("disabled");
            clonedDeployBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Deploy lên Vercel`;
        }
        
        // Reset the status to saved state inside the clone
        const clonedStatus = docClone.querySelector("#save-status");
        if (clonedStatus) {
            clonedStatus.textContent = "Đã lưu thay đổi";
            clonedStatus.classList.remove("unsaved");
        }
        const clonedSaveBtn = docClone.querySelector("#btn-save-html");
        if (clonedSaveBtn) {
            clonedSaveBtn.setAttribute("disabled", "true");
        }
        
        // Build the complete file content
        const fullHTML = "<!DOCTYPE html>\n" + docClone.outerHTML;

        // Target local server port (relative or default 3000 fallback)
        let host = window.location.origin;
        if (host.startsWith("file:")) {
            host = "http://localhost:3000";
        }
        
        return fetch(`${host}/api/save-walkthrough`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ html: fullHTML, deploy })
        })
        .then(async response => {
            if (!response.ok) {
                let errMsg = "Lỗi máy chủ không khả dụng";
                try {
                    const errData = await response.json();
                    if (errData && errData.error) errMsg = errData.error;
                } catch(e) {}
                throw new Error(errMsg);
            }
            return response.json();
        });
    }

    // 6. Editor Initializers
    function initEditor() {
        const urlParams = new URLSearchParams(window.location.search);
        const isEmbedded = urlParams.get('embedded') === 'true';
        const isEditMode = urlParams.get('edit') === 'true' && !isEmbedded;

        document.body.classList.toggle("embedded-view", isEmbedded);

        if (!isEditMode) {
            document.body.classList.add("view-mode");
            editorCanvas.setAttribute("contenteditable", "false");
        } else {
            document.body.classList.remove("view-mode");
            editorCanvas.setAttribute("contenteditable", "true");
        }

        const savedHTML = localStorage.getItem("walkthrough_html_content");
        if (isEditMode && savedHTML) {
            editorCanvas.innerHTML = savedHTML;
            setUnsaved(false);
            showToast("Đã khôi phục bản nháp từ trình duyệt!");
        } else {
            // Check if there is already content inside the editor-canvas from the disc file
            const canvasHTML = editorCanvas.innerHTML.trim();
            if (canvasHTML !== "") {
                setUnsaved(false);
            } else {
                editorCanvas.innerHTML = defaultHTML;
                setUnsaved(false);
            }
        }
    }

    btnSave.addEventListener("click", () => {
        // Save to LocalStorage
        localStorage.setItem("walkthrough_html_content", editorCanvas.innerHTML);
        
        // Save to Disc File via Node API
        saveToFileSystem(false)
            .then(res => {
                setUnsaved(false);
                showToast(res.message || "Đã lưu nội dung thành công vào tệp walkthrough.html!", "success");
            })
            .catch(err => {
                console.error(err);
                const errMsg = err.message || "";
                if (window.location.origin.includes("vercel.app")) {
                    showToast("Lỗi lưu trực tiếp lên Vercel: " + errMsg, "error");
                } else {
                    setUnsaved(false);
                    showToast("Lưu offline trình duyệt thành công! (Không kết nối được Local Server)", "info");
                }
            });
    });

    btnReset.addEventListener("click", () => {
        if (confirm("Bạn có chắc muốn khôi phục về bài báo gốc mặc định? Mọi thay đổi chưa lưu sẽ bị mất.")) {
            localStorage.removeItem("walkthrough_html_content");
            editorCanvas.innerHTML = defaultHTML;
            setUnsaved(true);
            showToast("Đã khôi phục về mặc định gốc!", "info");
        }
    });

    btnDeploy.addEventListener("click", () => {
        // Save first
        localStorage.setItem("walkthrough_html_content", editorCanvas.innerHTML);
        
        // Show loading state
        btnDeploy.setAttribute("disabled", "true");
        btnDeploy.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang deploy...`;
        
        const isVercel = window.location.origin.includes("vercel.app");
        showToast(isVercel ? "Đang đẩy thay đổi lên Vercel... Vui lòng chờ." : "Đang ghi đè file và deploy lên Vercel... Vui lòng chờ.", "info");

        // Save and trigger Vercel deployment
        saveToFileSystem(true)
            .then(res => {
                setUnsaved(false);
                setTimeout(() => {
                    btnDeploy.removeAttribute("disabled");
                    btnDeploy.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Deploy lên Vercel`;
                    showToast(res.message || "Đã lưu và triển khai lên Vercel thành công!", "success");
                }, 2500);
            })
            .catch(err => {
                console.error(err);
                btnDeploy.removeAttribute("disabled");
                btnDeploy.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Deploy lên Vercel`;
                const errMsg = err.message || "";
                if (isVercel) {
                    showToast("Không thể deploy lên Vercel: " + errMsg, "error");
                } else {
                    showToast("Không kết nối được Local Server để chạy Deploy Vercel!", "error");
                }
            });
    });

    // 7. Toast Helper Function
    function showToast(message, type = "success") {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        
        let icon = '<i class="fa-solid fa-circle-check"></i>';
        if (type === "error") icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
        if (type === "info") icon = '<i class="fa-solid fa-circle-info"></i>';
            
        toast.innerHTML = `${icon} <span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add("show");
        }, 50);
        
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => {
                container.removeChild(toast);
            }, 300);
        }, 4000);
    }

    // 8. Exit Warning
    window.addEventListener("beforeunload", (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn rời đi?";
        }
    });

    // Close modal on escape
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (imageModal.classList.contains("show")) {
                imageModal.classList.remove("show");
            }
            if (youtubeModal.classList.contains("show")) {
                youtubeModal.classList.remove("show");
            }
        }
    });

    // Initialize
    initEditor();
});
