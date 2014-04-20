var express = require('express'),
    events = require('events'),
    util = require('util'),
    Peer = require("./peer.js"),
    request = require("request");

var Seed = function (port, peerProcessor, peer) {
    events.EventEmitter.call(this);

    this.port = port;
    this.mypeer = peer;
    this.peerprocessor = peerProcessor;
    this.app = express();

    this.app.configure("development", function () {
        this.app.use(express.logger('dev'));
        this.app.use(express.errorHandler());
    }.bind(this));

    this.app.configure(function () {
        this.app.use(this.app.router);
    }.bind(this));

    this.listen = function (port) {
        if (port) {
            this.port = port;
        }

        this.app.listen(this.port, function (err) {
            if (err) {
                console.log(err);
            } else {
                console.log("Seed listen on " + this.port);
                this.app.get("/p2p", this.processRequest);
            }
        }.bind(this));
    }

    this.connect = function (ip, port, cb) {
        var method = "connected";
        var url = "http://" + ip + ":" + port + "/p2p?method=" + method;

        var options = {
            url : url,
            headers: {
                'node-info' : new Buffer(JSON.stringify(this.mypeer), 'utf8').toString('base64')
            }
        };

        request.get(options);

        if (cb) {
            cb(null, true);
        } else {
            return true;
        }
    }

    this.processRequest = function (req, res) {
        var method = req.query.method;
        var peer;

        if (!req.headers["node-info"]) {
            return res.json({ error: "Not provided node-info header!" });
        } else {
            var nodeInfoJson = new Buffer(req.headers["node-info"], 'base64').toString("utf8");
            var nodeInfo;

            try {
                nodeInfo = JSON.parse(nodeInfoJson);
            } catch (e) {
                console.log(e);
                return res.json({ error : "Invalid json in node-info header! "});
            }

            if (!nodeInfo.port || !nodeInfo.version || !nodeInfo.port) {
                peer = new Peer(nodeInfo.port, nodeInfo.version, nodeInfo.port, req.connection.remoteAddress);
                this.peerprocessor.addPeer(peer);
            }
        }

        var jsonParams;

        if (!method) {
            return res.json({ error : "Not provided method!" });
            return;
        }

        if (req.query.params) {
            jsonParams = new Buffer(req.query.params, "base64").toString("utf8");
        }

        if (jsonParams) {
            try {
                params = JSON.parse(jsonParams);
            } catch (e) {
                console.log(e);
                return res.json({ error : "Invalid json in params!" });
            }
        }

        this.emit(method, res, jsonParams, peer.getId());
    }

    this.sendToPeer = function (peerId, method, params, cb) {
        var peer = this.peerprocessor.getPeer(id);
        if (!peer) {
            if (cb) {
                return cb("Peer not found by id: " + peerId);
            } else {
                return false;
            }
        } else {
            var params64;
            if (params) {
                params64 = new Buffer(JSON.stringify(params), 'utf8').toString('base64');
            }

            var url = "http://" + peer.ip + ":" + peer.port + "/p2p?method=" + method;

            if (params64) {
                url += "&params=" + params64;
            }

            var options = {
                url : url,
                headers: {
                    'node-info' : new Buffer(JSON.stringify(this.mypeer), 'utf8').toString('base64')
                }
            };

            request.get(options);

            if (cb) {
                cb(null, true);
            } else {
                return true;
            }
        }
    }
}

util.inherits(Seed, events.EventEmitter);

module.exports = Seed;