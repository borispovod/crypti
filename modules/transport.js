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
	var req = {
		url: url,
		method: 'POST'
	};
	if (Object.prototype.toString.call(data) == "[object Object]" || util.isArray(data)){
		req.json = data;
	}else{
		req.body = data;
	}
	request(req, function (err, response, body) {
		if (!err && response.statusCode == 200) {
			cb(null, body);
		} else {
			cb(err || response)
		}
	});
}

Transport.prototype.request = function (peersCount, method, data, cb) {
	peersCount = peersCount || 1;
	if (!cb && (typeof(data) == 'function')) {
		cb = data;
		data = {};
	}
	modules.peer.list(peersCount, function (err, peers) {
		if (!err) {
			async.eachLimit(peers, 3, function (peer, cb) {
				_request('http://' + ip.fromLong(peer.ip) + ':' + peer.port + '/peer' + method, data, function (err, body) {
					if (err) {
						//modules.peer.remove(peer, function () {
						//	cb();
						//});
						cb(err);
					} else {
						cb();
					}
				});
			}, cb)
		} else {
			setImmediate(cb, err);
		}
	});
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
		console.log('get /transaction', req.body)
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