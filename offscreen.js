// Offscreen Audio Player Script
// Este script se ejecuta en un documento offscreen y maneja la reproducción de audio.

const sounds = {};
const pendingSounds = new Map();
const stoppedIds = new Set();

// Escuchar mensajes del Service Worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target && request.target !== 'offscreen') {
    return;
  }
  if (request.action === 'playSound') {
    playSound(request.id, request.url, request.loop || false);
  } else if (request.action === 'stopSound') {
    stopSound(request.id);
  }
});

// Función para reproducir un sonido
function playSound(id, url, loop) {
  stoppedIds.delete(id);
  const sound = sounds[id];
  
  if (sound && sound.src) {
    if (!sound.paused) {
      if (sound.currentTime < 0.2) {
        console.log("Ignoring fast replay: " + id);
        return;
      }
      sound.pause();
      sound.currentTime = 0;
    }
    sound.loop = !!loop;
    sound.play().catch(e => console.log("Play error: " + e));
  } else {
    if (pendingSounds.has(id)) {
      return;
    }
    // Si el sonido no está cargado, cargarlo y reproducirlo
    loadAndPlaySound(id, url, loop);
  }
}

// Función para cargar y reproducir un sonido
function loadAndPlaySound(id, url, loop, onEnded) {
  const audio = new Audio();
  audio.id = id;
  pendingSounds.set(id, audio);
  audio.onerror = function() {
    if (pendingSounds.get(id) === audio) {
      pendingSounds.delete(id);
    }
    console.log("Failed to load and play sound: " + id + " - " + url);
  };
  audio.addEventListener("canplay", function() {
    if (pendingSounds.get(id) !== audio) {
      return;
    }
    pendingSounds.delete(id);
    if (stoppedIds.has(id)) {
      return;
    }
    console.log("Loaded and playing sound: " + id + " (loop: " + loop + ")");
    sounds[id] = audio;
    audio.loop = loop || false;
    
    if (!loop && onEnded) {
      audio.onended = onEnded;
    }
    
    audio.play().catch(e => console.log("Play error: " + e));
  }, false);
  audio.src = url;
  audio.load();
}

// Función para detener un sonido
function stopSound(id) {
  stoppedIds.add(id);
  const pending = pendingSounds.get(id);
  if (pending) {
    pendingSounds.delete(id);
    pending.pause();
    pending.removeAttribute("src");
    pending.load();
  }
  const sound = sounds[id];
  if (sound) {
    sound.loop = false;
    sound.pause();
    sound.currentTime = 0;
  }
}
