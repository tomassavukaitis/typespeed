# TypeSpeed

A typing speed test with configurable duration. Pick a passage, type as fast and accurately as you can, and get your WPM, accuracy, and mistake analysis results.

## Features

- 100 built-in passages with uniformly mixed word lengths (2–12 characters)
- Configurable race duration (30s, 60s, 2 min) for both solo and multiplayer
- Live WPM and accuracy stats while you type
- Timer starts on your first keystroke so you can read the passage first
- **Typo blocking** — mistakes must be corrected with backspace before you can continue; errors still count against accuracy
- Detailed results breakdown with passage review highlighting correct and incorrect characters
- **Mistake analysis** — post-game breakdown showing which keys you mistyped and how often
- **Multiplayer** — Create or join a room (6-char code), race against friends in real time with live progress bars and standings

## Prerequisites

For local development you only need a web browser. No build tools, bundlers, or package managers required — it's pure HTML, CSS, and JavaScript.

For other deployment methods:

- **Docker** — Docker installed
- **AWS (Ansible + Terraform)** — AWS account, AWS CLI configured, Terraform >= 1.0, Ansible >= 2.12

## Running Locally

**Solo mode only** — open `index.html` directly in your browser, or use any static file server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

**With multiplayer** — requires Node.js:

```bash
npm install
node server.js
```

Then open `http://localhost:3000`.

## Running with Docker

```bash
docker build -t typespeed .
docker run -d -p 3000:3000 typespeed
```

Then open `http://localhost:3000`.

## Deploying to AWS

Deployment uses Ansible to orchestrate Terraform (infrastructure) and app setup in a single command.

### What it creates

- EC2 instance (t2.micro by default) running Amazon Linux 2023
- Security group allowing inbound HTTP (80) and SSH (22 from your current IP)
- Auto-generated SSH key pair saved locally as `typespeed-key.pem`
- 30 GB gp3 root volume

### Deploy

```bash
cd ansible
ansible-playbook deploy.yml
```

This single command handles everything:
- If the EC2 instance doesn't exist, Terraform creates it and Ansible sets it up
- If the EC2 instance already exists, Terraform reports no changes and Ansible pulls the latest code and redeploys
- Your current public IP is automatically detected and used for the SSH security group rule

### Terraform Variables

| Variable | Description | Default |
|---|---|---|
| `region` | AWS region | `eu-west-1` |
| `instance_type` | EC2 instance type | `t2.micro` |
| `ssh_cidr` | CIDR block allowed to SSH (auto-set by Ansible) | *required* |

### Outputs

| Output | Description |
|---|---|
| `public_ip` | Public IP of the EC2 instance |
| `url` | HTTP URL to access the app |
| `ssh_command` | Ready-to-use SSH command |
| `ssh_private_key_file` | Path to the generated private key |

### Cost

A `t2.micro` instance is included in the [AWS Free Tier](https://aws.amazon.com/free/) (750 hours/month for the first 12 months). The 30 GB gp3 volume is also within free tier limits. Outside of free tier, expect roughly ~$8.50/month in `eu-west-1`.

### Teardown

```bash
cd terraform
terraform destroy
```

## Project Structure

```
index.html          — Single-page app (all screens)
css/style.css       — Styles
img/                — Background SVG illustrations (keyboard, hands)
js/
  passages.js       — 100 typing passages (mixed word lengths, 2–12 chars)
  timer.js          — Configurable countdown timer
  scoring.js        — WPM and accuracy calculations
  typing.js         — Input handling, passage rendering, typo blocking, mistake tracking
  app.js            — Solo mode controller, screen transitions, mistake analysis
  multiplayer.js    — Multiplayer client (WebSocket, lobby, race, results)
server.js           — Node.js server (Express static files + WebSocket)
package.json        — Node.js dependencies (express, ws)
Dockerfile          — Node.js container image
terraform/          — AWS infrastructure (Terraform)
ansible/            — Deployment playbook (Ansible)
```
