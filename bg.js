// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 * Service worker for Chrome Sounds extension (Manifest V3).
 * Tracks Chrome events and coordinates audio playback via an offscreen
 * document, since service workers cannot play audio directly.
 */

// Map of hostname suffixes or URLs without query params to sounds.
var urlSounds = {
  "http://www.google.ca/": "canadian-hello.mp3",
  "about:histograms": "time-passing.mp3",
  "about:memory": "transform!.mp3",
  "about:crash": "sadtrombone.mp3",
  "chrome://extensions/": "beepboop.mp3",
  "http://www.google.com.au/": "didgeridoo.mp3",
  "http://www.google.com.my/": "my_subway.mp3",
  "http://www.google.com/appserve/fiberrfi/": "dialup.mp3",
  "lively.com": "cricket.mp3",
  "http://www.google.co.uk/": "mind_the_gap.mp3",
  "http://news.google.com/": "news.mp3",
  "http://www.bing.com/": "sonar.mp3",
};

// Map of query parameter words to sounds.
var searchSounds = {
  "scotland": "bagpipe.mp3",
  "seattle": "rain.mp3",
};

// Map of tab numbers to notes on a scale.
var tabNoteSounds = {
  "tab0": "mando-1.mp3",
  "tab1": "mando-2.mp3",
  "tab2": "mando-3.mp3",
  "tab3": "mando-4.mp3",
  "tab4": "mando-5.mp3",
  "tab5": "mando-6.mp3",
  "tab6": "mando-7.mp3"
};

// Map of sounds that play in a continuous loop while an event is happening
// in the content area (e.g. "keypress" while start and keep looping while
// the user keeps typing).
var contentSounds = {
  "keypress": "typewriter-1.mp3",
  "resize": "harp-transition-2.mp3",
  "scroll": "shepard.mp3"
};

// Map of events to their default sounds
var eventSounds = {
  "tabCreated": "conga1.mp3",
  "tabMoved": "bell-transition.mp3",
  "tabRemoved": "smash-glass-1.mp3",
  "tabSelectionChanged": "click.mp3",
  "tabAttached": "whoosh-15.mp3",
  "tabDetached": "sword-shrill.mp3",
  "tabNavigated": "click.mp3",
  "windowCreated": "bell-small.mp3",
  "windowFocusChanged": "click.mp3",
  "bookmarkCreated": "bubble-drop.mp3",
  "bookmarkMoved": "thud.mp3",
  "bookmarkRemoved": "explosion-6.mp3",
  "windowCreatedIncognito": "weird-wind1.mp3",
  "startup": "whoosh-19.mp3"
};

var soundLists = [urlSounds, searchSounds, eventSounds, tabNoteSounds, contentSounds];

// Events intentionally skipped:
// chrome.windows.onRemoved - can't suppress the tab removed that comes first
var events = {
  "tabCreated": chrome.tabs.onCreated,
  "tabMoved": chrome.tabs.onMoved,
  "tabRemoved": chrome.tabs.onRemoved,
  // MV2 onSelectionChanged -> MV3 onActivated
  "tabSelectionChanged": chrome.tabs.onActivated,
  "tabAttached": chrome.tabs.onAttached,
  "tabDetached": chrome.tabs.onDetached,
  "tabNavigated": chrome.tabs.onUpdated,
  "windowCreated": chrome.windows.onCreated,
  "windowFocusChanged": chrome.windows.onFocusChanged,
  "bookmarkCreated": chrome.bookmarks.onCreated,
  "bookmarkMoved": chrome.bookmarks.onMoved,
  "bookmarkRemoved": chrome.bookmarks.onRemoved
};

var eventValidator = {
  "tabCreated": tabCreated,
  "tabNavigated": tabNavigated,
  "tabRemoved": tabRemoved,
  "tabSelectionChanged": tabSelectionChanged,
  "windowCreated": windowCreated,
  "windowFocusChanged": windowFocusChanged,
};

var started = true;
var DEBUG_LOGGING = true;
function dlog() {
  if (!DEBUG_LOGGING) return;
  var args = Array.prototype.slice.call(arguments);
  args.unshift("[BG]");
  console.log.apply(console, args);
}

// Storage helpers (MV3: no localStorage in service worker)
function storageGet(key) {
  return new Promise(function(resolve) {
    chrome.storage.local.get(key, function(items) { resolve(items[key]); });
  });
}

function storageSet(key, value) {
  return new Promise(function(resolve) {
    var obj = {}; obj[key] = value; chrome.storage.local.set(obj, function() { resolve(); });
  });
}

