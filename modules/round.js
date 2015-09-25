var async = require('async'),
	util = require('util'),
	slots = require('../helpers/slots.js'),
	sandboxHelper = require('../helpers/sandbox.js');

//private fields
var modules, library, self, private = {}, shared = {};
private.tasks = [];
private.feesByRound = {};
private.delegatesByRound = {};
private.unFeesByRound = {};
private.unDelegatesByRound = {};
private.forgedBlocks = {};
private.missedBlocks = {};

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

Round.prototype.directionSwap = function (direction) {
	switch (direction) {
		case 'backward':
			private.feesByRound = {};
			private.delegatesByRound = {};
			private.tasks = [];
			break;
		case 'forward':
			private.unFeesByRound = {};
			private.unDelegatesByRound = {};
			private.tasks = [];
			break;
	}
}

Round.prototype.backwardTick = function (block, previousBlock, cb) {
	function done(err) {
		delete private.unFeesByRound[round];
		delete private.unDelegatesByRound[round];
		cb && cb(err);
	}

	private.forgedBlocks[block.generatorPublicKey] = (private.forgedBlocks[block.generatorPublicKey] || 0) - 1;

	var round = self.calc(block.height);

	var prevRound = self.calc(previousBlock.height);

	private.unFeesByRound[round] = (private.unFeesByRound[round] || 0);
	private.unFeesByRound[round] += block.totalFee;

	private.unDelegatesByRound[round] = private.unDelegatesByRound[round] || [];
	private.unDelegatesByRound[round].push(block.generatorPublicKey);

	if (prevRound !== round || previousBlock.height == 1) {
		if (private.unDelegatesByRound[round].length == slots.delegates || previousBlock.height == 1) {
			var roundDelegates = modules.delegates.generateDelegateList(block.height);
			roundDelegates.forEach(function (delegate) {
				if (private.unDelegatesByRound[round].indexOf(delegate) == -1) {
					private.missedBlocks[delegate] = (private.missedBlocks[delegate] || 0) - 1;
				}
			});

			async.series([
				function (cb) {
					var task;
					async.whilst(function () {
						task = private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							cb();
						});
					}, cb);
				},
				function (cb) {
					var foundationFee = Math.floor(private.unFeesByRound[round] / 10);
					var diffFee = private.unFeesByRound[round] - foundationFee;

					if (foundationFee || diffFee) {
						modules.accounts.mergeAccountAndGet({
							address: "14225995638226006440C",
							balance: -foundationFee,
							u_balance: -foundationFee
						}, function (err, recipient) {
							if (err) {
								return cb(err);
							}
							var delegatesFee = Math.floor(diffFee / slots.delegates);
							var leftover = diffFee - (delegatesFee * slots.delegates);

							async.forEachOfSeries(private.unDelegatesByRound[round], function (delegate, index, cb) {
								modules.accounts.mergeAccountAndGet({
									publicKey: delegate,
									balance: -delegatesFee,
									u_balance: -delegatesFee
								}, function (err, recipient) {
									if (err) {
										return cb(err);
									}
									modules.delegates.addFee(delegate, -delegatesFee);
									if (index === 0) {
										modules.accounts.mergeAccountAndGet({
											publicKey: delegate,
											balance: -leftover,
											u_balance: -leftover
										}, function (err) {
											if (err) {
												return cb(err);
											}
											modules.delegates.addFee(delegate, -leftover);
											cb();
										});
									} else {
										cb();
									}
								});
							}, cb);
						});
					}else{
						cb();
					}
				},
				function (cb) {
					async.whilst(function () {
						var task = private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							cb();
						});
					}, cb);
				}
			], done);
		} else {
			done();
		}
	} else {
		done();
	}
}

Round.prototype.blocksStat = function (publicKey) {
	return {
		forged: private.forgedBlocks[publicKey] || null,
		missed: private.missedBlocks[publicKey] || null
	}
}

Round.prototype.tick = function (block, cb) {
	function done(err) {
		delete private.feesByRound[round];
		delete private.delegatesByRound[round];
		cb && setImmediate(cb, err);
	}


	private.forgedBlocks[block.generatorPublicKey] = (private.forgedBlocks[block.generatorPublicKey] || 0) + 1;
	var round = self.calc(block.height);

	private.feesByRound[round] = (private.feesByRound[round] || 0);
	private.feesByRound[round] += block.totalFee;

	private.delegatesByRound[round] = private.delegatesByRound[round] || [];
	private.delegatesByRound[round].push(block.generatorPublicKey);

	var nextRound = self.calc(block.height + 1);

	//console.log(block.height, round, nextRound);
	if (round !== nextRound || block.height == 1) {
		if (private.delegatesByRound[round].length == slots.delegates || block.height == 1) {

			var roundDelegates = modules.delegates.generateDelegateList(block.height);
			roundDelegates.forEach(function (delegate) {
				if (private.delegatesByRound[round].indexOf(delegate) == -1) {
					private.missedBlocks[delegate] = (private.missedBlocks[delegate] || 0) + 1;
				}
			});

			async.series([
				function (cb) {
					var task;
					async.whilst(function () {
						task = private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							setImmediate(cb);
						});
					}, cb);
				},
				function (cb) {
					var foundationFee = Math.floor(private.feesByRound[round] / 10);
					var diffFee = private.feesByRound[round] - foundationFee;

					//console.log("Fee:");
					//console.log(foundationFee, diffFee);

					if (foundationFee || diffFee) {
						modules.accounts.mergeAccountAndGet({
							address: "14225995638226006440C",
							balance: foundationFee,
							u_balance: foundationFee
						}, function (err, recipient) {
							if (err) {
								return cb(err);
							}
							var delegatesFee = Math.floor(diffFee / slots.delegates);
							var leftover = diffFee - (delegatesFee * slots.delegates);

							async.forEachOfSeries(private.delegatesByRound[round], function (delegate, index, cb) {
								modules.accounts.mergeAccountAndGet({
									publicKey: delegate,
									balance: delegatesFee,
									u_balance: delegatesFee
								}, function (err, recipient) {
									if (err) {
										return cb(err);
									}
									modules.delegates.addFee(delegate, delegatesFee);

									if (index === private.delegatesByRound[round].length - 1) {
										modules.accounts.mergeAccountAndGet({
											publicKey: delegate,
											balance: leftover,
											u_balance: leftover
										}, function (err, recipient) {
											if (err) {
												return cb(err);
											}
											modules.delegates.addFee(delegate, leftover);
										});
									} else {
										cb();
									}
								});
							}, cb);
						});
					} else {
						cb();
					}
				},
				function (cb) {
					async.whilst(function () {
						var task = private.tasks.shift();
						return !!task;
					}, function (cb) {
						task(function () {
							cb();
						});
					}, function () {
						//console.log('here!');
						library.bus.message('finishRound', round);
						cb();
					});
				}
			], done);
		} else {
			done();
		}
	} else {
		done();
	}
}

Round.prototype.onFinishRound = function (round) {
	//console.log("round finished");
	library.network.io.sockets.emit('rounds/change', {number: round});
}

Round.prototype.runOnFinish = function (task) {
	private.tasks.push(task);
}

Round.prototype.sandboxApi = function (call, args, cb) {
	sandboxHelper.callMethod(shared, call, args, cb);
}

//events
Round.prototype.onBind = function (scope) {
	modules = scope;
}

//shared

//export
module.exports = Round;
