var crypto = require('crypto'),
	bignum = require('bignum'),
	ByteBuffer = require('bytebuffer');

function getBytes(signature) {
	var bb = new ByteBuffer(32, true);
	var publicKeyBuffer = new Buffer(signature.publicKey, 'hex');
	for (var i = 0; i < publicKeyBuffer.length; i++) {
		bb.writeByte(publicKeyBuffer[i]);
	}

	var generatorPublicKeyBuffer = new Buffer(signature.generatorPublicKey, 'hex');
	for (var i = 0; i < generatorPublicKeyBuffer.length; i++) {
		bb.writeByte(generatorPublicKeyBuffer[i]);
	}

	bb.writeInt(signature.timestamp);

	if (signature.signature) {
		var signatureBuffer = new Buffer(signature.signature, 'hex');
		for (var i = 0; i < signatureBuffer.length; i++) {
			bb.writeByte(signatureBuffer[i]);
		}
	}

	if (signature.generationSignature) {
		var generationSignatureBuffer = new Buffer(signature.generationSignature, 'hex');
		for (var i = 0; i < generationSignatureBuffer.length; i++) {
			bb.writeByte(generationSignatureBuffer[i]);
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

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

module.exports = {
	getHash : getHash,
	getId : getId,
	getBytes : getBytes
}