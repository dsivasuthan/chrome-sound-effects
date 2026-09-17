// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/*
 * Background Service Worker for Chrome Sounds extension.
 * This tracks various events from Chrome and sends messages to the popup for audio playback.
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
  "tab6": "mando-7.mp3",
};

// Map of sounds that play in a continuous loop
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

// Base URL for sounds (temporary, will be replaced with custom sounds)
var base_url = "http://dl.google.com/dl/chrome/extensions/audio/";

// Map of event name to a validation function
var eventValidator = {
  "tabCreated": tabCreated,
  "tabNavigated": tabNavigated,
  "tabRemoved": tabRemoved,
  "tabSelectionChanged": tabSelectionChanged,
  "windowCreated": windowCreated,
  "windowFocusChanged": windowFocusChanged,
};

// Function to check if a sound should play
function shouldPlay(id, callback) {
  function checkEnabled(items) {
    var val = items[id];
    if (val && val != "enabled") {
      console.log(id + " disabled");
      if (callback) callback(false);
      return;
    }
    if (callback) callback(true);
  }

  if (id === "startup") {
    chrome.storage.local.get([id], checkEnabled);
    return;
  }

  // Persisted in session storage so sounds keep working after SW restarts (MV3).
  chrome.storage.session.get(["started"], function(session) {
    if (!session.started) {
      if (callback) callback(false);
      return;
    }
    chrome.storage.local.get([id], checkEnabled);
  });
}

// Function to mark a sound as played
function didPlay(id) {
  chrome.storage.local.get([id], function(items) {
    if (!items[id]) {
      chrome.storage.local.set({ [id]: "enabled" });
    }
  });
}

// Promise used to serialize concurrent offscreen-document creation attempts.
let creatingOffscreenDocument = null;

// Ensure the offscreen document exists before sending audio messages.
async function createOffscreenDocument() {
  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = (async () => {
      const offscreenUrl = chrome.runtime.getURL('offscreen.html');
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
      });

      if (existingContexts.length > 0) {
        return;
      }

      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Playing sound effects for browser events'
      });
      console.log("Offscreen document created");
    })();
  }

  try {
    await creatingOffscreenDocument;
  } catch (error) {
    console.error("Error creating offscreen document:", error);
    throw error;
  } finally {
    creatingOffscreenDocument = null;
  }
}

// Function to send a message to the offscreen document
async function sendToOffscreen(message) {
  try {
    await createOffscreenDocument();
    await chrome.runtime.sendMessage({ ...message, target: "offscreen" });
  } catch (e) {
    console.log("Error sending message to offscreen:", e);
  }
}

// Function to play a sound
function playSound(id, loop) {
  shouldPlay(id, function(canPlay) {
    if (!canPlay) return;

    const soundUrl = getSoundUrl(id);
    
    if (soundUrl) {
      sendToOffscreen({ 
        action: "playSound", 
        id: id, 
        url: soundUrl,
        loop: loop || false 
      });
    }
    didPlay(id);
  });
}

// Preview requests from the options page intentionally bypass the enabled
// state, so clicking a sound always lets the user hear what it is.
function previewSound(id) {
  const soundUrl = getSoundUrl(id);
  if (soundUrl) {
    sendToOffscreen({
      action: "playSound",
      id: id,
      url: soundUrl,
      loop: false
    });
  }
}

// Function to stop a sound
function stopSound(id) {
  sendToOffscreen({ action: "stopSound", id: id });
}

// Function to get the sound file for an ID
function getSoundFile(id) {
  for (var i = 0; i < soundLists.length; i++) {
    var list = soundLists[i];
    if (list[id]) {
      return list[id];
    }
  }
  return "";
}

function getSoundUrl(id) {
  const soundFile = getSoundFile(id);
  return soundFile ? base_url + soundFile : "";
}

// Pending synthetic events to suppress after Chrome creates/removes tabs or
// windows. Groups expire so a missing browser event cannot suppress a later,
// unrelated user action.
var eventSuppressions = [];
var selectedTabId = -1;
var selectedWindowId = -1;
var navSound = null;

