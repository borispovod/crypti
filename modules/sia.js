var util = require('util'),
	request = require('request'),
	ip = require('ip'),
	fs = require('fs'),
	sandboxHelper = require('../helpers/sandbox.js'),
	async = require('async');

var modules, library, self, private = {}, shared = {};

private.loaded = false;

//get random peer
private.getRandomPeers = function(count, cb) {
	library.dbLite.query("SELECT ip, port FROM sia_peers ORDER BY RANDOM() LIMIT " + count, {
		"ip": Number,
		"port": Number
	}, function (err, rows) {
		if (err || rows.length == 0) {
			return cb(err || "Sia peers not found")
		} else {
			var peers = [];
			for (var i in rows) {
				peers.push(
					{
						ip: ip.fromLong(rows[i].ip),
						port: rows[i].port
					}
				);
			}

			return cb(null, peers);
		}
	});
}

private.removePeer = function(peer, cb) {
	var generalPeer = library.config.sia.peers.find(function (item) {
		return item.ip == peer.ip && item.port == peer.port;
	});

	if (generalPeer) {
		return setImmediate(cb);
	}

	library.dbLite.query("DELETE FROM sia_peers WHERE ip = $ip and port = $port", {
		ip: ip.toLong(peer.ip),
		port: peer.port
	}, cb);
}

//download peers
private.downloadPeers = function(peer, cb) {
	request.get({
		url: "http://" + peer.ip + ":" + peer.port + "/peers",
		json: true
	}, function (err, resp, body) {
		if (err) {
			return cb(err);
		} else {
			// validate peers
			async.eachSeries(body.peers, function (peer, cb) {
				library.scheme.validate(peer, {
					type: "object",
					properties: {
						"ip": {
							type: "string"
						},
						"port": {
							type: "integer",
							minimum: 1,
							maximum: 65535
						}
					}
				}, function (err) {
					if (err) {
						return setImmediate(cb);
					}

					library.dbLite.query("INSERT OR IGNORE INTO sia_peers(ip, port) VALUES($ip, $port)", {
						ip: ip.toLong(peer.ip),
						port: peer.port
					}, function (err, r) {
						setImmediate(cb, err);
					});
				})
			}, cb);
		}
	});
}

//constructor
function Sia(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;

	setImmediate(cb, null, self);
}

//private fields
Sia.prototype.uploadAscii = function (id, ascii, icon, cb) {
	function uploadAsciiRecursive() {
		private.getRandomPeers(1, function (err, peers) {
			if (err) {
				library.logger.error(err);
				return cb(err.toString());
			} else {
				var peer = peers[0];
				var peerStr = "http://" + peer.ip + ":" + peer.port;

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
						library.logger.error(err.toString() || "Can't download file");
						private.removePeer(peer, function (removeErr) {
							library.logger.error(err? err.toString() : "Can't download file");
							return uploadAsciiRecursive();
						});
						//return setImmediate(cb, err || "Can't download file");
					} else {

						if (body.success) {
							return cb(null, body.file);
						} else {
							return cb("Can't add this file, this file already added");
						}
					}
				});
			}
		});
	}

	uploadAsciiRecursive();
}

//public methods
Sia.prototype.download = function (nickname, path, cb) {
	private.getRandomPeers(1, function (err, peers) {
		var peer = peers[0];
		var peerStr = "http://" + peer.ip + ":" + peer.port;

		request.post({
			url: peerStr + "/download",
			json: {
				nickname: nickname
			},
			timeout: 1000 * 60 * 2
		}, function (err, resp, body) {
			if (err || resp.statusCode != 200) {
				if (cb) {
					return setImmediate(cb, err || "Can't download file");
				} else {
					library.logger.error(err);
					return;
				}
			}

			if (body.success || (!body.success && body.error == "This file already downloaded, use /get to get file.")) {
				if (typeof path === 'string') {
					var stream = fs.createWriteStream(path);

					// to file
					request.post({
						url: peerStr + "/get",
						json: {
							nickname: nickname
						},
						timeout: 1000 * 60
					}).on("error", function (err) {
						if (cb) {
							return setImmediate(cb, err);
						}
					}).on('end', function () {
						if (cb) {
							return setImmediate(cb, null, path);
						}
					}).pipe(stream);
				} else {
					// to stream
					request.post({
						url: peerStr + "/get",
						json: {
							nickname: nickname
						},
						timeout: 1000 * 60
					}).on("error", function (err) {
						if (cb) {
							return setImmediate(cb, err);
						}
					}).on('end', function () {
						if (cb) {
							return setImmediate(cb, null, path);
						}
					}).pipe(path);
				}
			} else {
				if (cb) {
					return setImmediate(cb, "Error downloading from sia: " + body);
				}
			}
		});
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

	function downloadPeers(cb) {
		private.getRandomPeers(1, function (err, peers) {
			if (err) {
				cb(err);
			} else {
				private.downloadPeers(peers[0], function (err) {
					if (err) {
						private.removePeer(function (removeErr) {
							cb(removeErr || err);
						});
					};
				});
			}
		});
	}

	// save local peers
	async.eachSeries(library.config.sia.peers, function (peer, cb) {
		library.scheme.validate(peer, {
			type: "object",
			properties: {
				"ip": {
					type: "string"
				},
				"port": {
					type: "integer",
					minimum: 1,
					maximum: 65535
				}
			}
		}, function (err) {
			if (err) {
				return cb(err);
			}

			library.dbLite.query("INSERT OR IGNORE INTO sia_peers(ip, port) VALUES($ip, $port)", {
				ip: ip.toLong(peer.ip),
				port: peer.port
			}, function (err, r) {
				setImmediate(cb, err);
			});
		})
	}, function (err) {
		if (err) {
			library.logger.error(err);
		} else {
			downloadPeers(function (err) {
				if (err) {
					library.logger.error(err);
				} else {
					setTimeout(function downloadPeersTimeout() {
						downloadPeersTimeout(function (err) {
							if (err) {
								library.logger.error(err);
							}

							setTimeout(downloadPeersTimeout, 1000 * 60);
						})
					}, 1000 * 60);
				}
			});
		}
	});


}

//shared

module.exports = Sia;