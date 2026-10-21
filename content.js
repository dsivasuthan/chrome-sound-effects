/*
 * Content script for Chrome Sounds.
 * Tracks in-page events and notifies the service worker (MV3).
 */

(function() {
  if (window.__chromeSoundsInjected) return;
  window.__chromeSoundsInjected = true;

  var disabledEvents = {};

  function sendEvent(event, value) {
    if (disabledEvents[event]) return;
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "contentEvent", eventName: event, eventValue: value });
      }
    } catch (e) {}
  }

  // Timers to trigger "stopEvent" for coalescing events.
  var timers = {};

  function stopEvent(type) {
    timers[type] = 0;
    sendEvent(type, "stopped");
  }

  // Automatically coalesces repeating events into a start and a stop event.
  // |validator| is a function which should return true if the event is
  // considered to be a valid event of this type.
  function handleEvent(event, type, validator) {
    if (disabledEvents[type]) return;
    if (validator) {
      if (!validator(event)) {
        return;
      }
    }
    var timerId = timers[type];
    var eventInProgress = (timerId > 0);
    if (eventInProgress) {
      clearTimeout(timerId);
      timers[type] = 0;
    } else {
      sendEvent(type, "started");
    }
    timers[type] = setTimeout(stopEvent, 300, type);
  }

  function listenAndCoalesce(target, type, validator) {
    target.addEventListener(type, function(event) {
      handleEvent(event, type, validator);
    }, true);
  }

  function updateConfig(items) {
    if (!items) return;
    ["keypress", "scroll", "resize"].forEach(function(evt) {
      if (items[evt] === "disabled") {
        disabledEvents[evt] = true;
        if (timers[evt]) {
          clearTimeout(timers[evt]);
          stopEvent(evt);
        }
      } else {
        disabledEvents[evt] = false;
      }
    });
  }

  // Synchronize configuration from storage dynamically without page refresh
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["keypress", "scroll", "resize"], function(items) {
      updateConfig(items);
    });

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (areaName !== "local") return;
        var updated = {};
        for (var key in changes) {
          updated[key] = changes[key].newValue;
        }
        updateConfig(updated);
      });
    }
  }

  listenAndCoalesce(document, "scroll");

  // For some reason, "resize" doesn't seem to work with addEventListener.
  if ((window == window.top) && document.body && !document.body.onresize) {
    document.body.onresize = function(event) {
      if (!disabledEvents["resize"]) {
        sendEvent("resize", "");
      }
    };
  }

  listenAndCoalesce(document, "keypress", function(event) {
    if (disabledEvents["keypress"]) return false;
    if (event.charCode == 13)
      return false;

    // TODO(erikkay) This doesn't work in gmail's rich text compose window.
    return event.target.tagName == "TEXTAREA" ||
           event.target.tagName == "INPUT" ||
           event.target.isContentEditable;
  });
})();
