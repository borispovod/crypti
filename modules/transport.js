//require
var Router = require('../helpers/router.js');
var async = require('async');
var request = require('request');
var ip = require('ip');
var util = require('util');
var params = require('../helpers/params.js');

//private
var modules, library, self;
var headers = {};

//constructor
function Transport(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.use(function (req, res, next) {
		// write peer...
		modules.peer.update({
			ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
			port: Number(req.headers['port']),
			state: 1,
			os: req.headers['os'],
			sharePort: Number(!!req.headers['share-port']),
			version: req.headers['version']
		});

		next();
	});

	router.get('/list', function (req, res) {
		res.set(headers);
		modules.peer.list(100, function (err, peers) {
			return res.status(200).json({peers: !err ? peers : []});
		})
	});

	router.get("/blocks/ids", function (req, res) {
		res.set(headers);
		var id = params.string(req.query.id);
		if (!id) {
			return res.json({success: false, error: "Provide id in url"});
		}

		library.db.all("SELECT id FROM blocks WHERE height > (SELECT height FROM blocks where id=$id) LIMIT 1440", {$id: id}, function (err, blocks) {
			if (err) {
				console.log(err);
				return res.status(200).json({success: false, error: "Internal sql error"});
			} else {
				var ids = [];

				for (var i = 0; i < blocks.length; i++) {
					ids.push(blocks[i].id);
				}

				return res.status(200).json({ids: ids});
			}
		});
	});

	router.get("/blocks/milestone", function (req, res) {
		res.set(headers);

		var lastBlockId = params.string(req.query.lastBlockId);
		var lastMilestoneBlockId = params.string(req.query.lastMilestoneBlockId);
		if (!lastBlockId && !lastMilestoneBlockId) {
			return res.json({success: false, error: "Error, provide lastBlockId or lastMilestoneBlockId"});
		}

		if (lastBlockId == modules.blocks.getLastBlock().id) {
			return res.status(200).json({last: true, milestoneBlockIds: [lastBlockId]});
		}

		var blockId, height, jump, limit;
		var milestoneBlockIds = [];
		async.series([
			function (cb) {
				if (lastMilestoneBlockId) {
					library.db.get("SELECT height FROM blocks WHERE id=$id", {$id: lastMilestoneBlockId}, function (err, block) {
						if (err) {
							console.log(err);
							cb("Internal sql error");
						} else if (!block) {
							cb("Can't find block: " + lastMilestoneBlockId);
						} else {
							height = block.height;
							jump = Math.min(1440, modules.blocks.getLastBlock().height - height);
							height = Math.max(height - jump, 0);
							limit = 10;
							cb();
						}
					});
				} else if (lastBlockId) {
					height = modules.blocks.getLastBlock().height;
					jump = 10;
					limit = 10;
					setImmediate(cb);
				}
			}
		], function (error) {
			if (error) {
				return res.status(200).json({success: false, error: error});
			} else {
				library.db.get("SELECT id FROM blocks WHERE height = $height", {$height: height}, function (err, block) {
					if (err) {
						console.log(err);
						res.status(200).json({success: false, error: "Internal sql error"});
					} else if (!block) {
						res.status(200).json({milestoneBlockIds: milestoneBlockIds});
					} else {
						blockId = block.id;

						async.whilst(
							function () {
								return (height > 0 && limit-- > 0);
							},
							function (next) {
								milestoneBlockIds.push(blockId);
								library.db.get("SELECT id FROM blocks WHERE height = $height", {$height: height}, function (err, block) {
									if (err) {
										next(err);
									} else if (!block) {
										next("Internal error");
									} else {
										blockId = block.id;
										height = height - jump;
										next();
									}
								});
							},
							function (err) {
								if (err) {
									res.status(200).json({success: false, error: err});
								} else {
									res.status(200).json({milestoneBlockIds: milestoneBlockIds});
								}
							}
						)
					}
				});
			}
		});
	});

	router.get("/blocks", function (req, res) {
		res.set(headers);

		var lastBlockId = params.string(req.query.lastBlockId);

		// get 1400+ blocks with all data (joins) from provided block id
		modules.blocks.loadBlocksPart({limit: 1440, lastId: lastBlockId}, function (err, blocks) {
			return res.status(200).json({blocks: !err ? blocks : []});
		});
	});

	router.post("/blocks", function (req, res) {
		res.set(headers);

		var block = params.object(req.body.block);
		modules.blocks.parseBlock(block, function (err, block) {
			if (block.previousBlock == modules.blocks.getLastBlock().id) {
				modules.blocks.processBlock(block, true, function (err) {
					res.sendStatus(200);
				});
			} else if (block.previousBlock == modules.blocks.getLastBlock().previousBlock) {
				library.db.get("SELECT * FROM blocks WHERE id=$id", {$id: block.previousBlock}, function (err, previousBlock) {
					if (err || !previousBlock) {
						library.logger.error(err ? err.toString() : "Block " + block.previousBlock + " not found");
						return res.sendStatus(200);
					}

					var lastBlock = modules.blocks.getLastBlock();

					var hitA = modules.blocks.calculateHit(lastBlock, previousBlock),
						hitB = modules.blocks.calculateHit(block, previousBlock);

					if (hitA.ge(hitB)) {
						return res.sendStatus(200);
					}

					modules.blocks.popLastBlock(function (err) {
						if (err) {
							library.logger.error(err.toString());
							return res.sendStatus(200);
						}

						modules.blocks.processBlock(block, true, function (err) {
							if (err) {
								modules.blocks.processBlock(lastBlock);
							}

							return res.sendStatus(200);
						})
					});
				});
			} else {
				return res.sendStatus(200);
			}
		});

	});

	router.get("/transactions", function (req, res) {
			res.set(headers);
			// need to process headers from peer
			return res.status(200).json({transactions: modules.transactions.getUnconfirmedTransactions()});
		});

	router.post("/transactions", function (req, res) {
		res.set(headers);

		var transaction = params.object(req.body.transaction);

		transaction = modules.transactions.parseTransaction(transaction);
		modules.transactions.processUnconfirmedTransaction(transaction, true);

		return res.sendStatus(200);
	});

	router.get('/weight', function (req, res) {
		res.set(headers);
		return res.status(200).json({weight: modules.blocks.getWeight().toString()});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/peer', router);

	library.app.use(function (err, req, res, next) {
		library.logger.error('/peer', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

	cb(null, this);
}

//public
Transport.prototype.run = function (scope) {
	modules = scope;

	headers = {
		os: modules.system.getOS(),
		version: modules.system.getVersion(),
		port: modules.system.getPort(),
		'share-port': modules.system.getSharePort()
	}
}

function _request(peer, api, method, data, cb) {
	var req = {
		url: 'http://' + ip.fromLong(peer.ip) + ':' + peer.port + '/peer' + api,
		method: method,
		json: true,
		headers : headers
	};

	if (Object.prototype.toString.call(data) == "[object Object]" || util.isArray(data)) {
		req.json = data;
	} else {
		req.body = data;
	}

	if (cb) {
		request(req, function (err, response, body) {
			library.logger.trace(req.url, body);
			if (!err && response.statusCode == 200) {
				modules.peer.update({
					ip: peer.ip,
					port: Number(response.headers['port']),
					state: 1,
					os: response.headers['os'],
					sharePort: Number(!!response.headers['share-port']),
					version: response.headers['version']
				});
				cb(null, body);
			} else {
				modules.peer.state(peer.ip, peer.port, 2, 10);
				cb(err || response);
			}
		});
	} else {
		request(req);
	}
}

Transport.prototype.broadcast = function (peersCount, method, data, cb) {
	peersCount = peersCount || 1;
	if (!cb && (typeof(data) == 'function')) {
		cb = data;
		data = undefined;
	}
	modules.peer.list(peersCount, function (err, peers) {
		if (!err) {
			async.eachLimit(peers, 3, function (peer, cb) {
				// not need to check peer is offline or online, just send.
				_request(peer, method, "POST", data);
				setImmediate(cb);
			}, function () {
				cb && cb(null, {body: null, peer: peers});
			})
		} else {
			cb && setImmediate(cb, err);
		}
	});
}

Transport.prototype.getFromRandomPeer = function (method, cb) {
	modules.peer.list(1, function (err, peers) {
		if (!err && peers.length) {
			var peer = peers[0];
			_request(peer, method, "GET", undefined, function (err, body) {
				cb(err, {body: body, peer: peer});
			});
		} else {
			return cb(err || "Nothing peers in db");
		}
	});
}

Transport.prototype.getFromPeer = function (peer, method, cb) {
	_request(peer, method, "GET", undefined, function (err, body) {
		cb(err, {body: body, peer: peer});
	});
}

Transport.prototype.onBlockchainReady = function () {


	async.forEach(library.config.peers.list, function (peer, cb) {
		library.db.get("SELECT ip FROM peers WHERE ip = $ip", {$ip: ip.toLong(peer.ip)}, function (err, exists) {
			if (err) {
				return cb(err);
			} else if (!exists) {
				var st = library.db.prepare("INSERT INTO peers(ip, port, state, sharePort) VALUES($ip, $port, $state, $sharePort)");
				st.bind({
					$ip: ip.toLong(peer.ip),
					$port: peer.port,
					$state: 1,
					$sharePort: Number(true)
				});
				st.run(function (err) {
					cb(err);
				});
			} else {
				return cb();
			}
		});

	}, function (err) {
		if (err) {
			library.logger.error(err.toString());
		}

		modules.peer.count(function (err, count) {
			if (count) {
				library.bus.message('peerReady');
				library.logger.info('peer ready, stored ' + count);
			} else {
				library.logger.warn('peer list is empty');
			}
		});
	});
}

Transport.prototype.onUnconfirmedTransaction = function (transaction) {
	self.broadcast(100, '/transactions', {transaction: transaction});
}

Transport.prototype.onNewBlock = function (block) {
	self.broadcast(100, '/blocks', {block: block})
}

//export
module.exports = Transport;