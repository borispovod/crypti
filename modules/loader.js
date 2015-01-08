var async = require('async'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	genesisBlock = require("../helpers/genesisblock.js"),
	ip = require("ip"),
	params = require('../helpers/params.js'),
	normalize = require('../helpers/normalize.js');

//private fields
var modules, library, self;

var loaded = false
var sync = false;
var loadingLastBlock = genesisBlock;
var total = 0;
var blocksToSync = 0;

//constructor
function Loader(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.get('/status', function (req, res) {
		res.json({
			success: true,
			loaded: self.loaded(),
			now: loadingLastBlock.height,
			blocksCount: total
		});
	});

	router.get('/status/sync', function (req, res) {
		res.json({
			success: true,
			sync: self.syncing(),
			blocks: blocksToSync,
			height: modules.blocks.getLastBlock().height
		});
	});

	library.app.use('/api/loader', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/loader', err)
		res.status(500).send({success: false, error: err});
	});
}

function loadBlocks(lastBlock, cb) {
	modules.transport.getFromRandomPeer('/weight', function (err, data) {
		if (err) {
			return cb();
		}

		var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
		library.logger.info("Load blocks from " + peerStr);

		if (modules.blocks.getWeight().lt(params.string(data.body.weight))) {
			sync = true;
			blocksToSync = params.int(data.body.height);

			if (lastBlock.id != genesisBlock.blockId) { //have to found common block

				library.logger.info("Find milestone block from " + peerStr);
				modules.blocks.getMilestoneBlock(data.peer, function (err, milestoneBlock) {
					if (err) {
						return cb(err);
					}

					library.logger.info("Find common block from " + peerStr);
					modules.blocks.getCommonBlock(data.peer, milestoneBlock, function (err, commonBlockId) {
						if (err) {
							return cb(err);
						}


						if (lastBlock.id != commonBlockId) {
							library.db.get("SELECT height FROM blocks WHERE id=$id", {$id: commonBlockId}, function (err, block) {
								if (err || !block) {
									return cb(err || 'block is null');
								}

								if (lastBlock.height - block.height > 1440) {
									modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);
									cb();
								} else {
									library.logger.info("Resolve fork before " + commonBlockId + " from " + peerStr);
									modules.blocks.deleteBlocksBefore(commonBlockId, function (err, backupBlocks) {
										if (err) {
											setImmediate(cb, err);
										} else {
											library.logger.info("Load blocks from peer " + peerStr);
											modules.blocks.loadBlocksFromPeer(data.peer, commonBlockId, function (err) {
												if (err) {
													library.logger.error(err);
													library.logger.info('ban 60 min', peerStr);
													modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);

													modules.blocks.deleteBlocksBefore(commonBlockId, function (err) {
														if (err) {
															library.logger.error(err);
															setImmediate(cb);
															return;
														}

														library.logger.info("First last block already: " + modules.blocks.getLastBlock().height + ", first block in backup: " + backupBlocks[0].height);
														async.eachSeries(backupBlocks, function (block, cb) {
															modules.blocks.processBlock(block, false, cb);
														}, cb);
													});
												} else {
													setImmediate(cb);
												}
											});
										}

									})
								}
							});
						} else { //found common block
							library.logger.info("Load blocks from peer " + peerStr);
							modules.blocks.loadBlocksFromPeer(data.peer, commonBlockId, cb);
						}
					})
				})
			} else { //have to load full db
				var commonBlockId = genesisBlock.blockId;
				library.logger.info("Load blocks from genesis from " + peerStr);
				modules.blocks.loadBlocksFromPeer(data.peer, commonBlockId, cb);
			}
		} else {
			cb();
		}
	});
}

function loadUnconfirmedTransactions(cb) {
	modules.transport.getFromRandomPeer('/transactions', function (err, data) {
		if (err) {
			return cb()
		}

		var transactions = params.array(data.body.transactions);

		for (var i = 0; i < transactions.length; i++) {
			transactions[i] = normalize.transaction(transactions[i]);
		}
		library.bus.message('receiveTransaction', transactions);
		cb();
	});
}

//public methods
Loader.prototype.loaded = function () {
	return loaded;
}

Loader.prototype.syncing = function () {
	return sync;
}

//events
Loader.prototype.onPeerReady = function () {
	debugger;
	process.nextTick(function nextLoadBlock() {
		library.sequence.add(function (cb) {
			var lastBlock = modules.blocks.getLastBlock();
			loadBlocks(lastBlock, function (err) {
				err && library.logger.error('loadBlocks timer', err);
				sync = false;
				blocksToSync = 0;
				cb()
				setTimeout(nextLoadBlock, 10 * 1000)
			});
		});
	});

	process.nextTick(function nextLoadUnconfirmedTransactions() {
		loadUnconfirmedTransactions(function (err) {
			err && library.logger.error('loadUnconfirmedTransactions timer', err);
			setTimeout(nextLoadUnconfirmedTransactions, 15 * 1000)
		})
	});

}

Loader.prototype.onBind = function (scope) {
	modules = scope;

	var offset = 0, limit = library.config.loading.loadPerIteration;

	modules.blocks.count(function (err, count) {
		if (err) {
			return library.logger.error('blocks.count', err)
		}

		total = count;
		library.logger.info('blocks ' + count);
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
						loadingLastBlock = lastBlockOffset;

						cb()
					});
				})
			}, function (err) {
				library.dbLite.close();
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

//export
module.exports = Loader;