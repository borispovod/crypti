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

Round.prototype.fowardTick = function (block, previousBlock) {
	var round = self.calc(block.height);
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
			var roundFee = unFeesByRound[round] / slots.delegates;
			if (roundFee) {
				unDelegatesByRound[round].forEach(function (delegate) {
					var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
					recipient.addToBalance(-roundFee);
					recipient.addToUnconfirmedBalance(-roundFee);
				});
			}
		}
		delete unFeesByRound[round];
		delete unDelegatesByRound[round];
	}
}

Round.prototype.flush = function(){
	unFeesByRound = {};
	unDelegatesByRound = {};
	feesByRound = {};
	delegatesByRound = {};
}

Round.prototype.tick = function (block) {
	var round = self.calc(block.height);

	feesByRound[round] = (feesByRound[round] || 0);
	feesByRound[round] += block.totalFee;

	delegatesByRound[round] = delegatesByRound[round] || [];
	delegatesByRound[round].push(block.generatorPublicKey);

	var nextRound = self.calc(block.height + 1);

	if (round !== nextRound) {
		if (delegatesByRound[round].length == slots.delegates) {
			while (tasks.length) {
				var task = tasks.shift();
				task();
			}
			var roundFee = feesByRound[round] / slots.delegates;
			if (roundFee) {
				delegatesByRound[round].forEach(function (delegate) {
					var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
					recipient.addToBalance(roundFee);
					recipient.addToUnconfirmedBalance(roundFee);
				});
			}
			library.bus.message('finishRound', round);
		}

		delete feesByRound[round];
		delete delegatesByRound[round];
	}
}

Round.prototype.getRoundData = function (round, cb) {
	library.dbLite.query("SELECT sum(totalFee), group_concat(lower(hex(generatorPublicKey))) FROM blocks where (cast(height / $delegates as integer) + (case when height % $delegates > 0 then 1 else 0 end)) = $round", {
		round: round,
		delegates: slots.delegates
	}, {
		'fees': Number,
		'delegateList': String
	}, function (err, rows) {
		if (err || !rows.length) {
			cb(err ? err.toString() : "Can't find round: " + round);
			return;
		}

		cb(null, rows[0]);
	});
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
