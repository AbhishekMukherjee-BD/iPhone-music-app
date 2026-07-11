/* ==========================================================================
   AURAPLAYER ENGINE & OFF-LINE DATABASE
   ========================================================================== */

// Global State
let db = null;
let tracks = [];
let queue = [];
let currentTrackIndex = -1;
let isPlaying = false;
let loopMode = 'none'; // 'none' | 'all' | 'single'
let isShuffleEnabled = false;
let audioContextUnlocked = false;



// DOM Elements
const audio = document.getElementById('audio-element');
const songsList = document.getElementById('songs-list');
const emptyState = document.getElementById('empty-state');
const trackCountBadge = document.getElementById('track-count');
const musicInput = document.getElementById('music-input');
const searchInput = document.getElementById('search-input');


// Mini Player Elements
const miniPlayer = document.getElementById('mini-player');
const miniTitle = document.getElementById('mini-title');
const miniArtist = document.getElementById('mini-artist');
const miniArtwork = document.getElementById('mini-artwork');
const miniArtworkFallback = document.getElementById('mini-artwork-fallback');
const miniPlayBtn = document.getElementById('mini-play');
const miniNextBtn = document.getElementById('mini-next');
const miniProgressFill = document.getElementById('mini-progress-fill');
const miniTriggerExpand = document.getElementById('mini-trigger-expand');

// Full Screen Player Elements
const playerPanel = document.getElementById('player-panel');
const panelCloseTrigger = document.getElementById('panel-close-trigger');
const panelCloseBtn = document.getElementById('panel-close-btn');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerArtwork = document.getElementById('player-artwork');
const playerArtworkFallback = document.getElementById('player-artwork-fallback');
const timeSlider = document.getElementById('time-slider');
const sliderTrackFill = document.getElementById('slider-track-fill');
const currentTimeLabel = document.getElementById('current-time');
const durationTimeLabel = document.getElementById('duration-time');
const playPauseBtn = document.getElementById('btn-play-pause');
const prevBtn = document.getElementById('btn-prev');
const nextBtn = document.getElementById('btn-next');
const shuffleBtn = document.getElementById('btn-shuffle');
const loopBtn = document.getElementById('btn-loop');
const loopSingleIndicator = document.getElementById('loop-single-indicator');
const volumeSlider = document.getElementById('volume-slider');
const artworkCard = document.getElementById('artwork-card');

// SVG Elements inside Play/Pause Buttons
const playSvgs = document.querySelectorAll('.play-svg, .play-svg-large');
const pauseSvgs = document.querySelectorAll('.pause-svg, .pause-svg-large');

/* ==========================================================================
   INDEXEDDB DATABASE UTILITIES
   ========================================================================== */
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AuraPlayerDB', 1);

    request.onerror = (event) => {
      showToast('Database failed to load: ' + event.target.errorCode);
      reject(event.target.errorCode);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains('songs')) {
        dbInstance.createObjectStore('songs', { keyPath: 'id' });
      }
    };
  });
}

function saveSongToDB(songData) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('No database instance');
    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const request = store.put(songData);

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAllSongsFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject('No database instance');
    const transaction = db.transaction(['songs'], 'readonly');
    const store = transaction.objectStore('songs');
    const request = store.getAll();

    request.onsuccess = (e) => resolve(e.target.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

function deleteSongFromDB(id) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('No database instance');
    const transaction = db.transaction(['songs'], 'readwrite');
    const store = transaction.objectStore('songs');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

/* ==========================================================================
   METADATA PARSER & IMPORT PIPELINE
   ========================================================================== */
async function importFiles(files) {
  if (files.length === 0) return;
  
  showToast(`Parsing ${files.length} song(s)...`);
  let importedCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = 'song_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    try {
      const songInfo = await parseSongMetadata(file, id);
      await saveSongToDB(songInfo);
      importedCount++;
    } catch (err) {
      console.error('Failed to parse metadata for:', file.name, err);
      // Fallback: save with filename as title
      try {
        const fallbackInfo = makeFallbackSongData(file, id);
        await saveSongToDB(fallbackInfo);
        importedCount++;
      } catch (fallbackErr) {
        console.error('Ultimate fallback failed for:', file.name, fallbackErr);
      }
    }
  }

  showToast(`Successfully added ${importedCount} song(s)`);
  await loadLibrary();
}

