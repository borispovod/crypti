var slots = require('../helpers/slots.js'),
	ed = require('ed25519'),
	crypto = require('crypto'),
	genesisblock = require("../helpers/genesisblock.js");

//constructor
function Transaction() {
	//Object.freeze(this);
}

//private methods
var private = {};
private.types = {};

//public methods
Transaction.prototype.create = function (data, cb) {
	if (!private.types[data.type]) {
		return cb('Unknown transaction type');
	}

	var transaction = {
		type: data.type,
		amount: 0,
		senderPublicKey: data.sender.publicKey,
		timestamp: slots.getTime(),
		asset: {}
	};

	transaction = private.types[config.type].create(data, transaction);

	this.sign(data.keypair, transaction);

	if (data.secondKeypair) {
		this.secondSign(data.secondKeypair, transaction);
	}

	transaction.id = this.getId(transaction);

	return transaction;
}

Transaction.prototype.attachAssetType = function (typeId, instance) {
	if (instance && typeof instance.create == 'function' && typeof instance.apply == 'function' && typeof instance.getBytes == 'function' && typeof instance.calculateFee == 'function' && typeof instance.verify == 'function') {
		private.types[typeId] = instance;
	} else {
		throw Error('Invalid instance interface');
	}
}

Transaction.prototype.sign = function (keypair, trs) {
	var hash = this.getHash(trs);
	trs.signature = ed.Sign(hash, keypair).toString('hex');
}

Transaction.prototype.secondSign = function (keypair, trs) {
	var hash = this.getHash(trs);
	trs.signSignature = ed.Sign(hash, keypair).toString('hex');
}

Transaction.prototype.getId = function (trs) {
	var hash = crypto.createHash('sha256').update(this.getBytes(trs)).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

Transaction.prototype.getHash = function (trs) {
	return crypto.createHash('sha256').update(this.getBytes(trs)).digest();
}

Transaction.prototype.apply = function (trs, sender, recipient, cb) {
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}

	var amount = trs.amount + trs.fee;

	if (sender.balance < amount && trs.blockId != genesisblock.block.id) {
		return cb('Has no balance');
	}

	sender.addToBalance(-amount);

	private.types[trs.type].apply(trs, sender, recipient, cb);
}

Transaction.prototype.getBytes = function (trs) {
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}

	try {
		var assetBytes = private.types[trs.type].getBytes(trs);
		var assetSize = assetBytes ? assetBytes.length : 0;

		var bb = new ByteBuffer(1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);
		bb.writeByte(trs.type);
		bb.writeInt(trs.timestamp);

		var senderPublicKeyBuffer = new Buffer(trs.senderPublicKey, 'hex');
		for (var i = 0; i < senderPublicKeyBuffer.length; i++) {
			bb.writeByte(senderPublicKeyBuffer[i]);
		}

		if (trs.recipientId) {
			var recipient = trs.recipientId.slice(0, -1);
			recipient = bignum(recipient).toBuffer({size: 8});

			for (var i = 0; i < 8; i++) {
				bb.writeByte(recipient[i] || 0);
			}
		} else {
			for (var i = 0; i < 8; i++) {
				bb.writeByte(0);
			}
		}

		bb.writeLong(trs.amount);

		if (assetSize > 0) {
			for (var i = 0; i < assetSize; i++) {
				bb.writeByte(assetBytes[i]);
			}
		}

		if (trs.signature) {
			var signatureBuffer = new Buffer(trs.signature, 'hex');
			for (var i = 0; i < signatureBuffer.length; i++) {
				bb.writeByte(signatureBuffer[i]);
			}
		}

		if (trs.signSignature) {
			var signSignatureBuffer = new Buffer(trs.signSignature, 'hex');
			for (var i = 0; i < signSignatureBuffer.length; i++) {
				bb.writeByte(signSignatureBuffer[i]);
			}
		}

		bb.flip();
	} catch (e) {
		throw Error(e.toString());
	}
	return bb.toBuffer();
}

Transaction.prototype.verify = function (trs, sender, recipient, cb) { //inheritance
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}

	//check sender
	if (!sender) {
		return cb("Can't find sender");
	}

	//verify signature
	if (!this.verifySignature(trs, sender, recipient)) {
		return cb("Can't verify signature");
	}

	//verify second signature
	if (!this.verifySecondSignature(trs, sender, recipient)) {
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
	private.types[trs.type].verify(trs, sender, recipient, cb);
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
		throw Error(e.toString());
	}

	return res;
}

Transaction.prototype.verifySecondSignature = function (trs, sender) {
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
		var publicKeyBuffer = new Buffer(sender.secondPublicKey, 'hex');
		var res = ed.Verify(hash, signSignatureBuffer || ' ', publicKeyBuffer || ' ');
	} catch (e) {
		throw Error(e.toString());
	}

	return res;
}

//export
module.exports = Transaction;