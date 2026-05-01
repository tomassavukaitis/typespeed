# TypeSpeed

A 60-second typing speed test. Pick a passage, type as fast and accurately as you can, and get your WPM and accuracy results.

## Features

- 100 built-in passages of varying difficulty
- Live WPM and accuracy stats while you type
- Timer starts on your first keystroke so you can read the passage first
- Detailed results breakdown with passage review highlighting correct and incorrect characters

## Prerequisites

For local development you only need a web browser. No build tools, bundlers, or package managers required — it's pure HTML, CSS, and JavaScript.

For other deployment methods:

- **Docker** — Docker installed
- **AWS (Ansible + Terraform)** — AWS account, AWS CLI configured, Terraform >= 1.0, Ansible >= 2.12

## Running Locally

Open `index.html` directly in your browser, or serve it with any static file server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Running with Docker

```bash
docker build -t typespeed .
docker run -d -p 8080:80 typespeed
```

Then open `http://localhost:8080`.

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
index.html          — Single-page app (Start → Typing → Results screens)
css/style.css       — Styles
js/
  passages.js       — 100 typing passages
  timer.js          — 60-second countdown timer
  scoring.js        — WPM and accuracy calculations
  typing.js         — Input handling and passage rendering
  app.js            — Main controller, screen transitions
Dockerfile          — Nginx-based container image
terraform/          — AWS infrastructure (Terraform)
ansible/            — Deployment playbook (Ansible)
```
