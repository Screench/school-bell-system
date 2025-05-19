const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const multer = require('multer');
const upload = multer({ dest: 'sounds/' });
const player = require('play-sound')();
const { play } = require('sound-play');

const app = express();
const port = 3000;
const SCHEDULE_FILE = 'schedule.json';
const SOUNDS_DIR = 'sounds';

// Ensure directories and files exist
if (!fs.existsSync(SOUNDS_DIR)) fs.mkdirSync(SOUNDS_DIR);
if (!fs.existsSync(SCHEDULE_FILE)) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
    enabled: true,
    enabledOnSaturday: false,
    enabledOnSunday: false,
    events: [{ name: '', time: '08:00', sound: 'test_bell.wav' }]
  }, null, 2));
}

// Utility functions
const getSoundFiles = () => {
  try {
    return fs.readdirSync(SOUNDS_DIR).filter(f => f.endsWith('.wav') || f.endsWith('.mp3'));
  } catch (e) {
    console.error('Error reading sounds directory:', e);
    return [];
  }
};

const loadSchedule = () => {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULE_FILE));
  } catch (e) {
    console.error('Error loading schedule:', e);
    process.exit(1);
  }
};

const saveSchedule = scheduleObj => {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleObj, null, 2));
};

const playSound = (file) => {
  return new Promise((resolve, reject) => {
    exec(`ffmpeg -i ./sounds/${file} -f wav - | aplay -q`, 
      (err, stdout, stderr) => {
        if (err) reject(stderr || err);
        else resolve(stdout);
      }
    );
  });
};

const isDuringBreak = (date, breaks) => {
  if (!breaks || !breaks.enabled) return false;
  const check = (range) => {
    if (!range.start || !range.end) return false;
    const start = new Date(range.start);
    const end = new Date(range.end);
    // Set end to end of day
    end.setHours(23, 59, 59, 999);
    return date >= start && date <= end;
  };
  return (
    check(breaks.fall) ||
    check(breaks.winter) ||
    check(breaks.spring) ||
    check(breaks.summer)
  );
};

// Scheduling
let bellSchedule = loadSchedule();

const clearSchedule = () => {
  Object.values(schedule.scheduledJobs).forEach(job => job.cancel());
};

const scheduleEvents = () => {
  if (!bellSchedule.enabled) return;
  bellSchedule.events.forEach(event => {
    const [hour, minute] = event.time.split(':').map(Number);
    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.second = 0;
    rule.dayOfWeek = [0, 1, 2, 3, 4]; // Mon-Fri
    if (bellSchedule.enabledOnSaturday) rule.dayOfWeek.push(5);
    if (bellSchedule.enabledOnSunday) rule.dayOfWeek.push(6);
    schedule.scheduleJob(rule, () => {
      const now = new Date();
      if (isDuringBreak(now, bellSchedule.breaks)) {
        console.log(`Bell skipped at ${event.time} due to active break.`);
        return;
      }
      console.log(`Bell time! ${event.time} -> Playing ${event.sound}`);
      playSound(event.sound).catch(console.error);
    });
  });
};

clearSchedule();
scheduleEvents();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sound file endpoints
app.post('/upload-sound', upload.single('soundFile'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  const newPath = path.join(SOUNDS_DIR, req.file.originalname);
  fs.renameSync(req.file.path, newPath);
  res.redirect('/');
});

app.post('/delete-sound', express.urlencoded({ extended: true }), (req, res) => {
  const file = req.body.file;
  if (!file) return res.status(400).send('No file specified');
  const filePath = path.join(SOUNDS_DIR, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.sendStatus(200);
  } else {
    res.status(404).send('File not found');
  }
});

app.get('/play-sound', (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).send('No file specified');
  playSound(file)
    .then(() => res.sendStatus(200))
    .catch(() => res.status(500).send('Failed to play sound'));
});

