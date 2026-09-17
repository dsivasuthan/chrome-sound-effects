// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed catalog of sounds shipped with the extension. Storage only keeps the
// user's enabled/disabled choice; it must not determine which rows are shown.
const soundCatalog = [
  "about:crash",
  "about:histograms",
  "about:memory",
  "bookmarkCreated",
  "bookmarkMoved",
  "bookmarkRemoved",
  "chrome://extensions/",
  "http://news.google.com/",
  "http://www.bing.com/",
  "http://www.google.ca/",
  "http://www.google.co.uk/",
  "http://www.google.com.au/",
  "http://www.google.com.my/",
  "http://www.google.com/appserve/fiberrfi/",
  "keypress",
  "lively.com",
  "resize",
  "scroll",
  "scotland",
  "seattle",
  "startup",
  "tab0",
  "tab1",
  "tab2",
  "tab3",
  "tab4",
  "tab5",
  "tab6",
  "tabAttached",
  "tabCreated",
  "tabDetached",
  "tabMoved",
  "tabNavigated",
  "tabRemoved",
  "tabSelectionChanged",
  "windowCreated",
  "windowCreatedIncognito",
  "windowFocusChanged"
];

// Function to send a sound play request to the background
function sendPlaySound(id) {
  chrome.runtime.sendMessage({ action: "previewSound", id: id });
}

// Function to send a sound stop request to the background
function sendStopSound(id) {
  chrome.runtime.sendMessage({ action: "stopSound", id: id });
}

// Function to handle sound toggle
function soundChanged(event) {
  var key = event.target.name;
  var checked = event.target.checked;
  if (checked) {
    chrome.storage.local.set({ [key]: "enabled" });
    sendPlaySound(key);
  } else {
    chrome.storage.local.set({ [key]: "disabled" });
    sendStopSound(key);
  }
}

// Function to show sounds in the UI
function showSounds() {
  var soundsDiv = document.getElementById("sounds");
  chrome.storage.local.get(null, function(items) {
    soundsDiv.replaceChildren();
    var heading = document.createElement("div");
    heading.innerText = "Available sounds (uncheck to disable):";
    soundsDiv.appendChild(heading);

    var fragment = document.createDocumentFragment();
    for (const key of soundCatalog) {
      var div = document.createElement("div");
      var check = document.createElement("input");
      check.type = "checkbox";
      check.name = key;
      check.checked = items[key] !== "disabled";
      check.addEventListener("change", soundChanged);
      div.appendChild(check);
      var text = document.createElement("span");
      text.innerText = key;
      text.className = "sound";
      text.addEventListener("click", () => sendPlaySound(key));
      div.appendChild(text);
      fragment.appendChild(div);
    }
    soundsDiv.appendChild(fragment);
  });
}

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', showSounds);
document.addEventListener('focus', showSounds);
