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

	trs.signature = this.sign(data.keypair, trs);

	if (data.secondKeypair) {
		trs.signSignature = this.sign(data.secondKeypair, trs);
	}

	trs.id = this.getId(trs);

	trs.fee = private.types[trs.type].calculateFee(trs) || false;

	return trs;
}

Transaction.prototype.attachAssetType = function (typeId, instance) {
	if (instance && typeof instance.create == 'function' && typeof instance.getBytes == 'function' &&
		typeof instance.calculateFee == 'function' && typeof instance.verify == 'function' &&
		typeof instance.objectNormalize == 'function' && typeof instance.dbRead == 'function' &&
		typeof instance.apply == 'function' && typeof instance.undo == 'function' &&
		typeof instance.applyUnconfirmed == 'function' && typeof instance.undoUnconfirmed == 'function' &&
		typeof instance.ready == 'function'
	) {
		private.types[typeId] = instance;
	} else {
		throw Error('Invalid instance interface');
	}
}

Transaction.prototype.sign = function (keypair, trs) {
	var hash = this.getHash(trs);
	return ed.Sign(hash, keypair).toString('hex');
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
	return crypto.createHash('sha256').update(this.getBytes(trs, true)).digest();
}

Transaction.prototype.getBytes = function (trs, skipSignatures) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	try {
		var assetBytes = private.types[trs.type].getBytes(trs, skipSignatures);
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

		if (!skipSignatures && trs.signature) {
			var signatureBuffer = new Buffer(trs.signature, 'hex');
			for (var i = 0; i < signatureBuffer.length; i++) {
				bb.writeByte(signatureBuffer[i]);
			}
		}

		if (!skipSignatures && trs.signSignature) {
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

Transaction.prototype.ready = function (trs) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	return private.types[trs.type].ready(trs);
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
	if (!this.verifySignature(trs, trs.senderPublicKey, trs.signature)) {
		return cb("Can't verify signature");
	}

	//verify second signature
	if (sender.secondSignature && !this.verifySignature(trs, sender.secondPublicKey, trs.signSignature)) {
		return cb("Can't verify second signature: " + trs.id);
	}

	//check sender
	if (trs.senderId != sender.address) {
		return cb("Invalid sender id: " + trs.id);
	}

	//calc fee
	var fee = private.types[trs.type].calculateFee(trs) || false;
	if (!fee || trs.fee != fee) {
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

Transaction.prototype.verifySignature = function (trs, publicKey, signature) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var bytes = this.getBytes(trs, true);
	var data2 = new Buffer(bytes.length);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();

	try {
		var signatureBuffer = new Buffer(signature, 'hex');
		var publicKeyBuffer = new Buffer(publicKey, 'hex');
		var res = ed.Verify(hash, signatureBuffer || ' ', publicKeyBuffer || ' ');
	} catch (e) {
		throw Error(e.toString());
	}

	return res;
}

Transaction.prototype.apply = function (trs, sender) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var amount = trs.amount + trs.fee;

	if (trs.blockId != genesisblock.block.id && sender.balance < amount) {
		return false;
	}

	sender.addToBalance(-amount);

	if (!private.types[trs.type].apply(trs, sender)) {
		sender.addToBalance(amount);
		return false;
	}

	return true;
}

Transaction.prototype.undo = function (trs, sender) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var amount = trs.amount + trs.fee;

	sender.addToBalance(amount);

	if (!private.types[trs.type].undo(trs, sender)) {
		sender.addToBalance(-amount);
		return false;
	}

	return true;
}

Transaction.prototype.applyUnconfirmed = function (trs, sender) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	if (sender.secondSignature && !trs.signSignature) {
		return false;
	}

	var amount = trs.amount + trs.fee;

	if (sender.unconfirmedBalance < amount && trs.blockId != genesisblock.block.id) {
		return false;
	}

	sender.addToUnconfirmedBalance(-amount);

	if (!private.types[trs.type].applyUnconfirmed(trs, sender)) {
		sender.addToUnconfirmedBalance(amount);
		return false;
	}

	return true;
}

Transaction.prototype.undoUnconfirmed = function (trs, sender) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var amount = trs.amount + trs.fee;

	sender.addToUnconfirmedBalance(amount);

	if (!private.types[trs.type].undoUnconfirmed(trs, sender)) {
		sender.addToUnconfirmedBalance(-amount);
		return false;
	}

	return true;
}

Transaction.prototype.dbSave = function (dbLite, trs, cb) {
	if (!private.types[trs.type]) {
		return cb('Unknown transaction type');
	}

	dbLite.query("INSERT INTO trs(id, blockId, type, timestamp, senderPublicKey, senderId, recipientId, amount, fee, signature, signSignature) VALUES($id, $blockId, $type, $timestamp, $senderPublicKey, $senderId, $recipientId, $amount, $fee, $signature, $signSignature)", {
		id: trs.id,
		blockId: trs.blockId,
		type: trs.type,
		timestamp: trs.timestamp,
		senderPublicKey: new Buffer(trs.senderPublicKey, 'hex'),
		senderId: trs.senderId,
		recipientId: trs.recipientId || null,
		amount: trs.amount,
		fee: trs.fee,
		signature: new Buffer(trs.signature, 'hex'),
		signSignature: trs.signSignature ? new Buffer(trs.signSignature, 'hex') : null
	}, function (err) {
		if (err) {
			return cb(err);
		}

		private.types[trs.type].dbSave(dbLite, trs, cb);
	});

}

Transaction.prototype.objectNormalize = function (trs) {
	if (!private.types[trs.type]) {
		throw Error('Unknown transaction type');
	}

	var report = RequestSanitizer.validate(trs, {
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
	});

	if (!report.isValid) {
		throw Error(report.issues);
	}

	trs = report.value;

	try {
		trs = private.types[trs.type].objectNormalize(trs);
	} catch (e) {
		throw Error(e.toString());
	}

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