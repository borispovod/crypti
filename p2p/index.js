var p2proutes = require('./p2proutes.js');

module.exports.initRoutes = function (app) {
    p2proutes(app);
}

module.exports.peerprocessor = require("./peerprocessor.js");
module.exports.peer = require("./peer.js");