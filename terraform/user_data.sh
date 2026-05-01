#!/bin/bash
set -euxo pipefail

# Install Docker
dnf install -y docker git
systemctl enable docker
systemctl start docker

# Clone the app
git clone ${app_repo} /opt/typespeed

# Build and run the container
cd /opt/typespeed
docker build -t typespeed .
docker run -d --name typespeed --restart always -p 80:3000 typespeed