// Extract tags (Title, Artist, Artwork) using jsmediatags
function parseSongMetadata(file, id) {
  return new Promise((resolve, reject) => {
    // Check if jsmediatags library is loaded
    if (typeof jsmediatags === 'undefined') {
      return reject('jsmediatags library not available');
    }

    jsmediatags.read(file, {
      onSuccess: function(tag) {
        const tags = tag.tags;
        let title = tags.title ? tags.title.trim() : '';
        let artist = tags.artist ? tags.artist.trim() : '';
        
        // Strip file extensions or split filenames as fallbacks if metadata tags are blank
        if (!title) {
          const parsed = parseFilename(file.name);
          title = parsed.title;
          if (!artist) artist = parsed.artist;
        }
        if (!artist) artist = 'Unknown Artist';

        let artworkData = null;
        if (tags.picture) {
          const picture = tags.picture;
          artworkData = convertPictureToBase64(picture);
        }

        resolve({
          id: id,
          title: title,
          artist: artist,
          fileName: file.name,
          artwork: artworkData,
          audioBlob: file
        });
      },
      onError: function(error) {
        reject(error);
      }
    });
  });
}

function makeFallbackSongData(file, id) {
  const parsed = parseFilename(file.name);
  return {
    id: id,
    title: parsed.title,
    artist: parsed.artist || 'Unknown Artist',
    fileName: file.name,
    artwork: null,
    audioBlob: file
  };
}

function parseFilename(filename) {
  let title = filename.replace(/\.[^/.]+$/, ""); // Strip extension
  let artist = '';
  
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    artist = parts[0].trim();
    title = parts.slice(1).join(' - ').trim();
  }
  
  return { title, artist };
}

// Convert bytes array to base64 string safely without stack overflows
function convertPictureToBase64(picture) {
  try {
    const bytes = new Uint8Array(picture.data);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${picture.format};base64,${window.btoa(binary)}`;
  } catch (e) {
    console.error('Base64 artwork conversion failed:', e);
    return null;
  }
}

/* ==========================================================================
   UI CONTROLLER & RENDER PIPELINE
   ========================================================================== */
async function loadLibrary() {
  try {
    tracks = await getAllSongsFromDB();
    // Sort songs alphabetically by title
    tracks.sort((a, b) => a.title.localeCompare(b.title));
    
    // Update Badge
    trackCountBadge.textContent = `${tracks.length} ${tracks.length === 1 ? 'Song' : 'Songs'}`;
    
    // Render list
    renderSongsList(tracks);
    
    // Re-synchronize current index if playing
    if (queue.length > 0) {
      const currentTrackId = currentTrackIndex !== -1 ? queue[currentTrackIndex].id : null;
      
      // Filter out any songs that are no longer in tracks
      queue = queue.filter(qTrack => tracks.some(t => t.id === qTrack.id));
      
      if (currentTrackId) {
        currentTrackIndex = queue.findIndex(t => t.id === currentTrackId);
        if (currentTrackIndex === -1) {
          resetPlayer();
        }
      } else {
        currentTrackIndex = -1;
      }
    }
  } catch (err) {
    console.error('Failed to load library:', err);
    showToast('Failed to load local files');
  }
}

function renderSongsList(songsToRender) {
  // Clear previous list, leaving empty state container
  const items = songsList.querySelectorAll('.song-item');
  items.forEach(el => el.remove());

  if (songsToRender.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  songsToRender.forEach(track => {
    const songItem = document.createElement('div');
    songItem.className = 'song-item';
    songItem.dataset.id = track.id;
    if (currentTrackIndex !== -1 && queue[currentTrackIndex].id === track.id) {
      songItem.classList.add('active');
    }

    // Artwork Element
    let artworkImg = `<div class="song-artwork flex-center"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style="opacity: 0.5;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
    if (track.artwork) {
      artworkImg = `<img src="${track.artwork}" alt="Art" class="song-artwork">`;
    }

    songItem.innerHTML = `
      ${artworkImg}
      <div class="song-info">
        <div class="song-title">${escapeHTML(track.title)}</div>
        <div class="song-artist">${escapeHTML(track.artist)}</div>
      </div>
      <div class="song-action-container">
        <button class="btn-icon delete-song-btn" data-id="${track.id}" aria-label="Delete Song">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
          </svg>
        </button>
      </div>
    `;

    // Click handler to play track
    songItem.addEventListener('click', (e) => {
      // If click on delete button, do not play
      if (e.target.closest('.delete-song-btn')) return;
      
      unlockAudioContext();
      playTrackById(track.id);
    });

    // Swipe / delete song handler
    const deleteBtn = songItem.querySelector('.delete-song-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${track.title}" from your library?`)) {
        await deleteSong(track.id);
      }
    });

    songsList.appendChild(songItem);
  });
}

