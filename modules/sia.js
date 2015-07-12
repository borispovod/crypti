var util = require('util'),
	request = require('request'),
	fs = require('fs');

var modules, library, self, private = {};

private.loaded = false;

function Sia(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	setImmediate(cb, null, self);
}

Sia.prototype.download = function (nickname, path, cb) {
	var peer = library.config.sia.peer;
	var peerStr = "http://" + peer.address + ":" + peer.port;

	request.post({
		url: peerStr + "/download",
		json: {
			nickname: nickname
		},
		timeout: 1000 * 60
	}, function (err, resp, body) {
		if (err || resp.statusCode != 200) {
			return setImmediate(cb, err || "Can't download file");
		}

		if (body.success || (!body.success && body.error == "This file already downloaded, use /get to get file.")) {
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
			return setImmediate(cb, "Error downloading from sia: " + body);
		}
	});
}

Sia.prototype.onBind = function (scope) {
	modules = scope;
}

Sia.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

Sia.prototype.sandboxApi = function (call, data, cb) {

}

module.exports = Sia;