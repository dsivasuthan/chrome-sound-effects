// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var AVAILABLE_SOUNDS = [
  "bell-small.mp3",
  "bell-transition.mp3",
  "bubble-drop.mp3",
  "click.mp3",
  "conga1.mp3",
  "cricket.mp3",
  "dialup.mp3",
  "didgeridoo.mp3",
  "explosion-6.mp3",
  "harp-transition-2.mp3",
  "mando-1.mp3",
  "mando-2.mp3",
  "mando-3.mp3",
  "mando-4.mp3",
  "mando-5.mp3",
  "mando-6.mp3",
  "mando-7.mp3",
  "mind_the_gap.mp3",
  "my_subway.mp3",
  "news.mp3",
  "rain.mp3",
  "sadtrombone.mp3",
  "shepard.mp3",
  "smash-glass-1.mp3",
  "sonar.mp3",
  "sword-shrill.mp3",
  "thud.mp3",
  "time-passing.mp3",
  "transform!.mp3",
  "typewriter-1.mp3",
  "weird-wind1.mp3",
  "whoosh-15.mp3",
  "whoosh-19.mp3",
  "beepboop.mp3",
  "bagpipe.mp3",
  "canadian-hello.mp3"
];

var PRESET_CATEGORIES = [
  {
    title: "In-Page Interaction Sounds",
    description: "Sounds played while typing or scrolling inside web pages",
    sounds: [
      { id: "keypress", name: "Typing / Keypress", defaultFile: "typewriter-1.mp3" },
      { id: "scroll", name: "Page Scroll", defaultFile: "shepard.mp3" },
      { id: "resize", name: "Window Resize", defaultFile: "harp-transition-2.mp3" }
    ]
  },
  {
    title: "Tab Events",
    description: "Sounds played during tab lifecycle and movement",
    sounds: [
      { id: "tabCreated", name: "Tab Created", defaultFile: "conga1.mp3" },
      { id: "tabRemoved", name: "Tab Closed / Removed", defaultFile: "smash-glass-1.mp3" },
      { id: "tabSelectionChanged", name: "Tab Selection Changed", defaultFile: "click.mp3" },
      { id: "tabNavigated", name: "Tab Navigation / Page Loaded", defaultFile: "click.mp3" },
      { id: "tabMoved", name: "Tab Moved / Reordered", defaultFile: "bell-transition.mp3" },
      { id: "tabAttached", name: "Tab Attached to Window", defaultFile: "whoosh-15.mp3" },
      { id: "tabDetached", name: "Tab Detached into New Window", defaultFile: "sword-shrill.mp3" }
    ]
  },
  {
    title: "Musical Tab Switching Notes",
    description: "Sequential mandolin notes when switching tabs (tabs 1–7)",
    sounds: [
      { id: "tab0", name: "Tab 1 Note (Do)", defaultFile: "mando-1.mp3" },
      { id: "tab1", name: "Tab 2 Note (Re)", defaultFile: "mando-2.mp3" },
      { id: "tab2", name: "Tab 3 Note (Mi)", defaultFile: "mando-3.mp3" },
      { id: "tab3", name: "Tab 4 Note (Fa)", defaultFile: "mando-4.mp3" },
      { id: "tab4", name: "Tab 5 Note (Sol)", defaultFile: "mando-5.mp3" },
      { id: "tab5", name: "Tab 6 Note (La)", defaultFile: "mando-6.mp3" },
      { id: "tab6", name: "Tab 7 Note (Ti)", defaultFile: "mando-7.mp3" }
    ]
  },
  {
    title: "Window & Bookmark Events",
    description: "Sounds played on window operations and bookmark changes",
    sounds: [
      { id: "windowCreated", name: "Window Opened", defaultFile: "bell-small.mp3" },
      { id: "windowFocusChanged", name: "Window Focus Changed", defaultFile: "click.mp3" },
      { id: "windowCreatedIncognito", name: "Incognito Window Opened", defaultFile: "weird-wind1.mp3" },
      { id: "bookmarkCreated", name: "Bookmark Created", defaultFile: "bubble-drop.mp3" },
      { id: "bookmarkMoved", name: "Bookmark Moved", defaultFile: "thud.mp3" },
      { id: "bookmarkRemoved", name: "Bookmark Deleted", defaultFile: "explosion-6.mp3" }
    ]
  },
  {
    title: "Browser & Easter Eggs",
    description: "Startup sound and special URLs/searches",
    sounds: [
      { id: "startup", name: "Browser Startup", defaultFile: "whoosh-19.mp3" },
      { id: "scotland", name: "Search: 'scotland'", defaultFile: "bagpipe.mp3" },
      { id: "seattle", name: "Search: 'seattle'", defaultFile: "rain.mp3" },
      { id: "chrome://extensions/", name: "URL: chrome://extensions/", defaultFile: "beepboop.mp3" },
      { id: "about:crash", name: "URL: about:crash", defaultFile: "sadtrombone.mp3" },
      { id: "about:histograms", name: "URL: about:histograms", defaultFile: "time-passing.mp3" },
      { id: "about:memory", name: "URL: about:memory", defaultFile: "transform!.mp3" },
      { id: "http://www.google.ca/", name: "URL: google.ca", defaultFile: "canadian-hello.mp3" },
      { id: "http://www.google.com.au/", name: "URL: google.com.au", defaultFile: "didgeridoo.mp3" },
      { id: "http://www.google.com.my/", name: "URL: google.com.my", defaultFile: "my_subway.mp3" },
      { id: "http://www.google.co.uk/", name: "URL: google.co.uk", defaultFile: "mind_the_gap.mp3" },
      { id: "http://news.google.com/", name: "URL: news.google.com", defaultFile: "news.mp3" },
      { id: "http://www.bing.com/", name: "URL: bing.com", defaultFile: "sonar.mp3" },
      { id: "lively.com", name: "URL: lively.com", defaultFile: "cricket.mp3" }
    ]
  }
];

