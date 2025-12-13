/**
 * Media Player Module
 * Handles loading and playing audio/video references from YouTube, URLs, or local files
 */

// DOM elements
let mediaLoaderDialog = null;
let mediaPlayerContainer = null;
let mediaPlayerWrapper = null;
let mediaPlayerAnchor = null;
let converterSection = null;
let currentMediaElement = null;

// State tracking
let isAnchorVisible = true;
let isConverterVisible = false;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    mediaLoaderDialog = document.getElementById("mediaLoaderDialog");
    mediaPlayerContainer = document.getElementById("mediaPlayerContainer");
    mediaPlayerWrapper = document.getElementById("mediaPlayerWrapper");
    mediaPlayerAnchor = document.getElementById("mediaPlayerAnchor");
    converterSection = document.getElementById("converter");

    // Initialize Intersection Observers for Floating Logic
    if (mediaPlayerAnchor && converterSection) {
        // Observer for the Anchor (Original Position)
        // Threshold 0.95 ensures it floats as soon as it's slightly obscured (not fully visible)
        // We use 0.95 instead of 1.0 to be safe with sub-pixel rendering and borders
        const anchorObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isAnchorVisible = entry.isIntersecting;
                updateFloatingState();
            });
        }, {
            root: null,
            threshold: 0.95
        });
        anchorObserver.observe(mediaPlayerAnchor);

        // Observer for the Converter Section (Working Area)
        // Threshold 0 means "am I at all seeing the converter section?"
        const converterObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isConverterVisible = entry.isIntersecting;
                updateFloatingState();
            });
        }, {
            root: null,
            threshold: 0
        });
        converterObserver.observe(converterSection);
    }

    // Load Media button
    const loadMediaButton = document.getElementById("loadMediaButton");
    if (loadMediaButton) {
        loadMediaButton.addEventListener("click", showMediaDialog);
    }

    // Close dialog button
    const closeDialogButton = document.getElementById("closeMediaDialog");
    if (closeDialogButton) {
        closeDialogButton.addEventListener("click", hideMediaDialog);
    }

    // Close player button
    const closePlayerButton = document.getElementById("closeMediaPlayer");
    if (closePlayerButton) {
        closePlayerButton.addEventListener("click", hidePlayer);
    }

    // Load button in dialog
    const loadUrlButton = document.getElementById("loadUrlButton");
    if (loadUrlButton) {
        loadUrlButton.addEventListener("click", handleLoadUrl);
    }

    // File input & Drop Zone
    const mediaFileInput = document.getElementById("mediaFileInput");
    const dropZone = document.getElementById("dropZone");

    if (mediaFileInput) {
        mediaFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) processMediaFile(file);
            e.target.value = "";
        });
    }

    if (dropZone) {
        dropZone.addEventListener("click", () => {
            if (mediaFileInput) mediaFileInput.click();
        });

        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("drag-over");
        });

        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("drag-over");

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                processMediaFile(file);
            }
        });

        dropZone.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (mediaFileInput) mediaFileInput.click();
            }
        });
    }

    // Close dialog on backdrop click
    if (mediaLoaderDialog) {
        mediaLoaderDialog.addEventListener("click", (e) => {
            if (e.target === mediaLoaderDialog) {
                hideMediaDialog();
            }
        });
    }

    // Close dialog on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && mediaLoaderDialog && !mediaLoaderDialog.classList.contains("hidden")) {
            hideMediaDialog();
        }
    });
});

/**
 * Show the media loader dialog
 */
function showMediaDialog() {
    if (mediaLoaderDialog) {
        mediaLoaderDialog.classList.remove("hidden");
        const urlInput = document.getElementById("mediaUrlInput");
        if (urlInput) {
            urlInput.value = "";
            urlInput.focus();
        }
    }
}

/**
 * Hide the media loader dialog
 */
function hideMediaDialog() {
    if (mediaLoaderDialog) {
        mediaLoaderDialog.classList.add("hidden");
    }
}

/**
 * Show the media player
 */
function showPlayer() {
    if (mediaPlayerContainer) {
        mediaPlayerContainer.classList.remove("hidden");
        updateFloatingState();
    }
}

/**
 * Hide the media player and clean up
 */
