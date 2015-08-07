var util = require('util'),
	request = require('request'),
	fs = require('fs'),
	sandboxHelper = require('../helpers/sandbox.js');

var modules, library, self, private = {}, shared = {};

private.loaded = false;

//constructor
function Sia(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	setImmediate(cb, null, self);
}

//private fields
Sia.prototype.uploadAscii = function (id, ascii, icon, cb) {
	var peer = library.config.sia.peer;
	var peerStr = "http://" + peer.address + ":" + peer.port;

	request.post({
		url: peerStr + "/upload",
		json: {
			ascii: ascii,
			id: id,
			icon: icon
		},
		timeout: 1000 * 60 * 2
	}, function (err, resp, body) {
		if (err || resp.statusCode != 200) {
			return setImmediate(cb, err || "Can't download file");
		}

		if (body.success) {
			return cb(null, body.file);
		} else {
			return cb("Can't add this file, this file already added");
		}
	});
}

//public methods
Sia.prototype.download = function (nickname, path, cb) {
	var peer = library.config.sia.peer;
	var peerStr = "http://" + peer.address + ":" + peer.port;

	request.post({
		url: peerStr + "/download",
		json: {
			nickname: nickname
		},
		timeout: 1000 * 60 * 2
	}, function (err, resp, body) {
		if (err || resp.statusCode != 200) {
			return setImmediate(cb, err || "Can't download file");
		}

		if (body.success || (!body.success && body.error == "This file already downloaded, use /get to get file.")) {
			if (typeof path === 'string') {
				// to file
				request.post({
					url: peerStr + "/get",
					json: {
						nickname: nickname
					},
					timeout: 1000 * 60
				}).on("error", function (err) {
					return setImmediate(cb, err);
				}).on('end', function () {
					return setImmediate(cb, null, path);
				}).pipe(fs.createWriteStream(path));
			} else {
				// to stream
				request.post({
					url: peerStr + "/get",
					json: {
						nickname: nickname
					},
					timeout: 1000 * 60
				}).on("error", function (err) {
					return setImmediate(cb, err);
				}).on('end', function () {
					return setImmediate(cb, null, path);
				}).pipe(path);
			}
		} else {
			return setImmediate(cb, "Error downloading from sia: " + body);
		}
	});
}

Sia.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Sia.prototype.onBind = function (scope) {
	modules = scope;
}

Sia.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

//shared

module.exports = Sia;