async function shouldPlay(id) {
  if (id !== "startup" && !started)
    { if (DEBUG_LOGGING) dlog("shouldPlay false: not started yet for", id); return false; }
  var val = await storageGet(id);
  if (val && val !== "enabled") {
    if (DEBUG_LOGGING) dlog(id + " disabled via storage value:", val);
    return false;
  }
  if (DEBUG_LOGGING) dlog("shouldPlay true for", id);
  return true;
}

async function didPlay(id) {
  var existing = await storageGet(id);
  if (!existing)
    await storageSet(id, "enabled");
}

// Offscreen document coordination
var OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
var base_url = "https://dl.google.com/dl/chrome/extensions/audio/";

var offscreenIsReady = false;
var pendingMessages = [];
// Track only looping content sounds to resume after offscreen restarts
var loopableIds = (function(){ var s = {}; for (var k in contentSounds) { s[k] = true; } return s; })();
var currentlyLooping = {};

function safeSendMessage(message) {
  try {
    // Allow init to go through any time; only queue play/stop when offscreen not ready
    if (!offscreenIsReady && (message && (message.type === "play" || message.type === "stop"))) {
      pendingMessages.push(message);
      if (DEBUG_LOGGING) dlog("queued message", message.type, "for id", message.id, "queueLen=", pendingMessages.length);
      return;
    }
    if (DEBUG_LOGGING) dlog("sending message", message.type, "for id", message.id);
    chrome.runtime.sendMessage(message, function() {
      // Swallow connection errors (offscreen not yet ready)
      var err = chrome.runtime.lastError;
      if (err && DEBUG_LOGGING) dlog("sendMessage lastError:", err.message);
    });
  } catch (e) {
    // ignore
  }
}

var customSites = [];
chrome.storage.local.get("customSites", function(items) {
  if (items && items.customSites) {
    customSites = items.customSites;
    if (DEBUG_LOGGING) dlog("loaded customSites on startup:", customSites.length);
  }
});

function resolveSoundSource(id) {
  return new Promise(function(resolve) {
    chrome.storage.local.get(null, function(items) {
      items = items || {};
      var custom = items["customSound:" + id];
      if (custom) {
        resolve(custom);
        return;
      }
      var sites = items.customSites || customSites || [];
      for (var i = 0; i < sites.length; i++) {
        if (sites[i].pattern === id && sites[i].sound) {
          resolve(sites[i].sound);
          return;
        }
      }
      // Search default mappings
      for (var list in soundLists) {
        if (soundLists[list].hasOwnProperty(id)) {
          resolve(soundLists[list][id]);
          return;
        }
      }
      resolve(null);
    });
  });
}

async function ensureOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    try {
      var has = await chrome.offscreen.hasDocument();
      if (DEBUG_LOGGING) dlog("offscreen.hasDocument() ->", has);
      if (!has) {
        if (DEBUG_LOGGING) dlog("creating offscreen document (hasDocument=false)");
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_DOCUMENT_PATH,
          reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
          justification: "Play extension sounds on browser events"
        });
        if (DEBUG_LOGGING) dlog("offscreen document created");
      }
    } catch (e) {
      // Fallback to create if hasDocument not available or throws
      try {
        if (DEBUG_LOGGING) dlog("creating offscreen document (fallback path)", e && e.message);
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_DOCUMENT_PATH,
          reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
          justification: "Play extension sounds on browser events"
        });
        if (DEBUG_LOGGING) dlog("offscreen document created (fallback)");
      } catch (e2) {
        // If it already exists, ignore.
        if (DEBUG_LOGGING) dlog("offscreen create failed/exists:", e2 && e2.message);
      }
    }
  } else if (chrome.offscreen) {
    try {
      if (DEBUG_LOGGING) dlog("creating offscreen document (no hasDocument API)");
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play extension sounds on browser events"
      });
    } catch (e3) {
      if (DEBUG_LOGGING) dlog("offscreen create failed/exists:", e3 && e3.message);
    }
  }
}

async function offscreenInit() {
  await ensureOffscreenDocument();
  var payload = { type: "init", baseUrl: base_url, mappings: {} };
  for (var list in soundLists) {
    for (var id in soundLists[list]) {
      payload.mappings[id] = soundLists[list][id];
    }
  }
  // Overlay any custom sounds from storage
  chrome.storage.local.get(null, function(items) {
    if (DEBUG_LOGGING) dlog("offscreenInit merging custom sounds. items count:", items ? Object.keys(items).length : 0);
    if (items) {
      var sites = items["customSites"] || customSites || [];
      for (var s = 0; s < sites.length; s++) {
        if (sites[s].pattern && sites[s].sound) {
          payload.mappings[sites[s].pattern] = sites[s].sound;
        }
      }
      for (var key in items) {
        if (key.indexOf("customSound:") === 0) {
          var soundId = key.substring("customSound:".length);
          payload.mappings[soundId] = items[key];
        }
      }
    }
    // Send init (do not reset readiness here; it can cause messages to queue indefinitely)
    if (DEBUG_LOGGING) dlog("sending init to offscreen with mapping count:", Object.keys(payload.mappings).length);
    safeSendMessage(payload);
    // Consider initialization complete even if startup sound is disabled
    started = true;
  });
}

