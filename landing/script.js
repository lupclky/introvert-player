document.addEventListener("DOMContentLoaded", () => {
    // 1. Tương tác chuyển đổi Theme
    const tabs = document.querySelectorAll(".theme-tab");
    const previewContainer = document.getElementById("theme-preview-container");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            // Remove active classes
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            // Change theme on simulated player container
            const selectedTheme = tab.getAttribute("data-theme");
            
            // Remove all themes
            previewContainer.className = "";
            previewContainer.classList.add(`theme-${selectedTheme}`);
        });
    });

    // 2. Giả lập trình phát nhạc tự động chạy trên Preview
    const mockSongs = [
        {
            title: "Ngày Ấy — Lâm",
            donorName: "Lâm",
            amount: "50.000 VNĐ",
            duration: 204, // 3:24
            nextTitle: "Faded — Alan Walker",
            nextDonor: "Khách",
            nextAmount: "20.000 VNĐ"
        },
        {
            title: "Faded — Alan Walker",
            donorName: "Khách",
            amount: "20.000 VNĐ",
            duration: 212, // 3:32
            nextTitle: "Alone — Marshmello",
            nextDonor: "Linh",
            nextAmount: "10.000 VNĐ"
        },
        {
            title: "Alone — Marshmello",
            donorName: "Linh",
            amount: "10.000 VNĐ",
            duration: 163, // 2:43
            nextTitle: "Ngày Ấy — Lâm",
            nextDonor: "Lâm",
            nextAmount: "50.000 VNĐ"
        }
    ];

    let currentSongIndex = 0;
    let elapsedSeconds = 185; // Start near the end of the song to show drawer slide down!
    
    const timeDisplay = document.getElementById("obs-current-time");
    const totalTimeDisplay = document.getElementById("obs-total-time");
    const progressFill = document.getElementById("obs-progress-fill");
    
    const titleDisplay = document.getElementById("obs-song-title");
    const donorContainer = document.getElementById("obs-donor-container");
    const donorNameDisplay = document.getElementById("obs-donor-name");
    const donorAmountDisplay = document.getElementById("obs-donor-amount");

    const drawer = document.getElementById("obs-next-song-drawer");
    const nextTextDisplay = document.getElementById("obs-next-text");
    const nextDonorInfo = document.getElementById("obs-next-donor-info");
    const nextDonorNameDisplay = document.getElementById("obs-next-donor-name");
    const nextDonorAmountDisplay = document.getElementById("obs-next-donor-amount");

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function updateSimulation() {
        const currentSong = mockSongs[currentSongIndex];
        
        // Update playing details if changed
        if (titleDisplay.textContent !== currentSong.title) {
            titleDisplay.textContent = currentSong.title;
            
            if (donorNameDisplay) donorNameDisplay.textContent = currentSong.donorName;
            if (donorAmountDisplay) donorAmountDisplay.textContent = currentSong.amount;
            if (totalTimeDisplay) totalTimeDisplay.textContent = formatTime(currentSong.duration);

            // Update next song details
            if (nextTextDisplay) nextTextDisplay.textContent = currentSong.nextTitle;
            if (nextDonorNameDisplay) nextDonorNameDisplay.textContent = currentSong.nextDonor;
            if (nextDonorAmountDisplay) nextDonorAmountDisplay.textContent = currentSong.nextAmount;
        }

        // Increment time
        elapsedSeconds++;
        
        // Loop back
        if (elapsedSeconds >= currentSong.duration) {
            elapsedSeconds = 0;
            currentSongIndex = (currentSongIndex + 1) % mockSongs.length;
            drawer.classList.remove("show");
        }

        // Display current time
        if (timeDisplay) timeDisplay.textContent = formatTime(elapsedSeconds);
        
        // Progress Fill
        if (progressFill) {
            const percentage = (elapsedSeconds / currentSong.duration) * 100;
            progressFill.style.width = `${percentage}%`;
        }

        // Slide Drawer check (Show drawer in the last 15 seconds)
        const remainingTime = currentSong.duration - elapsedSeconds;
        if (remainingTime <= 15 && remainingTime > 1) {
            drawer.classList.add("show");
        } else {
            drawer.classList.remove("show");
        }
    }

    // Run interval every 1 second
    setInterval(updateSimulation, 1000);
});