function hidePlayer() {
    if (mediaPlayerContainer) {
        mediaPlayerContainer.classList.add("hidden");
        mediaPlayerContainer.classList.remove("floating");
        if (mediaPlayerAnchor) mediaPlayerAnchor.style.minHeight = "";
    }
    // Clean up current media
    if (mediaPlayerWrapper) {
        mediaPlayerWrapper.innerHTML = "";
    }
    if (currentMediaElement) {
        if (currentMediaElement.pause) {
            currentMediaElement.pause();
        }
        currentMediaElement = null;
    }
    // Update title
    const title = document.getElementById("mediaTitle");
    if (title) {
        title.textContent = "Reference Player";
    }
}

/**
 * Handle URL load button click
 */
function handleLoadUrl() {
    const urlInput = document.getElementById("mediaUrlInput");
    if (!urlInput) return;

    const url = urlInput.value.trim();
    if (!url) {
        alert("Please enter a URL");
        return;
    }

    // Check if it's a YouTube URL
    const youtubeId = extractYouTubeId(url);
    if (youtubeId) {
        loadYouTubeVideo(youtubeId);
    } else {
        loadAudioUrl(url);
    }

    hideMediaDialog();
}

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

/**
 * Reset player state and class modes
 */
function resetPlayerState() {
    if (mediaPlayerContainer) {
        mediaPlayerContainer.classList.remove("mode-youtube", "mode-video", "mode-audio");

        // Hide overlay if it exists (from previous implementation)
        const overlay = document.getElementById("mediaTitleOverlay");
        if (overlay) overlay.classList.add("hidden");
    }

    // Stop any playing media
    if (currentMediaElement && currentMediaElement.pause) {
        currentMediaElement.pause();
    }

    // Clean up object URLs if needed
    if (currentMediaElement && currentMediaElement.src && currentMediaElement.src.startsWith("blob:")) {
        URL.revokeObjectURL(currentMediaElement.src);
    }

    currentMediaElement = null;
    if (mediaPlayerWrapper) { // Ensure mediaPlayerWrapper is not null before accessing innerHTML
        mediaPlayerWrapper.innerHTML = "";
    }
}

/**
 * Load a YouTube video
 * Note: YouTube embeds require the page to be served from http:// or https://
 */
function loadYouTubeVideo(videoId) {
    if (!mediaPlayerWrapper) return;

    resetPlayerState();
    mediaPlayerContainer.classList.add("mode-youtube");

    // Create YouTube embed iframe
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.frameBorder = "0";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.title = "YouTube video player";
    iframe.style.aspectRatio = "16 / 9";

    mediaPlayerWrapper.appendChild(iframe);
    currentMediaElement = iframe;

    // Update title
    const title = document.getElementById("mediaTitle");
    if (title) {
        title.textContent = "YouTube Video";
    }

    showPlayer();
}

/**
 * Load audio from URL
 */
function loadAudioUrl(url) {
    if (!mediaPlayerWrapper) return;

    // Determine if it's likely video or audio based on extension
    const isVideo = /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(url);

    if (isVideo) {
        loadVideo(url, getFilenameFromUrl(url));
    } else {
        loadAudio(url, getFilenameFromUrl(url));
    }

    showPlayer();
}

/**
 * Process selected media file
 */
function processMediaFile(file) {
    if (!file) return;

    // Show filename in UI (optional feedback)
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    if (fileNameDisplay) {
        fileNameDisplay.textContent = file.name;
        fileNameDisplay.classList.remove("hidden");
    }

    // Determine type
    if (file.type.startsWith("video/")) {
        const fileUrl = URL.createObjectURL(file);
        loadVideo(fileUrl, file.name);
    } else {
        const fileUrl = URL.createObjectURL(file);
        loadAudio(fileUrl, file.name);
    }

    hideMediaDialog();
    showPlayer();
}

/**
 * Load a Video (Adaptive Aspect Ratio)
 */
function loadVideo(src, title) {
    resetPlayerState();
    mediaPlayerContainer.classList.add("mode-video");

    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.preload = "metadata";
    video.style.width = "100%";
    video.style.height = "auto";
    video.style.maxHeight = "600px";
    video.style.display = "block";

    video.onerror = () => {
        alert("Failed to load video. Please check the source.");
        hidePlayer();
    };

    mediaPlayerWrapper.appendChild(video);
    currentMediaElement = video;
}