async function playSound(id, loop) {
  if (!(await shouldPlay(id))) return;
  await didPlay(id);
  await ensureOffscreenDocument();
  var src = await resolveSoundSource(id);
  if (!src) return;
  if (DEBUG_LOGGING) dlog("playSound", id, "loop=", !!loop, "src=", src && (src.substring(0,5)==='data:'?'[dataURL]':src));
  safeSendMessage({ type: "play", id: id, loop: !!loop, src: src });
  if (loop && loopableIds[id]) {
    currentlyLooping[id] = true;
  } else {
    delete currentlyLooping[id];
  }
}

var previewTimeout = null;
async function previewSound(id) {
  await ensureOffscreenDocument();
  var src = await resolveSoundSource(id);
  if (!src) return;
  if (DEBUG_LOGGING) dlog("previewSound", id, "src=", src && (src.substring(0,5)==='data:'?'[dataURL]':src));
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  safeSendMessage({ type: "play", id: id, loop: false, src: src });
  // For looping / continuous sounds, stop after 4 seconds preview safety
  if (loopableIds[id]) {
    previewTimeout = setTimeout(function() {
      stopSound(id);
      previewTimeout = null;
    }, 4000);
  }
}

async function stopSound(id) {
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  await ensureOffscreenDocument();
  if (DEBUG_LOGGING) dlog("stopSound", id);
  safeSendMessage({ type: "stop", id: id });
  delete currentlyLooping[id];
}

// Event de-bouncing for cross-event noise
var eventsToEat = 0;
function eatEvent(name) {
  if (eventsToEat > 0) {
    if (DEBUG_LOGGING) console.log("ate event: " + name);
    eventsToEat--;
    return true;
  }
  return false;
}

function soundEvent(event, name) {
  if (event) {
    var validator = eventValidator[name];
    if (validator) {
      event.addListener(async function() {
        if (DEBUG_LOGGING) console.log("handling custom event: " + name);
        var canPlay = (eventsToEat == 0);
        var valid = await validator.apply(this, arguments);
        if (valid) {
          if (!canPlay) {
            if (DEBUG_LOGGING) console.log("ate event: " + name);
            eventsToEat--;
            return;
          }
          playSound(name);
        }
      });
    } else {
      event.addListener(function() {
        if (DEBUG_LOGGING) console.log("handling event: " + name);
        if (eatEvent(name)) {
          return;
        }
        playSound(name);
      });
    }
  } else {
    if (DEBUG_LOGGING) console.log("no event for " + name);
  }
}

var navSound;
async function stopNavSound() {
  if (navSound) {
    await stopSound(navSound);
    navSound = null;
  }
}

async function playNavSound(id) {
  await stopNavSound();
  navSound = id;
  await playSound(id);
}

