const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const multer = require('multer');
const upload = multer({ dest: 'sounds/' });

const app = express();
const port = 3000;

// Ensure directories exist
if (!fs.existsSync('sounds')) {
  fs.mkdirSync('sounds');
}

// Initialize default schedule if doesn't exist
if (!fs.existsSync('schedule.json')) {
  fs.writeFileSync('schedule.json', JSON.stringify({
    enabled: true,
    enabledOnSaturday: false,
    enabledOnSunday: false,
    events: [{
      name: '',
      time: '08:00',
      sound: 'test_bell.wav'
    }]
  }, null, 2));
}

// Load schedule
let bellSchedule;
try {
  bellSchedule = JSON.parse(fs.readFileSync('schedule.json'));
} catch (err) {
  console.error('Error loading schedule:', err);
  process.exit(1);
}

// Clear existing schedule jobs
function clearSchedule() {
  for (const job in schedule.scheduledJobs) {
    schedule.scheduledJobs[job].cancel();
  }
}

// Schedule all events
function scheduleEvents() {
  if (!bellSchedule.enabled) return;

  bellSchedule.events.forEach(event => {
    const [hour, minute] = event.time.split(':').map(Number);
    
    const rule = new schedule.RecurrenceRule();
    rule.hour = hour;
    rule.minute = minute;
    rule.second = 0;
    
    // Set day of week restrictions
    rule.dayOfWeek = [new schedule.Range(0, 4)]; // Monday to Friday by default
    
    if (bellSchedule.enabledOnSaturday) {
      rule.dayOfWeek.push(5); // Add Saturday
    }
    
    if (bellSchedule.enabledOnSunday) {
      rule.dayOfWeek.push(6); // Add Sunday
    }

    schedule.scheduleJob(rule, () => {
      const today = new Date();
      console.log(`Bell time! ${event.time} -> Playing ${event.sound}`);
      playSound(event.sound).catch(console.error);
    });
  });
}

// Initial scheduling
clearSchedule();
scheduleEvents();

// Play sound function (uses ALSA)
function playSound(file) {
  return new Promise((resolve, reject) => {
    exec(`aplay -D hw:0,0 -f S16_LE -r 44100 ./sounds/${file}`, (err, stdout, stderr) => {
      if (err) {
        console.error("Audio error:", stderr);
        reject(stderr);
      } else {
        console.log("Played sound:", file);
        resolve(stdout);
      }
    });
  });
}

// Get list of sound files
function getSoundFiles() {
  try {
    return fs.readdirSync('sounds').filter(file => 
      file.endsWith('.wav') || file.endsWith('.mp3')
    );
  } catch (err) {
    console.error('Error reading sounds directory:', err);
    return [];
  }
}

// Web interface
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Upload sound file
app.post('/upload-sound', upload.single('soundFile'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded');
  const ext = path.extname(req.file.originalname);
  const newPath = path.join('sounds', req.file.originalname);
  fs.renameSync(req.file.path, newPath);
  res.redirect('/');
});

// Delete sound file
app.post('/delete-sound', express.urlencoded({ extended: true }), (req, res) => {
  const file = req.body.file;
  if (!file) return res.status(400).send('No file specified');
  const filePath = path.join('sounds', file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.sendStatus(200);
  } else {
    res.status(404).send('File not found');
  }
});

// Play sound file (manual trigger)
app.get('/play-sound', (req, res) => {
  const file = req.query.file;
  if (!file) return res.status(400).send('No file specified');
  playSound(file)
    .then(() => res.sendStatus(200))
    .catch(() => res.status(500).send('Failed to play sound'));
});

