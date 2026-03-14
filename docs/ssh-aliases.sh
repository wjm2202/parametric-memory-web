# Parametric Memory — SSH Aliases
# Add these to your ~/.zshrc or source this file directly:
#   echo 'source ~/Documents/code/mmpm-website/docs/ssh-aliases.sh' >> ~/.zshrc

# Web Droplet (170.64.238.232) — parametric-memory.dev
alias sshwebasroot='echo "🌐 Connecting to WEB droplet (170.64.238.232) as ROOT..." && ssh root@170.64.238.232'
alias sshwebasdeploy='echo "🌐 Connecting to WEB droplet (170.64.238.232) as DEPLOY..." && ssh deploy@170.64.238.232'
alias sshwebasrecover='echo "🌐 Connecting to WEB droplet (170.64.238.232) as RECOVER..." && ssh -i ~/.ssh/id_ed25519 recover@170.64.238.232'

# Memory Droplet (170.64.198.144) — MMPM server
alias sshmemoryasroot='echo "🧠 Connecting to MEMORY droplet (170.64.198.144) as ROOT..." && ssh root@170.64.198.144'
