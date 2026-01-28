# 🎵 Audio Visualizer Generator 🚀

**Turn your music into stunning videos automatically.**  
Built with [Next.js](https://nextjs.org), [Remotion](https://www.remotion.dev), and [Tailwind CSS](https://tailwindcss.com).

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Platform](https://img.shields.io/badge/platform-win%20%7C%20mac%20%7C%20linux-lightgrey) ![Status](https://img.shields.io/badge/status-stable-success)

---

## ✨ Features

- 🎨 **Visualizer Magic**: Choose between **Wave**, **Bars**, or **Circle** visualizations.
- 🎚️ **Pro Controls**: Customize colors, sensitivity, orientation, and responsiveness (Bass/Spectrum).
- 🌌 **Multi-Track**: Upload a playlist and let it render a complete mix.
- 🖥️ **Local & Private**: Renders videos 100% locally on your machine—no cloud costs, no data leaks.
- ⚡ **Tailwind v4 Powered**: Sleek, modern styling out of the box.

---

## 🪟 Windows Setup Guide

New to coding? No problem! Follow these steps to get running on Windows.

### 1️⃣ Install Prerequisites
- **Node.js**: Download the "LTS" version from [nodejs.org](https://nodejs.org/).
- **Git**: Download from [git-scm.com](https://git-scm.com/download/win).

### 2️⃣ Prepare PowerShell
Open **PowerShell** as Administrator and run this command to allow the app scripts to run:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```
*(Press `Y` when prompted)*

### 3️⃣ Clone & Install
Open your terminal (Command Prompt or PowerShell) and run:

```bash
# Clone the repo
git clone https://github.com/wanjalaian/resonate.git
cd resonate

# Install dependencies
npm install

# Install FFmpeg (required for video rendering)
npx remotion install ffmpeg
```

---

## 🍎 Mac & Linux Setup

1. **Clone the repo**:
   ```bash
   git clone https://github.com/wanjalaian/resonate.git
   cd resonate
   ```

2. **Install**:
   ```bash
   npm install
   ```
   *(FFmpeg is usually auto-detected, but you can run `npx remotion install ffmpeg` if needed)*

---

## 🚀 How to Run

1. **Start the Engine**:
   ```bash
   npm run dev --webpack
   ```
   > **Note**: We use the `--webpack` flag to ensure maximum compatibility with the audio engine.

2. **Open the App**:
   Go to [http://localhost:3000](http://localhost:3000) in your browser.

3. **Create!**
   - Drag & drop your audio files.
   - Tweaking the settings in the sidebar.
   - Click **Export** to render your MP4. 🎥

---

## 🛠️ Troubleshooting

**"Module not found: ... css-loader"**  
If you see build errors, you might need to fix dependency versions (we've already handled this in the repo, but just in case):
```bash
npm install css-loader@5.2.7 style-loader@3.3.4 --save-dev
```

**"Status check failed" / Render Errors**  
If the export gets stuck:
1. Stop the server (`Ctrl + C`).
2. Run `npm run dev --webpack` again.

---

## 💻 Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Video Engine**: Remotion
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React

---

Made with ❤️ by PsycoSlime
