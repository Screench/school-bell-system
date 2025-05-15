const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const schedule = require('node-schedule');

const app = express();
const port = 3000;

// Load schedule
const bellSchedule = JSON.parse(fs.readFileSync('schedule.json'));

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

// Schedule all events
bellSchedule.events.forEach(event => {
  const [hour, minute] = event.time.split(':').map(Number);
  schedule.scheduleJob({ hour, minute, second: 0 }, () => {
    console.log(`Bell time! ${event.time} -> Playing ${event.sound}`);
    playSound(event.sound).catch(console.error);
  });
});

// Web interface
app.get('/', (req, res) => {
  res.send('School Bell System - Running!');
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
