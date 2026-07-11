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

// Queue Elements
const queueToggleBtn = document.getElementById('btn-queue-toggle');
const queuePanel = document.getElementById('queue-panel');
const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const queueAddBtn = document.getElementById('btn-queue-add');
const queueCloseBtn = document.getElementById('btn-queue-close');
const queueSelectModal = document.getElementById('queue-select-modal');
const modalCloseBtn = document.getElementById('btn-modal-close');
const modalSearchInput = document.getElementById('modal-search-input');
const modalSongsList = document.getElementById('modal-songs-list');

// Segmented Controls and Direct Import inside Modal
const btnChooseImported = document.getElementById('btn-choose-imported');
const btnImportNew = document.getElementById('btn-import-new');
const segmentedSlider = document.getElementById('segmented-slider');
const contentChooseImported = document.getElementById('content-choose-imported');
const contentImportNew = document.getElementById('content-import-new');
const btnModalFileTrigger = document.getElementById('btn-modal-file-trigger');
const modalFileInput = document.getElementById('modal-file-input');

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

function attachSwipeToDelete(item) {
  let startX = 0, currentX = 0, swiping = false;
  
  item.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    swiping = true;
    item.style.transition = 'none';
  }, { passive: true });
  
  item.addEventListener('touchmove', e => {
    if (!swiping) return;
    const diff = e.touches[0].clientX - startX;
    currentX = Math.min(0, diff);
    item.style.transform = `translateX(${Math.max(currentX, -100)}px)`;
  }, { passive: true });
  
  item.addEventListener('touchend', () => {
    swiping = false;
    item.style.transition = 'transform 0.3s var(--easing-spring)';
    if (currentX < -60) {
      item.style.transform = 'translateX(-80px)';
    } else {
      item.style.transform = 'translateX(0)';
    }
  });
}

function renderSongsList(songsToRender) {
  // Clear previous list wrappers
  const items = songsList.querySelectorAll('.song-row-wrapper');
  items.forEach(el => el.remove());

  // Also clear any legacy direct song-items
  const legacyItems = songsList.querySelectorAll('.song-item');
  legacyItems.forEach(el => el.remove());

  if (songsToRender.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  songsToRender.forEach(track => {
    const rowWrapper = document.createElement('div');
    rowWrapper.className = 'song-row-wrapper';

    const songItem = document.createElement('div');
    songItem.className = 'song-item';
    songItem.dataset.id = track.id;
    if (currentTrackIndex !== -1 && queue[currentTrackIndex].id === track.id) {
      songItem.classList.add('active');
    }

    let artworkImg = `<div class="song-artwork flex-center"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style="opacity: 0.5;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
    if (track.artwork) {
      artworkImg = `<img src="${track.artwork}" alt="Art" class="song-artwork">`;
    }

    rowWrapper.innerHTML = `
      <button class="delete-action-btn" data-id="${track.id}" aria-label="Delete">
        Delete
      </button>
    `;

    songItem.innerHTML = `
      ${artworkImg}
      <div class="song-info">
        <div class="song-title">${escapeHTML(track.title)}</div>
        <div class="song-artist">${escapeHTML(track.artist)}</div>
      </div>
    `;

    rowWrapper.appendChild(songItem);

    // Click handler to play track or collapse swipe state
    songItem.addEventListener('click', () => {
      if (songItem.style.transform && songItem.style.transform !== 'translateX(0px)') {
        songItem.style.transition = 'transform 0.3s var(--easing-spring)';
        songItem.style.transform = 'translateX(0)';
        return;
      }
      unlockAudioContext();
      playTrackById(track.id);
    });

    // Delete button click action
    const deleteBtn = rowWrapper.querySelector('.delete-action-btn');
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${track.title}" from your library?`)) {
        await deleteSong(track.id);
      }
    });

    // Attach touch gesture swipe handler
    attachSwipeToDelete(songItem);

    songsList.appendChild(rowWrapper);
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
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  } else {
    playSvgs.forEach(el => el.classList.remove('hidden'));
    pauseSvgs.forEach(el => el.classList.add('hidden'));
    artworkCard.classList.remove('playing');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
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

  // 5. Update Queue UI if panel is open
  if (queuePanel && queuePanel.classList.contains('active')) {
    renderQueueList();
  }
}

