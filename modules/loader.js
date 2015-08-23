var async = require('async'),
	Router = require('../helpers/router.js'),
	util = require('util'),
	genesisBlock = require("../helpers/genesisblock.js"),
	ip = require("ip"),
	bignum = require('../helpers/bignum.js'),
	sandboxHelper = require('../helpers/sandbox.js');

require('colors');

//private fields
var modules, library, self, private = {}, shared = {};

private.loaded = false;
private.loadingLastBlock = genesisBlock;
private.total = 0;
private.blocksToSync = 0;
private.syncIntervalId = null;

//constructor
function Loader(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	private.attachApi();

	setImmediate(cb, null, self);
}

//private methods
private.attachApi = function () {
	var router = new Router();

	router.map(shared, {
		"get /status": "status",
		"get /status/sync": "sync"
	});

	library.network.app.use('/api/loader', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.syncTrigger = function (turnOn) {
	if (turnOn === false && private.syncIntervalId) {
		clearTimeout(private.syncIntervalId);
		private.syncIntervalId = null;
	}
	if (turnOn === true && !private.syncIntervalId) {
		setImmediate(function nextSyncTrigger() {
			library.network.io.sockets.emit('loader/sync', {
				blocks: private.blocksToSync,
				height: modules.blocks.getLastBlock().height
			});
			private.syncIntervalId = setTimeout(nextSyncTrigger, 1000);
		});
	}
}

private.loadFullDb = function (peer, cb) {
	var peerStr = peer ? ip.fromLong(peer.ip) + ":" + peer.port : 'unknown';

	var commonBlockId = genesisBlock.block.id;

	library.logger.debug("Load blocks from genesis from " + peerStr);

	modules.blocks.loadBlocksFromPeer(peer, commonBlockId, cb);
}

private.findUpdate = function (lastBlock, peer, cb) {
	var peerStr = peer ? ip.fromLong(peer.ip) + ":" + peer.port : 'unknown';

	library.logger.info("Looking for common block with " + peerStr);

	modules.blocks.getCommonBlock(peer, lastBlock.height, function (err, commonBlock) {
		if (err || !commonBlock) {
			return cb(err);
		}

		library.logger.info("Found common block " + commonBlock.id + " (at " + commonBlock.height + ")" + " with peer " + peerStr);

		if (lastBlock.height - commonBlock.height > 1440) {
			library.logger.log("long fork, ban 60 min", peerStr);
			modules.peer.state(peer.ip, peer.port, 0, 3600);
			return cb();
		}

		var overTransactionList = [];
		modules.transactions.undoUnconfirmedList(function (err, unconfirmedList) {
			if (err) {
				return process.exit(0);
			}

			for (var i = 0; i < unconfirmedList.length; i++) {
				var transaction = modules.transactions.getUnconfirmedTransaction(unconfirmedList[i]);
				overTransactionList.push(transaction);
				modules.transactions.removeUnconfirmedTransaction(unconfirmedList[i]);
			}

			if (commonBlock.id != lastBlock.id) {
				modules.round.directionSwap('backward');
			}

			modules.blocks.deleteBlocksBefore(commonBlock, function (err, backupBlocks) {
				if (commonBlock.id != lastBlock.id) {
					modules.round.directionSwap('forward');
				}
				if (err) {
					library.logger.fatal('delete blocks before', err);
					process.exit(1);
				}

				library.logger.debug("Load blocks from peer " + peerStr);

				modules.blocks.loadBlocksFromPeer(peer, commonBlock.id, function (err) {
					if (err) {
						modules.transactions.deleteHiddenTransaction();
						library.logger.error(err);
						library.logger.log("can't load blocks, ban 60 min", peerStr);
						modules.peer.state(peer.ip, peer.port, 0, 3600);

						library.logger.info("Remove blocks again until " + commonBlock.id + " (at " + commonBlock.height + ")");
						if (commonBlock.id != lastBlock.id) {
							modules.round.directionSwap('backward');
						}

						// fix 1000 blocks and check, if you need to remove more 1000 blocks - ban node

						modules.blocks.deleteBlocksBefore(commonBlock, function (err) {
							if (commonBlock.id != lastBlock.id) {
								modules.round.directionSwap('forward');
							}
							if (err) {
								library.logger.fatal('delete blocks before', err);
								process.exit(1);
							}

							if (backupBlocks.length) {
								library.logger.info("Restore stored blocks until " + backupBlocks[backupBlocks.length - 1].height);
								async.series([
									function (cb) {
										async.eachSeries(backupBlocks, function (block, cb) {
											modules.blocks.processBlock(block, false, cb);
										}, cb)
									}, function (cb) {
										async.eachSeries(overTransactionList, function (trs, cb) {
											modules.transactions.processUnconfirmedTransaction(trs, false, function () {
												cb()
											});
										}, cb);
									}
								], cb);
							} else {
								async.eachSeries(overTransactionList, function (trs, cb) {
									modules.transactions.processUnconfirmedTransaction(trs, false, cb);
								}, cb);
							}
						});
					} else {
						for (var i = 0; i < overTransactionList.length; i++) {
							modules.transactions.pushHiddenTransaction(overTransactionList[i]);
						}

						var trs = modules.transactions.shiftHiddenTransaction();
						async.whilst(
							function () {
								return trs
							},
							function (next) {
								modules.transactions.processUnconfirmedTransaction(trs, true, function () {
									trs = modules.transactions.shiftHiddenTransaction();
									next();
								});
							}, cb);
					}
				});
			});
		});
	});
}

private.loadBlocks = function (lastBlock, cb) {
	modules.transport.getFromRandomPeer({
		api: '/height',
		method: 'GET'
	}, function (err, data) {
		var peerStr = data && data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
		if (err || !data.body) {
			library.logger.log("Fail request at " + peerStr);
			return cb();
		}

		library.logger.info("Check blockchain on " + peerStr);

		data.body.height = parseInt(data.body.height);

		var report = library.scheme.validate(data.body.height, {type: "object", properties: {
			"height": {
				type: "integer",
				minimum: 0
			}
		}, required: ['height']});

		if (!report) {
			library.logger.log("Can't parse blockchain height: " + peerStr + "\n" + library.scheme.getLastError());
			return cb();
		}

		if (bignum(modules.blocks.getLastBlock().height).lt(data.body.height)) { //diff in chainbases
			private.blocksToSync = data.body.height;

			if (lastBlock.id != genesisBlock.block.id) { //have to found common block
				private.findUpdate(lastBlock, data.peer, cb);
			} else { //have to load full db
				private.loadFullDb(data.peer, cb);
			}
		} else {
			cb();
		}
	});
}

private.loadSignatures = function (cb) {
	modules.transport.getFromRandomPeer({
		api: '/signatures',
		method: 'GET'
	}, function (err, data) {
		if (err) {
			return cb();
		}

		library.scheme.validate(data.body.signatures, {
			type: "array",
			required: true,
			uniqueItems: true
		}, function (err) {
			if (err) {
				return cb();
			}

			async.eachSeries(data.body.signatures, function (signature, cb) {
				modules.multisignatures.processSignature(signature, function (err) {
					// important!
					setImmediate(cb);
				});
			}, cb);
		});
	});
}

private.loadUnconfirmedTransactions = function (cb) {
	modules.transport.getFromRandomPeer({
		api: '/transactions',
		method: 'GET'
	}, function (err, data) {
		if (err) {
			return cb()
		}

		var report = library.scheme.validate(data.body.transactions, {
			type: "array",
			required: true,
			uniqueItems: true
		});
		if (!report) {
			return cb();
		}

		var transactions = data.body.transactions;

		for (var i = 0; i < transactions.length; i++) {
			try {
				transactions[i] = library.logic.transaction.objectNormalize(transactions[i]);
			} catch (e) {
				var peerStr = data.peer ? ip.fromLong(data.peer.ip) + ":" + data.peer.port : 'unknown';
				library.logger.log('transaction ' + (transactions[i] ? transactions[i].id : 'null') + ' is not valid, ban 60 min', peerStr);
				modules.peer.state(data.peer.ip, data.peer.port, 0, 3600);
				return setImmediate(cb);
			}
		}
		modules.transactions.receiveTransactions(transactions, cb);
	});
}

private.loadBlockChain = function () {
	var offset = 0, limit = library.config.loading.loadPerIteration;

	modules.blocks.count(function (err, count) {
		if (err) {
			return library.logger.error('blocks.count', err)
		}

		private.total = count;
		library.logger.info('blocks ' + count);
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('current ' + offset);
				setImmediate(function () {
					modules.blocks.loadBlocksOffset(limit, offset, function (err, lastBlockOffset) {
						if (err) {
							return cb(err);
						}

						offset = offset + limit;
						private.loadingLastBlock = lastBlockOffset;

						cb();
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
	return !!private.syncIntervalId;
}

Loader.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Loader.prototype.onPeerReady = function () {
	setImmediate(function nextLoadBlock() {
		library.sequence.add(function (cb) {
			private.syncTrigger(true);
			var lastBlock = modules.blocks.getLastBlock();
			private.loadBlocks(lastBlock, cb);
		}, function (err) {
			err && library.logger.error('loadBlocks timer', err);
			private.syncTrigger(false);
			private.blocksToSync = 0;

			setTimeout(nextLoadBlock, 9 * 1000)
		});
	});

	setImmediate(function nextLoadUnconfirmedTransactions() {
		library.sequence.add(function (cb) {
			private.loadUnconfirmedTransactions(cb);
		}, function (err) {
			err && library.logger.error('loadUnconfirmedTransactions timer', err);

			setTimeout(nextLoadUnconfirmedTransactions, 14 * 1000)
		})
	});

	setImmediate(function nextLoadSignatures() {
		library.sequence.add(function (cb) {
			private.loadSignatures(cb);
		}, function (err) {
			err && library.logger.error('loadSignatures timer', err);

			setTimeout(nextLoadSignatures, 14 * 1000)
		})
	});
}

Loader.prototype.onBind = function (scope) {
	modules = scope;

	private.loadBlockChain();
}

Loader.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

//shared
shared.status = function (req, cb) {
	cb(null, {
		loaded: private.loaded,
		now: private.loadingLastBlock.height,
		blocksCount: private.total
	});
}

shared.sync = function (req, cb) {
	cb(null, {
		sync: self.syncing(),
		blocks: private.blocksToSync,
		height: modules.blocks.getLastBlock().height
	});
}

//export
module.exports = Loader;