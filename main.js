let fs = require('fs')
let record = require('node-record-lpcm16');
let {
  Detector,
  Models
} = require('snowboy');
let speech = require('@google-cloud/speech')({
  projectId: '<GOOGLE CLOUD PROJECT ID>',
  keyFilename: '<GOOGLE CLOUD SERVICE KEY FILE>'
})
let express = require('express')
let app = express()
var server = require('http').Server(app);
var io = require('socket.io')(server, { path: '/mirror'});
let request = require('request-promise')
let eos = require('end-of-stream')
let https = require('https')
let spdy = require('spdy')
let stream = require('stream');
let streamToBuffer = require('stream-to-buffer');
let SpawnStream = require('spawn-stream');
let _ = require('lodash');
let linear16 = require('linear16');
let httpParser = require('http-message-parser');
let player = require('play-sound')(opts = {})
let {BrowserWindow} = require('electron')
let mirror = require('electron').app
let youtube = require('googleapis').youtube({version: 'v3', auth: '<KEY>'})
let NodeGeocoder = require('node-geocoder');

let options = {
	provider: 'mapquest',

	// Optional depending on the providers
	httpAdapter: 'https', // Default
	apiKey: '<MAPQUEST KEY>', // for Mapquest, OpenCage, Google Premier
	formatter: null // 'gpx', 'string', ...
};

let geocoder = NodeGeocoder(options);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.


let win

process.env.GOOGLE_API_KEY = '<GOOGLE API KEY>'

function createWindow () {
  const {BrowserWindow} = require('electron')
  let win = new BrowserWindow({width: 800, height: 600, frame: false})
  win.loadURL('http://localhost:3000/mirror')
  win.openDevTools()
  win.show()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
mirror.on('ready', createWindow)

// Quit when all windows are closed.
mirror.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

mirror.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})


app.use(express.static('css/'));

let models = new Models();

const conf = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US'
};

let in_session = false
let playing_music = false

const isStream = stream =>
	stream !== null &&
	typeof stream === 'object' &&
	typeof stream.pipe === 'function';


// MODELS

models.add({
  file: 'resources/francisco.pmdl',
  sensitivity: '0.44',
  hotwords: 'francisco'
});
models.add({
  file: 'resources/Go to sleep.pmdl',
  sensitivity: '0.5',
  hotwords: 'Go to sleep'
});
models.add({
  file: 'resources/play.pmdl',
  sensitivity: '0.55',
  hotwords: 'play'
});
models.add({
  file: 'resources/stop.pmdl',
  sensitivity: '0.5',
  hotwords: 'stop'
});
models.add({
  file: 'resources/directions to.pmdl',
  sensitivity: '0.5',
  hotwords: 'directions to'
})


if (typeof localStorage === "undefined" || localStorage === null) {
  let LocalStorage = require('node-localstorage').LocalStorage;
  localStorage = new LocalStorage('./scratch');
}

io.sockets.on('connection', function(socket) {
  console.log('connected')
  socket.on('PLAYING', function(data) {
    if(data == false) {
      playing_music = false
    }
    console.log('PLaying ended')
  })
})

app.get('/', function(req, res) {
  res.send('Francisco is ALIVE!')
})

app.get('/login', function(req, res) {
  res.redirect('https://www.amazon.com/ap/oa?client_id=<CLIENT TOKEN>&scope=alexa%3Aall&scope_data=%7B%22alexa%3Aall%22%3A%7B%22productID%22%3A%22<PRODUCT ID>%22%2C%22productInstanceAttributes%22%3A%7B%22deviceSerialNumber%22%3A%221231999%22%7D%7D%7D&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauthd')
})

app.get('/authd', function(req, res) {
  if (!req.param('code')) {
    res.send('FINALLY')
  } else {
    request.post({
      url: 'https://api.amazon.com/auth/o2/token',
      form: {
        grant_type: 'authorization_code',
        code: req.param('code'),
        client_id: '<CLIENT ID>',
        client_secret: '<CLIENT SECRET>',
        redirect_uri: 'http://localhost:3000/authd'
      }
    }).then((result) => {
      localStorage.setItem('CREDS', result);
      res.redirect('/done')
    })
  }
})