function safeSendMessage(message) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message);
    }
  } catch (e) {}
}

var currentPreviewId = null;
var currentPreviewBtn = null;
var previewTimeout = null;
var previewAudio = null;

function stopCurrentPreview() {
  if (previewAudio) {
    try {
      previewAudio.pause();
      previewAudio.currentTime = 0;
    } catch (e) {}
    previewAudio = null;
  }
  if (currentPreviewId) {
    safeSendMessage({ type: "optionsStop", id: currentPreviewId });
    if (currentPreviewBtn) {
      currentPreviewBtn.textContent = "▶ Preview";
      currentPreviewBtn.classList.remove("playing");
    }
    currentPreviewId = null;
    currentPreviewBtn = null;
  }
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
}

function previewSound(id, btn, soundFile, customAudioUrl) {
  if (currentPreviewId === id) {
    stopCurrentPreview();
    return;
  }
  stopCurrentPreview();

  currentPreviewId = id;
  currentPreviewBtn = btn;
  btn.textContent = "⏹ Stop";
  btn.classList.add("playing");

  var audioSrc = customAudioUrl;
  if (!audioSrc && soundFile) {
    if (/^https?:\/\/|^data:/.test(soundFile)) {
      audioSrc = soundFile;
    } else {
      audioSrc = "https://dl.google.com/dl/chrome/extensions/audio/" + soundFile;
    }
  }

  if (audioSrc) {
    try {
      previewAudio = new Audio(audioSrc);
      previewAudio.onended = function() {
        stopCurrentPreview();
      };
      previewAudio.onerror = function() {
        stopCurrentPreview();
        showToast("Error playing preview sound");
      };
      var playPromise = previewAudio.play();
      if (playPromise && playPromise.catch) {
        playPromise.catch(function() {
          stopCurrentPreview();
        });
      }
    } catch (e) {
      stopCurrentPreview();
    }
  } else {
    // Fallback to background messaging if source is unknown
    safeSendMessage({ type: "optionsPreview", id: id });
  }

  // Safety timer to reset preview (e.g. continuous sounds)
  previewTimeout = setTimeout(function() {
    stopCurrentPreview();
  }, 4500);
}

function stopSound(id) {
  safeSendMessage({ type: "optionsStop", id: id });
}

function soundChanged(event) {
  var key = event.target.name;
  var checked = event.target.checked;
  if (checked) {
    chrome.storage.local.set({ [key]: "enabled" });
    showToast("Enabled sound for: " + key);
  } else {
    chrome.storage.local.set({ [key]: "disabled" });
    stopSound(key);
    showToast("Disabled sound for: " + key);
  }
}

function showToast(text) {
  var toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("visible");
  setTimeout(function() {
    toast.classList.remove("visible");
  }, 2200);
}

