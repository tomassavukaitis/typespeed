variable "region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "ssh_cidr" {
  description = "CIDR block allowed to SSH into the instance"
  type        = string
  default     = "84.15.187.255/32"
}

variable "app_repo" {
  description = "GitHub repository URL for the app"
  type        = string
  default     = "https://github.com/tomassavukaitis/typespeed.git"
}
