var async = require('async'),
	util = require('util'),
	slots = require('../helpers/slots.js'),
	sandboxHelper = require('../helpers/sandbox.js'),
	constants = require('../helpers/constants.js');

//private fields
var modules, library, self, private = {}, shared = {};

private.loaded = false;

private.feesByRound = {};
private.delegatesByRound = {};
private.unFeesByRound = {};
private.unDelegatesByRound = {};

//constructor
function Round(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	setImmediate(cb, null, self);
}

//public methods
Round.prototype.calc = function (height) {
	return Math.floor(height / slots.delegates) + (height % slots.delegates > 0 ? 1 : 0);
}

Round.prototype.getVotes = function (round, cb) {
	library.dbLite.query("select delegate, amount from ( " +
		"select m.delegate, sum(m.amount) amount, m.round from mem_round m " +
		"group by m.delegate, m.round " +
		") where round = $round", {round: round}, {delegate: String, amount: Number}, cb);
}

Round.prototype.flush = function (round, cb) {
	library.dbLite.query("delete from mem_round where round = $round", {round: round}, cb);
}

Round.prototype.directionSwap = function (direction, lastBlock, cb) {
	if (direction == 'backward') {
		private.feesByRound = {};
		private.delegatesByRound = {};
		self.flush(self.calc(lastBlock.height), cb);
	} else {
		private.unFeesByRound = {};
		private.unDelegatesByRound = {};
		self.flush(self.calc(lastBlock.height), cb);
	}
}

Round.prototype.backwardTick = function (block, previousBlock, cb) {
	function done(err) {
		cb && cb(err);
	}

	modules.accounts.mergeAccountAndGet({
		publicKey: block.generatorPublicKey,
		producedBlocks: -1,
		blockId: block.id
	}, function (err) {
		if (err) {
			return done(err);
		}

		var round = self.calc(block.height);

		var prevRound = self.calc(previousBlock.height);

		private.unFeesByRound[round] = (private.unFeesByRound[round] || 0);
		private.unFeesByRound[round] += block.totalFee;

		private.unDelegatesByRound[round] = private.unDelegatesByRound[round] || [];
		private.unDelegatesByRound[round].push(block.generatorPublicKey);

		if (prevRound !== round || previousBlock.height == 1) {
			if (private.unDelegatesByRound[round].length == slots.delegates || previousBlock.height == 1) {
				var outsiders = [];
				async.series([
					function (cb) {
						if (block.height != 1) {
							modules.delegates.generateDelegateList(block.height, function (err, roundDelegates) {
								if (err) {
									return cb(err);
								}
								for (var i = 0; i < roundDelegates.length; i++) {
									if (private.unDelegatesByRound[round].indexOf(roundDelegates[i]) == -1) {
										outsiders.push(modules.accounts.generateAddressByPublicKey(roundDelegates[i]));
									}
								}
								cb();
							});
						} else {
							cb();
						}
					},
					function (cb) {
						if (!outsiders.length) {
							return cb();
						}
						library.dbLite.query('update mem_accounts set missedBlock = missedBlock + 1 where address in (' + outsiders.join(',') + ')', function (err, data) {
							cb(err);
						});
					},
					function (cb) {
						self.getVotes(round, function (err, votes) {
							async.eachSeries(votes, function (vote, cb) {
								library.dbLite.query('update mem_accounts set vote = vote + $amount where address = $address', {
									address: modules.accounts.generateAddressByPublicKey(vote.delegate),
									amount: vote.amount
								}, function (err) {
									self.flush(round, cb);
								});
							}, cb)
						});
					},
					function (cb) {
						var foundationFee = Math.floor(private.unFeesByRound[round] / 10);
						var diffFee = private.unFeesByRound[round] - foundationFee;

						if (foundationFee || diffFee) {
							modules.accounts.mergeAccountAndGet({
								address: constants.foundation,
								balance: -foundationFee,
								u_balance: -foundationFee,
								blockId: block.id
							}, function (err) {
								if (err) {
									return cb(err);
								}
								var delegatesFee = Math.floor(diffFee / slots.delegates);
								var leftover = diffFee - (delegatesFee * slots.delegates);

								async.forEachOfSeries(private.unDelegatesByRound[round], function (delegate, index, cb) {
									modules.accounts.mergeAccountAndGet({
										publicKey: delegate,
										balance: -delegatesFee,
										u_balance: -delegatesFee,
										blockId: block.id
									}, function (err) {
										if (err) {
											return cb(err);
										}
										modules.statistic.addFee(delegate, -delegatesFee, function (err) {
											if (err) {
												return cb(err);
											}

											if (index === 0) {
												modules.accounts.mergeAccountAndGet({
													publicKey: delegate,
													balance: -leftover,
													u_balance: -leftover,
													blockId: block.id
												}, function (err) {
													if (err) {
														return cb(err);
													}
													modules.statistic.addFee(delegate, -leftover, cb);
												});
											} else {
												cb();
											}
										});
									});
								}, cb);
							});
						} else {
							cb();
						}
					},
					function (cb) {
						self.getVotes(round, function (err, votes) {
							async.eachSeries(votes, function (vote, cb) {
								library.dbLite.query('update mem_accounts set vote = vote + $amount where address = $address', {
									address: modules.accounts.generateAddressByPublicKey(vote.delegate),
									amount: vote.amount
								}, function (err) {
									self.flush(round, cb);
								});
							}, cb)
						});
					}
				], function (err) {
					delete private.unFeesByRound[round];
					delete private.unDelegatesByRound[round];
					done(err)
				});
			} else {
				done();
			}
		} else {
			done();
		}
	});
}

