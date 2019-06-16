const bodyParser = require('body-parser');
const express    = require('express');
const fs         = require('fs');
const http       = require('http');
const jspredict  = require('jspredict');
const net        = require('net');
const readline   = require('readline');

const amateurTLEURL = 'http://www.celestrak.com/NORAD/elements/amateur.txt';
const amateurTLEPath = '_3p/CelesTrak/amateur.txt';



var status = {
 location: [1.3033315, 103.8507822, 0.01], // Lasalle College, Singapore
 minElevation: 10.0,
 tleUpdatedMs: 0,
 tracking: {
  status: 'idle' // (idle|waiting|tracking)
 },
 rotatorConnected: false
};
var tles = [];
var app;
var trackUpdateTimeout;
var rotatorSocket;



function connectRotatorSocket() {
 rotatorSocket.connect(4533, 'localhost', function() {
  status.rotatorConnected = true;
 });
}

function rotatorSocketError(thing) {
 status.rotatorConnected = false;
 setTimeout(connectRotatorSocket, 1000);
}

function getStatus(req, res) {
 res.json(status);
}

function getPasses(req, res) {
 var candidates = [];
 tles.forEach(function(tle) {
  jspredict.transits(tle, status.location, Date.now(), Date.now() + 3600000, status.minElevation, 2).forEach(function(transit) {
   candidates.push({ name: tleName(tle), transit: transit });
  });
 });
 candidates.sort(function(a, b) {
  return a.transit.start - b.transit.start;
 });
 var body = '';
 candidates.forEach(function(candidate) {
  body
   += new Date(candidate.transit.start).toLocaleString()
   + ' - '
   + new Date(candidate.transit.end).toLocaleTimeString()
   + ' '
   + candidate.transit.minAzimuth.toFixed(2)
   + '-'
   + candidate.transit.maxAzimuth.toFixed(2)
   + ' ^'
   + candidate.transit.maxElevation.toFixed(2)
   + ' '
   + candidate.name
   + '\n';
 });
 res.set('Content-Type', 'text/plain');
 res.send(body);
}

function updateAmateurTLE() {
 console.log('fetching ' + amateurTLEURL);
 http.get(amateurTLEURL, (resp) => {
  var fd = fs.openSync(amateurTLEPath + '.new', 'w', 0o644);

  resp.on('data', (chunk) => {
   fs.write(fd, chunk, function(err, bytesWritten, buffer) {
    if (err != null)
     console.log('http error:' + err);
   });
  });

  resp.on('end', () => {
   fs.closeSync(fd);
   fs.rename(amateurTLEPath + '.new', amateurTLEPath, function(err) {
    if (err != null)
     console.log('rename error: ' + err);
   });
   noteAmateurTLEMtime();
  });
 }).on("error", (err) => {
  console.log("Error: " + err.message);
 });
}

function noteAmateurTLEMtime() {
 var mtimeMs = fs.statSync(amateurTLEPath).mtimeMs;
 status.tleUpdatedMs = mtimeMs;
 setTimeout(updateAmateurTLE, mtimeMs + 86400*1000 - Date.now());
 loadAmateurTLEs();
}

function loadAmateurTLEs() {
 var stream = fs.createReadStream(amateurTLEPath);
 var rl = readline.createInterface({
  input: stream,
  crlfDelay: Infinity
 });
 var lineNo = 0;
 var accumTle = '';
 rl.on('line', (line) => {
  accumTle += line + '\n';
  lineNo++;
  if (lineNo > 2) {
   tles.push(accumTle);
   accumTle = '';
   lineNo = 0;
  }
 });
}

function tleName(tle) {
 return tle.split('\n')[0].trim();
}

function getTle(name) {
 var result;
 tles.forEach(function(tle) {
  if (name.localeCompare(tleName(tle)) == 0) {
   result = tle; // because forEach creates an invisible function, return here has no effect
  }
 });
 return result;
}

function trackUpdate() {
 trackUpdateTimeout = undefined;
 var observation = jspredict.observe(status.tracking.tle, status.location);
 switch (status.tracking.status) {
  case 'waiting':
   if (observation.elevation > 0)
    status.tracking.status = 'tracking';
   rotatorSend();
   break;
  case 'tracking':
   if (observation.elevation < 0)
    status.tracking.status = 'idle';
   else {
    assignAzEl(status.tracking.tle, status.location, Date.now());
    rotatorSend();
   }
   break;
  case 'idle':
   console.log('trackUpdate(): status.tracking.status: idle');
   break;
  default:
   console.log('trackUpdate(): unknown status.tracking.status: ' + status.tracking.status);
   break;
 }
}

function rotatorSend() {
 console.log('rotatorSend()');
 rotatorSocket.write('P ' + status.tracking.azimuth.toFixed(1) + ' ' + status.tracking.elevation.toFixed(1) + '\n');
 trackUpdateTimeout = setTimeout(trackUpdate, 1000);
}

function assignAzEl(tle, location, timeMs) {
 var observation = jspredict.observe(tle, location, timeMs);
 status.tracking.azimuth   = observation.azimuth;
 status.tracking.elevation = observation.elevation;
}

function track(req, res) {
 if (trackUpdateTimeout !== undefined)
  clearTimeout(trackUpdateTimeout);
 var name = req.body.name;
 var tle = getTle(req.body.name);
 var transit = jspredict.transits(tle, status.location, Date.now(), Date.now() + 3600000, status.minElevation, 1)[0];
 if (transit !== undefined) {
  status.tracking.name = name;
  status.tracking.tle = tle;
  status.tracking.aos = transit.start;
  status.tracking.los = transit.end;
  assignAzEl(tle, status.location, transit.start);
  status.tracking.status = 'waiting';
  rotatorSend();
  res.set('Content-Type', 'text/plain');
  res.send('');
 } else {
  status.tracking.status = 'idle';
  res.status(400);
  res.set('Content-Type', 'text/plain');
  res.send('No transit for that satellite in the next hour.\n');
 }
}

function stop(req, res) {
 if (trackUpdateTimeout !== undefined)
  clearTimeout(trackUpdateTimeout);
 status.tracking.status = 'idle';
 rotatorSocket.write('S\n');
 res.set('Content-Type', 'text/plain');
 res.send('');
}



if (fs.existsSync(amateurTLEPath)) {
 noteAmateurTLEMtime();
} else {
 setImmediate(updateAmateurTLE);
}

app = express();
app.use(bodyParser.urlencoded());
app.route('/status')
.get(getStatus);
app.route('/passes')
.get(getPasses);
app.route('/track')
.post(track);
app.route('/stop')
.post(stop)
app.listen(5500);

rotatorSocket = new net.Socket();
rotatorSocket.on('error', rotatorSocketError);
connectRotatorSocket();

