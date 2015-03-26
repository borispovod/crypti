var program = require('commander');
var SegfaultHandler = require('segfault-handler');
var packageJson = require('../package.json');
var appConfig = require("../config.json");
var Crypti = require('../app.js');

program
    .version(packageJson.version)
    .option('-c, --config <path>', 'Config file path')
    .option('-p, --port <port>', 'Listening port number')
    .option('-a, --address <ip>', 'Listening host name or ip')
    .option('-b, --blockchain <path>', 'Blockchain db path')
    .option('-l, --peers [peers]', 'Peers list')
    .parse(process.argv);

if (program.config) {
    extend(appConfig, require(path.resolve(process.cwd(), program.config)));
}

if (program.port) {
    appConfig.port = program.port;
}

if (program.address) {
    appConfig.address = program.address;
}

if (program.hasOwnProperty('peers')) {
    if (typeof program.peers === 'boolean') {
        appConfig.peer.slit = [];
    } else {
        appConfig.peers.list = program.peers.split(',').map(function(peer){
            peer = peer.split(":");
            return {
                ip : peer.shift(),
                port : peer.shift() || appConfig.port
            };
        });
    }
}

if (program.blockchain) {
    appConfig.blockchain = program.blockchain;
}

SegfaultHandler.registerHandler();

process.on('uncaughtException', function (err) {
    // handle the error safely
    console.error('system error', err.stack);
});


var app = new Crypti(appConfig);

process.on('SIGINT', function(){
    app.exit();
    process.exit();
});