function isSiteMatch(tabUrl, pattern, searchWords) {
  if (!tabUrl || !pattern) return false;
  var rawUrl = tabUrl.toLowerCase().trim();
  var pat = pattern.toLowerCase().trim();

  // Search words match
  if (searchWords && searchWords.length > 0 && searchWords.indexOf(pat) !== -1) {
    return true;
  }

  // Strip query string and trailing slashes for comparison
  var cleanUrl = rawUrl.split("?")[0].replace(/\/+$/, "");
  var cleanPat = pat.split("?")[0].replace(/\/+$/, "");

  // 1. Direct or prefix URL match
  if (cleanUrl === cleanPat || rawUrl.startsWith(pat) || cleanUrl.startsWith(cleanPat + "/")) {
    return true;
  }

  // 2. Extract hostnames (domain matching)
  var getHost = function(u) {
    var m = /https?:\/\/([^\/:]+)/i.exec(u);
    return m ? m[1].toLowerCase() : u.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  };
  var tabHost = getHost(rawUrl);
  var patHost = getHost(pat);

  if (tabHost && patHost) {
    if (tabHost === patHost || tabHost.endsWith("." + patHost)) {
      var patPath = pat.replace(/^https?:\/\//, "").replace(/^[^\/]+/, "").replace(/\/+$/, "");
      if (!patPath) return true;
      var tabPath = rawUrl.replace(/^https?:\/\//, "").replace(/^[^\/]+/, "").replace(/\/+$/, "");
      return tabPath.startsWith(patPath);
    }
  }
  return false;
}

async function tabNavigated(tabId, changeInfo, tab) {
  // Ensure any looping keypress is stopped if content script didn't get a chance.
  stopSound("keypress");
  if (changeInfo.status != "complete") {
    return false;
  }

  // Reliably get tab URL (even across worker wakeups)
  var currentUrl = (tab && tab.url) || (changeInfo && changeInfo.url) || "";
  if (!currentUrl && tabId) {
    try {
      var tabObj = await chrome.tabs.get(tabId);
      currentUrl = (tabObj && tabObj.url) || "";
    } catch (e) {}
  }
  if (!currentUrl) return false;

  if (navSound)
    stopSound(navSound);

  var re = /https?:\/\/([^\/:]*)[^\?]*\??(.*)/i;
  var match = re.exec(currentUrl);
  var hostname = "";
  var searchWords = [];

  if (match) {
    if (match.length >= 2 && match[1]) {
      hostname = match[1].toLowerCase();
    }
    if (match.length >= 3 && match[2]) {
      var query = match[2];
      var parts = query.split("&");
      for (var i in parts) {
        if (parts[i].indexOf("q=") == 0) {
          var q = decodeURIComponent(parts[i].substring(2)).replace("+", " ");
          searchWords = q.toLowerCase().split(" ");
          break;
        }
      }
    }
  }

  // Ensure customSites are loaded from storage if worker restarted
  var sites = customSites;
  if (!sites || sites.length === 0) {
    var stored = await storageGet("customSites");
    if (stored) {
      sites = stored;
      customSites = stored;
    }
  }

  // 1. Check user-added custom sites / Easter eggs first (NEVER eaten by eatEvent)
  if (sites && sites.length > 0) {
    for (var c = 0; c < sites.length; c++) {
      var item = sites[c];
      if (item && item.pattern && isSiteMatch(currentUrl, item.pattern, searchWords)) {
        if (DEBUG_LOGGING) dlog("custom site matched:", item.pattern, "for url:", currentUrl);
        await playNavSound(item.pattern);
        return false;
      }
    }
  }

  // 2. Check predefined search sounds (NEVER eaten by eatEvent)
  if (searchWords.length > 0) {
    for (var j in searchWords) {
      if (searchSounds[searchWords[j]]) {
        await playNavSound(searchWords[j]);
        return false;
      }
    }
  }

  // 3. Check predefined URL / domain sounds (NEVER eaten by eatEvent)
  if (hostname) {
    var parts = hostname.split(".");
    if (parts.length > 1) {
      var tld2 = parts.slice(-2).join(".");
      var tld3 = parts.slice(-3).join(".");
      var sound = urlSounds[tld2];
      if (sound) {
        await playNavSound(tld2);
        return false;
      }
      sound = urlSounds[tld3];
      if (sound) {
        await playNavSound(tld3);
        return false;
      }
    }
  }

  var cleanNavUrl = currentUrl;
  var qPos = cleanNavUrl.indexOf("?");
  if (qPos > 0) {
    cleanNavUrl = cleanNavUrl.substring(0, qPos);
  }
  var matchedUrlSound = urlSounds[cleanNavUrl];
  if (matchedUrlSound) {
    await playNavSound(cleanNavUrl);
    return false;
  }

  // 4. Default navigation sound: only play if not eaten by cross-event noise debouncing
  if (eatEvent("tabNavigated")) {
    return false;
  }

  return true;
}

var selectedTabId = -1;
function tabSelectionChanged(activeInfo) {
  // activeInfo: { tabId, windowId }
  var tabId = activeInfo && activeInfo.tabId ? activeInfo.tabId : activeInfo;
  selectedTabId = tabId;
  if (eatEvent("tabSelectionChanged"))
    return false;
  var count = 7;
  chrome.tabs.get(tabId, function(tab) {
    var index = tab.index % count;
    playSound("tab" + index);
  });
  return false;
}

function tabCreated(tab) {
  if (eatEvent("tabCreated")) {
    return false;
  }
  eventsToEat++;  // tabNavigated or tabSelectionChanged
  return true;
}

function tabRemoved(tabId) {
  if (eatEvent("tabRemoved")) {
    return false;
  }
  if (tabId == selectedTabId) {
    eventsToEat++;  // tabSelectionChanged
    stopNavSound();
  }
  return true;
}

function windowCreated(window) {
  if (eatEvent("windowCreated")) {
    return false;
  }
  eventsToEat += 3;  // tabNavigated, tabSelectionChanged, windowFocusChanged
  if (window.incognito) {
    playSound("windowCreatedIncognito");
    return false;
  }
  return true;
}

var selectedWindowId = -1;
function windowFocusChanged(windowId) {
  if (windowId == selectedWindowId) {
    return false;
  }
  selectedWindowId = windowId;
  if (eatEvent("windowFocusChanged")) {
    return false;
  }
  return true;
}

function contentScriptHandler(request) {
  if (contentSounds[request.eventName]) {
    if (request.eventValue == "started") {
      playSound(request.eventName, true);
    } else if (request.eventValue == "stopped") {
      stopSound(request.eventName);
    } else {
      playSound(request.eventName);
    }
  }
}

// Listen for messages from content scripts and options/offscreen
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (DEBUG_LOGGING) dlog("onMessage", message && message.type, message);
  if (!message || !message.type) return;
  if (message.type === "contentEvent") {
    contentScriptHandler(message);
  } else if (message.type === "optionsPreview" || message.type === "optionsPlay") {
    previewSound(message.id);
  } else if (message.type === "optionsStop") {
    stopSound(message.id);
  } else if (message.type === "offscreenReady") {
    offscreenIsReady = true;
    // Allow sounds immediately after offscreen is ready regardless of startup sound state
    started = true;
    // Flush any queued messages
    var queue = pendingMessages.slice();
    pendingMessages = [];
    if (DEBUG_LOGGING) dlog("offscreenReady; flushing queued messages:", queue.length);
    for (var i = 0; i < queue.length; i++) {
      safeSendMessage(queue[i]);
    }
    // Re-init mappings and resume any active sounds
    // Send fresh init without toggling readiness
    var payload = { type: "init", baseUrl: base_url, mappings: {} };
    for (var list in soundLists) {
      for (var id in soundLists[list]) {
        payload.mappings[id] = soundLists[list][id];
      }
    }
    chrome.storage.local.get(null, function(items) {
      for (var key in items) {
        if (key.indexOf("customSound:") === 0) {
          var soundId = key.substring("customSound:".length);
          payload.mappings[soundId] = items[key];
        }
      }
      if (DEBUG_LOGGING) dlog("sending init post-ready with mapping count:", Object.keys(payload.mappings).length);
      safeSendMessage(payload);
    });
    for (var id in currentlyLooping) {
      if (currentlyLooping[id]) {
        (async function(replayId) {
          var src = await resolveSoundSource(replayId);
          if (src) {
            if (DEBUG_LOGGING) dlog("resuming loop after offscreenReady:", replayId);
            safeSendMessage({ type: "play", id: replayId, loop: true, src: src });
          }
        })(id);
      }
    }
  } else if (message.type === "audioEnded") {
    if (message.id === "startup") {
      started = true;
    }
  } else if (message.type === "audioLoadError") {
    if (message.id === "startup") {
      started = true;
    }
  }
});

