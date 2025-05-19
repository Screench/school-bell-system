# School Bell System

A simple web-based school bell scheduler and sound player for Linux (Ubuntu Server).  
Allows you to set up a bell schedule, upload/delete/play sound files, and manage everything from a browser.

## Stack

- Node.js (Express)
- HTML/JavaScript frontend (served by Express)
- [ffmpeg](https://ffmpeg.org/) and [alsa-utils](https://alsa-project.org/) for sound playback
- [multer](https://github.com/expressjs/multer) for file uploads

## Features

- Web UI for managing bell schedules and sound files
- Upload, delete, and play bell sound files (`.wav`, `.mp3`)
- Schedule bells for weekdays, Saturday, and Sunday
- Systemd service support for easy startup and reliability

---

## Installation (Ubuntu Server)

```sh
sudo apt update && sudo apt install nodejs npm ffmpeg alsa-utils

Clone or copy the project to your server, e.g. /home/administrator/school-bell-system/.

Install Node.js dependencies:
npm i

Create a systemd service
Create and edit the service file:

sudo nano /etc/systemd/system/school-bell.service

```markdown
# School Bell System

A simple web-based school bell scheduler and sound player for Linux (Ubuntu Server).  
Allows you to set up a bell schedule, upload/delete/play sound files, and manage everything from a browser.

## Stack

- Node.js (Express)
- HTML/JavaScript frontend (served by Express)
- [ffmpeg](https://ffmpeg.org/) and [alsa-utils](https://alsa-project.org/) for sound playback
- [multer](https://github.com/expressjs/multer) for file uploads

## Features

- Web UI for managing bell schedules and sound files
- Upload, delete, and play bell sound files (`.wav`, `.mp3`)
- Schedule bells for weekdays, Saturday, and Sunday
- Systemd service support for easy startup and reliability

---

## Installation (Ubuntu Server)

```sh
sudo apt update && sudo apt install nodejs npm ffmpeg alsa-utils
```

Clone or copy the project to your server, e.g. `/home/administrator/school-bell-system/`.

Install Node.js dependencies:

```sh
npm i
```

### Create a systemd service

Create and edit the service file:

```sh
sudo nano /etc/systemd/system/school-bell.service
```

Paste the following (edit `User`, `WorkingDirectory`, and `XDG_RUNTIME_DIR` as needed):

```
[Unit]
Description=School Bell System Node.js App
After=network.target sound.target

[Service]
Type=simple
User=administrator
WorkingDirectory=/home/administrator/school-bell-system
ExecStart=/usr/bin/node /home/administrator/school-bell-system/server.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"
Environment="XDG_RUNTIME_DIR=/run/user/1000"  # Replace 1000 with your user's UID (run `id -u` to check)
StandardOutput=syslog
StandardError=syslog

[Install]
WantedBy=multi-user.target
```

Reload systemd and enable/start the service:

```sh
sudo systemctl daemon-reload
sudo systemctl enable school-bell.service
sudo systemctl start school-bell.service
```

---

Access the web interface at:  
`http://<your-server-ip>:3000`

---

**Tip:**  
For audio to work, make sure your user has access to the sound device and `XDG_RUNTIME_DIR` is set correctly.
```