async function deleteSong(id) {
  try {
    await deleteSongFromDB(id);
    showToast('Song removed');
    await loadLibrary();
  } catch (e) {
    showToast('Failed to delete song');
  }
}

/* ==========================================================================
   AUDIO ENGINE FUNCTIONS
   ========================================================================== */
function unlockAudioContext() {
  if (audioContextUnlocked) return;
  const context = new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === 'suspended') {
    context.resume();
  }
  audioContextUnlocked = true;
}

function playTrackById(trackId) {
  // Sync queue with active library tracks
  queue = [...tracks];
  if (isShuffleEnabled) {
    // Shuffle the queue but keep the selected track at index 0
    const activeIndex = queue.findIndex(t => t.id === trackId);
    if (activeIndex !== -1) {
      const activeTrack = queue.splice(activeIndex, 1)[0];
      shuffleArray(queue);
      queue.unshift(activeTrack);
    }
  }

  const newIndex = queue.findIndex(t => t.id === trackId);
  if (newIndex !== -1) {
    loadAndPlayTrack(newIndex);
  }
}

function loadAndPlayTrack(index) {
  if (index < 0 || index >= queue.length) return;
  
  currentTrackIndex = index;
  const track = queue[currentTrackIndex];
  
  // Convert Blob file to safe local URL for audio element
  const audioURL = URL.createObjectURL(track.audioBlob);
  audio.src = audioURL;
  audio.load();

  // Play immediately
  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        isPlaying = true;
        updatePlaybackUI();
        updateMediaSession(track);
      })
      .catch(error => {
        console.error('Audio playback failed:', error);
        showToast('Playback failed, tap Play to try again');
        isPlaying = false;
        updatePlaybackUI();
      });
  }

  // Revoke previous URL to release memory after sound loads
  audio.oncanplaythrough = () => {
    // We keep the URL active for Safari scrubbing stability
  };

  // Sync Library Active highlight
  document.querySelectorAll('.song-item').forEach(el => {
    if (el.dataset.id === track.id) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  showToast(`Playing: ${track.title}`);
}

function togglePlay() {
  if (currentTrackIndex === -1 && tracks.length > 0) {
    playTrackById(tracks[0].id);
    return;
  }
  if (currentTrackIndex === -1) return;

  unlockAudioContext();

  if (isPlaying) {
    audio.pause();
    isPlaying = false;
  } else {
    audio.play().then(() => {
      isPlaying = true;
      updatePlaybackUI();
    }).catch(err => {
      console.error(err);
      showToast('Could not resume playback');
    });
  }
  updatePlaybackUI();
}

function nextTrack() {
  if (queue.length === 0) return;
  
  let nextIndex = currentTrackIndex + 1;
  if (nextIndex >= queue.length) {
    if (loopMode === 'all') {
      nextIndex = 0;
    } else {
      // End of queue
      resetPlayer();
      return;
    }
  }
  loadAndPlayTrack(nextIndex);
}

function prevTrack() {
  if (queue.length === 0) return;

  // If song is more than 3 seconds in, restart the song
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  let prevIndex = currentTrackIndex - 1;
  if (prevIndex < 0) {
    if (loopMode === 'all') {
      prevIndex = queue.length - 1;
    } else {
      prevIndex = 0; // Stick to first song
    }
  }
  loadAndPlayTrack(prevIndex);
}

function resetPlayer() {
  audio.pause();
  audio.src = '';
  isPlaying = false;
  currentTrackIndex = -1;
  updatePlaybackUI();
}

/* ==========================================================================
   UI SYNCHRONIZATION
   ========================================================================== */
function updatePlaybackUI() {
  const isMiniPlayerHidden = currentTrackIndex === -1;
  
  if (isMiniPlayerHidden) {
    miniPlayer.classList.add('hidden');
    artworkCard.classList.remove('playing');
    return;
  }

  const track = queue[currentTrackIndex];
  miniPlayer.classList.remove('hidden');

  // 1. Sync Mini Player info
  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist;
  if (track.artwork) {
    miniArtwork.src = track.artwork;
    miniArtwork.classList.remove('hidden');
    miniArtworkFallback.classList.add('hidden');
  } else {
    miniArtwork.classList.add('hidden');
    miniArtworkFallback.classList.remove('hidden');
  }

  // 2. Sync Full Panel Info
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  if (track.artwork) {
    playerArtwork.src = track.artwork;
    playerArtwork.classList.remove('hidden');
    playerArtworkFallback.classList.add('hidden');
  } else {
    playerArtwork.classList.add('hidden');
    playerArtworkFallback.classList.remove('hidden');
  }

  // 3. Play/Pause Icons Sync
  if (isPlaying) {
    playSvgs.forEach(el => el.classList.add('hidden'));
    pauseSvgs.forEach(el => el.classList.remove('hidden'));
    artworkCard.classList.add('playing');
  } else {
    playSvgs.forEach(el => el.classList.remove('hidden'));
    pauseSvgs.forEach(el => el.classList.add('hidden'));
    artworkCard.classList.remove('playing');
  }

  // 4. Loop & Shuffle button styles
  shuffleBtn.classList.toggle('active', isShuffleEnabled);
  
  if (loopMode === 'none') {
    loopBtn.classList.remove('active');
    loopSingleIndicator.classList.add('hidden');
  } else if (loopMode === 'all') {
    loopBtn.classList.add('active');
    loopSingleIndicator.classList.add('hidden');
  } else if (loopMode === 'single') {
    loopBtn.classList.add('active');
    loopSingleIndicator.classList.remove('hidden');
  }
}

// Synchronize timeline sliders during play tick
audio.addEventListener('timeupdate', () => {
  if (isNaN(audio.duration)) return;
  
  const current = audio.currentTime;
  const duration = audio.duration;
  const pct = (current / duration) * 100;
  
  // Timeline label text updates
  currentTimeLabel.textContent = formatTime(current);
  durationTimeLabel.textContent = formatTime(duration);
  
  // Slider values sync
  timeSlider.value = pct;
  
  // Custom Slider Track Fill (Gold Accent size)
  sliderTrackFill.style.width = `${pct}%`;
  miniProgressFill.style.width = `${pct}%`;
  
  // Update iOS Media Session Position state
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setPositionState({
      duration: duration,
      playbackRate: audio.playbackRate,
      position: current
    });
  }
});

