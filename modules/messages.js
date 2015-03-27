var encryptHelper = require('../helpers/encrypt.js'),
	TransactionTypes = require('../helpers/transaction-types.js');

var modules, library, self;

function Message() {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
		trs.amount = data.amount;

		return trs;
	}

	this.calculateFee = function (trs) {
		return trs.fee;
	}

	this.verify = function (trs, sender, cb) {
		cb(null, trs);
	}

	this.getBytes = function (trs) {
		return null;
	}

	this.objectNormalize = function (trs) {
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}
}


function attachApi() {

}


function Messages(cb, scope) {
	library = scope;
	self = this;

	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.MESSAGE, new Message());

	setImmediate(cb, null, self);
}

Messages.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Messages;