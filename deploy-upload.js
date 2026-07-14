const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const deploySecret = require('crypto').randomBytes(24).toString('hex');

const secrets = Object.fromEntries(fs.readFileSync(path.join(__dirname, '.deploy-secrets.local'), 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
const zip = path.join(__dirname, 'gzywl-deploy.zip');
const nginx = `server {
  listen 80 default_server;
  server_name _;
  client_max_body_size 20m;
  location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
}`;
const remote = `set -e
mkdir -p /var/www/gzywl
rm -rf /var/www/gzywl/*
unzip -o /tmp/gzywl-deploy.zip -d /var/www/gzywl >/dev/null
cat > /etc/nginx/conf.d/gzywl.conf <<'NGINX'
${nginx}
NGINX
rm -f /etc/nginx/conf.d/default.conf
nginx -t
cd /var/www/gzywl
mkdir -p data
test -f data/messages.json || echo '[]' > data/messages.json
pm2 delete gzywl >/dev/null 2>&1 || true
ADMIN_USER='${secrets.ADMIN_USER}' ADMIN_PASSWORD='${secrets.ADMIN_PASSWORD}' CAPTCHA_SECRET='${deploySecret}' PORT=3000 pm2 start server.js --name gzywl
pm2 save
systemctl enable nginx
systemctl restart nginx
echo DEPLOY_OK`;

const conn = new Client();
conn.on('ready', () => conn.sftp((error, sftp) => {
  if (error) throw error;
  console.log('Uploading website package...');
  sftp.fastPut(zip, '/tmp/gzywl-deploy.zip', {}, uploadError => {
    if (uploadError) throw uploadError;
    console.log('Running deployment...');
    conn.exec(remote, (execError, stream) => {
      if (execError) throw execError;
      stream.on('data', data => process.stdout.write(data));
      stream.stderr.on('data', data => process.stderr.write(data));
      stream.on('close', (code) => { conn.end(); process.exit(code || 0); });
    });
  });
}));
conn.on('error', error => { console.error(error.message); process.exit(1); });
conn.connect({ host: secrets.HOST, port: 22, username: secrets.SSH_USER, password: secrets.SSH_PASSWORD, readyTimeout: 30000 });
