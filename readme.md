# 🕰️ macOS-Style Flip Clock & Timer

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)

A sleek, minimalist, web-based flip clock and countdown timer inspired by the clean aesthetics of macOS. Built entirely with vanilla JavaScript, CSS 3D transforms, and Tailwind CSS. No build tools or complex frameworks required—just open and run!

[**🔴 View Live Demo Here**](https://drarahimi.github.io/clock-timer/)
![Demo](/demo.gif "Demo")

## ✨ Features

* **Dual Modes:** Seamlessly switch between a real-time Clock and a customizable Countdown Timer, with quick presets (5m/10m/15m/30m/1h/2h) and manual +5m/-5m/+1m/-1m adjustment while running.
* **3D Flip Animations:** Hardware-accelerated CSS animations using `transform-style: preserve-3d` for a smooth, realistic mechanical flip effect.
* **Intelligent Theming:** Automatically detects your system's light/dark mode preference, with a manual toggle for quick overriding.
* **Immersive View:** A built-in fullscreen/large-view toggle for distraction-free focus.
* **Quote Library:** Cycles through curated, built-in quote sets — no network required. Pick a style: general Quotes, time-aware Motivational (tone shifts as the timer runs down), or Life Wisdom.
* **Exam Mode:** A dedicated proctoring-friendly mode with editable, persisted Pre-Start and Post-Exam rule lists, a duration summary on the instructions screen, and a link out to your institution's exam-conduct policy.
* **Research-Backed Exam Options** — a set of opt-in settings grounded in test-anxiety and accessibility research, each explained (with cited sources) on an in-app **Research** page (ℹ️ icon):
  * **Calm Display:** hides the exact numeric countdown during an exam and shows a softer, centered progress visual with a coarse phase caption instead of exact time.
  * **Configurable Time Warnings:** replace the fixed 5-min/1-min beeps with any set of checkpoints you choose (e.g. 30-min, 15-min marks for longer exams).
  * **Accessible Text:** switches the rules screens to a higher-contrast, wider-spaced, more legible layout.
  * **Read Rules Aloud:** reads the pre-start rules aloud via the browser's built-in text-to-speech, automatically preferring a natural-sounding voice and skipping bracketed citations.
* **Stays Accurate & Awake:** Timestamp-based countdown that resists tab throttling, a screen Wake Lock while running, and resume-after-reload so an accidental refresh won't lose the timer.
* **Precision Control:** Option to show or hide the seconds panel to reduce visual clutter.
* **Audio & Visual Alerts:** Progress bar that shifts amber then red, configurable warning beeps, and a Web Audio alarm when your timer finishes — all generated locally.

## 🚀 Getting Started

Because this project uses vanilla HTML, CSS, and JavaScript with Tailwind pulled via CDN, setup is completely frictionless.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/drarahimi/clock-timer.git
   ```

2. **Navigate to the directory:**
   ```bash
   cd clock-timer
   ```


3. **Run the app:**
Simply double-click the `index.html` file to open it in your default web browser.
*(Alternatively, use an extension like VS Code Live Server for a better development experience).*

## 🛠️ Tech Stack & Architecture

* **Structure:** A single self-contained `index.html` — no build step, no bundler, no `node_modules`.
* **Styling:** Tailwind CSS (via CDN) for rapid layout and UI components, combined with custom CSS for complex 3D perspective animations.
* **Logic:** Vanilla JavaScript handles the time calculations, DOM manipulation, interval management, timestamp-based countdown, Wake Lock, and Web Audio alerts.
* **Browser APIs used:** Web Audio API (locally generated beeps/alarm, no sound files), Screen Wake Lock API, Web Speech API (`speechSynthesis`, for Read Rules Aloud), and `localStorage` to persist mode, rules, quote style, and exam-option preferences across sessions.
* **Typography:** The highly legible [Inter font](https://www.google.com/search?q=https://fonts.google.com/specimen/Inter) serves as the primary typeface, utilizing `font-variant-numeric: tabular-nums` to ensure the flipping digits remain perfectly aligned.

## 🎨 How the Flip Animation Works

The mechanical flip effect is achieved by splitting each digit into a top and bottom "plate". A third element, the "flap," is layered on top and anchored at the bottom (`transform-origin: bottom`). When the time changes, the flap rotates -180 degrees on the X-axis using `@keyframes`, revealing the new number underneath.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://www.google.com/search?q=%23) if you want to contribute.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.