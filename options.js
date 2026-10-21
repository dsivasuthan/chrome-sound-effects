// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

function safeSendMessage(message) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message);
    }
  } catch (e) {}
}

function playSound(id) {
  safeSendMessage({ type: "optionsPlay", id: id });
}

function stopSound(id) {
  safeSendMessage({ type: "optionsStop", id: id });
}

function soundChanged(event) {
  var key = event.target.name;
  var checked = event.target.checked;
  if (checked) {
    chrome.storage.local.set({ [key]: "enabled" });
    playSound(event.target.name);
  } else {
    chrome.storage.local.set({ [key]: "disabled" });
    stopSound(event.target.name);
  }
}

function showSounds() {
  var container = document.getElementById("sounds");
  if (!container) return;
  chrome.storage.local.get(null, function(items) {
    var keys = Object.keys(items || {});
    container.textContent = "";
    if (!keys.length) return;
    var header = document.createElement("div");
    header.textContent = "Discovered sounds: (uncheck to disable)";
    container.appendChild(header);
    keys.sort();
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i];
      var div = document.createElement("div");
      var check = document.createElement("input");
      check.type = "checkbox";
      check.name = key;
      check.checked = items[key] == "enabled";
      check.onchange = soundChanged;
      div.appendChild(check);
      var text = document.createElement("span");
      text.id = key;
      text.innerText = key + (items["customSound:" + key] ? " (custom)" : "");
      text.className = "sound";
      text.style.marginRight = "8px";
      text.onclick = function(event) { playSound(event.target.id.replace(" (custom)", "")); };
      div.appendChild(text);

      var actions = document.createElement("div");
      actions.className = "row-actions";

      var file = document.createElement("input");
      file.type = "file";
      file.accept = "audio/*";
      file.onchange = function(e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function() {
          var obj = {}; obj["customSound:" + key] = reader.result;
          chrome.storage.local.set(obj, function() { showSounds(); });
        };
        reader.readAsDataURL(f);
      };
      actions.appendChild(file);

      var clear = document.createElement("button");
      clear.textContent = "Clear";
      clear.style.marginLeft = "6px";
      clear.onclick = function() {
        chrome.storage.local.remove("customSound:" + key, function() { showSounds(); });
      };
      actions.appendChild(clear);

      div.appendChild(actions);

      container.appendChild(div);
    }
  });
}

document.addEventListener('DOMContentLoaded', showSounds);
document.addEventListener('focus', showSounds);
