/**
 * Pineapple WYSIWYG Rich Text Editor Controller (Light Mode)
 * Features:
 * 1. Rich Text Document Editing (Bold, Italic, Underline, H1, H2, UL, OL, Blockquote).
 * 2. Custom KBD Shortcut and Figure-box Image Insertion.
 * 3. Command state query for active formatting buttons feedback.
 * 4. LocalStorage persistence for drafts.
 * 5. Local-only persistence, draggable cards and browsable image insertion.
 */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Selector Elements
    const pendingRequests = new Map();
    let requestCounter = 0;

    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        if (event.data.type === 'save-walkthrough-image-response' || event.data.type === 'save-walkthrough-html-response') {
            const resolve = pendingRequests.get(event.data.requestId);
            if (resolve) {
                pendingRequests.delete(event.data.requestId);
                resolve(event.data.result);
            }
        }
    });

    const iframeElectronAPI = {
        saveWalkthroughImage: (fileName, base64Data) => {
            return new Promise((resolve) => {
                const requestId = ++requestCounter;
                pendingRequests.set(requestId, resolve);
                window.parent.postMessage({
                    type: 'save-walkthrough-image',
                    requestId,
                    fileName,
                    base64Data
                }, '*');
            });
        },
        saveWalkthroughHTML: (cleanHTML) => {
            return new Promise((resolve) => {
                const requestId = ++requestCounter;
                pendingRequests.set(requestId, resolve);
                window.parent.postMessage({
                    type: 'save-walkthrough-html',
                    requestId,
                    cleanHTML
                }, '*');
            });
        }
    };

    const isElectron = typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') > -1;
    const electronAPI = window.electronAPI || (isElectron ? iframeElectronAPI : null);
    const editorCanvas = document.getElementById("editor-canvas");
    const btnSave = document.getElementById("btn-save-html");
    const btnReset = document.getElementById("btn-reset-html");
    const saveStatus = document.getElementById("save-status");
    const editorSelectionLabel = document.getElementById("editor-selection-label");
    const cardLayoutControls = document.getElementById("card-layout-controls");
    const imageLayoutControls = document.getElementById("image-layout-controls");
    const btnCardMovePrev = document.getElementById("btn-card-move-prev");
    const btnCardMoveNext = document.getElementById("btn-card-move-next");
    const btnCardToggleWide = document.getElementById("btn-card-toggle-wide");
    const selectedImageWidth = document.getElementById("selected-image-width");
    const selectedImageWidthOutput = document.getElementById("selected-image-width-output");
    
    // Formatting buttons
    const formatButtons = document.querySelectorAll(".format-btn[data-command]");
    const btnInsertKbd = document.getElementById("btn-insert-kbd");
    const btnInsertImage = document.getElementById("btn-insert-image");
    const btnInsertStatCard = document.getElementById("btn-insert-stat-card");
    const btnInsertFeatureCard = document.getElementById("btn-insert-feature-card");
    const btnInsertReleaseNote = document.getElementById("btn-insert-release-note");
    
    // Image Modal Elements
    const imageModal = document.getElementById("image-modal");
    const imageModalTitle = document.getElementById("image-modal-title");
    const inputImgSrc = document.getElementById("input-img-src");
    const inputImgFile = document.getElementById("input-img-file");
    const inputImgCaption = document.getElementById("input-img-caption");
    const inputImgWidth = document.getElementById("input-img-width");
    const inputImgWidthOutput = document.getElementById("input-img-width-output");
    const inputImgAlign = document.getElementById("input-img-align");
    const imageUploadPreview = document.getElementById("image-upload-preview");
    const imageUploadPreviewImg = document.getElementById("image-upload-preview-img");
    const imageUploadPreviewName = document.getElementById("image-upload-preview-name");
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
    let selectedEditorComponent = null;
    let editingFigure = null;
    let pendingImageDataUrl = '';
    let draggedCard = null;

    // Nội dung cũ chỉ được dùng làm phương án dự phòng nếu template mới bị thiếu.
    const legacyDefaultHTML = `<h1>🍍 Bản Tin Cập Nhật Introvert Player v26.7.0</h1>
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

    const walkthroughTemplate = document.getElementById("walkthrough-default-template");
    const baseWalkthroughHTML = walkthroughTemplate?.innerHTML.trim() || legacyDefaultHTML;
    const sourceWalkthroughHTML = editorCanvas.innerHTML.trim();
    const initialWalkthroughHTML = sourceWalkthroughHTML || baseWalkthroughHTML;
    const defaultHTML = baseWalkthroughHTML;

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
                    queueMicrotask(refreshEditableComponents);
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
        queueMicrotask(refreshEditableComponents);
    }

    const EDITABLE_CARD_SELECTOR = [
        ".release-stat-card",
        ".release-feature-card",
        ".release-tool-grid > article",
        ".release-note-card"
    ].join(", ");

    function isEditorMode() {
        return !document.body.classList.contains("view-mode");
    }

    function clearEditorSelection() {
        editorCanvas.querySelectorAll(".editor-component-selected").forEach(element => {
            element.classList.remove("editor-component-selected");
        });
        selectedEditorComponent = null;
        cardLayoutControls.hidden = true;
        imageLayoutControls.hidden = true;
        editorSelectionLabel.textContent = "Chọn một thẻ hoặc hình ảnh để chỉnh bố cục";
    }

    function getFigureWidth(figure) {
        const width = Number.parseInt(figure?.style.width, 10);
        return Number.isFinite(width) ? Math.min(100, Math.max(25, width)) : 100;
    }

    function getFigureAlignment(figure) {
        if (figure?.classList.contains("figure-align-left")) return "left";
        if (figure?.classList.contains("figure-align-right")) return "right";
        return "center";
    }

    function applyFigureAlignment(figure, alignment) {
        figure.classList.remove("figure-align-left", "figure-align-center", "figure-align-right");
        figure.classList.add(`figure-align-${["left", "right"].includes(alignment) ? alignment : "center"}`);
    }

    function selectEditorComponent(component) {
        if (!isEditorMode() || !component) return;
        clearEditorSelection();
        selectedEditorComponent = component;
        component.classList.add("editor-component-selected");

        if (component.matches(".figure-box")) {
            const width = getFigureWidth(component);
            selectedImageWidth.value = String(width);
            selectedImageWidthOutput.value = `${width}%`;
            imageLayoutControls.hidden = false;
            editorSelectionLabel.textContent = "Hình ảnh đang chọn — kéo thanh Rộng hoặc chọn cách căn";
            return;
        }

        cardLayoutControls.hidden = false;
        const title = component.querySelector("h2, h3")?.textContent?.trim();
        editorSelectionLabel.textContent = title ? `Thẻ: ${title}` : "Thẻ đang chọn";
        btnCardToggleWide.classList.toggle("active", component.classList.contains("editor-card-wide"));
    }

    function refreshEditableComponents() {
        if (!isEditorMode()) return;
        editorCanvas.querySelectorAll(EDITABLE_CARD_SELECTOR).forEach(card => {
            card.draggable = true;
            card.title = "Kéo để đổi vị trí, hoặc bấm để chỉnh bố cục";
        });
        editorCanvas.querySelectorAll(".figure-box").forEach(figure => {
            figure.title = "Bấm để chỉnh kích thước và vị trí ảnh";
            if (!figure.classList.contains("figure-align-left") &&
                !figure.classList.contains("figure-align-center") &&
                !figure.classList.contains("figure-align-right")) {
                figure.classList.add("figure-align-center");
            }
        });
    }

    function moveSelectedCard(direction) {
        if (!selectedEditorComponent?.matches(EDITABLE_CARD_SELECTOR)) return;
        const sibling = direction < 0
            ? selectedEditorComponent.previousElementSibling
            : selectedEditorComponent.nextElementSibling;
        if (!sibling?.matches(EDITABLE_CARD_SELECTOR)) return;
        if (direction < 0) {
            selectedEditorComponent.parentElement.insertBefore(selectedEditorComponent, sibling);
        } else {
            selectedEditorComponent.parentElement.insertBefore(sibling, selectedEditorComponent);
        }
        setUnsaved(true);
    }

    btnCardMovePrev.addEventListener("click", () => moveSelectedCard(-1));
    btnCardMoveNext.addEventListener("click", () => moveSelectedCard(1));
    btnCardToggleWide.addEventListener("click", () => {
        if (!selectedEditorComponent?.matches(EDITABLE_CARD_SELECTOR)) return;
        selectedEditorComponent.classList.toggle("editor-card-wide");
        btnCardToggleWide.classList.toggle("active", selectedEditorComponent.classList.contains("editor-card-wide"));
        setUnsaved(true);
    });

    selectedImageWidth.addEventListener("input", () => {
        if (!selectedEditorComponent?.matches(".figure-box")) return;
        const width = Number(selectedImageWidth.value);
        selectedEditorComponent.style.width = `${width}%`;
        selectedImageWidthOutput.value = `${width}%`;
        setUnsaved(true);
    });

    imageLayoutControls.querySelectorAll("[data-image-align]").forEach(button => {
        button.addEventListener("click", () => {
            if (!selectedEditorComponent?.matches(".figure-box")) return;
            applyFigureAlignment(selectedEditorComponent, button.dataset.imageAlign);
            setUnsaved(true);
        });
    });

    editorCanvas.addEventListener("click", (event) => {
        if (!isEditorMode()) return;
        const component = event.target.closest(`.figure-box, ${EDITABLE_CARD_SELECTOR}`);
        if (component && editorCanvas.contains(component)) {
            selectEditorComponent(component);
        }
    });

    editorCanvas.addEventListener("dragstart", (event) => {
        if (!isEditorMode()) return;
        const card = event.target.closest(EDITABLE_CARD_SELECTOR);
        if (!card) return;
        draggedCard = card;
        card.classList.add("editor-card-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", "walkthrough-card");
    });

    editorCanvas.addEventListener("dragover", (event) => {
        const target = event.target.closest(EDITABLE_CARD_SELECTOR);
        if (!draggedCard || !target || target === draggedCard || target.parentElement !== draggedCard.parentElement) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    });

    editorCanvas.addEventListener("drop", (event) => {
        const target = event.target.closest(EDITABLE_CARD_SELECTOR);
        if (!draggedCard || !target || target === draggedCard || target.parentElement !== draggedCard.parentElement) return;
        event.preventDefault();
        const rect = target.getBoundingClientRect();
        const nearSameRow = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height * 0.42;
        const insertBefore = nearSameRow
            ? event.clientX < rect.left + rect.width / 2
            : event.clientY < rect.top + rect.height / 2;
        target.parentElement.insertBefore(draggedCard, insertBefore ? target : target.nextElementSibling);
        selectEditorComponent(draggedCard);
        setUnsaved(true);
    });

    editorCanvas.addEventListener("dragend", () => {
        if (draggedCard) draggedCard.classList.remove("editor-card-dragging");
        draggedCard = null;
    });

    // 3. Status Indicator updates
    function setUnsaved(unsaved) {
        hasUnsavedChanges = unsaved;
        if (unsaved) {
            saveStatus.textContent = "Có thay đổi chưa lưu";
            saveStatus.classList.add("unsaved");
            btnSave.removeAttribute("disabled");
        } else {
            saveStatus.textContent = "Đã lưu trên máy";
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

    function escapeEditorText(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function askEditorText(question, fallback) {
        const value = prompt(question, fallback);
        if (value === null) return null;
        return escapeEditorText(value.trim() || fallback);
    }

    btnInsertStatCard?.addEventListener("mousedown", (e) => {
        e.preventDefault();
        saveSelection();
        const value = askEditorText("Số liệu nổi bật (ví dụ: 2×, 30%, 1 chạm):", "2×");
        if (value === null) return;
        const title = askEditorText("Tên thay đổi:", "Tốc độ xử lý nhanh hơn");
        if (title === null) return;
        const comparison = askEditorText("Nội dung so sánh hoặc giải thích:", "So với phiên bản trước.");
        if (comparison === null) return;
        restoreSelection();
        insertHTMLAtCursor(`
            <div class="release-stats release-stats-single">
                <article class="release-stat-card release-stat-primary">
                    <strong class="release-stat-value">${value}</strong>
                    <div><h2>${title}</h2><p>${comparison}</p></div>
                </article>
            </div><p><br></p>
        `);
        setUnsaved(true);
        showToast("Đã chèn thẻ số liệu.", "success");
    });

    btnInsertFeatureCard?.addEventListener("mousedown", (e) => {
        e.preventDefault();
        saveSelection();
        const title = askEditorText("Tên tính năng:", "Tính năng mới");
        if (title === null) return;
        const description = askEditorText("Mô tả ngắn:", "Mô tả lợi ích chính của tính năng trong phiên bản này.");
        if (description === null) return;
        restoreSelection();
        insertHTMLAtCursor(`
            <div class="release-feature-grid release-feature-grid-single">
                <article class="release-feature-card">
                    <div class="release-feature-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                    <div><h3>${title}</h3><p>${description}</p></div>
                </article>
            </div><p><br></p>
        `);
        setUnsaved(true);
        showToast("Đã chèn thẻ tính năng.", "success");
    });

    btnInsertReleaseNote?.addEventListener("mousedown", (e) => {
        e.preventDefault();
        saveSelection();
        const title = askEditorText("Tiêu đề ghi chú:", "Lưu ý sau khi cập nhật");
        if (title === null) return;
        const description = askEditorText("Nội dung ghi chú:", "Các thiết lập hiện tại vẫn được giữ nguyên.");
        if (description === null) return;
        restoreSelection();
        insertHTMLAtCursor(`
            <aside class="release-note-card">
                <i class="fa-solid fa-circle-info"></i>
                <div><h2>${title}</h2><p>${description}</p></div>
            </aside><p><br></p>
        `);
        setUnsaved(true);
        showToast("Đã chèn ghi chú phát hành.", "success");
    });

    function updateImageModalWidthOutput() {
        inputImgWidthOutput.value = `${inputImgWidth.value}%`;
    }

    function showImageUploadPreview(src, name = "") {
        if (!src) {
            imageUploadPreview.hidden = true;
            imageUploadPreviewImg.removeAttribute("src");
            imageUploadPreviewName.textContent = "";
            return;
        }
        imageUploadPreviewImg.src = src;
        imageUploadPreviewName.textContent = name;
        imageUploadPreview.hidden = false;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(reader.error || new Error("Không thể đọc ảnh"));
            reader.readAsDataURL(file);
        });
    }

    async function optimizeLocalImage(file) {
        const originalDataUrl = await readFileAsDataUrl(file);
        if (file.type === "image/gif") return originalDataUrl;

        const image = new Image();
        image.src = originalDataUrl;
        await image.decode();
        const maxWidth = 1600;
        const maxHeight = 1200;
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d", { alpha: true });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/webp", 0.84);
    }

    function closeImageModal() {
        imageModal.classList.remove("show");
        inputImgFile.value = "";
        pendingImageDataUrl = "";
        editingFigure = null;
        showImageUploadPreview("");
    }

    // Mở modal để chèn ảnh mới
    btnInsertImage.addEventListener("click", () => {
        saveSelection();
        editingFigure = null;
        pendingImageDataUrl = "";
        inputImgFile.value = "";

        inputImgSrc.value = "";
        inputImgCaption.value = "";
        inputImgWidth.value = "100";
        inputImgAlign.value = "center";
        imageModalTitle.innerHTML = '<i class="fa-solid fa-image"></i> Chèn hình ảnh tính năng';
        btnModalSave.textContent = "Chèn ảnh";
        showImageUploadPreview("");

        updateImageModalWidthOutput();
        imageModal.classList.add("show");
        inputImgSrc.focus();
    });

    inputImgWidth.addEventListener("input", updateImageModalWidthOutput);

    inputImgFile.addEventListener("change", async () => {
        const file = inputImgFile.files?.[0];
        if (!file) return;
        btnModalSave.disabled = true;
        imageUploadPreviewName.textContent = "Đang tối ưu ảnh...";
        imageUploadPreview.hidden = false;
        try {
            const optimizedWebpBase64 = await optimizeLocalImage(file);
            
            if (electronAPI && typeof electronAPI.saveWalkthroughImage === "function") {
                imageUploadPreviewName.textContent = "Đang sao chép vào assets...";
                const res = await electronAPI.saveWalkthroughImage(file.name, optimizedWebpBase64);
                if (res && res.success) {
                    pendingImageDataUrl = res.relativePath;
                    inputImgSrc.value = "";
                    showImageUploadPreview(optimizedWebpBase64, `${file.name} · Đã lưu vào assets`);
                } else {
                    throw new Error(res?.error || "Không thể sao chép ảnh vào assets");
                }
            } else {
                pendingImageDataUrl = optimizedWebpBase64;
                inputImgSrc.value = "";
                showImageUploadPreview(pendingImageDataUrl, `${file.name} · lưu local base64`);
            }
        } catch (error) {
            console.error(error);
            pendingImageDataUrl = "";
            showImageUploadPreview("");
            showToast("Lỗi xử lý ảnh: " + error.message, "error");
        } finally {
            btnModalSave.disabled = false;
        }
    });

    btnModalCancel.addEventListener("click", closeImageModal);

    btnModalSave.addEventListener("click", () => {
        const src = pendingImageDataUrl || inputImgSrc.value.trim() || "image/home.png";
        const caption = inputImgCaption.value.trim() || "Hình ảnh minh họa";
        const width = Number(inputImgWidth.value) || 100;
        const alignment = inputImgAlign.value;

        restoreSelection();
        const safeSrc = escapeEditorText(src);
        const safeCaption = escapeEditorText(caption);
        const safeAlignment = ["left", "right"].includes(alignment) ? alignment : "center";
        const figHTML = `<div class="figure-box figure-align-${safeAlignment}" style="width: ${width}%"><img src="${safeSrc}"><div class="caption">${safeCaption}</div></div><p><br></p>`;
        insertHTMLAtCursor(figHTML);
        showToast("Đã chèn hình ảnh thành công!", "success");

        closeImageModal();
        setUnsaved(true);
        refreshEditableComponents();
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

    function isStoredWalkthroughValid(html) {
        return typeof html === "string" && html.trim().length > 20;
    }

    function getCleanEditorHTML() {
        const clone = editorCanvas.cloneNode(true);
        clone.querySelectorAll(".editor-component-selected, .editor-card-dragging").forEach(element => {
            element.classList.remove("editor-component-selected", "editor-card-dragging");
        });
        clone.querySelectorAll("[draggable]").forEach(element => element.removeAttribute("draggable"));
        clone.querySelectorAll("[title]").forEach(element => {
            if (element.matches(EDITABLE_CARD_SELECTOR) || element.matches(".figure-box")) {
                element.removeAttribute("title");
            }
        });
        return clone.innerHTML;
    }

    function applyWalkthroughVersion(version) {
        const normalizedVersion = String(version || "26.8.11").replace(/^v/i, "");
        document.querySelectorAll("[data-walkthrough-version]").forEach(element => {
            element.textContent = `v${normalizedVersion}`;
        });
        document.title = `Pineapple Studio ${normalizedVersion} — Có gì mới`;
    }

    // 6. Editor Initializers
    function initEditor() {
        const urlParams = new URLSearchParams(window.location.search);
        const isEmbedded = urlParams.get('embedded') === 'true';
        const isEditMode = urlParams.get('edit') === 'true' && !isEmbedded;
        const version = urlParams.get('version') || '26.8.11';

        document.body.classList.toggle("embedded-view", isEmbedded);

        if (!isEditMode) {
            document.body.classList.add("view-mode");
            editorCanvas.setAttribute("contenteditable", "false");
        } else {
            document.body.classList.remove("view-mode");
            editorCanvas.setAttribute("contenteditable", "true");
        }

        const savedHTML = localStorage.getItem("walkthrough_html_content");
        const localWalkthroughHTML = isStoredWalkthroughValid(savedHTML) ? savedHTML : null;
        editorCanvas.innerHTML = localWalkthroughHTML || initialWalkthroughHTML;
        setUnsaved(false);

        if (isEditMode && localWalkthroughHTML) {
            setUnsaved(false);
            showToast("Đã mở bản walkthrough lưu trên máy.", "info");
        }

        applyWalkthroughVersion(version);
        refreshEditableComponents();
    }

    btnSave.addEventListener("click", async () => {
        const cleanHTML = getCleanEditorHTML();
        try {
            localStorage.setItem("walkthrough_html_content", cleanHTML);
            setUnsaved(false);
            
            if (electronAPI && typeof electronAPI.saveWalkthroughHTML === "function") {
                const res = await electronAPI.saveWalkthroughHTML(cleanHTML);
                if (res && res.success) {
                    showToast("Đã lưu vào file hệ thống và assets thành công!", "success");
                } else {
                    showToast("Lưu local thành công, lỗi ghi file: " + (res?.error || "Không xác định"), "error");
                }
            } else {
                showToast("Đã lưu walkthrough trên máy. Không gửi dữ liệu lên server.", "success");
            }
        } catch (error) {
            console.error(error);
            showToast("Không đủ dung lượng lưu local. Hãy dùng ảnh nhỏ hơn hoặc xóa bớt ảnh.", "error");
        }
    });

    btnReset.addEventListener("click", () => {
        if (confirm("Bạn có chắc muốn khôi phục về bài báo gốc mặc định? Mọi thay đổi chưa lưu sẽ bị mất.")) {
            localStorage.removeItem("walkthrough_html_content");
            editorCanvas.innerHTML = defaultHTML;
            clearEditorSelection();
            applyWalkthroughVersion(new URLSearchParams(window.location.search).get('version') || '26.8.11');
            refreshEditableComponents();
            setUnsaved(true);
            showToast("Đã khôi phục về mặc định gốc!", "info");
        }
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
                closeImageModal();
            }
            if (youtubeModal.classList.contains("show")) {
                youtubeModal.classList.remove("show");
            }
        }
    });

    // --- LIGHTBOX IMAGE VIEWER WITH DRAG & ZOOM ---
    function initLightbox() {
        const lightbox = document.getElementById("lightbox-modal");
        const lightboxImg = document.getElementById("lightbox-img");
        const lightboxClose = lightbox.querySelector(".lightbox-close");
        const btnZoomIn = document.getElementById("lightbox-zoom-in");
        const btnZoomOut = document.getElementById("lightbox-zoom-out");
        const btnZoomReset = document.getElementById("lightbox-zoom-reset");
        const zoomLevelText = document.getElementById("lightbox-zoom-level");
        const container = document.getElementById("lightbox-container");

        if (!lightbox || !lightboxImg) return;

        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        function updateTransform() {
            lightboxImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            zoomLevelText.textContent = `${Math.round(scale * 100)}%`;
        }

        function resetViewer() {
            scale = 1;
            translateX = 0;
            translateY = 0;
            updateTransform();
        }

        // Open Lightbox when clicking any image inside the editor canvas
        editorCanvas.addEventListener("click", (e) => {
            if (e.target.tagName === "IMG") {
                // Ignore click if we are clicking layout tools or preview icons
                if (e.target.closest(".layout-toolbar") || e.target.closest(".image-upload-preview")) return;
                
                lightboxImg.src = e.target.src;
                lightbox.classList.add("show");
                resetViewer();
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Close Lightbox
        function closeLightbox() {
            lightbox.classList.remove("show");
            setTimeout(() => {
                if (!lightbox.classList.contains("show")) {
                    lightboxImg.src = "";
                }
            }, 250);
        }

        lightboxClose.addEventListener("click", closeLightbox);
        container.addEventListener("click", (e) => {
            if (e.target === container) {
                closeLightbox();
            }
        });

        // Dragging functionality
        lightboxImg.addEventListener("mousedown", (e) => {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            lightboxImg.style.transition = "none"; // disable transition during drag
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        });

        window.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                lightboxImg.style.transition = "transform 0.12s ease-out";
            }
        });

        // Touch support for dragging
        lightboxImg.addEventListener("touchstart", (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                startX = e.touches[0].clientX - translateX;
                startY = e.touches[0].clientY - translateY;
                lightboxImg.style.transition = "none";
            }
        });

        window.addEventListener("touchmove", (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            updateTransform();
        });

        window.addEventListener("touchend", () => {
            if (isDragging) {
                isDragging = false;
                lightboxImg.style.transition = "transform 0.12s ease-out";
            }
        });

        // Zoom buttons
        btnZoomIn.addEventListener("click", () => {
            scale = Math.min(5, scale + 0.25);
            updateTransform();
        });

        btnZoomOut.addEventListener("click", () => {
            scale = Math.max(0.2, scale - 0.25);
            updateTransform();
        });

        btnZoomReset.addEventListener("click", resetViewer);

        // Mouse Wheel Zoom
        container.addEventListener("wheel", (e) => {
            e.preventDefault();
            const zoomFactor = 0.15;
            if (e.deltaY < 0) {
                scale = Math.min(5, scale + zoomFactor);
            } else {
                scale = Math.max(0.2, scale - zoomFactor);
            }
            updateTransform();
        }, { passive: false });

        // Close on Escape inside Lightbox
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && lightbox.classList.contains("show")) {
                closeLightbox();
            }
        });
    }

    // Initialize
    initEditor();
    initLightbox();
});