// Load audio duration when meta loads
audio.addEventListener('loadedmetadata', () => {
  durationTimeLabel.textContent = formatTime(audio.duration);
});

// Auto-advance song when active completes
audio.addEventListener('ended', () => {
  if (loopMode === 'single') {
    audio.currentTime = 0;
    audio.play();
  } else {
    nextTrack();
  }
});

// Slider scrubbing action listener
timeSlider.addEventListener('input', (e) => {
  if (isNaN(audio.duration)) return;
  const pct = e.target.value;
  const newTime = (pct / 100) * audio.duration;
  
  audio.currentTime = newTime;
  sliderTrackFill.style.width = `${pct}%`;
});

// Volume adjustment listener
volumeSlider.addEventListener('input', (e) => {
  audio.volume = e.target.value;
});

// Loop & Shuffle Actions
loopBtn.addEventListener('click', () => {
  if (loopMode === 'none') {
    loopMode = 'all';
    showToast('Repeat: All');
  } else if (loopMode === 'all') {
    loopMode = 'single';
    showToast('Repeat: Track');
  } else {
    loopMode = 'none';
    showToast('Repeat: Off');
  }
  updatePlaybackUI();
});

shuffleBtn.addEventListener('click', () => {
  isShuffleEnabled = !isShuffleEnabled;
  showToast(isShuffleEnabled ? 'Shuffle: On' : 'Shuffle: Off');
  
  if (isShuffleEnabled && currentTrackIndex !== -1) {
    // Rearrange the playing queue around the current track
    const activeTrack = queue[currentTrackIndex];
    queue.splice(currentTrackIndex, 1);
    shuffleArray(queue);
    queue.unshift(activeTrack);
    currentTrackIndex = 0;
  } else {
    // Reset queue back to library alphabet order
    const currentId = queue[currentTrackIndex]?.id;
    queue = [...tracks];
    if (currentId) {
      currentTrackIndex = queue.findIndex(t => t.id === currentId);
    }
  }
  updatePlaybackUI();
});