// Main page
app.get('/', (req, res) => {
  bellSchedule = loadSchedule();
  const soundFiles = getSoundFiles();

  // Add breaks section HTML
  const breaks = bellSchedule.breaks || {
    enabled: false,
    fall: { start: '', end: '' },
    winter: { start: '', end: '' },
    spring: { start: '', end: '' },
    summer: { start: '', end: '' }
  };

  const breaksHtml = `
    <h2>School Breaks</h2>
    <div>
      <input type="checkbox" name="breaks[enabled]" id="breaks_enabled" ${breaks.enabled ? 'checked' : ''}>
      <label for="breaks_enabled"><b>Enable Breaks</b></label>
    </div>
    <div style="margin-left:1em;">
      <label>Fall Break: </label>
      <input type="date" name="breaks[fall][start]" value="${breaks.fall.start || ''}"> to
      <input type="date" name="breaks[fall][end]" value="${breaks.fall.end || ''}">
      <br>
      <label>Winter Break: </label>
      <input type="date" name="breaks[winter][start]" value="${breaks.winter.start || ''}"> to
      <input type="date" name="breaks[winter][end]" value="${breaks.winter.end || ''}">
      <br>
      <label>Spring Break: </label>
      <input type="date" name="breaks[spring][start]" value="${breaks.spring.start || ''}"> to
      <input type="date" name="breaks[spring][end]" value="${breaks.spring.end || ''}">
      <br>
      <label>Summer Break: </label>
      <input type="date" name="breaks[summer][start]" value="${breaks.summer.start || ''}"> to
      <input type="date" name="breaks[summer][end]" value="${breaks.summer.end || ''}">
    </div>
  `;

  const eventsHtml = bellSchedule.events.map((event, index) => `
    <tr data-index="${index}">
      <td><input type="text" name="events[${index}][name]" value="${event.name || ''}"></td>
      <td><input type="time" name="events[${index}][time]" value="${event.time || '08:00'}"></td>
      <td>
        <select name="events[${index}][sound]">
          ${soundFiles.map(file => `<option value="${file}" ${event.sound === file ? 'selected' : ''}>${file}</option>`).join('')}
        </select>
      </td>
      <td>
        <button type="button" class="add-row">Add</button>
        <button type="button" class="delete-row">Delete</button>
      </td>
    </tr>
  `).join('');

  res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>School Bell System</title>
    <script>
      function addRow(index) {
        const table = document.querySelector('table');
        const row = table.rows[index + 1];
        const newRow = row.cloneNode(true);
        newRow.querySelectorAll('input').forEach(input => input.value = '');
        newRow.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
        row.after(newRow);
        updateRowIndexes();
      }
      function deleteRow(index) {
        if (document.querySelectorAll('table tr').length <= 2) return;
        const row = document.querySelector(\`tr[data-index="\${index}"]\`);
        row.parentNode.removeChild(row);
        updateRowIndexes();
      }
      function updateRowIndexes() {
        const rows = document.querySelectorAll('table tr:not(:first-child)');
        rows.forEach((row, index) => {
          row.setAttribute('data-index', index);
          row.querySelectorAll('input, select').forEach(input => {
            input.name = input.name.replace(/events\\[\\d+\\]/g, \`events[\${index}]\`);
          });
          const addBtn = row.querySelector('.add-row');
          if (addBtn) addBtn.onclick = () => addRow(index);
          const delBtn = row.querySelector('.delete-row');
          if (delBtn) delBtn.onclick = () => deleteRow(index);
        });
      }
      document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('.add-row, .delete-row').forEach(button => {
          button.onclick = function() {
            const row = this.closest('tr');
            const index = parseInt(row.getAttribute('data-index'));
            if (this.classList.contains('add-row')) addRow(index);
            else deleteRow(index);
          };
        });
        document.querySelector('form').onsubmit = function(e) {
          e.preventDefault();
          const formData = new FormData(this);
          const data = {
            enabled: formData.get('enabled') === 'on',
            enabledOnSaturday: formData.get('enabledOnSaturday') === 'on',
            enabledOnSunday: formData.get('enabledOnSunday') === 'on',
            events: [],
            breaks: {
              enabled: formData.get('breaks[enabled]') === 'on',
              fall: {
                start: formData.get('breaks[fall][start]') || '',
                end: formData.get('breaks[fall][end]') || ''
              },
              winter: {
                start: formData.get('breaks[winter][start]') || '',
                end: formData.get('breaks[winter][end]') || ''
              },
              spring: {
                start: formData.get('breaks[spring][start]') || '',
                end: formData.get('breaks[spring][end]') || ''
              },
              summer: {
                start: formData.get('breaks[summer][start]') || '',
                end: formData.get('breaks[summer][end]') || ''
              }
            }
          };
          const timeInputs = document.querySelectorAll('input[name^="events"][name$="[time]"]');
          timeInputs.forEach((input, index) => {
            const name = document.querySelector(\`input[name="events[\${index}][name]"]\`).value;
            const time = input.value;
            const sound = document.querySelector(\`select[name="events[\${index}][sound]"]\`).value;
            data.events.push({ name, time, sound });
          });
          fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          })
          .then(response => response.text())
          .then(message => alert(message))
          .catch(error => alert('Error: ' + error));
        };
      });
      function playSoundFile(file) {
        fetch('/play-sound?file=' + encodeURIComponent(file))
          .then(res => { if (!res.ok) alert('Failed to play sound'); });
      }
      function deleteSoundFile(file) {
        if (!confirm('Delete ' + file + '?')) return;
        fetch('/delete-sound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'file=' + encodeURIComponent(file)
        })
        .then(res => res.ok ? location.reload() : alert('Failed to delete'));
      }
    </script>
  </head>
  <body>
    <h1>School Bell System</h1>
    <form>
      <h2>Main Schedule</h2>
      <table>
        <tr>
          <th>Name</th>
          <th>Time</th>
          <th>Sound</th>
          <th>Actions</th>
        </tr>
        ${eventsHtml}
      </table>
      <h2>Settings</h2>
      <div>
        <input type="checkbox" name="enabled" id="enabled" ${bellSchedule.enabled ? 'checked' : ''}>
        <label for="enabled">Enable Schedule</label>
      </div>
      <div>
        <input type="checkbox" name="enabledOnSaturday" id="enabledOnSaturday" ${bellSchedule.enabledOnSaturday ? 'checked' : ''}>
        <label for="enabledOnSaturday">Enable Schedule on Saturdays</label>
      </div>
      <div>
        <input type="checkbox" name="enabledOnSunday" id="enabledOnSunday" ${bellSchedule.enabledOnSunday ? 'checked' : ''}>
        <label for="enabledOnSunday">Enable Schedule on Sundays</label>
      </div>
      ${breaksHtml}
      <button type="submit">Save schedule and settings</button>
    </form>
    <h2>Sound Files</h2>
    <form id="uploadForm" action="/upload-sound" method="post" enctype="multipart/form-data" style="margin-bottom:1em;">
      <input type="file" name="soundFile" accept=".wav,.mp3" required>
      <button type="submit">Upload Sound</button>
    </form>
    <table>
      <tr>
        <th>File Name</th>
        <th>Actions</th>
      </tr>
      ${soundFiles.map(file => `
        <tr>
          <td>${file}</td>
          <td>
            <button type="button" onclick="playSoundFile('${file}')">Play</button>
            <button type="button" onclick="deleteSoundFile('${file}')">Delete</button>
          </td>
        </tr>
      `).join('')}
    </table>
  </body>
  </html>
  `);
});

// Save schedule/settings
app.post('/', (req, res) => {
  try {
    const data = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
    const newSchedule = {
      enabled: data.enabled,
      enabledOnSaturday: data.enabledOnSaturday,
      enabledOnSunday: data.enabledOnSunday,
      events: (data.events || []).filter(e => e.time),
      breaks: data.breaks || {
        enabled: false,
        fall: { start: '', end: '' },
        winter: { start: '', end: '' },
        spring: { start: '', end: '' },
        summer: { start: '', end: '' }
      }
    };
    if (!newSchedule.events.length) {
      newSchedule.events.push({ name: '', time: '08:00', sound: getSoundFiles()[0] || 'test_bell.wav' });
    }
    saveSchedule(newSchedule);
    bellSchedule = newSchedule;
    clearSchedule();
    scheduleEvents();
    res.send('Schedule saved successfully!');
  } catch (err) {
    console.error('Error saving schedule:', err);
    res.status(500).send('Error saving schedule');
  }
});

// Test sound endpoint
app.get('/test-sound', async (req, res) => {
  try {
    const soundFile = req.query.file || 'test_bell.wav';
    await playSound(soundFile);
    res.send(`Successfully played sound: ${soundFile}`);
  } catch (err) {
    res.status(500).send(`Failed to play sound: ${err}`);
  }
});

app.listen(port, () => {
  console.log(`Bell system running on http://localhost:${port}`);
});