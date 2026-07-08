# MYGO LLM Platform & YODA Assistant

This repository contains the organization-wide LLM services backend and React dashboard built for **MYGO**. The platform features **YODA** (the internal AI Assistant) powered by **Gemma 4 E4B** via Ollama, along with an admin console for managing client credentials, document ingestion (RAG), and request metrics tracking.

---

## Technical Stack
- **Backend:** Python + FastAPI + SQLite (Request logging, credential registry, document embeddings indexing).
- **LLM Runner:** Ollama executing `gemma4:e4b` (dense Edge 4B model) and `nomic-embed-text` (embeddings generator).
- **Frontend:** React + TypeScript + Vite + Lucide Icons + Custom CSS.

---

## Local Development Quickstart

### 1. Start Ollama and Load Models
Ensure Ollama is installed on your machine:
```bash
# Pull the Gemma 4 Edge 4B Instruct model
ollama pull gemma4:e4b

# Pull the standard embedding model
ollama pull nomic-embed-text
```

### 2. Run the FastAPI Backend
```bash
cd backend
python -m venv .venv
# On Windows PowerShell:
.venv\Scripts\Activate.ps1
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python main.py # or: uvicorn main:app --reload --port 8000
```
The backend API will run on `http://localhost:8000`. It initializes `mygo_llm.db` SQLite database and seeds the default admin:
- **Admin Username:** `admin@mygo.ai`
- **Admin Password:** `mygo12345`

### 3. Run the React Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend dashboard will run on `http://localhost:5173`. Open the browser, chat with YODA, or navigate to `/admin` (via sidebar link or typing `/admin` in chat) to log in.

---

## Production Deployment to AWS EC2 (16GB RAM)

### Step 1: Install Dependencies on EC2
SSH into your Ubuntu/Debian EC2 instance and install Python, Node, Nginx, and Git:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip python3-venv python3-dev nginx git curl

# Install Node.js via NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
```

### Step 2: Install Ollama and Pull Models
Ollama is edge-optimized and runs extremely fast on CPU/GPU on a 16GB RAM instance.
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the models in the background
ollama pull gemma4:e4b
ollama pull nomic-embed-text
```

### Step 3: Set up Backend Service (systemd)
Clone the repository to your home directory, e.g., `/home/ubuntu/Mygo_LLM`.
Create a virtual environment and install requirements:
```bash
cd /home/ubuntu/Mygo_LLM/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a systemd service file to manage the FastAPI server process:
```bash
sudo nano /etc/systemd/system/mygo-backend.service
```

Paste the following configuration:
```ini
[Unit]
Description=Mygo LLM Backend Service
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/Mygo_LLM/backend
ExecStart=/home/ubuntu/Mygo_LLM/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
Environment="OLLAMA_HOST=http://localhost:11434"
Environment="LLM_MODEL=gemma4:e4b"
Environment="JWT_SECRET=production_secret_change_me_12345"

[Install]
WantedBy=multi-user.target
```

Enable and start the backend service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mygo-backend
sudo systemctl start mygo-backend
sudo systemctl status mygo-backend
```

### Step 4: Build and Deploy Frontend
Inject the EC2 server host address into the build or use a relative path if serving through a reverse proxy.

Configure the environment variable for Vite in `/home/ubuntu/Mygo_LLM/frontend/.env.production`:
```env
VITE_BACKEND_URL=
```
*(Leaving it empty ensures Vite calls relative paths, which route to Nginx, proxying to the local FastAPI port 8000).*

Build the React production static bundle:
```bash
cd /home/ubuntu/Mygo_LLM/frontend
npm install
npm run build
```
This generates the static files in the `/home/ubuntu/Mygo_LLM/frontend/dist` directory.

### Step 5: Configure Nginx Reverse Proxy
Configure Nginx to serve the React assets and reverse-proxy `/api` requests to our backend:
```bash
sudo nano /etc/nginx/sites-available/mygo-llm
```

Paste the configuration:
```nginx
server {
    listen 80;
    server_name your_ec2_public_dns_or_ip;

    # Serve React Frontend static assets
    location / {
        root /home/ubuntu/Mygo_LLM/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to FastAPI backend
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for long-running LLM generation
        proxy_read_timeout 180s;
        proxy_connect_timeout 180s;
    }
}
```

Enable the site configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/mygo-llm /etc/nginx/sites-enabled/
# Remove default site if present
sudo rm /etc/nginx/sites-enabled/default
# Validate nginx configuration
sudo nginx -t
# Restart Nginx
sudo systemctl restart nginx
```

Ensure ports `80` (HTTP) and `22` (SSH) are open in your AWS EC2 Security Groups, and your platform is live!