// Restore transient coordination state when the service worker wakes up.
const runtimeStateReady = (async () => {
  try {
    const state = await chrome.storage.session.get([
      "eventSuppressions",
      "selectedTabId",
      "selectedWindowId",
      "navSound"
    ]);
    eventSuppressions = Array.isArray(state.eventSuppressions)
      ? state.eventSuppressions
      : [];
    selectedTabId = state.selectedTabId ?? -1;
    selectedWindowId = state.selectedWindowId ?? -1;
    navSound = state.navSound || null;
  } catch (error) {
    console.error("Error restoring runtime state:", error);
  }
})();

async function persistRuntimeState() {
  try {
    await chrome.storage.session.set({
      eventSuppressions,
      selectedTabId,
      selectedWindowId,
      navSound
    });
  } catch (error) {
    console.error("Error persisting runtime state:", error);
  }
}

function suppressNext(eventNames) {
  eventSuppressions.push({
    eventNames,
    createdAt: Date.now()
  });
  persistRuntimeState();
}

function eatEvent(name) {
  const now = Date.now();
  eventSuppressions = eventSuppressions.filter(
    (group) => now - group.createdAt < 2000
  );
  const groupIndex = eventSuppressions.findIndex(
    (group) => group.eventNames.includes(name)
  );
  if (groupIndex === -1) {
    return false;
  }
  eventSuppressions.splice(groupIndex, 1);
  console.log("Ate event: " + name);
  persistRuntimeState();
  return true;
}

function soundEvent(event, name) {
  if (event) {
    var validator = eventValidator[name];
    if (validator) {
      event.addListener(async function() {
        await runtimeStateReady;
        console.log("Handling custom event: " + name);
        if (validator.apply(this, arguments)) {
          playSound(name);
        }
      });
    } else {
      event.addListener(async function() {
        await runtimeStateReady;
        console.log("Handling event: " + name);
        if (eatEvent(name)) {
          return;
        }
        playSound(name);
      });
    }
  } else {
    console.log("No event for " + name);
  }
}

function stopNavSound() {
  if (navSound) {
    stopSound(navSound);
    navSound = null;
    persistRuntimeState();
  }
}

function playNavSound(id) {
  stopNavSound();
  navSound = id;
  persistRuntimeState();
  playSound(id);
}

function tabNavigated(tabId, changeInfo, tab) {
  stopSound("keypress");
  if (changeInfo.status != "complete") {
    return false;
  }
  if (!tab || typeof tab.url !== "string") {
    console.warn("Tab navigation completed without a usable URL:", tabId);
    return false;
  }
  if (eatEvent("tabNavigated")) {
    return false;
  }
  console.log("Tab navigated to: " + tab.url);
  stopNavSound();
  
  var re = /https?:\/\/([^\/:]*)[^\?]*\??(.*)/i;
  var match = re.exec(tab.url);
  if (match) {
    if (match.length == 3) {
      var query = match[2];
      var parts = query.split("&");
      for (var i in parts) {
        if (parts[i].indexOf("q=") == 0) {
          var q = decodeURIComponent(parts[i].substring(2));
          q = q.replace("+", " ");
          console.log("Query: " + q);
          var words = q.split(" ");
          for (var j in words) {
            if (searchSounds[words[j]]) {
              console.log("Search sound: " + words[j]);
              playNavSound(words[j]);
              return false;
            }
          }
          break;
        }
      }
    }
    if (match.length >= 2) {
      var hostname = match[1];
      if (hostname) {
        var parts = hostname.split(".");
        if (parts.length > 1) {
          var tld2 = parts.slice(-2).join(".");
          var tld3 = parts.slice(-3).join(".");
          var sound = urlSounds[tld2];
          if (sound) {
            playNavSound(tld2);
            return false;
          }
          sound = urlSounds[tld3];
          if (sound) {
            playNavSound(tld3);
            return false;
          }
        }
      }
    }
  }
  var url = tab.url;
  var query = url.indexOf("?");
  if (query > 0) {
    url = tab.url.substring(0, query);
  }
  console.log("Checking URL: " + url);
  var sound = urlSounds[url];
  if (sound) {
    playNavSound(url);
    return false;
  }
  return true;
}

