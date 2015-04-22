# DOCKER-VERSION 0.3.4
FROM    ubuntu:14.04
# Install Node.js and npm
RUN	apt-get update && apt-get upgrade
RUN	apt-get install -y curl
RUN	apt-get install -y nodejs-legacy
RUN	apt-get install -y npm
RUN	npm -g update npm
RUN	npm install -g forever

ADD . /src/
RUN	cd src; npm install

EXPOSE  6040
CMD forever /src/app.js