function createSoundRow(soundItem, items) {
  var key = soundItem.id;
  var isCustom = !!items["customSound:" + key];
  // Default is enabled unless explicitly set to "disabled"
  var isEnabled = items[key] !== "disabled";

  var row = document.createElement("div");
  row.className = "sound-row";

  var check = document.createElement("input");
  check.type = "checkbox";
  check.name = key;
  check.checked = isEnabled;
  check.title = isEnabled ? "Click to disable" : "Click to enable";
  check.onchange = soundChanged;
  row.appendChild(check);

  var labelGroup = document.createElement("div");
  labelGroup.className = "sound-label-group";

  var nameSpan = document.createElement("span");
  nameSpan.className = "sound-name";
  nameSpan.textContent = soundItem.name || key;
  labelGroup.appendChild(nameSpan);

  if (soundItem.defaultFile && !isCustom) {
    var fileSpan = document.createElement("span");
    fileSpan.className = "sound-file";
    fileSpan.textContent = soundItem.defaultFile;
    labelGroup.appendChild(fileSpan);
  }

  if (soundItem.isCustomSite) {
    var siteBadge = document.createElement("span");
    siteBadge.className = "site-badge";
    siteBadge.textContent = "Custom Site";
    labelGroup.appendChild(siteBadge);
  }

  if (isCustom) {
    var customBadge = document.createElement("span");
    customBadge.className = "custom-badge";
    customBadge.textContent = "Custom Sound";
    labelGroup.appendChild(customBadge);
  }

  row.appendChild(labelGroup);

  var actions = document.createElement("div");
  actions.className = "row-actions";

  var soundFile = soundItem.defaultFile || null;
  var customAudioUrl = items["customSound:" + key] || null;

  // Dedicated Play/Preview button
  var previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn-preview";
  previewBtn.textContent = (currentPreviewId === key) ? "⏹ Stop" : "▶ Preview";
  if (currentPreviewId === key) {
    previewBtn.classList.add("playing");
    currentPreviewBtn = previewBtn;
  }
  previewBtn.onclick = function() {
    previewSound(key, previewBtn, soundFile, customAudioUrl);
  };
  actions.appendChild(previewBtn);

  // File upload for custom audio
  var fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "file-input";
  fileInput.accept = "audio/*";
  fileInput.title = "Upload custom sound for " + key;
  fileInput.onchange = function(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function() {
      var obj = {};
      obj["customSound:" + key] = reader.result;
      chrome.storage.local.set(obj, function() {
        showToast("Custom sound saved for: " + key);
        renderCatalog();
      });
    };
    reader.readAsDataURL(f);
  };
  actions.appendChild(fileInput);

  if (isCustom) {
    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn-clear";
    clearBtn.textContent = "Clear";
    clearBtn.title = "Revert to default sound";
    clearBtn.onclick = function() {
      chrome.storage.local.remove("customSound:" + key, function() {
        showToast("Reverted to default sound for: " + key);
        renderCatalog();
      });
    };
    actions.appendChild(clearBtn);
  }

  if (soundItem.isCustomSite) {
    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-danger btn-remove";
    removeBtn.textContent = "🗑 Remove";
    removeBtn.title = "Delete this custom site";
    removeBtn.onclick = function() {
      chrome.storage.local.get("customSites", function(curr) {
        var list = (curr && curr.customSites) || [];
        list = list.filter(function(s) { return s.pattern !== key; });
        chrome.storage.local.set({ customSites: list }, function() {
          chrome.storage.local.remove([key, "customSound:" + key], function() {
            showToast("Removed custom site: " + key);
            renderCatalog();
          });
        });
      });
    };
    actions.appendChild(removeBtn);
  }

  row.appendChild(actions);
  return row;
}