Round.prototype.tick = function (block, cb) {
	function done(err) {
		cb && setImmediate(cb, err);
	}

	modules.accounts.mergeAccountAndGet({
		publicKey: block.generatorPublicKey,
		producedBlocks: 1,
		blockId: block.id
	}, function (err) {
		if (err) {
			return done(err);
		}
		var round = self.calc(block.height);

		private.feesByRound[round] = (private.feesByRound[round] || 0);
		private.feesByRound[round] += block.totalFee;

		private.delegatesByRound[round] = private.delegatesByRound[round] || [];
		private.delegatesByRound[round].push(block.generatorPublicKey);

		var nextRound = self.calc(block.height + 1);

		if (round !== nextRound || block.height == 1) {
			if (private.delegatesByRound[round].length == slots.delegates || block.height == 1 || block.height == 101) {
				var outsiders = [];

				async.series([
					function (cb) {
						if (block.height != 1) {
							modules.delegates.generateDelegateList(block.height, function (err, roundDelegates) {
								if (err) {
									return cb(err);
								}
								for (var i = 0; i < roundDelegates.length; i++) {
									if (private.delegatesByRound[round].indexOf(roundDelegates[i]) == -1) {
										outsiders.push(modules.accounts.generateAddressByPublicKey(roundDelegates[i]));
									}
								}
								cb();
							});
						} else {
							cb();
						}
					},
					function (cb) {
						if (!outsiders.length) {
							return cb();
						}
						library.dbLite.query('update mem_accounts set missedBlock = missedBlock + 1 where address in (' + outsiders.join(',') + ')', function (err, data) {
							cb(err);
						});
					},
					function (cb) {
						self.getVotes(round, function (err, votes) {
							async.eachSeries(votes, function (vote, cb) {
								library.dbLite.query('update mem_accounts set vote = vote + $amount where address = $address', {
									address: modules.accounts.generateAddressByPublicKey(vote.delegate),
									amount: vote.amount
								}, function (err) {
									self.flush(round, cb);
								});
							}, cb)
						});
					},
					function (cb) {
						var foundationFee = Math.floor(private.feesByRound[round] / 10);
						var diffFee = private.feesByRound[round] - foundationFee;

						if (foundationFee || diffFee) {
							modules.accounts.mergeAccountAndGet({
								address: constants.foundation,
								balance: foundationFee,
								u_balance: foundationFee,
								blockId: block.id
							}, function (err) {
								if (err) {
									return cb(err);
								}
								var delegatesFee = Math.floor(diffFee / slots.delegates);
								var leftover = diffFee - (delegatesFee * slots.delegates);

								async.forEachOfSeries(private.delegatesByRound[round], function (delegate, index, cb) {
									modules.accounts.mergeAccountAndGet({
										publicKey: delegate,
										balance: delegatesFee,
										u_balance: delegatesFee,
										blockId: block.id
									}, function (err) {
										if (err) {
											return cb(err);
										}
										modules.statistic.addFee(delegate, delegatesFee, function (err) {
											if (err) {
												return cb(err);
											}

											if (index === private.delegatesByRound[round].length - 1) {
												modules.accounts.mergeAccountAndGet({
													publicKey: delegate,
													balance: leftover,
													u_balance: leftover,
													blockId: block.id
												}, function (err) {
													if (err) {
														return cb(err);
													}
													modules.statistic.addFee(delegate, leftover, cb);
												});
											} else {
												cb();
											}
										});
									});
								}, cb);
							});
						} else {
							cb();
						}
					},
					function (cb) {
						self.getVotes(round, function (err, votes) {
							async.eachSeries(votes, function (vote, cb) {
								library.dbLite.query('update mem_accounts set vote = vote + $amount where address = $address', {
									address: modules.accounts.generateAddressByPublicKey(vote.delegate),
									amount: vote.amount
								}, function (err) {
									self.flush(round, cb);
								});
							}, function (err) {
								library.bus.message('finishRound', round);
								cb(err);
							})
						});
					}
				], function (err) {
					delete private.feesByRound[round];
					delete private.delegatesByRound[round];

					done(err);
				});
			} else {
				done();
			}
		} else {
			done();
		}
	});
}

Round.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Round.prototype.onBind = function (scope) {
	modules = scope;
}

Round.prototype.onBlockchainReady = function () {
	private.loaded = true;
}

Round.prototype.onFinishRound = function (round) {
	library.network.io.sockets.emit('rounds/change', {number: round});
}

Round.prototype.cleanup = function (cb) {
	private.loaded = false;
	cb();
}

//shared

//export
module.exports = Round;
