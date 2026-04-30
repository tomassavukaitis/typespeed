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

variable "app_repo" {
  description = "GitHub repository URL for the app"
  type        = string
  default     = "https://github.com/tomassavukaitis/typespeed.git"
}