function refreshToken() {
    request.post({
      url: 'https://api.amazon.com/auth/o2/token',
      form: {
        grant_type: 'refresh_token',
        refresh_token: JSON.parse(localStorage.getItem('CREDS')).refresh_token,
        client_id: '<CLIENT ID>',
        client_secret: '<CLIENT SECRET>',
        redirect_uri: 'http://localhost:3000/authd'
      }
    }).then((result) => {
      console.log(result)
      localStorage.setItem('CREDS', result);
    })
}

app.get('/done', function(req, res) {
  res.send('Okay we got token ' + JSON.parse(localStorage.getItem('CREDS')).access_token)
})


function getYT(srch) {
  youtube.search.list({
      part: 'id,snippet',
      q: srch,
      maxResults: 1
    }, function (err, data){
      if (err) {
        console.error('Error: ' + err);
      }
      if (data) {
        console.log(JSON.stringify(data.items[0].id.videoId))
        io.sockets.emit('PLAY', data.items[0].id.videoId)
        playing_music = true
      }
    });
}

app.get('/mirror', function(req, res) {
  //setInterval(refreshToken, (1000 * 60) * 60)
  let CONNECT = spdy.createAgent({
    host: 'avs-alexa-na.amazon.com',
    port: 443,
    method: 'GET',
  }).once('error', function(err) {
    this.emit(err);
  });
  var request = https.get({
    agent: CONNECT,
    headers: {
      'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('CREDS')).access_token,
    },
    path: '/v20160207/directives'
  }, function(response) {
    if (response.statusCode == 403) {
      refreshToken()
      res.redirect('/mirror')
    } else {
      setInterval(ping, (1000 * 60) * 4.6)
      function recordCommand() {
          let non_alexa_cmd = false
          let internal_cmd = ''
          in_session = true
          player.play('dong.wav', function(err) {
            if (err) throw err
          })
          if(playing_music)
            io.sockets.emit('VOLUME', 2.5)
          io.sockets.emit('STATE', 'Listening');
          let file = fs.createWriteStream('command.wav', {
            encoding: 'binary'
          })
          let detector = new Detector({
            resource: "resources/common.res",
            models: models,
            audioGain: 2.0
          });
          detector.on('hotword', function(index, hotword) {
            console.log(hotword)
            if(hotword == 'stop' && playing_music == true) {
              console.log('IT WOULD STOP')
              playing_music = false
              io.sockets.emit('PAUSE', null)
            }
            if(hotword !== 'francisco' && hotword !== 'stop') {
              console.log('Switching to internal cmd')
              internal_cmd = hotword                   // Ask stackoverflow about starting a pipe after some time
              non_alexa_cmd = true
            }
          })
          let cmd = record.start({
            sampleRateHertz: 16000,
            threshold: 0,
          })
          let command_begun = false,
              time_silence = null,
              time = new Date()
          detector.on('silence', function() {
            if(command_begun && time_silence == null) {
              time_silence = time.getTime()
              console.log('SILENTO!')
            }
            else if(command_begun && time_silence !== null) {
              if(((new Date()).getTime()  - time_silence) > 5000) {
                record.stop()
                command_begun = false
              }
              else {
                console.log((new Date()).getTime() + ' minus ' + time_silence)
              }
            }
          })
          detector.on('sound', function () {
            if(command_begun) {
              time_silence = null
            }
            else
              command_begun = true
            console.log('SOUND!')
          })

          cmd.pipe(detector)
          cmd.pipe(file)
          eos(cmd, function(err) {
            if (err) return console.log('stream had an error or closed early');
            let formattedAudioStream = fs.createReadStream('command.wav');

            if(!non_alexa_cmd) {
              post(formattedAudioStream).then((res) => {
                console.log(res)
                io.sockets.emit('STATE', 'Ready to Listen');
                if(playing_music)
                  io.sockets.emit('VOLUME', 100)
                setTimeout(function() {
                  listen()
                }, 250);
              }).catch((err) => {
                if(err == 'BAD CODE') {
                  refreshToken()
                  io.sockets.emit('ERR', 'REFRESH')
                }
                console.log(err)
                if(playing_music)
                  io.sockets.emit('VOLUME', 100)
                io.sockets.emit('STATE', 'Ready to Listen');
                setTimeout(function() {
                  listen()
                }, 250);
              })
            }
            else {
              if (internal_cmd == 'play') {
                speech.recognize('command.wav', conf)
                  .then((results) => {
                    const transcription = results[0];
                    let res;
                    try {
                      res = transcription.split('play')[1].trim()
                      console.log(transcription.split('play')[1].trim());
                      getYT(transcription.split('play')[1].trim())
                      in_session = false
                      io.sockets.emit('VOLUME', 100)
                      io.sockets.emit('STATE', 'Ready to Listen');
                      io.sockets.emit('STATUS', 'Listening to ' + transcription.split('play')[1].trim());
                      setTimeout(function() {
                        listen()
                      }, 250);
                    }
                    catch (e) {
                      in_session = false
                      io.sockets.emit('STATE', 'Ready to Listen');
                      io.sockets.emit('STATUS', 'Sorry I didnt get that');
                      setTimeout(function() {
                        listen()
                      }, 250);
                    }
                  })
                  .catch((err) => {
                    console.error('ERROR:', err);
                  });
                }
                else if(internal_cmd == 'directions to') {
                  speech.recognize('command.wav', conf)
                    .then((results) => {
                      const transcription = results[0];
                      let res;
                      try {
                        res = transcription.split('to')[1].trim()
                        console.log(transcription.split('to')[1].trim());
                        geocoder.geocode(res).then(function(result) {
                          console.log([result[0].latitude, result[0].longitude])
                          io.sockets.emit('LOCATE', {lat: result[0].latitude, lng: result[0].longitude})
                        })
                        in_session = false
                        io.sockets.emit('STATE', 'Ready to Listen');
                        setTimeout(function() {
                          listen()
                        }, 250);
                      }
                      catch (e) {
                        in_session = false
                        io.sockets.emit('STATE', 'Ready to Listen');
                        io.sockets.emit('STATUS', 'Sorry I didnt get that');
                        setTimeout(function() {
                          listen()
                        }, 250);
                      }
                    })
                    .catch((err) => {
                      console.error('ERROR:', err);
                    });
                }
                else {
                  in_session = false
                  io.sockets.emit('STATE', 'Ready to Listen');
                  io.sockets.emit('STATUS', '...');
                  setTimeout(function() {
                    listen()
                  }, 250);
                }
            }
          });
          /*setTimeout(function() {
            record.stop()
            let formattedAudioStream = fs.createReadStream('command.wav');

            if(!non_alexa_cmd) {
              post(formattedAudioStream).then((res) => {
                console.log(res)
                io.sockets.emit('STATE', 'Ready to Listen');
                if(playing_music)
                  io.sockets.emit('VOLUME', 100)
                setTimeout(function() {
                  listen()
                }, 250);
              }).catch((err) => {
                if(err == 'BAD CODE') {
                  refreshToken()
                  io.sockets.emit('ERR', 'REFRESH')
                }
                console.log(err)
                if(playing_music)
                  io.sockets.emit('VOLUME', 100)
                io.sockets.emit('STATE', 'Ready to Listen');
                setTimeout(function() {
                  listen()
                }, 250);
              })
            }
            else {
              if (internal_cmd == 'play') {
                speech.recognize('command.wav', conf)
                  .then((results) => {
                    const transcription = results[0];
                    let res;
                    try {
                      res = transcription.split('play')[1].trim()
                      console.log(transcription.split('play')[1].trim());
                      getYT(transcription.split('play')[1].trim())
                      in_session = false
                      io.sockets.emit('VOLUME', 100)
                      io.sockets.emit('STATE', 'Ready to Listen');
                      io.sockets.emit('STATUS', 'Listening to ' + transcription.split('play')[1].trim());
                      setTimeout(function() {
                        listen()
                      }, 250);
                    }
                    catch (e) {
                      in_session = false
                      io.sockets.emit('STATE', 'Ready to Listen');
                      io.sockets.emit('STATUS', 'Sorry I didnt get that');
                      setTimeout(function() {
                        listen()
                      }, 250);
                    }
                  })
                  .catch((err) => {
                    console.error('ERROR:', err);
                  });
                }
                else if(internal_cmd == 'directions to') {
                  speech.recognize('command.wav', conf)
                    .then((results) => {
                      const transcription = results[0];
                      let res;
                      try {
                        res = transcription.split('to')[1].trim()
                        console.log(transcription.split('to')[1].trim());
                        geocoder.geocode(res).then(function(result) {
                          console.log([result[0].latitude, result[0].longitude])
                          io.sockets.emit('LOCATE', {lat: result[0].latitude, lng: result[0].longitude})
                        })
                        in_session = false
                        io.sockets.emit('STATE', 'Ready to Listen');
                        setTimeout(function() {
                          listen()
                        }, 250);
                      }
                      catch (e) {
                        in_session = false
                        io.sockets.emit('STATE', 'Ready to Listen');
                        io.sockets.emit('STATUS', 'Sorry I didnt get that');
                        setTimeout(function() {
                          listen()
                        }, 250);
                      }
                    })
                    .catch((err) => {
                      console.error('ERROR:', err);
                    });
                }
                else {
                  in_session = false
                  io.sockets.emit('STATE', 'Ready to Listen');
                  io.sockets.emit('STATUS', '...');
                  setTimeout(function() {
                    listen()
                  }, 250);
                }
            }
          }, 6000)*/
        }

      function listen() {
        console.log('listening');
        let detector = new Detector({
          resource: "resources/common.res",
          models: models,
          audioGain: 2.0
        });
        detector.on('hotword', function(index, hotword) {
          if (hotword === 'francisco' && !in_session) {
            record.stop().on('close', function() {
              recordCommand()
            })
          }
        })
        record.start({
          sampleRateHertz: 16000,
          threshold: 0,
        }).pipe(detector);
      }
      listen()

      res.render('mirror.ejs')
    }
  })

  request.on('error', function(err) {
    console.log(err)
  })
})


