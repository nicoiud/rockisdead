#!/bin/bash
# Preparación inicial de una VM Ubuntu (Oracle Cloud u otra) para correr la
# tienda. Se ejecuta UNA sola vez, como el usuario que vas a usar para
# desplegar (no como root; usa sudo donde hace falta).
#
# Uso: ./setup-vm.sh
set -euo pipefail

echo "== Instalando Docker =="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "Docker instalado. Cerrá la sesión SSH y volvé a entrar antes de seguir (para que el grupo 'docker' tome efecto)."
fi

echo "== Abriendo puertos 80/443 en el firewall del sistema (iptables/ufw) =="
if command -v ufw >/dev/null; then
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
fi
# Oracle Cloud además filtra por "Security List" en la consola web:
# VCN > Security Lists > agregar Ingress Rules para 80/tcp y 443/tcp (0.0.0.0/0).

echo "== Memoria de intercambio (recomendado en VMs de 1-2 GB de RAM) =="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "== Carpeta de despliegue =="
mkdir -p ~/rockisdead
echo "Ahora copiá deploy/docker-compose.yml, deploy/Caddyfile, deploy/weekly-report.sh"
echo "a ~/rockisdead/, creá ~/rockisdead/.env (basado en deploy/.env.example) y seguí DEPLOY.md."
