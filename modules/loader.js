var async = require('async');
var Router = require('../helpers/router.js');
var util = require('util');
var genesisBlock = require("../helpers/genesisblock.js");
var ip = require("ip");
var params = require('../helpers/params.js');

//private
var modules, library, self, loaded, sync, lastBlock = genesisBlock;
var total = 0;
var blocksToSync = 0;

//constructor
function Loader(cb, scope) {
	library = scope;
	loaded = false;
	sync = false;
	self = this;

	var router = new Router();

	router.get('/status', function (req, res) {
		res.json({
			success: true,
			loaded: self.loaded(),
			now: lastBlock.height,
			blocksCount: total
		});
	});

	router.get('/status/sync', function (req, res) {
		res.json({
			success: true,
			sync: self.syncing(),
			blocks : blocksToSync,
			height: modules.blocks.getLastBlock().height
		});
	});

	library.app.use('/api/loader', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/loader', err)
		res.status(500).send({success: false, error: err});
	});

	setImmediate(cb, null, self);
}

Loader.prototype.loaded = function () {
	return loaded;
}

Loader.prototype.syncing = function () {
	return sync;
}

//public
Loader.prototype.run = function (scope) {
	modules = scope;

	var offset = 0, limit = 1000;
	modules.blocks.count(function (err, count) {
		if (err) {
			return library.logger.error('blocks.count', err)
		}

		total = count;
		library.logger.info('blocks ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('current ' + offset);
				process.nextTick(function () {
					modules.blocks.loadBlocksOffset(limit, offset, function (err, lastBlockOffset) {
						if (err) {
							return cb(err);
						}
						offset = offset + limit;
						lastBlock = lastBlockOffset;
						cb()
					});
				})
			}, function (err) {
				if (err) {
					library.logger.error('loadBlocksOffset', err);
					if (err.block) {
						library.logger.error('blockchain failed at ', err.block.height)
						modules.blocks.deleteById(err.block.id, function (err, res) {
							loaded = true;
							library.logger.error('blockchain clipped');
							library.bus.message('blockchainReady');
						})
					}
				} else {
					loaded = true;
					library.logger.info('blockchain ready');
					library.bus.message('blockchainReady');
				}
			}
		)
	})
}

Loader.prototype.updatePeerList = function (cb) {
	modules.transport.getFromRandomPeer('/list', function (err, data) {
		if (err) {
			return cb();
		}

		var peers = params.array(data.body.peers);
		async.eachLimit(peers, 2, function (peer, cb) {
			peer = modules.peer.parsePeer(peer);

			if (ip.toLong("127.0.0.1") == peer.ip || peer.port == 0 || peer.port > 65535) {
				setImmediate(cb);
				return;
			}

			modules.peer.update(peer, cb);
		}, cb);
	});
}

Loader.prototype.loadBlocks = function (cb) {
	modules.transport.getFromRandomPeer('/weight', function (err, data) {
		if (err) {
			return cb();
		}

		var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
		library.logger.info("Load blocks from " + peerStr);

		if (modules.blocks.getWeight().lt(params.string(data.body.weight))) {
			sync = true;
			blocksToSync = data.body.height;

			if (modules.blocks.getLastBlock().id != genesisBlock.blockId) {

				library.logger.info("Find milestone block from " + peerStr);
				modules.blocks.getMilestoneBlock(data.peer, function (err, milestoneBlock) {
					if (err) {
						return cb(err);
					}

					library.logger.info("Find common block from " + peerStr);

					modules.blocks.getCommonBlock(data.peer, milestoneBlock, function (err, commonBlock) {
						if (err) {
							return cb(err);
						}


						if (modules.blocks.getLastBlock().id != commonBlock) {
							library.db.get("SELECT height FROM blocks WHERE id=$id", {$id: commonBlock}, function (err, block) {
								if (err || !block) {
									return cb(err || 'block is null');
								}

								if (modules.blocks.getLastBlock().height - block.height > 1440) {
									library.logger.info('ban 60 min', peerStr)
									modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);
									cb();
								} else {
									library.logger.info("Resolve fork before " + commonBlock + " from " + peerStr);
									modules.blocks.deleteBlocksBefore(commonBlock, function (err) {
										if (err) {
											return cb(err);
										}

										library.logger.info("Load blocks from peer " + peerStr);
										modules.blocks.loadBlocksFromPeer(data.peer, commonBlock, cb);
									})
								}
							});
						} else {
							library.logger.info("Load blocks from peer " + peerStr);

							modules.blocks.loadBlocksFromPeer(data.peer, commonBlock, cb);
						}
					})
				})
			} else {
				library.logger.info("Load blocks from genesis from " + peerStr);
				var commonBlock = genesisBlock.blockId;
				modules.blocks.loadBlocksFromPeer(data.peer, commonBlock, cb);
			}
		} else {
			cb();
		}
	});
}

Loader.prototype.getUnconfirmedTransactions = function (cb) {
	modules.transport.getFromRandomPeer('/transactions', function (err, data) {
		if (err) {
			return cb()
		}


		var transactions = params.array(data.body.transactions);

		async.forEach(transactions, function (transaction, cb) {
			modules.transactions.processUnconfirmedTransaction(modules.transactions.parseTransaction(transaction), true, cb);
		}, cb);
	});
}

Loader.prototype.onPeerReady = function () {
	function timersStart() {
		process.nextTick(function nextLoadBlock() {
			self.loadBlocks(function (err) {
				err && library.logger.error('loadBlocks timer', err);
				sync = false;
				// 10 seconds for testing
				setTimeout(nextLoadBlock, 10 * 1000)
			});
		});

		process.nextTick(function banManager() {
			modules.peer.banManager(function (err) {
				err && library.logger.error('banManager timer', err);
				setTimeout(banManager, 60 * 1000)
			});
		});

		process.nextTick(function nextGetUnconfirmedTransactions() {
			self.getUnconfirmedTransactions(function (err) {
				err && library.logger.error('getUnconfirmedTransactions timer', err);
				setTimeout(nextGetUnconfirmedTransactions, 15 * 1000)
			})
		});
	}

	process.nextTick(function nextUpdatePeerList() {
		self.updatePeerList(function (err) {
			err && library.logger.error('updatePeerList timer', err);
			!timersStart.started && timersStart();
			timersStart.started = true;
			setTimeout(nextUpdatePeerList, 60 * 1000);
		})
	});
}

Loader.prototype.onBlockchainReady = function () {
	//modules.blocks.count(function (err, count) {
	//	console.log('before', count);
	//	library.db.all('select b.id, t.id from blocks b ' +
	//	'left outer join trs t on t.blockId = b.id ' +
	//	"where b.height >= (SELECT height FROM blocks where id = '4256538783591516150')", function (err, res) {
	//		console.log('rows before', err, res ? res.length : 0)
	//
	//		modules.blocks.deleteById('4256538783591516150', function (err, res) {
	//			console.log('ok', err, res);
	//			modules.blocks.count(function (err, count) {
	//				console.log('after', count);
	//				library.db.all('select b.id, t.id from blocks b ' +
	//				'left outer join trs t on t.blockId = b.id ' +
	//				"where b.height >= (SELECT height FROM blocks where id = '4256538783591516150')", function (err, res) {
	//					console.log('rows after', err, res ? res.length : 0)
	//				})
	//			});
	//		})
	//	})
	//})
}

//export
module.exports = Loader;