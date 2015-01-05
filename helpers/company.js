var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer");

function getId(company) {
	var hash = crypto.createHash('sha256').update(getBytes(company)).digest();
	var temp = new Buffer(8);

	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

function getBytes(company) {
	var nameBuffer = new Buffer(company.name, 'utf8');

	var descriptionBuffer = null;
	if (company.description) {
		descriptionBuffer = new Buffer(company.description, 'utf8');
	} else {
		descriptionBuffer = new Buffer(0);
	}

	var domainBuffer = new Buffer(company.domain, 'utf8');
	var emailBuffer = new Buffer(company.email, 'utf8');

	var bb = new ByteBuffer(4 + 4 + 4 + 4 + nameBuffer.length + descriptionBuffer.length + domainBuffer.length + emailBuffer.length + 4 + 32 + 64, true);

	bb.writeInt(nameBuffer.length);
	bb.writeInt(descriptionBuffer.length);
	bb.writeInt(domainBuffer.length);
	bb.writeInt(emailBuffer.length);

	for (var i = 0; i < nameBuffer.length; i++) {
		bb.writeByte(nameBuffer[i])
	}

	for (var i = 0; i < descriptionBuffer.length; i++) {
		bb.writeByte(descriptionBuffer[i]);
	}

	for (var i = 0; i < domainBuffer.length; i++) {
		bb.writeByte(domainBuffer[i]);
	}

	for (var i = 0; i < emailBuffer.length; i++) {
		bb.writeByte(emailBuffer[i]);
	}

	bb.writeInt(company.timestamp);

	for (var i = 0; i < company.generatorPublicKey.length; i++) {
		bb.writeByte(company.generatorPublicKey[i]);
	}

	if (company.signature) {
		for (var i = 0; i < company.signature.length; i++) {
			bb.writeByte(company.signature[i]);
		}
	}

	bb.flip();
	return bb.toBuffer();
}


module.exports = {
	getBytes : getBytes,
	getId : getId
}