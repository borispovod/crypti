var async = require('async'),
    util = require('util'),
    arrayHelper = require('../helpers/array.js'),
    slots = require('../helpers/slots.js');

//private fields
var modules, library, self;
var tasks = [];
var feesByRound = {};
var delegatesByRound = {};
var unFeesByRound = {};
var unDelegatesByRound = {};
var forgedBlocks = {};
var missedBlocks = {};

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
            tasks = [];
            //while (tasks.length) {
            //	var task = tasks.shift();
            //	task();
            //}
            break;
        case 'forward':
            unFeesByRound = {};
            unDelegatesByRound = {};
            tasks = [];
            //while (tasks.length) {
            //	var task = tasks.shift();
            //	task();
            //}
            break;
    }
}

Round.prototype.backwardTick = function (block, previousBlock) {
    forgedBlocks[block.generatorPublicKey] = (forgedBlocks[block.generatorPublicKey] || 0) - 1;

    var round = self.calc(block.height);

    var prevRound = self.calc(previousBlock.height);

    unFeesByRound[round] = (unFeesByRound[round] || 0);
    unFeesByRound[round] += block.totalFee;

    unDelegatesByRound[round] = unDelegatesByRound[round] || [];
    unDelegatesByRound[round].push(block.generatorPublicKey);

    if (prevRound !== round || previousBlock.height == 1) {
        if (unDelegatesByRound[round].length == slots.delegates || previousBlock.height == 1) {
            var roundDelegates = modules.delegates.generateDelegateList(block.height);
            roundDelegates.forEach(function (delegate) {
                if (unDelegatesByRound[round].indexOf(delegate) == -1) {
                    missedBlocks[delegate] = (missedBlocks[delegate] || 0) - 1;
                }
            });

            while (tasks.length) {
                var task = tasks.shift();
                task();
            }

            var foundationFee = Math.floor(unFeesByRound[round] / 10);
            var diffFee = unFeesByRound[round] - foundationFee;


            if (foundationFee || diffFee) {
                var recipient = modules.accounts.getAccountOrCreateByAddress("14225995638226006440C");
                recipient.addToBalance(-foundationFee);
                recipient.addToUnconfirmedBalance(-foundationFee);

                var delegatesFee = Math.floor(diffFee / slots.delegates);
                var leftover = diffFee - (delegatesFee * slots.delegates);

                unDelegatesByRound[round].forEach(function (delegate, index) {
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

            while (tasks.length) {
                var task = tasks.shift();
                task();
            }
        }
        delete unFeesByRound[round];
        delete unDelegatesByRound[round];
    }
}

Round.prototype.blocksStat = function (publicKey) {
    return {
        forged: forgedBlocks[publicKey] || null,
        missed: missedBlocks[publicKey] || null
    }
}

Round.prototype.tick = function (block) {
    forgedBlocks[block.generatorPublicKey] = (forgedBlocks[block.generatorPublicKey] || 0) + 1;
    var round = self.calc(block.height);

    feesByRound[round] = (feesByRound[round] || 0);
    feesByRound[round] += block.totalFee;

    delegatesByRound[round] = delegatesByRound[round] || [];
    delegatesByRound[round].push(block.generatorPublicKey);

    var nextRound = self.calc(block.height + 1);

    if (round !== nextRound || block.height == 1) {
        if (delegatesByRound[round].length == slots.delegates || block.height == 1) {
            var roundDelegates = modules.delegates.generateDelegateList(block.height);
            roundDelegates.forEach(function (delegate) {
                if (delegatesByRound[round].indexOf(delegate) == -1) {
                    missedBlocks[delegate] = (missedBlocks[delegate] || 0) + 1;
                }
            });

            while (tasks.length) {
                var task = tasks.shift();
                task();
            }
            var foundationFee = Math.floor(feesByRound[round] / 10);
            var diffFee = feesByRound[round] - foundationFee;

            if (foundationFee || diffFee) {
                var recipient = modules.accounts.getAccountOrCreateByAddress("14225995638226006440C");
                recipient.addToUnconfirmedBalance(foundationFee);
                recipient.addToBalance(foundationFee);

                var delegatesFee = Math.floor(diffFee / slots.delegates);
                var leftover = diffFee - (delegatesFee * slots.delegates);

                delegatesByRound[round].forEach(function (delegate, index) {
                    var recipient = modules.accounts.getAccountOrCreateByPublicKey(delegate);
                    recipient.addToUnconfirmedBalance(delegatesFee);
                    recipient.addToBalance(delegatesFee);
                    modules.delegates.addFee(delegate, delegatesFee);

                    if (index === delegatesByRound[round].length - 1) {
                        recipient.addToUnconfirmedBalance(leftover);
                        recipient.addToBalance(leftover);
                        modules.delegates.addFee(delegate, leftover);
                    }
                });
            }
            while (tasks.length) {
                var task = tasks.shift();
                task();
            }
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

//export
module.exports = Round;