// Synchronize timeline sliders during play tick
let lastPositionUpdate = 0;
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
  
  // Throttle mediaSession position updates to once per second
  if ('mediaSession' in navigator && (Math.abs(current - lastPositionUpdate) >= 1.0)) {
    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: audio.playbackRate || 1.0,
        position: current
      });
      lastPositionUpdate = current;
    } catch (err) {
      // Ignore momentarily mismatching state errors
    }
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

  // Re-register actions on track change to maintain lock screen focus
  initMediaSessionActions();

  // Sync playbackState state
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
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

  // Nullify seekforward/seekbackward to prevent iOS from overriding track controls with 15s skip buttons
  try {
    navigator.mediaSession.setActionHandler('seekforward', null);
    navigator.mediaSession.setActionHandler('seekbackward', null);
  } catch (err) {
    console.warn('MediaSession seek action overrides not fully supported:', err);
  }

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
let panelStartY = 0, panelCurrentY = 0, panelLastY = 0, panelLastT = 0, panelVelocity = 0;

panelCloseTrigger.addEventListener('touchstart', (e) => {
  panelStartY = e.touches[0].clientY;
  panelLastY = panelStartY;
  panelLastT = performance.now();
  playerPanel.style.transition = 'none';
}, { passive: true });

panelCloseTrigger.addEventListener('touchmove', (e) => {
  const y = e.touches[0].clientY;
  const now = performance.now();
  let diff = y - panelStartY;
  if (diff < 0) diff = diff / 4; // rubber-band resistance when dragging upward past top
  panelVelocity = (y - panelLastY) / Math.max(1, now - panelLastT);
  panelLastY = y;
  panelLastT = now;
  panelCurrentY = diff;
  playerPanel.style.transform = `translateY(${diff}px)`;
}, { passive: true });

panelCloseTrigger.addEventListener('touchend', () => {
  playerPanel.style.transition = '';
  const shouldDismiss = panelCurrentY > 120 || panelVelocity > 0.6;
  if (shouldDismiss) {
    minimizePlayerPanel();
  } else {
    playerPanel.style.transform = '';
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

/* ==========================================================================
   QUEUE MANAGEMENT SYSTEM & TOUCH GESTURES
   ========================================================================== */
function renderQueueList() {
  queueList.innerHTML = '';
  queueCount.textContent = `${queue.length} ${queue.length === 1 ? 'Song' : 'Songs'}`;

  if (queue.length === 0) {
    queueList.innerHTML = '<div class="empty-state"><h3>Queue is empty</h3><p>Tap "+" above to add songs.</p></div>';
    return;
  }

  queue.forEach((track, index) => {
    const isCurrent = index === currentTrackIndex;
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.dataset.index = index;

    item.innerHTML = `
      <span class="queue-item-number">${index + 1}</span>
      <div class="queue-item-details">
        <div class="queue-item-title">${escapeHTML(track.title)}</div>
        <div class="queue-item-artist">${escapeHTML(track.artist)}</div>
      </div>
      ${isCurrent ? '<span class="queue-item-playing-badge">Currently Playing</span>' : ''}
      <button class="btn-icon btn-queue-item-menu" data-index="${index}" aria-label="Song Menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
          <circle cx="12" cy="5" r="1.2"></circle>
          <circle cx="12" cy="12" r="1.2"></circle>
          <circle cx="12" cy="19" r="1.2"></circle>
        </svg>
      </button>
    `;

    // Click to play directly from queue list
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-queue-item-menu')) return; // ignore menu clicks in standard item play click
      loadAndPlayTrack(index);
    });

    const menuBtn = item.querySelector('.btn-queue-item-menu');
    menuBtn.addEventListener('click', (e) => {
      showQueueItemDropdown(e, index);
    });

    setupQueueDragEvents(item);
    queueList.appendChild(item);
  });
}

// Queue Item Dropdown Menu Functions
let activeDropdown = null;

function showQueueItemDropdown(e, index) {
  e.stopPropagation();
  closeActiveDropdown();

  const button = e.currentTarget;
  const rect = button.getBoundingClientRect();
  const panelRect = queuePanel.getBoundingClientRect();

  const dropdown = document.createElement('div');
  dropdown.className = 'queue-item-dropdown';
  
  // Position dropdown relative to the sliding queue panel viewport
  dropdown.style.top = `${rect.bottom - panelRect.top}px`;
  dropdown.style.right = `${panelRect.right - rect.right}px`;

  dropdown.innerHTML = `
    <button class="dropdown-action-btn" data-action="play-now">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      Play Now
    </button>
    <button class="dropdown-action-btn remove-action" data-action="remove">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
      Remove
    </button>
  `;

  dropdown.querySelector('[data-action="play-now"]').addEventListener('click', (ev) => {
    ev.stopPropagation();
    playQueueTrackNow(index);
    closeActiveDropdown();
  });

  dropdown.querySelector('[data-action="remove"]').addEventListener('click', (ev) => {
    ev.stopPropagation();
    removeQueueTrack(index);
    closeActiveDropdown();
  });

  queuePanel.appendChild(dropdown);
  activeDropdown = dropdown;

  document.addEventListener('click', closeActiveDropdownOutside);
}

function closeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
    document.removeEventListener('click', closeActiveDropdownOutside);
  }
}

