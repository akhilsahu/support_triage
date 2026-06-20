#!/bin/bash
# One-time VPS setup for SUPPORT247.chat backend
# Run as root on a fresh Ubuntu 22.04 VPS
set -e

echo "▶ Installing Docker..."
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

echo "▶ Installing Nginx + Certbot..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

echo "▶ Creating app directory..."
mkdir -p /var/www/support247
cd /var/www/support247

echo "▶ Cloning repo (or pull if already exists)..."
# Replace with your actual GitHub repo URL
if [ -d ".git" ]; then
  git pull
else
  git clone https://github.com/YOUR_USERNAME/bob-watson-hackathon.git .
fi

echo "▶ Configuring Nginx..."
cp deploy/nginx/api.support247.chat.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/api.support247.chat.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "▶ Issuing SSL certificate via Let's Encrypt..."
certbot --nginx -d api.support247.chat --non-interactive --agree-tos -m admin@support247.chat

echo "▶ Setting up auto-renew..."
systemctl enable --now certbot.timer

echo ""
echo "✅ VPS setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy your .env file: scp .env user@YOUR_VPS_IP:/var/www/support247/.env"
echo "  2. Add GitHub Actions secrets (see .env.example for the list)"
echo "  3. Push to main — GitHub Actions will auto-deploy"
