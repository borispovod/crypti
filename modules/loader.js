var async = require('async');
var Router = require('../helpers/router.js');
var util = require('util');
var genesisBlock = require("../helpers/genesisblock.js")

//private
var modules, library, self, loaded;
var total = 0;

//constructor
function Loader(cb, scope) {
	library = scope;
	loaded = false;
	self = this;

	var router = new Router();

	router.get('/status', function (req, res) {
		if (modules.blocks.getLastBlock()) {
			return res.json({
				success: true,
				loaded: self.loaded(),
				now: modules.blocks.getLastBlock().height,
				blocksCount: total
			});
		} else {
			return res.json({success: false});
		}
	})

	library.app.use('/api/loader', router);

	cb(null, this);
}

Loader.prototype.loaded = function () {
	return loaded;
}

//public
Loader.prototype.run = function (scope) {
	modules = scope;

	var offset = 0, limit = 1000;
	modules.blocks.count(function (err, count) {
		total = count;
		library.logger.info('blocks ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('current ' + offset);
				process.nextTick(function () {
					modules.blocks.loadBlocksPart(limit, offset, null, function (err, res) {
						offset = offset + limit;
						cb(err, res)
					});
				})
			}, function (err, res) {
				if (err) {
					library.logger.error(err);
				}

				loaded = true;
				library.logger.info('blockchain ready');

				library.bus.message('blockchain ready');
			}
		)
	})
}

Loader.prototype.updatePeerList = function (cb) {
	modules.transport.getFromRandomPeer('/list', function (err, data) {
		if (!err) {
			modules.peer.add(data.body.peers, cb);
		} else {
			cb(err);
		}
	});
}

Loader.prototype.loadBlocks = function (cb) {
	modules.transport.getFromRandomPeer('/weight', function (err, data) {
		if (err) {
			return cb(err);
		} else {
			if (modules.blocks.getWeight().lt(data.body.weight)) {
				var commonBlock = genesisBlock.blockId;

				if (modules.blocks.getLastBlock().id != commonBlock) {
					var isLastBlock = false,
						lastBlock = null,
						lastMilestoneBlockId = null;

					async.whilst(
						function () {
							return !isLastBlock;
						},
						function (next) {
							if (lastMilestoneBlockId == null) {
								lastBlock = modules.blocks.getLastBlock().id;
							} else {
								lastMilestoneBlockId = lastMilestoneBlockId;
							}

							modules.transport.getFromPeer(data.peer, "/blocks/milestone?lastBlockId=" + lastBlock + "&" + "lastMilestoneBlockId=" + lastMilestoneBlockId, function (err, data) {
								if (err) {
									return next(err);
								} else if (data.body.error) {
									return next(data.body.error);
								} else {
									async.eachSeries(data.body.milestoneBlockIds, function (blockId, cb) {
										library.db.get("SELECT id FROM blocks WHERE id = $id", {$id: blockId}, function (err, block) {
											if (err) {
												return cb(err);
											} else if (block) {
												return cb();
											} else {
												return cb(true);
											}
										}, function (errOrFinish) {
											if (errOrFinish === true) {
												//
											}
										});
									});
									/*

									 if (!json.milestoneBlockIds) {
									 return next({ err : "Can't find block" });
									 } else if (json.milestoneBlockIds.length == 0) {
									 return next({ err : null, milestoneBlock : genesisblock.blockId});
									 } else {
									 for (var i = 0; i < json.milestoneBlockIds.length; i++) {
									 var blockId = json.milestoneBlockIds[i];

									 if (this.blocks[blockId]) {
									 return next({ err : null, milestoneBlock : blockId });
									 } else {
									 lastMilestoneBlockId = blockId;
									 }
									 }

									 next();
									 }*/
								}
							});
						},
						function (err) {
							if (err) {
								return cb(err);
							}
						}
					)

				} else {
					modules.transport
				}
			} else {
				return cb();
			}
		}
	});
}

Loader.prototype.getUnconfirmedTransactions = function (cb) {
	modules.transport.getFromRandomPeer('/transactions', function (err, data) {
		cb(err, data.body)
		//if (!err) {
		//	modules.peer.add(data.body, cb);
		//} else {
		//	cb(err);
		//}
	});
}

Loader.prototype.onPeerReady = function () {
	process.nextTick(function nextUpdatePeerList() {
		self.updatePeerList(function () {
			setTimeout(nextUpdatePeerList, 60 * 1000);

			process.nextTick(function nextLoadBlock() {
				self.loadBlocks(function () {
					setTimeout(nextLoadBlock, 30 * 1000)
				})
			});

			process.nextTick(function nextGetUnconfirmedTransactions() {
				self.getUnconfirmedTransactions(function () {
					setTimeout(nextGetUnconfirmedTransactions, 15 * 1000)
				})
			});
		})
	});
}

//export
module.exports = Loader;