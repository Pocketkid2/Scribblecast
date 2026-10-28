// Transparent, always-on-top video overlay with an edit mode (move/resize) and a click-through locked mode.
//
// Usage:
//   npx electron . path/to/video.webm [--opacity=0.8] [--invert] [--volume=0.5] [--mute]
//                                     [--loop] [--locked] [--fullscreen] [--display=0]
//
// The video plays once and then disappears. Add --loop to repeat it.
//
// Hotkeys (global):
//   Cmd/Ctrl+Shift+E      toggle edit mode (drag to move, drag edges to resize) / locked click-through
//   Cmd/Ctrl+Shift+Plus   make the overlay 10% bigger
//   Cmd/Ctrl+Shift+-      make the overlay 10% smaller
//   Cmd/Ctrl+Shift+H      show / hide
//   Cmd/Ctrl+Shift+P      pause / resume
//   Cmd/Ctrl+Shift+R      replay from the start
//   Cmd/Ctrl+Shift+M      mute / unmute
//   Cmd/Ctrl+Shift+Q      quit

const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(1);
const flagValue = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=')[1] : true;
};

const videoPath = args.find((a) => !a.startsWith('--') && /\.(webm|mov|mp4)$/i.test(a));
const opacity = flagValue('opacity', '1');
const invert = flagValue('invert', false) ? '1' : '0';
const volume = flagValue('volume', '1');
const muted = flagValue('mute', false) ? '1' : '0';
const loop = flagValue('loop', false) ? '1' : '0';
const fullscreen = !!flagValue('fullscreen', false);
const startLocked = fullscreen || !!flagValue('locked', false);
const displayIndex = parseInt(flagValue('display', '0'), 10) || 0;

let win = null;
let editMode = false;
let aspect = null; // video width / height, known once metadata loads

function setEditMode(on) {
  if (!win) return;
  editMode = on;
  win.setIgnoreMouseEvents(!on);
  win.setFocusable(on);
  if (!fullscreen) {
    win.setResizable(on);
    win.setMovable(on);
  }
  win.webContents.executeJavaScript(`document.body.classList.toggle('edit', ${on})`);
  if (on) win.showInactive();
}

function scaleWindow(factor) {
  if (!win || fullscreen) return;
  const b = win.getBounds();
  const w = Math.max(120, Math.round(b.width * factor));
  const h = aspect ? Math.round(w / aspect) : Math.round(b.height * factor);
  win.setBounds({
    x: Math.round(b.x + (b.width - w) / 2),
    y: Math.round(b.y + (b.height - h) / 2),
    width: w,
    height: h,
  });
}

function createWindow() {
  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('Usage: npx electron . path/to/video.webm [--opacity=0.8] [--invert] [--volume=0.5] [--mute] [--locked] [--fullscreen] [--display=0]');
    app.quit();
    return;
  }

  const displays = screen.getAllDisplays();
  const display = displays[displayIndex] || screen.getPrimaryDisplay();
  const area = fullscreen ? display.bounds : display.workArea;

  win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: fullscreen ? area.width : Math.round(area.width * 0.5),
    height: fullscreen ? area.height : Math.round(area.height * 0.5),
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Float above full-screen apps and follow you across Spaces.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'overlay.html'), {
    query: {
      src: pathToFileURL(path.resolve(videoPath)).href,
      opacity: String(opacity),
      invert,
      volume: String(volume),
      muted,
      loop,
      fit: fullscreen ? 'contain' : 'fill',
    },
  });

  win.webContents.once('did-finish-load', () => {
    // Once the video's size is known, lock the window to its aspect ratio
    // and size it to 60% of the screen, centered.
    win.webContents
      .executeJavaScript(
        `new Promise((resolve) => {
          const v = document.querySelector('video');
          const done = () => resolve([v.videoWidth, v.videoHeight]);
          if (v.videoWidth) done(); else v.addEventListener('loadedmetadata', done, { once: true });
        })`
      )
      .then(([vw, vh]) => {
        if (!vw || !vh || fullscreen) return;
        aspect = vw / vh;
        const s = Math.min((area.width * 0.6) / vw, (area.height * 0.6) / vh);
        const w = Math.round(vw * s);
        const h = Math.round(vh * s);
        win.setAspectRatio(aspect);
        win.setBounds({
          x: Math.round(area.x + (area.width - w) / 2),
          y: Math.round(area.y + (area.height - h) / 2),
          width: w,
          height: h,
        });
      });
    setEditMode(!startLocked);
  });

  win.on('closed', () => {
    win = null;
  });
}

function registerShortcuts() {
  const bindings = {
    'CommandOrControl+Shift+E': () => setEditMode(!editMode),
    'CommandOrControl+Shift+Plus': () => scaleWindow(1.1),
    'CommandOrControl+Shift+-': () => scaleWindow(1 / 1.1),
    'CommandOrControl+Shift+H': () => {
      if (!win) return;
      win.isVisible() ? win.hide() : win.showInactive();
    },
    'CommandOrControl+Shift+P': () => {
      if (!win) return;
      win.webContents.executeJavaScript(
        "(() => { const v = document.querySelector('video'); v.paused ? v.play() : v.pause(); })()"
      );
    },
    'CommandOrControl+Shift+R': () => {
      if (!win) return;
      win.webContents.executeJavaScript(
        "(() => { const v = document.querySelector('video'); v.style.visibility = 'visible'; v.currentTime = 0; v.play(); })()"
      );
    },
    'CommandOrControl+Shift+M': () => {
      if (!win) return;
      win.webContents.executeJavaScript(
        "(() => { const v = document.querySelector('video'); v.muted = !v.muted; })()"
      );
    },
    'CommandOrControl+Shift+Q': () => app.quit(),
  };

  for (const [accelerator, handler] of Object.entries(bindings)) {
    if (!globalShortcut.register(accelerator, handler)) {
      console.warn(`Could not register ${accelerator} (already in use?)`);
    }
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();
  registerShortcuts();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