/**
 * Load Audio (Custom UI)
 */
function loadAudio(src, title) {
    resetPlayerState();
    mediaPlayerContainer.classList.add("mode-audio");

    // Create hidden audio element
    const audio = document.createElement("audio");
    audio.src = src;
    audio.preload = "metadata";

    audio.onerror = () => {
        alert("Failed to load audio. Please check the source.");
        hidePlayer();
    };

    // Create Custom UI
    const uiContainer = document.createElement("div");
    uiContainer.className = "audio-player-ui";

    uiContainer.innerHTML = `
        <div class="audio-slider-container">
            <div class="audio-progress-bar"></div>
            <input type="range" class="audio-slider-input" min="0" max="100" value="0" step="0.1">
        </div>
        <div class="audio-controls">
            <button class="audio-btn audio-btn-play" title="Play/Pause">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </button>
        </div>
    `;

    mediaPlayerWrapper.appendChild(uiContainer);
    mediaPlayerWrapper.appendChild(audio); // Append hidden audio
    currentMediaElement = audio;

    // Wire up events
    const playBtn = uiContainer.querySelector(".audio-btn-play");
    const slider = uiContainer.querySelector(".audio-slider-input");
    const progressBar = uiContainer.querySelector(".audio-progress-bar");
    const playIcon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseIcon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

    // Play/Pause Toggle
    playBtn.addEventListener("click", () => {
        if (audio.paused) {
            audio.play();
            playBtn.innerHTML = pauseIcon;
        } else {
            audio.pause();
            playBtn.innerHTML = playIcon;
        }
    });

    // Update Slider as audio plays
    audio.addEventListener("timeupdate", () => {
        if (!isNaN(audio.duration)) {
            const percent = (audio.currentTime / audio.duration) * 100;
            slider.value = percent;
            progressBar.style.width = `${percent}%`;
        }
    });

    // Seek when slider changes
    slider.addEventListener("input", () => {
        if (!isNaN(audio.duration)) {
            const time = (slider.value / 100) * audio.duration;
            audio.currentTime = time;
            progressBar.style.width = `${slider.value}%`;
        }
    });

    // Reset on end
    audio.addEventListener("ended", () => {
        playBtn.innerHTML = playIcon;
        slider.value = 0;
        progressBar.style.width = "0%";
    });
}

/**
 * Extract filename from URL
 */
function getFilenameFromUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.split("/").pop();
        return filename || "Unknown";
    } catch {
        return "Unknown";
    }
}

/**
 * Update the floating state of the media player
 * based on intersection observers
 */
function updateFloatingState() {
    if (!mediaPlayerContainer || !currentMediaElement) return;

    // If player is explicitly hidden, do not float
    if (mediaPlayerContainer.classList.contains("hidden")) {
        mediaPlayerContainer.classList.remove("floating");
        if (mediaPlayerAnchor) mediaPlayerAnchor.style.minHeight = "";
        return;
    }

    // Check where the anchor is relative to the viewport
    let isAnchorAbove = false;
    if (mediaPlayerAnchor) {
        const rect = mediaPlayerAnchor.getBoundingClientRect();
        // If the top of the anchor is negative, it means we have scrolled past it (it's above us)
        // We use a small buffer (e.g., 0) to be precise
        isAnchorAbove = rect.top <= 0;
    }

    // Logic: 
    // 1. Must be in Component Section (working on tool)
    // 2. Original Position must NOT be fully visible (!isAnchorVisible)
    // 3. Original Position must be BELOW the viewport (not scrolled past)
    const shouldFloat = isConverterVisible && !isAnchorVisible && !isAnchorAbove;

    if (shouldFloat) {
        // Only float if we have content
        if (!mediaPlayerContainer.classList.contains("floating")) {
            // Lock height of anchor to prevent layout shift
            const height = mediaPlayerContainer.offsetHeight;
            if (mediaPlayerAnchor) mediaPlayerAnchor.style.minHeight = height + "px";
            mediaPlayerContainer.classList.add("floating");
        }
    } else {
        if (mediaPlayerContainer.classList.contains("floating")) {
            mediaPlayerContainer.classList.remove("floating");
            // Reset anchor height
            if (mediaPlayerAnchor) mediaPlayerAnchor.style.minHeight = "";
        }
    }
}
