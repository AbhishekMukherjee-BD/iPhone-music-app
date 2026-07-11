# Noir Sound PWA

A premium, custom-built Progressive Web App (PWA) Music Player designed for **iOS Safari** and optimized for **iPhone 11 Pro Max**. 

Noir Sound allows you to import and play your local MP3 files completely **offline**, integrates with your **iOS Lock Screen & Control Center** (using the Media Session API) for background playback, and comes with two highly-detailed custom user interfaces.

---

## Features
* **Two Switchable Designs:**
  1. **Luxury Obsidian & Gold:** Premium cinematic black-and-gold aesthetic, translucent glassmorphism, pulsing gold drop-shadow glows, and tactile button-bounce/scale effects.
  2. **Apple Minimalist:** A classier, professional interface styled like Apple.com / Apple Music, featuring clean black block layouts, high-contrast typography, and sleek iOS-style controls.
* **Persistent Offline Storage:** Audio files are saved directly in your iPhone browser's local **IndexedDB** database. They play completely offline.
* **Lock Screen Control Integration:** Full metadata sync (song title, artist, and album art) showing up on the iOS lock screen with interactive playback buttons (Play, Pause, Skip, Prev, and Time Scrubbing).
* **Tactile Interactions:** Scale-down animations on button press for satisfying haptic feedback.
* **iOS Sheet Gesture:** Drag/swipe down from the top handle of the full-screen player panel to dismiss it back to the library view.

---

## How to Install and Use on Your iPhone 11 Pro Max

### Step 1: Start the Server on Your Mac
We have already started a server on your Mac. If you need to restart it later, run this command in your Mac terminal:
```bash
python3 -m http.server 8080
```

### Step 2: Open the App in Safari on Your iPhone
1. Find your Mac's **Local IP Address** (e.g., `192.168.1.15`). You can find this in **System Settings > Wi-Fi > Details** on your Mac.
2. Open **Safari** on your iPhone.
3. Type in the address: `http://<your-mac-ip>:8080` (for example, `http://192.168.1.15:8080`).

### Step 3: Add to Home Screen (Install PWA)
1. In Safari, tap the **Share** button (the square icon with an arrow pointing up at the bottom of the screen).
2. Scroll down and tap **"Add to Home Screen"**.
3. Tap **"Add"** in the top right corner.
4. The **Noir Sound** icon (your new custom image) will appear on your iPhone home screen.

### Step 4: Import and Play Music Offline
1. Turn off your Mac if you'd like! You no longer need it.
2. Open the **Noir Sound** app from your iPhone's home screen.
3. Tap the **"Import"** button in the top right.
4. Select your files:
   * iOS will open the native Files App.
   * Navigate to your **"music"** folder.
   * Tap the **"..."** button in the top right, tap **"Select"**, highlight the MP3 files you want to add, and tap **"Open"**.
5. Noir Sound will automatically extract the song title, artist, and album artwork, save them into your iPhone's database, and load them into your offline library!
6. Click any song to start playing!

### Step 5: Toggle Between Interfaces
* Tap the **Theme Icon** (Sun/Moon button) in the header.
* It will instantly swap between the **Luxury Obsidian & Gold** theme and the **Apple Minimalist** theme.
* Test both to see which layout, colors, and animations you prefer!
