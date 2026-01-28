# Audio Visualizer Generator

A powerful Next.js + Remotion application that turns audio files into professional visualization videos (MP4).

## Features

- **Local Rendering**: Renders videos entirely on your machine using `@remotion/renderer`.
- **Multi-Track Support**: Create compilations from multiple audio files.
- **Visualizer Customization**:
  - Types: Wave, Bars, Circle.
  - Colors: Solid or Gradient logic.
  - Reactivity: Bass-heavy or Spectrum-balanced.
  - Positioning: Move the visualizer and title anywhere.
- **Cross-Platform**: Tested on macOS, compatible with Windows and Linux.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [FFmpeg](https://ffmpeg.org/) (Usually installed automatically by Remotion, but having it in PATH is recommended)

## Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the development server:
   ```bash
   npm run dev --webpack
   ```
   > **Note**: The `--webpack` flag is currently required for compatibility with the API route bundler.

2. Open **[http://localhost:3000](http://localhost:3000)** in your browser.

3. **Upload** your audio files (MP3, WAV, etc.) and specific a background image if desired.

4. **Customize** the look using the sidebar controls.

5. Click **Export** to render your video locally. The file will download automatically when finished.

## Troubleshooting

- **"Module not found: ... css-loader"**: Accessing styles in the video renderer requires specific loader versions. If you encounter build errors, ensure you have the correct dependencies installed:
  ```bash
  npm install css-loader@5.2.7 style-loader@3.3.4 --save-dev
  ```
  (This project is already configured with these versions).

- **"Status check failed"**: Ensure you restart the server (`npm run dev --webpack`) after any major configuration changes.

## Tech Stack

- Next.js (App Router)
- Remotion (Video Rendering)
- Tailwind CSS (Styling)
- Lucide React (Icons)
