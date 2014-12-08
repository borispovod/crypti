//require
var Router = require('../helpers/router.js');
var async = require('async');
var request = require('request');
var ip = require('ip');
var util = require('util');

//private
var modules, library, self;
var headers = {};

//constructor
function Transport(cb, scope) {
	library = scope;
	self = this;

	cb(null, this);
}

//public
Transport.prototype.run = function (scope) {
	modules = scope;

	headers = {
		os: modules.system.getOS(),
		version: modules.system.getVersion(),
		port: modules.system.getPort(),
		sharePort: modules.system.getSharePort()
	}
}

function _request(url, data, cb) {
	request.post(url, data, function (err, response, body) {
		if (!err && response.statusCode == 200) {
			cb(null, JSON.parse(body));
		} else {
			cb(err || response)
		}
	});
}

Transport.prototype.request = function (peer, method, data, cb) {
	if (!cb && (typeof(data) == 'function')) {
		cb = data;
		data = {};
	}
	if (!peer) {
		modules.peer.random(function (err, peer) {
			if (!err) {
				_request('http://' + ip.fromLong(peer.ip) + ':' + peer.port + '/peer' + method, data, function (err, body) {
					if (err) {
						modules.peer.remove(peer, function () {
							cb(err);
						});
					} else {
						cb(null, body);
					}
				});
			}else{
				setImmediate(cb, err);
			}
		});
	} else if (util.isArray(peer)) {
		async.eachLimit(peer, 2, function (item, cb) {
			_request('http://' + ip.fromLong(item.ip) + ':' + item.port + '/peer' + method, data, function (err, body) {
				if (err) {
					modules.peer.remove(peer, function () {
						cb();
					});
				} else {
					cb();
				}
			});
		}, cb)
	} else if (Object.prototype.toString.call(peer) == "[object Object]") {
		_request('http://' + ip.fromLong(peer.ip) + ':' + peer.port + '/peer' + method, data, function (err, body) {
			if (err) {
				modules.peer.remove(peer, function () {
					cb(err);
				});
			} else {
				cb(null, body);
			}
		});
	} else {
		cb('provide peer, method, [data,] cb')
	}
}

Transport.prototype.onBlockchainReady = function () {
	var router = new Router();

	router.post('/list', function (req, res) {
		res.set(headers);
		modules.peer.list(100, function (err, peers) {
			return res.status(200).json(peers || []);
		})
	});

	router.post('/transaction', function (req, res) {
		res.set(headers);
		console.log(req.body)
		//modules.transactions.processUnconfirmedTransaction
		return res.send(200)
	});

	router.post('/weight', function (req, res) {
		res.set(headers);
		return res.send(200, modules.block.getWeight());
	});

	library.app.use('/peer', router);

	modules.peer.add([{ip: 1754992519, port: 7040}, {ip: 2194884796, port: 7040}], function () {
		modules.peer.count(function (err, count) {
			if (count) {
				library.bus.message('peer ready');
				library.logger.info('peer ready, stored ' + count);
			} else {
				library.logger.warn('peer list is empty');
			}
		});
	});
}

//export
module.exports = Transport;