function closeActiveDropdownOutside(e) {
  if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('.btn-queue-item-menu')) {
    closeActiveDropdown();
  }
}

function playQueueTrackNow(index) {
  const track = queue[index];
  if (!track) return;
  
  if (index !== 0) {
    queue.splice(index, 1);
    queue.unshift(track);
  }
  
  loadAndPlayTrack(0);
  renderQueueList();
  showToast(`Playing Now: ${track.title}`);
}

function removeQueueTrack(index) {
  const track = queue[index];
  if (!track) return;
  
  queue.splice(index, 1);
  
  if (index === currentTrackIndex) {
    if (queue.length === 0) {
      audio.pause();
      isPlaying = false;
      currentTrackIndex = 0;
      updatePlaybackUI();
    } else {
      const nextIndex = Math.min(index, queue.length - 1);
      loadAndPlayTrack(nextIndex);
    }
  } else if (index < currentTrackIndex) {
    currentTrackIndex--;
  }
  
  renderQueueList();
  showToast(`Removed from Queue: ${track.title}`);
}

// iOS style Hold (1s) & Drag Reordering
let dragTimeout = null;
let isDraggingQueue = false;
let dragStartIndex = -1;
let dragActiveElement = null;
let touchStartY = 0;
let touchStartX = 0;

function setupQueueDragEvents(item) {
  item.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
    dragStartIndex = parseInt(item.dataset.index);
    dragActiveElement = item;

    if (dragTimeout) clearTimeout(dragTimeout);

    // iOS style 1 second hold threshold to drag
    dragTimeout = setTimeout(() => {
      isDraggingQueue = true;
      item.classList.add('held-active');
      
      // Haptic physical vibration feedback if available
      if ('vibrate' in navigator) navigator.vibrate(15);

      document.querySelectorAll('.queue-item').forEach((el, idx) => {
        if (idx !== dragStartIndex) {
          el.classList.add('dragging-ghost');
        }
      });
    }, 1000);
  }, { passive: true });

  item.addEventListener('touchmove', (e) => {
    if (!dragActiveElement) return;
    const touch = e.touches[0];
    const diffY = touch.clientY - touchStartY;
    const diffX = touch.clientX - touchStartX;

    if (!isDraggingQueue) {
      // Cancel the hold-to-drag if user moves significant distance before 1s
      if (Math.abs(diffY) > 8 || Math.abs(diffX) > 8) {
        clearTimeout(dragTimeout);
      }
      return;
    }

    e.preventDefault(); // Prevent page scroll while dragging
    dragActiveElement.style.transform = `translateY(${diffY}px) scale(1.04)`;
  }, { passive: false });

  item.addEventListener('touchend', (e) => {
    if (dragTimeout) clearTimeout(dragTimeout);

    if (isDraggingQueue) {
      isDraggingQueue = false;
      dragActiveElement.classList.remove('held-active');
      dragActiveElement.style.transform = '';

      document.querySelectorAll('.queue-item').forEach(el => {
        el.classList.remove('dragging-ghost');
      });

      const touch = e.changedTouches[0];
      const hoverEl = getQueueItemUnderPointer(touch.clientX, touch.clientY);
      if (hoverEl) {
        const dropIndex = parseInt(hoverEl.dataset.index);
        if (dropIndex !== dragStartIndex) {
          reorderQueue(dragStartIndex, dropIndex);
        }
      } else {
        renderQueueList();
      }
    }

    dragActiveElement = null;
    dragStartIndex = -1;
  });
}

function getQueueItemUnderPointer(x, y) {
  if (dragActiveElement) {
    const prevDisplay = dragActiveElement.style.display;
    dragActiveElement.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    dragActiveElement.style.display = prevDisplay;
    return el ? el.closest('.queue-item') : null;
  }
  return null;
}

function reorderQueue(fromIndex, toIndex) {
  const item = queue.splice(fromIndex, 1)[0];
  queue.splice(toIndex, 0, item);

  if (currentTrackIndex === fromIndex) {
    currentTrackIndex = toIndex;
  } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
    currentTrackIndex--;
  } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
    currentTrackIndex++;
  }

  renderQueueList();

  // If dropped on index 0 (1st position), start playing immediately!
  if (toIndex === 0) {
    loadAndPlayTrack(0);
  }

  showToast('Queue reordered');
}

