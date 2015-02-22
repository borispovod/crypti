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

function test(lable) {
	var b = modules.accounts.getAccountOrCreateByPublicKey('667e390ba5dcb5b79e371654027807459b1ab7becb4e778f73e9eec090205b10')
	var t = modules.transactions.getUnconfirmedTransactions(true);
	var sum = t.length && t
			.map(function (t) {
				if (t.senderPublicKey == '667e390ba5dcb5b79e371654027807459b1ab7becb4e778f73e9eec090205b10') {
					return t.amount + t.fee
				} else {
					return 0;
				}
			})
			.reduce(function (previousValue, currentValue, index, array) {
				return previousValue + currentValue;
			});
	/*console.log(lable.yellow, {
		balance: b.balance,
		unconfirmedBalance: b.unconfirmedBalance,
		unconfirmedTransactionsAmount: sum
	});*/
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

					test('w/o change');

					modules.round.flush();

					if (commonBlock.id == lastBlock.id) {
						modules.blocks.loadBlocksFromPeer(data.peer, commonBlock.id, function (err) {
							if (err) {
								modules.round.flush();
							}
							setImmediate(cb, err);
							test('after clean load');
						});
					} else {
						library.logger.info("Found common block " + commonBlock.id + " (at " + commonBlock.height + ")" + " with peer " + peerStr);
						modules.blocks.deleteBlocksBefore(commonBlock, function (err, backupBlocks) {
							if (err) {
								modules.round.flush();
								return setImmediate(cb, err);
							}

							test('after delete until common');

							library.logger.debug("Load blocks from peer " + peerStr);

							modules.blocks.loadBlocksFromPeer(data.peer, commonBlock.id, function (err) {

								test('after load');

								if (err) {
									library.logger.error(err);
									library.logger.log('ban 60 min', peerStr);
									modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);

									library.logger.info("Remove blocks again until " + commonBlock.id + " (at " + commonBlock.height + ")");
									modules.blocks.deleteBlocksBefore(commonBlock, function (err) {

										test('after delete until common #2');

										if (err) {
											library.logger.error(err);
											modules.round.flush();
											return setImmediate(cb);
										}

										library.logger.info("Restore stored blocks until " + backupBlocks[backupBlocks.length - 1].height);
										async.eachSeries(backupBlocks, function (block, cb) {
											modules.blocks.processBlock(block, false, cb);
										}, function (err) {

											test('after restore');

											modules.round.flush();
											cb(err);
										});
									});

								} else {
									setImmediate(cb);
								}
							});
						});
					}
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