function tabSelectionChanged(activeInfo) {
  stopSound("keypress");
  var tabId = activeInfo.tabId;
  selectedTabId = tabId;
  persistRuntimeState();
  if (eatEvent("tabSelectionChanged"))
    return false;
  
  var count = 7;
  chrome.tabs.get(tabId, function(tab) {
    if (chrome.runtime.lastError || !tab) {
      console.warn("Unable to read activated tab:", tabId);
      return;
    }
    var index = tab.index % count;
    playSound("tab" + index);
  });
  return false;
}

function tabCreated(tab) {
  if (eatEvent("tabCreated")) {
    return false;
  }
  suppressNext(["tabNavigated", "tabSelectionChanged"]);
  return true;
}

function tabRemoved(tabId) {
  if (eatEvent("tabRemoved")) {
    return false;
  }
  if (tabId == selectedTabId) {
    suppressNext(["tabSelectionChanged"]);
    stopNavSound();
  }
  return true;
}

function windowCreated(window) {
  if (eatEvent("windowCreated")) {
    return false;
  }
  suppressNext(["tabNavigated"]);
  suppressNext(["tabSelectionChanged"]);
  suppressNext(["windowFocusChanged"]);
  if (window.incognito) {
    playSound("windowCreatedIncognito");
    return false;
  }
  return true;
}

function windowFocusChanged(windowId) {
  stopSound("keypress");
  if (windowId == selectedWindowId) {
    return false;
  }
  selectedWindowId = windowId;
  persistRuntimeState();
  if (eatEvent("windowFocusChanged")) {
    return false;
  }
  return true;
}

// Register event listeners
console.log("Registering event listeners...");
// Register each event manually to avoid prototype issues
soundEvent(chrome.tabs.onCreated, "tabCreated");
soundEvent(chrome.tabs.onMoved, "tabMoved");
soundEvent(chrome.tabs.onRemoved, "tabRemoved");
soundEvent(chrome.tabs.onActivated, "tabSelectionChanged");
soundEvent(chrome.tabs.onAttached, "tabAttached");
soundEvent(chrome.tabs.onDetached, "tabDetached");
soundEvent(chrome.tabs.onUpdated, "tabNavigated");
soundEvent(chrome.windows.onCreated, "windowCreated");
soundEvent(chrome.windows.onFocusChanged, "windowFocusChanged");
soundEvent(chrome.bookmarks.onCreated, "bookmarkCreated");
soundEvent(chrome.bookmarks.onMoved, "bookmarkMoved");
soundEvent(chrome.bookmarks.onRemoved, "bookmarkRemoved");
console.log("All event listeners registered");

async function markExtensionStarted() {
  await chrome.storage.session.set({ started: true });
  await createOffscreenDocument();
  playSound("startup");
}

// Create the offscreen document when the browser starts
chrome.runtime.onStartup.addListener(() => {
  markExtensionStarted();
});

// Also when the extension is installed or reloaded
chrome.runtime.onInstalled.addListener(() => {
  markExtensionStarted();
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message in background:", request);
  if (request.action === "previewSound" && request.id) {
    previewSound(request.id);
    return;
  }
  if (request.eventName) {
    console.log("Event name:", request.eventName, "Value:", request.eventValue);
    // Handle messages from content scripts
    if (contentSounds[request.eventName]) {
      console.log("Playing content sound:", request.eventName);
      if (request.eventValue === "started") {
        playSound(request.eventName, true);
      } else if (request.eventValue === "stopped") {
        stopSound(request.eventName);
      } else {
        // Play once if no value or value is empty
        playSound(request.eventName, false);
      }
    } else {
      console.log("No sound defined for event:", request.eventName);
    }
  }
});
