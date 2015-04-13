var Router = require('../helpers/router.js'),
	async = require('async'),
	request = require('request'),
	ip = require('ip'),
	util = require('util'),
	zlib = require('zlib'),
	RequestSanitizer = require('../helpers/request-sanitizer.js');

//private fields
var modules, library, self, private = {};

private.headers = {};
private.loaded = false;

//constructor
function Files(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules && private.loaded) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.use(function (req, res, next) {
		var peerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

		if (peerIp == "127.0.0.1") {
			return next();
		}

		req.sanitize(req.headers, {
			port: "int",
			os: "string?",
			'share-port': {
				int: true,
				boolean: true
			},
			version: "string?"
		}, function (err, report, headers) {
			if (err) return next(err);
			if (!report.isValid) return {status: false, error: report.issues};


			var peer = {
				ip: ip.toLong(peerIp),
				port: private.headers.port,
				state: 2,
				os: private.headers.os,
				sharePort: Number(private.headers['share-port']),
				version: private.headers.version
			};


			if (peer.port > 0 && peer.port <= 65535 && peer.version == library.config.version) {
				modules.peer.update(peer);
			}

			next();
		});

	});

	router.get('/', function (req, res) {
		res.set(private.headers);
		modules.peer.list(100, function (err, peers) {
			return res.status(200).json({peers: !err ? peers : []});
		})
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.network.app.use('/peer', router);

	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

//public methods

//events
Transport.prototype.onBind = function (scope) {
	modules = scope;
}

Transport.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

//export
module.exports = Transport;