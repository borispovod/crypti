var crypto = require('crypto'),
	bignum = require('bignum'),
	ByteBuffer = require('bytebuffer');

function getBytes(signature) {
	try {
		var bb = new ByteBuffer(32, true);
		var publicKeyBuffer = new Buffer(signature.publicKey, 'hex');

		for (var i = 0; i < publicKeyBuffer.length; i++) {
			bb.writeByte(publicKeyBuffer[i]);
		}

		bb.flip();
	} catch (e) {
		throw e.toString();
	}
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

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

module.exports = {
	getHash: getHash,
	getId: getId,
	getBytes: getBytes
}