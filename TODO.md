# TODO List - Chrome Sound Effects Extension

## Fase 1: Compatibilidad básica (Prioridad Alta)
- [X] Actualizar `manifest.json` de v2 a v3
  - Cambiar `manifest_version` a 3
  - Reemplazar `background.scripts` por `background.service_worker`
  - Actualizar permisos (agregar `storage`)
  - Reemplazar `browser_action` por `action`
- [X] Actualizar APIs obsoletas en `bg.js` y `content.js`
  - Reemplazar `chrome.extension.onRequest` → `chrome.runtime.onMessage`
  - Reemplazar `chrome.extension.sendRequest` → `chrome.runtime.sendMessage`
  - Reemplazar `chrome.extension.getBackgroundPage()` → `chrome.runtime.getBackgroundPage()`
- [X] Probar la extensión en Brave/Chrome actual

## Fase 2: Funcionalidad de teclado (Prioridad Media)
- [X] Extender detección de eventos de teclado en `content.js`
  - Agregar listener global para `keydown`/`keyup`
  - Enviar eventos al background con `chrome.runtime.sendMessage`
- [X] Agregar sonidos para eventos de teclado en `bg.js`
  - Definir mapeo `keySounds` para teclas específicas

## Fase 3: Personalización de sonidos (Prioridad Media)
- [ ] Agregar interfaz para cargar sonidos personalizados en `options.html`
  - Input de tipo `file` para subir archivos de audio
- [ ] Implementar sistema de mapeo dinámico
  - Guardar asignaciones en `chrome.storage.local`

## Fase 4: Mejoras de UI (Prioridad Baja)
- [ ] Agregar interfaz para habilitar/deshabilitar eventos de teclado
