var slots = require('../helpers/slots.js'),
	ed = require('ed25519'),
	crypto = require('crypto');

//constructor
function Transaction() {
	Object.freeze(this);
}

//private methods
var private = {};
private.types = {};

//public methods
Transaction.prototype.create = function (trs, cb) {
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}
	private.types[trs.type].create(trs, cb);
}

Transaction.prototype.attachAssetType = function (typeId, instance) {
	if (instance && typeof instance.create == 'function' && typeof instance.getBytes == 'function' && typeof instance.calculateFee == 'function' && typeof instance.verify == 'function') {
		private.types[typeId] = instance;
	} else {
		throw Error('Invalid instance interface');
	}
}

Transaction.prototype.verify = function (trs, cb) { //inheritance
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}

	//check sender
	var sender = this.getSender(trs);
	if (!sender) {
		return cb("Can't find sender");
	}

	//verify signature
	if (!this.verifySignature(trs)) {
		return cb("Can't verify signature");
	}

	//verify second signature
	if (!self.verifySecondSignature(trs, sender.secondPublicKey)) {
		return cb("Can't verify second signature: " + trs.id);
	}

	//calc fee
	trs.fee = private.types[trs.type].calculateFee(trs) || false;
	if (trs.fee === false) {
		return cb("Invalid transaction type/fee: " + trs.id);
	}
	//check amount
	if (trs.amount < 0 || String(trs.amount).indexOf('.') >= 0) {
		return cb("Invalid transaction amount: " + trs.id);
	}
	//check timestamp
	if (slots.getSlotNumber(trs.timestamp) > slots.getSlotNumber()) {
		return cb("Invalid transaction timestamp");
	}

	//spec
	private.types[trs.type].verify(trs, cb);
}

Transaction.prototype.getSender = function (trs) {
	throw Error('method getSender not implemented');
}

Transaction.prototype.verifySignature = function (trs) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var remove = 64;

	if (trs.signSignature) {
		remove = 128;
	}

	var bytes = private.types[trs.type].getBytes(trs);
	var data2 = new Buffer(bytes.length - remove);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var signatureBuffer = new Buffer(trs.signature, 'hex');
		var senderPublicKeyBuffer = new Buffer(trs.senderPublicKey, 'hex');
		var res = ed.Verify(hash, signatureBuffer || ' ', senderPublicKeyBuffer || ' ');
	} catch (e) {
		throw Error(e);
	}

	return res;
}

Transaction.prototype.verifySecondSignature = function (trs, senderPublicKey) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var bytes = private.types[trs.type].getBytes(trs);
	var data2 = new Buffer(bytes.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var signSignatureBuffer = new Buffer(trs.signSignature, 'hex');
		var publicKeyBuffer = new Buffer(senderPublicKey, 'hex');
		var res = ed.Verify(hash, signSignatureBuffer || ' ', publicKeyBuffer || ' ');
	} catch (e) {
		throw Error(e);
	}

	return res;
}


//Samples
var Transfer = function () {
	this.create = function (trs, cb) {

	}

	this.calculateFee = function (trs) {
		return 0;
	}

	this.verify = function (trs, cb) {

	}

	this.getBytes = function (trs) {
		return 0;
	}
};

var Signature = function () {
	this.create = function (trs, cb) {

	}

	this.calculateFee = function (trs) {
		return 0;
	}

	this.verify = function (trs, cb) {

	}

	this.getBytes = function (trs) {
		return 0;
	}
};

var Delegate = function () {
	this.create = function (trs, cb) {

	}

	this.calculateFee = function (trs) {
		return 0;
	}

	this.verify = function (trs, cb) {

	}

	this.getBytes = function (trs) {
		return 0;
	}
};

var Vote = function () {
	this.create = function (trs, cb) {

	}

	this.calculateFee = function (trs) {
		return 0;
	}

	this.verify = function (trs, cb) {

	}

	this.getBytes = function (trs) {
		return 0;
	}
};