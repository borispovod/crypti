var async = require('async'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	genesisBlock = require("../helpers/genesisblock.js"),
	ip = require("ip"),
	bignum = require('bignum'),
	params = require('../helpers/params.js'),
	normalize = require('../helpers/normalize.js');
require('colors');

//private fields
var modules, library, self;

var loaded = false;
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
			loaded: loaded,
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
		res.status(500).send({success: false, error: err.toString()});
	});
}

function loadBlocks(lastBlock, cb) {
	modules.transport.getFromRandomPeer('/height', function (err, data) {
		if (err || !data.body) {
			return cb();
		}

		var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
		library.logger.debug("Load blocks from " + peerStr);

		if (bignum(modules.blocks.getLastBlock().height).lt(params.string(data.body.height || 0))) { //diff in chainbases
			sync = true;
			blocksToSync = params.int(data.body.height);

			if (lastBlock.id != genesisBlock.blockId) { //have to found common block
				library.logger.info("Looking for common block with " + peerStr);
				modules.blocks.getCommonBlock(data.peer, lastBlock.height, function (err, commonBlock) {
					if (err) {
						return cb(err);
					}

					if (!commonBlock) {
						return cb();
					}

					library.logger.info("Found common block " + commonBlock.id + " (at " + commonBlock.height + ")" + " with peer " + peerStr);

					modules.round.directionSwap('backward');
					modules.blocks.deleteBlocksBefore(commonBlock, function (err, backupBlocks) {
						modules.round.directionSwap('forward');
						if (err) {
							library.logger.fatal('delete blocks before', err);
							return setImmediate(cb, err);
						}

						library.logger.debug("Load blocks from peer " + peerStr);

						modules.blocks.loadBlocksFromPeer(data.peer, commonBlock.id, function (err) {
							if (err) {
								library.logger.error(err);
								library.logger.log('ban 60 min', peerStr);
								modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);

								library.logger.info("Remove blocks again until " + commonBlock.id + " (at " + commonBlock.height + ")");
								modules.round.directionSwap('backward');
								modules.blocks.deleteBlocksBefore(commonBlock, function (err) {
									modules.round.directionSwap('forward');
									if (err) {
										library.logger.fatal('delete blocks before', err);
										return setImmediate(cb);
									}

									if (backupBlocks.length) {
										library.logger.info("Restore stored blocks until " + backupBlocks[backupBlocks.length - 1].height);
										async.eachSeries(backupBlocks, function (block, cb) {
											modules.blocks.processBlock(block, false, cb);
										}, cb);
									} else {
										setImmediate(cb);
									}
								});
							} else {
								setImmediate(cb);
							}
						});
					});

				});
			} else { //have to load full db
				var commonBlockId = genesisBlock.blockId;
				library.logger.debug("Load blocks from genesis from " + peerStr);
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
			try {
				transactions[i] = normalize.transaction(transactions[i]);
			} catch (e) {
				var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
				library.logger.log('ban 60 min', peerStr);
				modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);
				return setImmediate(cb);
			}
		}
		library.bus.message('receiveTransaction', transactions);
		cb();
	});
}

function loadBlockChain() {
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
				if (err) {
					library.logger.error('loadBlocksOffset', err);
					if (err.block) {
						library.logger.error('blockchain failed at ', err.block.height)
						modules.blocks.simpleDeleteAfterBlock(err.block.id, function (err, res) {
							library.logger.error('blockchain clipped');
							library.bus.message('blockchainReady');
						})
					}
				} else {
					library.logger.info('blockchain ready');
					library.bus.message('blockchainReady');
				}
			}
		)
	});
}

//public methods
Loader.prototype.syncing = function () {
	return sync;
}

//events
Loader.prototype.onPeerReady = function () {
	process.nextTick(function nextLoadBlock() {
		library.sequence.add(function (cb) {
			var lastBlock = modules.blocks.getLastBlock();
			loadBlocks(lastBlock, cb);
		}, function (err) {
			err && library.logger.error('loadBlocks timer', err);
			sync = false;
			blocksToSync = 0;

			setTimeout(nextLoadBlock, 10 * 1000)
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

	loadBlockChain();
}

Loader.prototype.onBlockchainReady = function () {
	loaded = true;
}

//export
module.exports = Loader;