# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

No build tools, bundlers, or package managers. Pure HTML/CSS/JS that runs directly via `file://` or any static server.

To serve locally: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000`.

## Architecture

TypeSpeed is a 60-second typing speed test. Three screens (Start → Typing → Results) are all in `index.html`, toggled by adding/removing the `.active` class.

**JS modules** (loaded via `<script>` tags, no module system):
- `passages.js` — Exports a global `PASSAGES` array of 100 passages (150-200+ words each). Stored as a JS array to avoid fetch/CORS issues with `file://`.
- `timer.js` — `Timer` class using `Date.now()` wall-clock time (drift-immune). Ticks every 100ms.
- `scoring.js` — Pure functions: `calculateWPM(correctChars, elapsedSeconds)` and `calculateAccuracy(correctChars, totalTypedChars)`. WPM uses the standard "1 word = 5 characters" formula.
- `typing.js` — `TypingEngine` class. Renders passage as individual `<span>` elements, updates their CSS classes (`correct`/`incorrect`/`current`) on each input event.
- `app.js` — IIFE controller. Wires DOM events, manages screen transitions, starts timer on first keystroke.

**Key design decisions:**
- Timer does **not** start on screen load — it starts on the user's first keystroke so they can read the passage first.
- A hidden `<textarea>` captures input (paste/autocorrect/spellcheck disabled). The visible passage display is a `<div>` of styled `<span>` elements.
- Passage selection avoids immediate repeats by tracking `lastPassageIndex`.

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

## Git Workflow

Each set of changes gets its own branch — do not reuse old feature branches.
- Create a new branch from `main` before committing: `feature/<description>` or `fix/<description>`
- Push the branch with `git push -u origin <branch-name>`
- **Never merge into `main` or push directly to `main`** — only push feature/fix branches and let the user merge via GitHub
