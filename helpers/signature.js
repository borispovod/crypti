var crypto = require('crypto'),
	bignum = require('bignum'),
	ByteBuffer = require('bytebuffer');

function getBytes(signature) {
	var bb = new ByteBuffer(32 + 32 + 4 + 64 + 64, true);
	for (var i = 0; i < signature.publicKey.length; i++) {
		bb.writeByte(signature.publicKey[i]);
	}

	for (var i = 0; i < signature.generatorPublicKey.length; i++) {
		bb.writeByte(signature.generatorPublicKey[i]);
	}

	bb.writeInt(signature.timestamp);

	if (signature.signature) {
		for (var i = 0; i < signature.signature.length; i++) {
			bb.writeByte(signature.signature[i]);
		}
	}

	if (signature.generationSignature) {
		for (var i = 0; i < signature.generationSignature.length; i++) {
			bb.writeByte(signature.generationSignature[i]);
		}
	}

	bb.flip();
	return bb.toBuffer();
}

function getHash(signature) {
	return crypto.createHash("sha256").update(getBytes(signature)).digest();
}

function getId(signature) {
	var hash = getHash(signature);
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	this.id = bignum.fromBuffer(temp).toString();
	return this.id;
}

module.exports = {
	getHash : getHash,
	getId : getId,
	getBytes : getBytes
}