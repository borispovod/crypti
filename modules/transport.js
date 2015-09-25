var Router = require('../helpers/router.js'),
	async = require('async'),
	request = require('request'),
	ip = require('ip'),
	util = require('util'),
	_ = require('underscore'),
	zlib = require('zlib'),
	errorCode = require('../helpers/errorCodes.js').error;

//private fields
var modules, library, self, private = {};

private.headers = {};
private.loaded = false;

//constructor
function Transport(cb, scope) {
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
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.use(function (req, res, next) {
		var peerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';

		if (peerIp == "127.0.0.1") {
			return next();
		}

		req.headers['port'] = parseInt(req.headers['port']);
		req.headers['share-port'] = parseInt(req.headers['share-port']);

		req.sanitize(req.headers, {
			type: "object",
			properties: {
				port: {
					type: "integer",
					minimum: 1,
					maximum: 65535
				},
				os: {
					type: "string",
					maxLength: 64
				},
				'share-port': {
					type: 'integer',
					minimum: 0,
					maximum: 1
				},
				'version' : {
					type: 'string',
					maxLength: 11
				}
			},
			required: ["port", 'share-port', 'version']
		}, function (err, report, headers) {
			if (err) return next();
			if (!report.isValid) return next();

			var peer = {
				ip: ip.toLong(peerIp),
				port: req.headers['port'],
				state: 2,
				os: req.headers['os'],
				sharePort: Number(req.headers['share-port']),
				version: req.headers['version']
			};

			if (peer.port > 0 && peer.port <= 65535 && peer.version == library.config.version) {
				modules.peer.update(peer);
			}

			next();
		});

	});

	router.get('/list', function (req, res) {
		res.set(private.headers);
		modules.peer.list(100, function (err, peers) {
			return res.status(200).json({peers: !err ? peers : []});
		})
	});

	router.get("/blocks/common", function (req, res, next) {
		res.set(private.headers);

		req.sanitize(req.query, {
			type: "object",
			properties: {
				max: {
					type: 'integer'
				},
				min: {
					type: 'integer'
				},
				ids: {
					type: 'string',
					format: 'splitarray'
				}
			},
			required: ['max', 'min', 'ids']
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issue});


			var max = query.max;
			var min = query.min;
			var ids = query.ids.split(',');

			ids = ids.filter(function (id) {
				return /^\d+$/.test(id);
			});

			var escapedIds = ids.map(function (id) {
				return "'" + id + "'";
			});


			if (!escapedIds.length) {
				var report = library.scheme.validate(req.headers, {
					type: "object",
					properties: {
						port: {
							type: "integer",
							minimum: 1,
							maximum: 65535
						}
					},
					required: ['port']
				});

				if (report) {
					var peerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
					var peerStr = peerIp ? peerIp + ":" + req.headers['port'] : 'unknown';
					library.logger.log('common block request is not valid, ban 60 min', peerStr);
					modules.peer.state(ip.toLong(peerIp), req.headers['port'], 0, 3600);
				}

				return res.json({success: false, error: errorCode("BLOCKS.WRONG_ID_SEQUENCE")});
			}

			library.dbLite.query("select max(height), id, previousBlock, timestamp, lower(hex(blockSignature)) from blocks where id in (" + escapedIds.join(',') + ") and height >= $min and height <= $max", {
				"max": max,
				"min": min
			}, {
				"height": Number,
				"id": String,
				"previousBlock": String,
				"timestamp": Number,
				"blockSignature": String
			}, function (err, rows) {
				if (err) {
					return res.json({success: false, error: errorCode("COMMON.DB_ERR")});
				}

				var commonBlock = rows.length ? rows[0] : null;
				return res.json({success: true, common: commonBlock});
			});
		});
	});

	router.get("/blocks", function (req, res, next) {
		res.set(private.headers);

		req.sanitize(req.query, {type: 'object', properties: { lastBlockId: { type : 'string' }}}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			// get 1400+ blocks with all data (joins) from provided block id
			var blocksLimit = 1440;

			modules.blocks.loadBlocksData({
				limit: blocksLimit,
				lastId: query.lastBlockId
			}, {plain: true}, function (err, data) {
				res.status(200);
				if (err) {
					return res.json({blocks: ""});
				}

				res.json({blocks: data});

			});
		});
	});

	router.post("/blocks", function (req, res) {
		res.set(private.headers);

		var report = library.scheme.validate(req.headers, {
			type: "object",
			properties: {
				port: {
					type: "integer",
					minimum: 1,
					maximum: 65535
				}
			},
			required: ['port']
		});

		var port = req.headers['port'];

		try {
			var block = library.logic.block.objectNormalize(req.body.block);
		} catch (e) {
			var peerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
			var peerStr = peerIp ? peerIp + ":" + (isNaN(port)? 'unknown' : port) : 'unknown';
			library.logger.log('block ' + (block ? block.id : 'null') + ' is not valid, ban 60 min', peerStr);
			console.log(req.body.block);

			if (peerIp && report) {
				modules.peer.state(ip.toLong(peerIp), port, 0, 3600);
			}

			return res.sendStatus(200);
		}

		library.bus.message('receiveBlock', block);

		res.sendStatus(200);
	});

	router.get("/transactions", function (req, res) {
		res.set(private.headers);
		// need to process headers from peer
		res.status(200).json({transactions: modules.transactions.getUnconfirmedTransactionList()});
	});

	router.post("/transactions", function (req, res) {
		res.set(private.headers);

		var report = library.scheme.validate(req.headers, {
			type: "object",
			properties: {
				port: {
					type: "integer",
					minimum: 1,
					maximum: 65535
				}
			},
			required: ['port']
		});


		var transaction = null;
		try {
			transaction = library.logic.transaction.objectNormalize(req.body.transaction);
		} catch (e) {
				var peerIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
				var peerStr = peerIp ? peerIp + ":" + (isNaN(req.headers['port'])? 'unknown' : req.headers['port']) : 'unknown';
				library.logger.log('recieved transaction ' + (transaction ? transaction.id : 'null') + ' is not valid, ban 60 min', peerStr);
				console.log(req.body.transaction);

				if (peerIp && report) {
					console.log(peerIp, req.headers['port'], report);
					modules.peer.state(ip.toLong(peerIp), req.headers['port'], 0, 3600);
				}

				return res.status(200).json({success: false, message: "Invalid transaction body"});
		}

		library.sequence.add(function (cb) {
			modules.transactions.receiveTransactions([transaction], cb);
		}, function (err) {
			if (err) {
				res.status(200).json({success: false, message: err});
			} else {
				res.status(200).json({success: true});
			}
		});
	});

	router.get('/height', function (req, res) {
		res.set(private.headers);
		res.status(200).json({
			height: modules.blocks.getLastBlock().height
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/peer', router);

	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

//public methods
Transport.prototype.broadcast = function (peersCount, options, cb) {
	peersCount = peersCount || 1;

	modules.peer.list(peersCount, function (err, peers) {
		if (!err) {
			async.eachLimit(peers, 3, function (peer, cb) {
				self.getFromPeer(peer, options);

				setImmediate(cb);
			}, function () {
				cb && cb(null, {body: null, peer: peers});
			})
		} else {
			cb && setImmediate(cb, err);
		}
	});
}

Transport.prototype.getFromRandomPeer = function (options, cb) {
	async.retry(20, function (cb) {
		modules.peer.list(1, function (err, peers) {
			if (!err && peers.length) {
				var peer = peers[0];
				self.getFromPeer(peer, options, cb);
			} else {
				return cb(err || "No peers in db");
			}
		});
	}, function (err, results) {
		cb(err, results)
	});
}

/**
 * Send request to selected peer
 * @param {object} peer Peer object
 * @param {object} options Request lib params with special value `api` which should be string name of peer's module
 * web method
 * @param {function} cb Result Callback
 * @returns {*|exports} Request lib request instance
 * @private
 * @exmplae
 *
 * // Send gzipped request to peer's web method /peer/blocks.
 * .getFromPeer(peer, {api:'/blocks', gzip:true}, function(err, data){
 * 	// process request
 * });
 */
Transport.prototype.getFromPeer = function (peer, options, cb) {
	var url;
	if (options.api) {
		url = '/peer' + options.api
	} else {
		url = options.url;
	}

	var req = {
		url: 'http://' + ip.fromLong(peer.ip) + ':' + peer.port + url,
		method: options.method,
		json: true,
		headers: _.extend({}, private.headers, options.headers),
		timeout: library.config.peers.options.timeout
	};

	if (Object.prototype.toString.call(options.data) === "[object Object]" || util.isArray(options.data)) {
		req.json = options.data;
	} else {
		req.body = options.data;
	}

	return request(req, function (err, response, body) {
		if (err || response.statusCode != 200) {
			library.logger.debug('request', {
				url: req.url,
				statusCode: response ? response.statusCode : 'unknown',
				err: err
			});

			if (peer) {
				if (err && (err.code == "ETIMEDOUT" || err.code == "ESOCKETTIMEDOUT" || err.code == "ECONNREFUSED")) {
					modules.peer.remove(peer.ip, peer.port, function (err) {
						if (!err) {
							library.logger.info('remove peer ' + req.method + ' ' + req.url)
						}
					});
				} else {
					modules.peer.state(peer.ip, peer.port, 0, 600, function (err) {
						if (!err) {
							library.logger.info('ban 10 min ' + req.method + ' ' + req.url);
						}
					});
				}
			}
			cb && cb(err || ('request status code' + response.statusCode));
			return;
		}

		response.headers['port'] = parseInt(response.headers['port']);
		response.headers['share-port'] = parseInt(response.headers['share-port']);

		var report = library.scheme.validate(response.headers, {
			type: "object",
			properties: {
				os: {
					type: "string",
					maxLength: 64
				},
				port: {
					type: "integer",
					minimum: 1,
					maximum: 65535
				},
				'share-port': {
					type: "integer",
					minimum: 0,
					maximum: 1
				},
				version: {
					type: "string",
					maxLength: 11
				}
			},
			required: ['port', 'share-port', 'version']
		});

		var port = req.headers['port'];
		if (!report) {
			return cb && cb(null, {body: body, peer: peer});
		}

		if (port > 0 && port <= 65535 && response.headers['version'] == library.config.version && report) {
			modules.peer.update({
				ip: peer.ip,
				port: req.headers['port'],
				state: 2,
				os: response.headers['os'],
				sharePort: Number(!!response.headers['share-port']),
				version: response.headers['version']
			});
		}

		cb && cb(null, {body: body, peer: peer});
	});
}

//events
Transport.prototype.onBind = function (scope) {
	modules = scope;

	private.headers = {
		os: modules.system.getOS(),
		version: modules.system.getVersion(),
		port: modules.system.getPort(),
		'share-port': modules.system.getSharePort()
	}
}

Transport.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

Transport.prototype.onUnconfirmedTransaction = function (transaction, broadcast) {
	if (broadcast) {
		self.broadcast(100, {api: '/transactions', data: {transaction: transaction}, method: "POST"});
		library.network.io.sockets.emit('transactions/change', {});
	}
}

Transport.prototype.onNewBlock = function (block, broadcast) {
	if (broadcast) {
		self.broadcast(100, {api: '/blocks', data: {block: block}, method: "POST"});
		library.network.io.sockets.emit('blocks/change', {});
	}
}

//export
module.exports = Transport;