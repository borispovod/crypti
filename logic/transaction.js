var slots = require('../helpers/slots.js'),
	ed = require('ed25519'),
	crypto = require('crypto'),
	genesisblock = require("../helpers/genesisblock.js"),
	constants = require('../helpers/constants.js'),
	ByteBuffer = require("bytebuffer"),
	bignum = require('bignum'),
	extend = require('util-extend'),
	RequestSanitizer = require('../helpers/request-sanitizer.js');

//constructor
function Transaction() {
	//Object.freeze(this);
}

//private methods
var private = {};
private.types = {};

//public methods
Transaction.prototype.create = function (data) {
	if (!private.types[data.type]) {
		throw Error('Unknown transaction type');
	}

	if (!data.sender) {
		throw Error("Can't find sender");
	}

	if (!data.keypair) {
		throw Error("Can't find keypair");
	}

	var trs = {
		type: data.type,
		amount: 0,
		senderPublicKey: data.sender.publicKey,
		timestamp: slots.getTime(),
		asset: {}
	};

	trs = private.types[trs.type].create(data, trs);

	this.sign(data.keypair, trs);

	if (data.secondKeypair) {
		this.secondSign(data.secondKeypair, trs);
	}

	trs.id = this.getId(trs);

	return trs;
}

Transaction.prototype.attachAssetType = function (typeId, instance) {
	if (instance && typeof instance.create == 'function' && typeof instance.getBytes == 'function' && typeof instance.calculateFee == 'function' && typeof instance.verify == 'function' && typeof instance.objectNormalize == 'function' && typeof instance.dbRead == 'function') {
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
	var hash = this.getHash(trs);
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

Transaction.prototype.getBytes = function (trs) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
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

Transaction.prototype.verify = function (trs, sender, cb) { //inheritance
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}

	//check sender
	if (!sender) {
		return cb("Can't find sender");
	}

	//verify signature
	if (!this.verifySignature(trs)) {
		return cb("Can't verify signature");
	}

	//verify second signature
	if (sender.secondSignature && !this.verifySecondSignature(trs, sender.secondPublicKey)) {
		return cb("Can't verify second signature: " + trs.id);
	}

	//check sender
	if (trs.senderId != sender.address) {
		return cb("Invalid sender id: " + trs.id);
	}

	//calc fee
	trs.fee = private.types[trs.type].calculateFee(trs) || false;
	if (trs.fee === false) {
		return cb("Invalid transaction type/fee: " + trs.id);
	}
	//check amount
	if (trs.amount < 0 || trs.amount > 100000000 * constants.fixedPoint || String(trs.amount).indexOf('.') >= 0 || trs.amount.toString().indexOf('e') >= 0) {
		return cb("Invalid transaction amount: " + trs.id);
	}
	//check timestamp
	if (slots.getSlotNumber(trs.timestamp) > slots.getSlotNumber()) {
		return cb("Invalid transaction timestamp");
	}

	//spec
	private.types[trs.type].verify(trs, sender, cb);
}

Transaction.prototype.verifySignature = function (trs) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var remove = 64;

	if (trs.signSignature) {
		remove = 128;
	}

	var bytes = this.getBytes(trs);
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

Transaction.prototype.verifySecondSignature = function (trs, secondPublicKey) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var bytes = this.getBytes(trs);
	var data2 = new Buffer(bytes.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var signSignatureBuffer = new Buffer(trs.signSignature, 'hex');
		var publicKeyBuffer = new Buffer(secondPublicKey, 'hex');
		var res = ed.Verify(hash, signSignatureBuffer || ' ', publicKeyBuffer || ' ');
	} catch (e) {
		throw Error(e.toString());
	}

	return res;
}

Transaction.prototype.objectNormalize = function (trs) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	trs = RequestSanitizer.validate(trs, {
		object: true,
		properties: {
			id: "string",
			blockId: "string",
			type: "int",
			timestamp: "int",
			senderPublicKey: "hex",
			senderId: "string",
			recipientId: "string?",
			amount: "int",
			fee: "int",
			signature: "hex",
			signSignature: "hex?",
			asset: "object"
		}
	}).value;


	trs = private.types[trs.type].objectNormalize(trs);

	return trs;
}

Transaction.prototype.dbRead = function (raw) {
	if (!raw.t_id) {
		return null
	} else {
		var tx = {
			id: raw.t_id,
			blockId: raw.b_id,
			type: parseInt(raw.t_type),
			timestamp: parseInt(raw.t_timestamp),
			senderPublicKey: raw.t_senderPublicKey,
			senderId: raw.t_senderId,
			recipientId: raw.t_recipientId,
			amount: parseInt(raw.t_amount),
			fee: parseInt(raw.t_fee),
			signature: raw.t_signature,
			signSignature: raw.t_signSignature,
			confirmations: raw.confirmations,
			asset: {}
		}

		if (!private.types[tx.type]) {
			throw Error('Unknown transaction type');
		}

		var asset = private.types[tx.type].dbRead(raw);

		if (asset) {
			tx.asset = extend(tx.asset, asset);
		}

		return tx;
	}
}

//export
module.exports = Transaction;