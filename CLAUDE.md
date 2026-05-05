# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build tools or bundlers. The frontend is pure HTML/CSS/JS. The multiplayer server requires Node.js.

- **Solo mode only:** Open `index.html` via `file://` or `python3 -m http.server 8000`.
- **With multiplayer:** Run `node server.js` (starts Express + WebSocket server on port 3000), then open `http://localhost:3000`.

**Code Style:**
- Always add basic comments to functions, classes, and complex logic for clarity and maintainability.

## Architecture

TypeSpeed is a typing speed test (configurable 30s/60s/120s) with solo and multiplayer modes. Seven screens (Start, Typing, Results, MP Menu, MP Lobby, MP Race, MP Results) are all in `index.html`, toggled by adding/removing the `.active` class.

**JS modules** (loaded via `<script>` tags, no module system):
- `passages.js` — Exports a global `PASSAGES` array of 100 passages (150 words each, uniformly mixed word lengths 2–12 chars). Stored as a JS array to avoid fetch/CORS issues with `file://`.
- `timer.js` — `Timer` class using `Date.now()` wall-clock time (drift-immune). Ticks every 100ms.
- `scoring.js` — Pure functions: `calculateWPM(correctChars, elapsedSeconds)` and `calculateAccuracy(correctChars, totalTypedChars)`. WPM uses the standard "1 word = 5 characters" formula.
- `typing.js` — `TypingEngine` class. Renders passage as individual `<span>` elements, updates their CSS classes (`correct`/`incorrect`/`current`) on each input event. Blocks forward typing on errors (`hasCurrentError`). Tracks mistake details for post-game analysis (`mistakeDetails`, `getMistakeAnalysis()`). WPM/accuracy use position-based stats (net progress, not raw keystrokes) to prevent backspace-spam exploits.
- `app.js` — IIFE controller. Wires DOM events, manages screen transitions, starts timer on first keystroke.
- `multiplayer.js` — IIFE module. WebSocket connection, lobby management, race progress bars, and results. Handles auto-reconnection with room rejoin on connection drop.

**Server** (`server.js`):
- Express static file server + WebSocket server (via `ws` library).
- In-memory room state: create/join rooms, 6-char room codes, max 10 players.
- Ping/pong heartbeat every 10s to detect dead WebSocket connections behind Docker/NAT.
- Race lifecycle: countdown → racing (configurable 30s/60s/120s, progress broadcast every 200ms) → finished.
- Room cleanup: 30-minute expiry, 5-minute idle cleanup for finished rooms.

**Key design decisions:**
- Timer does **not** start on screen load — it starts on the user's first keystroke so they can read the passage first.
- A hidden `<textarea>` captures input (paste/autocorrect/spellcheck disabled). The visible passage display is a `<div>` of styled `<span>` elements.
- Passage selection avoids immediate repeats by tracking `lastPassageIndex`.
- On typo, the user must backspace to correct the error before typing further. The mistake is still counted against accuracy.
- Multiplayer uses WebSocket push (not polling). Client auto-reconnects and rejoins the room if the connection drops.

## Deployment

Deployment to AWS uses a single Ansible playbook that orchestrates everything:

```bash
cd ansible
ansible-playbook deploy.yml
```

**`ansible/deploy.yml`** — Two-play playbook:
- **Play 1 (localhost):** Runs `terraform init` and `terraform apply`. Auto-detects the current public IP via `checkip.amazonaws.com` and passes it as `ssh_cidr` to Terraform. Extracts the EC2 IP and SSH key path from Terraform outputs and adds the host for Play 2.
- **Play 2 (EC2):** Waits for SSH, installs Docker/Git via dnf, clones or pulls the repo, builds the Docker image, and starts the container on port 80.

**`ansible/ansible.cfg`** — Disables host key checking for EC2 connections.

**`terraform/`** — Manages EC2 instance, security group, and SSH key pair. No `user_data` script — Ansible handles instance setup.

To tear down: `cd terraform && terraform destroy`.

## Documentation

After any significant changes to features, architecture, or project structure, update `README.md` to reflect those changes before committing.

## Git Workflow

Each set of changes gets its own branch — do not reuse old feature branches.
- Create a new branch from `main` before committing: `feature/<description>` or `fix/<description>`
- Do not reuse an existing branch for new work; start a fresh branch for every GitHub push.
- Push the branch with `git push -u origin <branch-name>`
- **Never merge into `main` or push directly to `main`** — only push feature/fix branches and let the user merge via GitHub
