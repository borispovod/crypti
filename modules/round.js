var async = require('async'),
	util = require('util'),
	params = require('../helpers/params.js'),
	arrayHelper = require('../helpers/array.js'),
	slots = require('../helpers/slots.js');

//private fields
var modules, library, self;
var tasks = [];
var feesByRound = {};
var delegatesByRound = {};
var unFeesByRound = {};
var unDelegatesByRound = {};

//constructor
function Round(cb, scope) {
	library = scope;
	self = this;

	setImmediate(cb, null, self);
}

//public methods
Round.prototype.calc = function (height) {
	return Math.floor(height / slots.delegates) + (height % slots.delegates > 0 ? 1 : 0);
}

Round.prototype.directionSwap = function (direction) {
	switch (direction) {
		case 'backward':
			feesByRound = {};
			delegatesByRound = {};
			while (tasks.length) {
				var task = tasks.shift();
				task();
			}
			break;
		case 'forward':
			unFeesByRound = {};
			unDelegatesByRound = {};
			while (tasks.length) {
				var task = tasks.shift();
				task();
			}
			break;
	}
	var round = self.calc(modules.blocks.getLastBlock().height);
	console.log('directionSwap round', round)
}

Round.prototype.backwardTick = function (block, previousBlock) {
	var round = self.calc(block.height);

	console.log('backwardTick round', round)

	var prevRound = self.calc(previousBlock.height);

	unFeesByRound[round] = (unFeesByRound[round] || 0);
	unFeesByRound[round] += block.totalFee;

	unDelegatesByRound[round] = unDelegatesByRound[round] || [];
	unDelegatesByRound[round].push(block.generatorPublicKey);

	if (prevRound !== round) {
		if (unDelegatesByRound[round].length == slots.delegates) {
			while (tasks.length) {
				var task = tasks.shift();
				task();
			}

			var fondationFee = Math.floor(unFeesByRound[round] / 10);
			var diffFee = unFeesByRound[round] - fondationFee;

			if (fondationFee) {
				var recipient = modules.accounts.getAccountOrCreateByAddress("14225995638226006440C");
				recipient.addToBalance(-fondationFee);
				recipient.addToUnconfirmedBalance(-fondationFee);

				var delegatesFee = Math.floor(diffFee / slots.delegates);
				var leftover = unFeesByRound[round] - (delegatesFee * slots.delegates);

				unDelegatesByRound[round].forEach(function (delegate, index) {
					var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
					recipient.addToBalance(-delegatesFee);
					recipient.addToUnconfirmedBalance(-delegatesFee);
					if (index === 0) {
						recipient.addToBalance(-leftover);
						recipient.addToUnconfirmedBalance(-leftover);
					}
				});
			}
		}
		delete unFeesByRound[round];
		delete unDelegatesByRound[round];
	}
}

Round.prototype.tick = function (block) {
	var round = self.calc(block.height);

	console.log('tick round', round)

	feesByRound[round] = (feesByRound[round] || 0);
	feesByRound[round] += block.totalFee;

	delegatesByRound[round] = delegatesByRound[round] || [];
	delegatesByRound[round].push(block.generatorPublicKey);

	var nextRound = self.calc(block.height + 1);

	if (round !== nextRound) {
		if (delegatesByRound[round].length == slots.delegates) {
			//if (delegatesByRound[round].indexOf('808c2a6e3bf0a8a6edd64356e98c8aab4daeacb4dc177a8a20a6442b40d1f0e0') !== -1) {
			//	var b = modules.accounts.getAccountOrCreateByPublicKey('808c2a6e3bf0a8a6edd64356e98c8aab4daeacb4dc177a8a20a6442b40d1f0e0')
			//	console.log('before', round, b.balance);
			//}
			while (tasks.length) {
				var task = tasks.shift();
				task();
			}
			var fondationFee = Math.floor(feesByRound[round] / 10);
			var diffFee = feesByRound[round] - fondationFee;

			if (fondationFee) {
				var recipient = modules.accounts.getAccountOrCreateByAddress("14225995638226006440C");
				recipient.addToBalance(fondationFee);
				recipient.addToUnconfirmedBalance(fondationFee);

				var delegatesFee = Math.floor(diffFee / slots.delegates);
				var leftover = feesByRound[round] - (delegatesFee * slots.delegates);

				delegatesByRound[round].forEach(function (delegate, index) {
					var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
					recipient.addToBalance(delegatesFee);
					recipient.addToUnconfirmedBalance(delegatesFee);
					//if (recipient.publicKey == '808c2a6e3bf0a8a6edd64356e98c8aab4daeacb4dc177a8a20a6442b40d1f0e0') {
					//	console.log('+' + delegatesFee);
					//}
					if (index === delegatesByRound[round].length - 1) {
						recipient.addToBalance(leftover);
						recipient.addToUnconfirmedBalance(leftover);
						//if (recipient.publicKey == '808c2a6e3bf0a8a6edd64356e98c8aab4daeacb4dc177a8a20a6442b40d1f0e0') {
						//	console.log('+' + leftover);
						//}
					}
				});
			}
			//if (delegatesByRound[round].indexOf('808c2a6e3bf0a8a6edd64356e98c8aab4daeacb4dc177a8a20a6442b40d1f0e0') !== -1) {
			//	var b = modules.accounts.getAccountOrCreateByPublicKey('808c2a6e3bf0a8a6edd64356e98c8aab4daeacb4dc177a8a20a6442b40d1f0e0')
			//	console.log('after', round, b.balance);
			//}
			library.bus.message('finishRound', round);
		}

		delete feesByRound[round];
		delete delegatesByRound[round];
	}
}

Round.prototype.runOnFinish = function (task) {
	tasks.push(task);
}

//events
Round.prototype.onBind = function (scope) {
	modules = scope;
}

Round.prototype.onFinishRound = function (round) {

}

//export
module.exports = Round;