function renderModalSongsList(songsToRender) {
  modalSongsList.innerHTML = '';

  if (songsToRender.length === 0) {
    modalSongsList.innerHTML = '<div class="empty-state"><p>No songs found</p></div>';
    return;
  }

  songsToRender.forEach(track => {
    const item = document.createElement('div');
    item.className = 'modal-song-item';

    let artworkImg = `<div class="modal-song-artwork flex-center" style="display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="opacity: 0.5;"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>`;
    if (track.artwork) {
      artworkImg = `<img src="${track.artwork}" alt="Art" class="modal-song-artwork">`;
    }

    item.innerHTML = `
      ${artworkImg}
      <div class="modal-song-info">
        <div class="modal-song-title">${escapeHTML(track.title)}</div>
        <div class="modal-song-artist">${escapeHTML(track.artist)}</div>
      </div>
      <button class="btn-modal-add" data-id="${track.id}" aria-label="Add to Queue">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    `;

    const addBtn = item.querySelector('.btn-modal-add');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addSongToQueueById(track.id);
    });

    modalSongsList.appendChild(item);
  });
}

function addSongToQueueById(trackId) {
  const song = tracks.find(t => t.id === trackId);
  if (song) {
    queue.push(song);
    renderQueueList();
    showToast(`Added to Queue: ${song.title}`);
  }
}

// Queue panel event bindings
queueToggleBtn.addEventListener('click', () => {
  closeActiveDropdown();
  queuePanel.classList.toggle('active');
  if (queuePanel.classList.contains('active')) {
    renderQueueList();
  }
});

queueCloseBtn.addEventListener('click', () => {
  closeActiveDropdown();
  queuePanel.classList.remove('active');
});

queueAddBtn.addEventListener('click', () => {
  queueAddBtn.classList.add('spinning');
  setTimeout(() => {
    queueAddBtn.classList.remove('spinning');
    queueSelectModal.classList.remove('hidden');
    
    // Reset to choice tab on open
    btnChooseImported.click();
    
    renderModalSongsList(tracks);
    modalSearchInput.value = '';
  }, 550);
});

modalCloseBtn.addEventListener('click', () => {
  queueSelectModal.classList.add('hidden');
});

modalSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderModalSongsList(tracks);
    return;
  }
  const filtered = tracks.filter(t => 
    t.title.toLowerCase().includes(query) || 
    t.artist.toLowerCase().includes(query)
  );
  renderModalSongsList(filtered);
});

// Segmented Button Tab Switch Event Listeners
btnChooseImported.addEventListener('click', () => {
  btnChooseImported.classList.add('active');
  btnImportNew.classList.remove('active');
  segmentedSlider.style.transform = 'translateX(0)';
  contentChooseImported.classList.remove('hidden');
  contentImportNew.classList.add('hidden');
});

btnImportNew.addEventListener('click', () => {
  btnImportNew.classList.add('active');
  btnChooseImported.classList.remove('active');
  segmentedSlider.style.transform = 'translateX(100%)';
  contentImportNew.classList.remove('hidden');
  contentChooseImported.classList.add('hidden');
});

// Direct File Selector bindings
btnModalFileTrigger.addEventListener('click', () => {
  modalFileInput.click();
});

modalFileInput.addEventListener('change', (e) => {
  importSongsFromModal(e.target.files);
});

// Modal direct file parsing & storage pipeline
async function importSongsFromModal(files) {
  if (files.length === 0) return;
  
  showToast(`Parsing ${files.length} imported song(s)...`);
  let importedCount = 0;
  const newSongs = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const id = 'song_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    try {
      const songInfo = await parseSongMetadata(file, id);
      await saveSongToDB(songInfo);
      importedCount++;
      newSongs.push(songInfo);
    } catch (err) {
      console.error('Failed to parse metadata for:', file.name, err);
      try {
        const fallbackInfo = makeFallbackSongData(file, id);
        await saveSongToDB(fallbackInfo);
        importedCount++;
        newSongs.push(fallbackInfo);
      } catch (fallbackErr) {
        console.error('Ultimate fallback failed for:', file.name, fallbackErr);
      }
    }
  }

  showToast(`Successfully added ${importedCount} song(s)`);
  
  // Reload dashboard library
  await loadLibrary();
  
  // Auto-append newly imported files to the active queue
  newSongs.forEach(song => {
    const dbSong = tracks.find(t => t.id === song.id);
    if (dbSong) {
      queue.push(dbSong);
    } else {
      queue.push(song);
    }
  });

  renderQueueList();
  
  // Reset active tab back to choose view and render
  btnChooseImported.click();
  
  modalFileInput.value = '';
}

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
  toast.className = 'toast glass glass-clear';
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Auto remove toast after 2 seconds active + 300ms transition
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2000);
}