function renderCatalog() {
  var container = document.getElementById("sounds-container");
  if (!container) return;

  chrome.storage.local.get(null, function(items) {
    items = items || {};
    container.textContent = "";

    var knownKeys = {};

    PRESET_CATEGORIES.forEach(function(cat) {
      var card = document.createElement("div");
      card.className = "category-card";

      var header = document.createElement("div");
      header.className = "category-header";

      var title = document.createElement("h2");
      title.className = "category-title";
      title.textContent = cat.title;
      header.appendChild(title);

      if (cat.description) {
        var desc = document.createElement("p");
        desc.className = "category-desc";
        desc.textContent = cat.description;
        header.appendChild(desc);
      }
      card.appendChild(header);

      cat.sounds.forEach(function(soundItem) {
        knownKeys[soundItem.id] = true;
        card.appendChild(createSoundRow(soundItem, items));
      });

      // For Browser & Easter Eggs: render user-added custom sites and the Add Site form
      if (cat.title === "Browser & Easter Eggs") {
        var customSitesList = items.customSites || [];
        customSitesList.forEach(function(site) {
          knownKeys[site.pattern] = true;
          var siteRow = createSoundRow({
            id: site.pattern,
            name: site.pattern,
            defaultFile: site.sound,
            isCustomSite: true
          }, items);
          card.appendChild(siteRow);
        });

        var addSection = document.createElement("div");
        addSection.className = "add-site-section";

        var addTitle = document.createElement("div");
        addTitle.className = "add-site-title";
        addTitle.textContent = "+ Add New Site or Search Easter Egg";
        addSection.appendChild(addTitle);

        var form = document.createElement("div");
        form.className = "add-site-form";

        var input = document.createElement("input");
        input.type = "text";
        input.id = "new-site-input";
        input.placeholder = "e.g. reddit.com, https://github.com, or search word";
        form.appendChild(input);

        var select = document.createElement("select");
        select.id = "new-site-select";
        AVAILABLE_SOUNDS.forEach(function(snd) {
          var opt = document.createElement("option");
          opt.value = snd;
          opt.textContent = snd;
          select.appendChild(opt);
        });
        form.appendChild(select);

        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "btn-primary";
        addBtn.textContent = "+ Add Site";
        addBtn.onclick = function() {
          var val = (input.value || "").trim();
          if (!val) {
            showToast("Please enter a domain or URL");
            input.focus();
            return;
          }
          if (knownKeys[val]) {
            showToast("This site or event is already added");
            return;
          }
          chrome.storage.local.get("customSites", function(curr) {
            var list = (curr && curr.customSites) || [];
            list.push({ pattern: val, sound: select.value });
            chrome.storage.local.set({ customSites: list, [val]: "enabled" }, function() {
              showToast("Added custom site: " + val);
              renderCatalog();
            });
          });
        };
        form.appendChild(addBtn);

        addSection.appendChild(form);
        card.appendChild(addSection);
      }

      container.appendChild(card);
    });

    // Handle any extra discovered sounds saved in storage not in presets
    var otherKeys = Object.keys(items).filter(function(k) {
      return !knownKeys[k] && !k.startsWith("customSound:") && k !== "customSites";
    });

    if (otherKeys.length > 0) {
      otherKeys.sort();
      var extraCard = document.createElement("div");
      extraCard.className = "category-card";

      var extraHeader = document.createElement("div");
      extraHeader.className = "category-header";

      var extraTitle = document.createElement("h2");
      extraTitle.className = "category-title";
      extraTitle.textContent = "Other Discovered Sounds";
      extraHeader.appendChild(extraTitle);
      extraCard.appendChild(extraHeader);

      otherKeys.forEach(function(key) {
        extraCard.appendChild(createSoundRow({ id: key, name: key }, items));
      });

      container.appendChild(extraCard);
    }
  });
}

// Reset preview button when playback ends
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg && (msg.type === "audioEnded" || msg.type === "audioLoadError")) {
      if (currentPreviewId === msg.id) {
        stopCurrentPreview();
      }
    }
  });
}

function setupBannerActions() {
  var reloadActiveBtn = document.getElementById("reload-active-tab-btn");
  if (reloadActiveBtn) {
    reloadActiveBtn.onclick = function() {
      if (!chrome.tabs) return;
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.reload(tabs[0].id, function() {
            showToast("Active tab reloaded!");
          });
        }
      });
    };
  }

  var reloadAllBtn = document.getElementById("reload-all-tabs-btn");
  if (reloadAllBtn) {
    reloadAllBtn.onclick = function() {
      if (!chrome.tabs) return;
      chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, function(tabs) {
        if (tabs && tabs.length > 0) {
          tabs.forEach(function(t) {
            chrome.tabs.reload(t.id);
          });
          showToast("Reloaded " + tabs.length + " tabs!");
        } else {
          showToast("No active web pages to reload.");
        }
      });
    };
  }
}

document.addEventListener("DOMContentLoaded", function() {
  setupBannerActions();
  renderCatalog();
});

document.addEventListener("focus", function() {
  renderCatalog();
});
