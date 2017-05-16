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

# Running
1. After you've gotten those required resources, git clone this repository to your raspberrypi
2. cd to the directory and run `npm install`, now wait a few minutes for all of the dependencies to build
3. google any error you encounter and fix
4. run `electron .`, if you encounter and error refer to this: [Issue](https://github.com/Kitt-AI/snowboy/issues/63)


#ENJOY
