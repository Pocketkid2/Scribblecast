# alpha-overlay

Turn any video into black line art on a transparent background, then play it as a click-through overlay on top of your desktop.

It has two parts:

1. **`lineart-alpha.sh`**: an ffmpeg pipeline that detects edges in a video and outputs a VP9 WebM where the lines are opaque black and everything else is transparent.
2. **The Electron overlay** (`main.js`, `overlay.html`): a transparent, always-on-top window that plays that WebM above your other apps. Clicks pass through to whatever is underneath.

> Built and used on macOS. It may work on Windows and Linux, but that is untested. Linux needs a compositing window manager for transparency, and Electron does not support resizing transparent windows on Windows.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- [ffmpeg](https://ffmpeg.org/) built with `libvpx` and `libopus` (the Homebrew build includes both)
- Optional: [yt-dlp](https://github.com/yt-dlp/yt-dlp) for downloading source videos

On macOS with Homebrew:

```bash
brew install node ffmpeg yt-dlp
```

## Install

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
npm install
chmod +x lineart-alpha.sh
```

## Usage

### 1. Make the line-art video

```bash
./lineart-alpha.sh input.mp4 output.webm
```

If you need a source video, `yt-dlp` can fetch one (use only videos you have the right to use):

```bash
yt-dlp -f "bestvideo" -o "input.%(ext)s" "VIDEO_URL"
```

Higher-quality sources give cleaner lines, because compression artifacts show up as stray edges.

#### Tuning the look

All options are optional:

| Option | Default | What it does |
| --- | --- | --- |
| `--low N` | `0.04` | Edge sensitivity (0 to 1). Lower finds more edges. |
| `--high N` | `3 x low` | Strong-edge cutoff. Keep it 2 to 3 times `--low`. |
| `--blur N` | `1.0` | Pre-blur strength. Higher gives smoother, simpler outlines. `0` turns it off. |
| `--thickness N` | `2` | Line thickness, as the number of `dilation` passes. `0` is the thinnest. |
| `--width N` | `1280` | Scale to this width before processing. `0` keeps the original size. |
| `--crf N` | `30` | VP9 quality. Lower means better quality and a larger file. |
| `--no-audio` | off | Drop the audio track. |

Example:

```bash
./lineart-alpha.sh input.mp4 output.webm --low 0.03 --thickness 3 --blur 1.5
```

The defaults are also set in a block at the top of the script if you would rather edit them there.

### 2. Run the overlay

```bash
npx electron . path/to/output.webm
```

The overlay starts in **edit mode**, with a blue frame and a gray tint:

- Drag the middle to move it.
- Drag the edges or corners to resize. The aspect ratio is locked to the video.
- Press **Cmd+Shift+E** to lock it. In locked mode, clicks pass through to the apps underneath.

The video plays once and then disappears. Press **Cmd+Shift+R** to replay it, or start with `--loop` to repeat it.

#### Overlay options

| Option | What it does |
| --- | --- |
| `--opacity=0.8` | Fade the lines. |
| `--invert` | Flip the black lines to white, useful over dark apps. |
| `--volume=0.5` | Set the volume (0 to 1). |
| `--mute` | Start muted. |
| `--loop` | Repeat the video instead of playing once. |
| `--locked` | Start in click-through mode instead of edit mode. |
| `--fullscreen` | Cover the whole screen instead of a movable window. |
| `--display=1` | Show on another monitor (0 is the primary). |

#### Hotkeys

These are global, so they work even though the overlay never takes focus.

| Hotkey | Action |
| --- | --- |
| `Cmd/Ctrl+Shift+E` | Toggle edit mode and click-through mode |
| `Cmd/Ctrl+Shift+Plus` | Make the overlay 10% bigger |
| `Cmd/Ctrl+Shift+-` | Make the overlay 10% smaller |
| `Cmd/Ctrl+Shift+H` | Show or hide |
| `Cmd/Ctrl+Shift+P` | Pause or resume |
| `Cmd/Ctrl+Shift+R` | Replay from the start |
| `Cmd/Ctrl+Shift+M` | Mute or unmute |
| `Cmd/Ctrl+Shift+Q` | Quit |

The app has no Dock icon, so use `Cmd+Shift+Q` (or Ctrl+C in the terminal where you launched it) to quit. The process keeps running after the video ends until you do.

## Troubleshooting

- **The screen is a solid black rectangle instead of transparent.** The WebM was probably not encoded with alpha. Re-encode it with `lineart-alpha.sh`, which uses `libvpx-vp9` with `yuva420p`.
- **I can't see the lines.** They are black, so they disappear over dark apps. Try `--invert`.
- **A hotkey does nothing.** Another app may have claimed it. The terminal prints a warning at launch for any shortcut that fails to register.
- **Resizing is awkward.** Use `Cmd+Shift+Plus` and `Cmd+Shift+-`, which work from anywhere in either mode.
- **ffmpeg says a filter or encoder is missing.** Make sure your ffmpeg build includes `libvpx` and `libopus`.
- **Other players show a black screen.** Most players, including ffplay and VLC, do not composite VP9 alpha over a background. Chromium-based browsers and this overlay do. If you decode the WebM with ffmpeg itself, put `-vcodec libvpx-vp9` before `-i` so the alpha channel is not dropped.

## Project layout

```
.
├── lineart-alpha.sh   # video -> line art with alpha (ffmpeg)
├── main.js            # Electron main process: window, hotkeys, edit mode
├── overlay.html       # video element and edit-mode styling
└── package.json
```

## How the pipeline works

1. Scale the video down (optional), convert to grayscale, and blur lightly to suppress noise.
2. Run ffmpeg's `edgedetect` filter in `wires` mode, which outputs white lines on black.
3. Thicken the lines with repeated `dilation` passes.
4. Use that edge map as the alpha channel over a solid black frame with `alphamerge`, so lines are opaque and the rest is transparent.
5. Encode as VP9 with alpha in a WebM container.

## License

Add a license of your choice here (MIT is a common default).