// Listen for dynamic settings changes and immediately stop disabled sounds
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName !== "local") return;
    if (changes["customSites"]) {
      customSites = changes["customSites"].newValue || [];
      if (DEBUG_LOGGING) dlog("storage changed: customSites updated, count:", customSites.length);
      offscreenInit();
    }
    for (var key in changes) {
      if (changes[key].newValue === "disabled") {
        if (DEBUG_LOGGING) dlog("storage changed: " + key + " disabled, stopping sound");
        stopSound(key);
      }
    }
  });
}

// Register event listeners
for (var name in events) {
  soundEvent(events[name], name);
  if (DEBUG_LOGGING) dlog("registered listener for", name);
}

// Inject content scripts into already-open tabs on install or update
async function injectContentScriptsIntoExistingTabs() {
  if (!chrome.scripting || !chrome.tabs) return;
  try {
    var tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (tab.id && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://") && !tab.url.startsWith("edge://")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"]
        }).catch(function(err) {
          // Tab may be discarded, restricted, or closing; ignore
        });
      }
    }
  } catch (e) {
    if (DEBUG_LOGGING) dlog("Error injecting content scripts:", e);
  }
}

// Initialize offscreen and play startup sound on worker start
if (chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(function(details) {
    if (DEBUG_LOGGING) dlog("onInstalled", details && details.reason);
    injectContentScriptsIntoExistingTabs();
  });
}
if (chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(function() {
    if (DEBUG_LOGGING) dlog("onStartup: playing startup sound");
    storageGet("startup").then(function(val) {
      if (!val || val === "enabled") {
        playSound("startup");
      }
    });
  });
}

offscreenInit();