app.get('/', (req, res) => {
  const soundFiles = getSoundFiles();
  
  let eventsHtml = '';
  bellSchedule.events.forEach((event, index) => {
    let soundOptions = '';
    soundFiles.forEach(file => {
      soundOptions += `<option value="${file}" ${event.sound === file ? 'selected' : ''}>${file}</option>`;
    });
    
    eventsHtml += `
    <tr data-index="${index}">
      <td><input type="text" name="events[${index}][name]" value="${event.name || ''}"></td>
      <td><input type="time" name="events[${index}][time]" value="${event.time || '08:00'}"></td>
      <td>
        <select name="events[${index}][sound]">
          ${soundOptions}
        </select>
      </td>
      <td>
        <button type="button" class="add-row">Add</button>
        <button type="button" class="delete-row">Delete</button>
      </td>
    </tr>
    `;
  });

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>School Bell System</title>
    <script>
      function addRow(index) {
        const table = document.querySelector('table');
        const row = table.rows[index + 1]; // +1 to skip header
        const newRow = row.cloneNode(true);

        // Clear values in the new row
        newRow.querySelectorAll('input').forEach(input => input.value = '');
        newRow.querySelectorAll('select').forEach(select => select.selectedIndex = 0);

        row.after(newRow); // Use after() to always insert after the current row
        updateRowIndexes();
      }
      
      function deleteRow(index) {
        if (document.querySelectorAll('table tr').length <= 2) return; // Don't delete last row
        const row = document.querySelector(\`tr[data-index="\${index}"]\`);
        row.parentNode.removeChild(row);
        updateRowIndexes();
      }
      
      function updateRowIndexes() {
        const rows = document.querySelectorAll('table tr:not(:first-child)');
        rows.forEach((row, index) => {
          row.setAttribute('data-index', index);
          const inputs = row.querySelectorAll('input, select');
          inputs.forEach(input => {
            input.name = input.name.replace(/events\\[\\d+\\]/g, \`events[\${index}]\`);
          });
          const addBtn = row.querySelector('.add-row');
          if (addBtn) addBtn.onclick = () => addRow(index);
          const delBtn = row.querySelector('.delete-row');
          if (delBtn) delBtn.onclick = () => deleteRow(index);
        });
      }
      
      document.addEventListener('DOMContentLoaded', function() {
        const buttons = document.querySelectorAll('.add-row, .delete-row');
        buttons.forEach(button => {
          button.onclick = function() {
            const row = this.closest('tr');
            const index = parseInt(row.getAttribute('data-index'));
            if (this.classList.contains('add-row')) {
              addRow(index);
            } else {
              deleteRow(index);
            }
          };
        });
        
        document.querySelector('form').onsubmit = function(e) {
          e.preventDefault();
          const formData = new FormData(this);
          const data = {
            enabled: formData.get('enabled') === 'on',
            enabledOnSaturday: formData.get('enabledOnSaturday') === 'on',
            enabledOnSunday: formData.get('enabledOnSunday') === 'on',
            events: []
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
          .then(res => {
            if (res.ok) alert('Played: ' + file);
            else alert('Failed to play sound');
          });
      }
      function deleteSoundFile(file) {
        if (!confirm('Delete ' + file + '?')) return;
        fetch('/delete-sound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'file=' + encodeURIComponent(file)
        })
        .then(res => {
          if (res.ok) location.reload();
          else alert('Failed to delete');
        });
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
  `;
  
  res.send(html);
});

// Handle form submission
app.post('/', (req, res) => {
  try {
    const newSchedule = {
      enabled: req.body.enabled,
      enabledOnSaturday: req.body.enabledOnSaturday,
      enabledOnSunday: req.body.enabledOnSunday,
      events: req.body.events || []
    };
    
    // Filter out empty time entries
    newSchedule.events = newSchedule.events.filter(event => event.time);
    
    // If no events, add one empty row
    if (newSchedule.events.length === 0) {
      newSchedule.events.push({
        name: '',
        time: '08:00',
        sound: getSoundFiles()[0] || 'test_bell.wav'
      });
    }
    
    fs.writeFileSync('schedule.json', JSON.stringify(newSchedule, null, 2));
    bellSchedule = newSchedule;
    
    // Reschedule events
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