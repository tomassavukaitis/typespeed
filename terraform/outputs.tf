output "public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_instance.typespeed.public_ip
}

output "url" {
  description = "URL to access the app"
  value       = "http://${aws_instance.typespeed.public_ip}"
}

output "ssh_private_key_file" {
  description = "Path to the generated SSH private key"
  value       = local_file.ssh_key.filename
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ${local_file.ssh_key.filename} ec2-user@${aws_instance.typespeed.public_ip}"
}