function ping() {
  let date = new Date()
  let options2 = spdy.createAgent({
    host: 'avs-alexa-na.amazon.com',
    port: 443,
    method: 'GET',
  }).once('error', function(err) {
    this.emit(err);
  });
  var request = https.get({
    agent: options2,
    headers: {
      'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('CREDS')).access_token,
    },
    path: '/ping'
  }, function(res) {
    if(res.statusCode == 403) {
      refreshToken()
    }
    console.log('PINGED with status code ' + res.statusCode + ' at ' +  date.getTime())
  })
  request.on('error', function(err) {
    console.log(err)
  })
}

server.listen(3000, function() {
  console.log('Runnign')
})


function post(audioBuffer) {
  return new Promise((resolve, reject) => {
    let BOUNDARY = 'BOUNDS';
    let BOUNDARY_DASHES = '--';
    let NEWLINE = '\r\n';
    let METADATA_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="metadata"';
    let METADATA_CONTENT_TYPE = 'Content-Type: application/json; charset=UTF-8';
    let AUDIO_CONTENT_TYPE = 'Content-Type: application/octet-stream';
    let AUDIO_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="audio"';

    let headers = {
      'Authorization': 'Bearer ' + JSON.parse(localStorage.getItem('CREDS')).access_token,
      'Content-Type': 'multipart/form-data; boundary=' + BOUNDARY
    };

    let metadata = {
      context: [{
        "header": {
          "namespace": "AudioPlayer",
          "name": "PlaybackState"
        },
        "payload": {
          "token": "",
          "offsetInMilliseconds": 0,
          "playerActivity": "FINISHED"
        }
      }, {
        "header": {
          "namespace": "Alerts",
          "name": "AlertsState"
        },
        "payload": {
          "allAlerts": [],
          "activeAlerts": [

          ]
        }
      }, {
        "header": {
          "namespace": "Speaker",
          "name": "VolumeState"
        },
        "payload": {
          "volume": 25,
          "muted": false
        }
      }, {
        "header": {
          "namespace": "SpeechSynthesizer",
          "name": "SpeechState"
        },
        "payload": {
          "token": "",
          "offsetInMilliseconds": 0,
          "playerActivity": "FINISHED"
        }
      }],
      event: {
        "header": {
          "namespace": "SpeechRecognizer",
          "name": "Recognize",
          "messageId": "test121343",
          "dialogRequestId": "dri1312576"
        },
        "payload": {
          "profile": "NEAR_FIELD",
          "format": "AUDIO_L16_RATE_16000_CHANNELS_1"
        }
      }
    };

    let postDataStart = [
      NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE, METADATA_CONTENT_DISPOSITION, NEWLINE, METADATA_CONTENT_TYPE,
      NEWLINE, NEWLINE, JSON.stringify(metadata), NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE,
      AUDIO_CONTENT_DISPOSITION, NEWLINE, AUDIO_CONTENT_TYPE, NEWLINE, NEWLINE
    ].join('');

    let postDataEnd = [NEWLINE, BOUNDARY_DASHES, BOUNDARY, BOUNDARY_DASHES, NEWLINE].join('');

    console.log('sending')
    let options = spdy.createAgent({
      host: 'avs-alexa-na.amazon.com',
      port: 443,
      method: 'POST',
    }).once('error', function(err) {
      this.emit(err);
    });
    var req = https.request({
      agent: options,
      headers: headers,
      encoding: 'binary',
      method: 'POST',
      path: '/v20160207/events'
    }, function(res) {
      console.log(res.statusCode)
      if (res.statusCode > 204) {
        console.log("ERR with return code " + res.statusCode)
        io.sockets.emit('STATE', 'BAD CODE');
        return reject('BAD CODE')
      } else if (res.statusCode == 204) {
        in_session = false
        io.sockets.emit('STATUS', 'No response');
        player.play('204.mp3', function(err) {
          if (err) throw err
        })
        reject('NO RESPONSE')
      }
      streamToBuffer(res, function(err, buffer) {
        console.log('response', buffer.length);
        if (err) {
          console.error('error', err);
          return false;
        }

        let parsedMessage = httpParser(buffer);
        var multipart = parsedMessage.multipart;

        if (Array.isArray(multipart)) {
          let i = 0
          let bodyBuffer_array = []
          multipart.forEach(function(part, index) {
            var headers = part.headers;
            var bodyBuffer = part.body;
            var contentType = _.get(headers, 'Content-Type');

            if (bodyBuffer) {
              console.log(contentType)
              if (contentType === 'application/octet-stream') {
                i++
                console.log(i + ' Audio detected')
                bodyBuffer_array.push(bodyBuffer)
                if (index == multipart.length - 1) {
                  console.log(bodyBuffer_array)
                  io.sockets.emit('STATE', 'Speaking');
                  playAudio(bodyBuffer_array)
                }
              } else if (contentType === 'application/json; charset=UTF-8') {
                var body = JSON.parse(bodyBuffer.toString('utf8'));
                console.log(body) //bookmark
              }
            }
          });
        }
      });
      let x = 0

      function playAudio(array) {
        fs.writeFileSync('audio.mp3', array[x])
        linear16('audio.mp3', 'google.wav').then(() => {
          speech.recognize('google.wav', conf)
            .then((results) => {
              const transcription = results[0];
              io.sockets.emit('STATUS', transcription);
            })
            .catch((err) => {
              console.error('ERROR:', err);
            });
          player.play('audio.mp3', function(err) {
            if (err) throw err
            if (x++ < array.length - 1) {
              playAudio(array)
            } else {
              in_session = false
              resolve('SUCCESS')
            }
          })
        });
      }

    });
    req.on('error', function(e) {
      console.log('problem with request: ' + e);
      in_session = false
      reject('ERR with request')
    });
    if (isStream(audioBuffer)) {
      streamToBuffer(audioBuffer, function(error, buffer) {
        if (error) {
          console.error(error);
          return false;
        }
        sendRequest(buffer); //check before this
      });
    } else if (Buffer.isBuffer(audioBuffer)) {
      sendRequest(audioBuffer);
    } else {
      console.error('Audio buffer invalid');
    }

    function sendRequest(audBuffer) {
      console.log('should sent data')
      req.write(postDataStart);
      console.log(postDataStart)
      req.write(audBuffer);
      console.log(audBuffer)
      req.write(postDataEnd);
      console.log(postDataEnd)
      req.end(null, function() {
        console.log('ended request and sent data')
      })
      io.sockets.emit('STATE', 'Loading...');
    }
  })
}