/* ==========================================================================
   LOCK SCREEN & CONTROL CENTER (MEDIA SESSION API)
   ========================================================================== */
function updateMediaSession(track) {
  if (!('mediaSession' in navigator)) return;

  const artworkInfo = [];
  if (track.artwork) {
    artworkInfo.push({ src: track.artwork, sizes: '512x512', type: 'image/jpeg' });
  } else {
    // Fallback gold record design inside canvas
    artworkInfo.push({ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' });
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: 'Local Storage',
    artwork: artworkInfo
  });
}

function initMediaSessionActions() {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.setActionHandler('play', () => {
    togglePlay();
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    togglePlay();
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    prevTrack();
  });
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    nextTrack();
  });
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.fastSeek && 'fastSeek' in audio) {
      audio.fastSeek(details.seekTime);
    } else {
      audio.currentTime = details.seekTime;
    }
  });
}

/* ==========================================================================
   UI SHEET DRAG & PAN GESTURE (NATIVE SHEET DISMISS FEEL)
   ========================================================================== */
let startY = 0;
let currentY = 0;
let isDragging = false;

panelCloseTrigger.addEventListener('touchstart', (e) => {
  startY = e.touches[0].clientY;
  isDragging = true;
  playerPanel.style.transition = 'none'; // Disable animations while dragging
}, { passive: true });

panelCloseTrigger.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  currentY = e.touches[0].clientY;
  const diffY = currentY - startY;
  
  if (diffY > 0) {
    playerPanel.style.transform = `translateY(${diffY}px)`;
  }
}, { passive: true });

panelCloseTrigger.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  
  const diffY = currentY - startY;
  playerPanel.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  
  if (diffY > 120) {
    // Dragged down far enough to dismiss
    minimizePlayerPanel();
  } else {
    // Snap back up
    playerPanel.style.transform = 'translateY(0)';
  }
});

function expandPlayerPanel() {
  playerPanel.classList.add('active');
  document.body.classList.add('player-panel-active');
  playerPanel.style.transform = 'translateY(0)';
}

function minimizePlayerPanel() {
  playerPanel.classList.remove('active');
  document.body.classList.remove('player-panel-active');
  playerPanel.style.transform = 'translateY(100%)';
}

// Mini player tap expands panel
miniTriggerExpand.addEventListener('click', expandPlayerPanel);
panelCloseBtn.addEventListener('click', minimizePlayerPanel);

// Control panel button event mappings
playPauseBtn.addEventListener('click', togglePlay);
miniPlayBtn.addEventListener('click', togglePlay);
nextBtn.addEventListener('click', nextTrack);
miniNextBtn.addEventListener('click', nextTrack);
prevBtn.addEventListener('click', prevTrack);



// Import music input listener
musicInput.addEventListener('change', (e) => {
  importFiles(e.target.files);
});

// Search input keyup listener
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderSongsList(tracks);
    return;
  }

  const filtered = tracks.filter(t => 
    t.title.toLowerCase().includes(query) || 
    t.artist.toLowerCase().includes(query)
  );
  renderSongsList(filtered);
});

// App Startup
window.addEventListener('DOMContentLoaded', async () => {
  initMediaSessionActions();
  
  try {
    await initDatabase();
    await loadLibrary();
  } catch (e) {
    showToast('Failed to initialize database');
  }

  // Register Service Worker for PWA (offline use)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.error('Service Worker Registry failed:', err));
  }
});

/* ==========================================================================
   HELPERS & TOAST SYSTEM
   ========================================================================== */
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Auto remove toast
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3000);
}
