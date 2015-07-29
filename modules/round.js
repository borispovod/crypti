var async = require('async'),
	util = require('util'),
	slots = require('../helpers/slots.js');

//private fields
var modules, library, self, private = {};
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

Round.prototype.backwardTick = function (block, previousBlock) {
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

			while (private.tasks.length) {
				var task = private.tasks.shift();
				task();
			}

			var foundationFee = Math.floor(private.unFeesByRound[round] / 10);
			var diffFee = private.unFeesByRound[round] - foundationFee;


			if (foundationFee || diffFee) {
				var recipient = modules.accounts.getAccountOrCreateByAddress("14225995638226006440C");
				recipient.addToBalance(-foundationFee);
				recipient.addToUnconfirmedBalance(-foundationFee);

				var delegatesFee = Math.floor(diffFee / slots.delegates);
				var leftover = diffFee - (delegatesFee * slots.delegates);

				private.unDelegatesByRound[round].forEach(function (delegate, index) {
					var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
					recipient.addToBalance(-delegatesFee);
					recipient.addToUnconfirmedBalance(-delegatesFee);
					modules.delegates.addFee(delegate, -delegatesFee);
					if (index === 0) {
						recipient.addToBalance(-leftover);
						recipient.addToUnconfirmedBalance(-leftover);
						modules.delegates.addFee(delegate, -leftover);
					}
				});
			}

			while (private.tasks.length) {
				var task = private.tasks.shift();
				task();
			}
		}
		delete private.unFeesByRound[round];
		delete private.unDelegatesByRound[round];
	}
}

Round.prototype.blocksStat = function (publicKey) {
	return {
		forged: private.forgedBlocks[publicKey] || null,
		missed: private.missedBlocks[publicKey] || null
	}
}

Round.prototype.tick = function (block) {
	private.forgedBlocks[block.generatorPublicKey] = (private.forgedBlocks[block.generatorPublicKey] || 0) + 1;
	var round = self.calc(block.height);

	private.feesByRound[round] = (private.feesByRound[round] || 0);
	private.feesByRound[round] += block.totalFee;

	private.delegatesByRound[round] = private.delegatesByRound[round] || [];
	private.delegatesByRound[round].push(block.generatorPublicKey);

	var nextRound = self.calc(block.height + 1);

	if (round !== nextRound || block.height == 1) {
		if (private.delegatesByRound[round].length == slots.delegates || block.height == 1) {
			var roundDelegates = modules.delegates.generateDelegateList(block.height);
			roundDelegates.forEach(function (delegate) {
				if (private.delegatesByRound[round].indexOf(delegate) == -1) {
					private.missedBlocks[delegate] = (private.missedBlocks[delegate] || 0) + 1;
				}
			});

			while (private.tasks.length) {
				var task = private.tasks.shift();
				task();
			}
			var foundationFee = Math.floor(private.feesByRound[round] / 10);
			var diffFee = private.feesByRound[round] - foundationFee;

			if (foundationFee || diffFee) {
				var recipient = modules.accounts.getAccountOrCreateByAddress("1504534484145552C");
				recipient.addToUnconfirmedBalance(foundationFee);
				recipient.addToBalance(foundationFee);

				var delegatesFee = Math.floor(diffFee / slots.delegates);
				var leftover = diffFee - (delegatesFee * slots.delegates);

				private.delegatesByRound[round].forEach(function (delegate, index) {
					var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
					recipient.addToUnconfirmedBalance(delegatesFee);
					recipient.addToBalance(delegatesFee);
					modules.delegates.addFee(delegate, delegatesFee);

					if (index === private.delegatesByRound[round].length - 1) {
						recipient.addToUnconfirmedBalance(leftover);
						recipient.addToBalance(leftover);
						modules.delegates.addFee(delegate, leftover);
					}
				});
			}
			while (private.tasks.length) {
				var task = private.tasks.shift();
				task();
			}
			library.bus.message('finishRound', round);
		}

		delete private.feesByRound[round];
		delete private.delegatesByRound[round];
	}
}

Round.prototype.onFinishRound = function(round){
	library.network.io.sockets.emit('rounds/change', {number: round});
}

Round.prototype.runOnFinish = function (task) {
	private.tasks.push(task);
}

//events
Round.prototype.onBind = function (scope) {
	modules = scope;
}

Round.prototype.accountIsDelegate = function (publicKey) {
	return private.forgedBlocks[publicKey];
}

//export
module.exports = Round;
