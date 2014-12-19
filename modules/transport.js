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
		'share-port': modules.system.getSharePort()
	}
}

function _request(peer, api, method, data, cb) {
	var req = {
		url: 'http://' + ip.fromLong(peer.ip) + ':' + peer.port + '/peer' + api,
		method: method,
		json: true
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
	var router = new Router();

	router.get('/list', function (req, res) {
		res.set(headers);
		modules.peer.list(100, function (err, peers) {
			return res.status(200).json({peers: !err ? peers : []});
		})
	});

	router.get("/blocks/ids", function (req, res) {
		res.set(headers);

		library.db.all("SELECT id FROM blocks WHERE height > (SELECT height FROM blocks where id=$id) LIMIT 1440", {$id: req.query.id}, function (err, blocks) {
			if (err) {
				console.log(err);
				return res.status(200).json({error: "Internal sql error"});
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

		// get milestone block
		var lastBlockId = req.query.lastBlockId,
			lastMilestoneBlockId = req.query.lastMilestoneBlockId;

		if (lastBlockId == modules.blocks.getLastBlock().id) {
			return res.status(200).json({last: true, milestoneBlockIds: [lastBlockId]});
		}

		var blockId, height, jump, limit;
		var milestoneBlockIds = [];
		async.series([
			function (cb) {
				if (lastMilestoneBlockId != null) {
					library.db.get("SELECT height FROM blocks WHERE id=$id", {$id: lastMilestoneBlockId}, function (err, block) {
						if (err) {
							console.log(err);
							return cb("Internal sql error");
						} else if (!block) {
							return cb("Can't find block: " + lastMilestoneBlockId);
						} else {
							height = block.height;
							jump = Math.min(1440, modules.blocks.getLastBlock().height - height);
							height = Math.max(height - jump, 0);
							limit = 10;
							return cb();
						}
					});
				} else if (lastBlockId != null) {
					height = modules.blocks.getLastBlock().height;
					jump = 10;
					limit = 10;
					return cb();
				} else {
					return cb("Error, provide lastBlockId or lastMilestoneBlockId");
				}
			}
		], function (error) {
			if (error) {
				return res.status(200).json({error: error});
			} else {
				library.db.get("SELECT id FROM blocks WHERE height = $height", {$height: height}, function (err, block) {
					if (err) {
						console.log(err);
						return res.status(200).json({error: "Internal sql error"});
					} else if (!block) {
						return res.status(200).json({error: "Internal error"});
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
										return next(err);
									} else if (!block) {
										return next("Internal error");
									} else {
										blockId = block.id;
										height = height - jump;
										return next();
									}
								});
							},
							function (err) {
								if (err) {
									return res.status(200).json({error: err});
								} else {
									return res.status(200).json({milestoneBlockIds: milestoneBlockIds});
								}
							}
						)
					}
				});
			}
		});
	});

	router
		.get("/blocks", function (req, res) {
			res.set(headers);
			// get 1400+ blocks with all data (joins) from provided block id
			modules.blocks.loadBlocksPart({limit: 1440, lastId: req.query.lastBlockId}, function (err, blocks) {
				return res.status(200).json({blocks: !err ? blocks : []});
			});
		})
		.post(function (req, res) {
			res.set(headers);

			var block = req.body.block;
			modules.blocks.parseBlock(block, function (err, block) {
				if (block.previousBlock == modules.blocks.getLastBlock().id) {
					modules.blocks.processBlock(block, function () {
						res.sendStatus(200);
					});
				} else {
					// if block
					// calculate weight of block
					// if block weight great then last block weight - make backup of this block and remove it
					// if new block processed with errors - return last block from backup

				}
			});

		});

	router
		.get("/transactions", function (req, res) {
			res.set(headers);
			// need to process headers from peer
			return res.status(200).json({transactions: modules.transactions.getUnconfirmedTransactions()});
		})
		.post(function (req, res) {
			res.set(headers);

			var transaction = modules.transactions.parseTransaction(req.body.transaction);
			modules.transactions.processUnconfirmedTransaction(transaction);

			return res.sendStatus(200);
		});

	router.get('/weight', function (req, res) {
		res.set(headers);
		return res.status(200).json({weight: modules.blocks.getWeight().toString()});
	});

	library.app.use('/peer', router);

	library.app.use(function (err, req, res, next) {
		library.logger.error('/peer', err)
		if (!err) return next();
		res.status(500).send({success: false, error: err});
	});

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
	self.broadcast(100, '/transaction', {transaction: transaction});
}

//export
module.exports = Transport;