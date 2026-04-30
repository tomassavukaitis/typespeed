terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# Look up the latest Amazon Linux 2023 AMI
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Generate an SSH key pair
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "typespeed" {
  key_name   = "typespeed-key"
  public_key = tls_private_key.ssh.public_key_openssh
}

resource "local_file" "ssh_key" {
  content         = tls_private_key.ssh.private_key_pem
  filename        = "${path.module}/typespeed-key.pem"
  file_permission = "0600"
}

# Security group: allow HTTP and SSH inbound, all outbound
resource "aws_security_group" "typespeed" {
  name        = "typespeed-sg"
  description = "Allow HTTP and SSH inbound"

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# EC2 instance
resource "aws_instance" "typespeed" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.typespeed.key_name
  vpc_security_group_ids = [aws_security_group.typespeed.id]

  user_data = templatefile("${path.module}/user_data.sh", {
    app_repo = var.app_repo
  })

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
  }

  tags = {
    Name = "typespeed"
  }
}
