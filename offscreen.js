// Offscreen audio controller for MV3
// Receives messages from the service worker to play/stop sounds.

(function() {
  var baseUrl = "https://dl.google.com/dl/chrome/extensions/audio/";
  var sounds = {};
  var mappings = {};
  var DEBUG_LOGGING = true;
  function dlog() {
    if (!DEBUG_LOGGING) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[OFFSCREEN]");
    console.log.apply(console, args);
  }

  function safeSendMessage(message) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message);
      }
    } catch (e) {
      // Swallow; offscreen context might be initializing
    }
  }

  function loadSoundIfNeeded(id, fileOrDataUrl) {
    var audio = sounds[id];
    if (audio && audio.src) return audio;
    audio = new Audio();
    audio.id = id;
    audio.preload = "auto";
    // Accept a full data URL (for custom sounds) or a relative file
    if (fileOrDataUrl && /^data:/.test(fileOrDataUrl)) {
      audio.src = fileOrDataUrl;
    } else {
      audio.src = baseUrl + fileOrDataUrl;
    }
    audio.addEventListener("ended", function() {
      dlog("ended", id);
      safeSendMessage({ type: "audioEnded", id: id });
    });
    audio.onerror = function() {
      dlog("error", id);
      safeSendMessage({ type: "audioLoadError", id: id });
    };
    sounds[id] = audio;
    return audio;
  }

  function handleMessage(message) {
    if (!message || !message.type) return;
    if (message.type === "init") {
      baseUrl = message.baseUrl || baseUrl;
      mappings = message.mappings || {};
      dlog("received init; mapping count:", Object.keys(mappings).length);
      // Precreate audio elements to warm cache
      Object.keys(mappings).forEach(function(id) {
        loadSoundIfNeeded(id, mappings[id]);
      });
    } else if (message.type === "play") {
      var id = message.id;
      var loop = !!message.loop;
      var file = message.src || mappings[id];
      if (!file) {
        dlog("no playable source for", id);
        return;
      }
      var audio = sounds[id];
      dlog("play", id, "loop=", loop, file && (String(file).substring(0,5)==='data:'?'[dataURL]':file));
      if (!audio) {
        if (!file) return;
        audio = loadSoundIfNeeded(id, file);
      }
      // If the source changed (custom uploaded), update src
      if (file && audio) {
        if (/^data:/.test(file)) {
          if (audio.src !== file) audio.src = file;
        } else {
          var target = baseUrl + file;
          if (audio.src !== target) audio.src = target;
        }
      }
      if (!audio) return;
      // Always restart the sound when asked to play again
      try { audio.pause(); } catch(e) {}
      try { audio.currentTime = 0; } catch(e) {}
      audio.loop = loop;
      var playPromise = audio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function(err){ dlog("audio.play() error", id, err && err.message); });
      }
    } else if (message.type === "stop") {
      var id = message.id;
      dlog("stop", id);
      var audio = sounds[id];
      if (audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // Notify service worker that offscreen is ready to receive messages
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    try { dlog("sending offscreenReady"); chrome.runtime.sendMessage({ type: "offscreenReady" }); } catch (e) {}
  }
})();


