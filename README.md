# Francisco
An Interactive Smart Mirror using AVS

# TODO
- [x] Authenticate with Amazon with LWA
- [x] Establish connection with AVS API
- [x] Send request to AVS and handle audio feedback
- [ ] Handle other Alexa capabilties (TODOS and such)
- [x] Implement Web Sockets and Design User Interface
- [x] Move everything to Raspberry Pi and assemble Mirror

# Set up
In Order to clone this repository locally and successfully run Francisco in it's entirety, you need these things:
  - RaspberryPi 3 running Debian Jessie
  - Node.js v6.10 [Change version accordingly](https://www.vultr.com/docs/installing-node-js-from-source-on-ubuntu-14-04)
  - `SoX` to install, copy and paste the following command: ` sudo apt-get install sox libsox-fmt-all`
  - install ffmpeg from source [Instructions](http://stackoverflow.com/questions/37369330/error-while-installing-ffmpeg-under-raspbian-debian-8-jessie)
  - a USB microphone and speakers
  - a Mirror... obviously 
  - Go to developer.amazon.com and create a new device project under AVS and substitute all the parts where it takes `<TOKEN SECRET>` or `<TOKEN CLIENT>` with yours
  - Then go to your security profile after youve created one and add this link to the `Allowed origin Login` and add `http://localhost:3000/login` then add `http://localhost:3000/authd` in `Allowed Redirect urls`

# Running
1. After you've gotten those required resources, git clone this repository to your raspberrypi
2. cd to the directory and run `npm install`, now wait a few minutes for all of the dependencies to build
3. google any error you encounter and fix
4. run `electron .`, if you encounter and error refer to this: [Issue](https://github.com/Kitt-AI/snowboy/issues/63)
5. you might encounter a localStorage Error, thats fine
6. if running successfully, go to `http://localhost:3000/login` to set up once

# Adding new internal commands
Francisco uses AVS for most of this commands, but when a certain hotword is spoken (like `play` since using AVS in development mode does not allow for Music playback) it then switches to internal command functions and the speech is not sent to AVS, let's take a closer look at the `play` internal command.

1. In order to add a new hotword, go to https://snowboy.kitt.ai, record a new hotword and download the .pmdl and add it to the `resources` folder
2. in the `main.js` file, add this:
```js
models.add({
  file: 'resources/YOUR HOTWORD FILE>.pmdl',
  sensitivity: '0.5',
  hotwords: '<YOUR HOTWORD>'
});
```
3. The logic for switching between AVS and internal commands are mostly written, so then you'd just need to figure out what to do according to what `internal_cmd` is equal to:
```js
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
```
4. Then voila, adding a new command is really up to the programmer, as you can really do anything you want with it once you configure the hotword.


# ENJOY
