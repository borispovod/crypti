var crypto = require('crypto'),
	ByteBuffer = require('bytebuffer'),
	bignum = require('bignum');

function getBytes(request) {
	var bb = new ByteBuffer(8, true);

	var address = request.address.slice(0, -1);
	var addressBuffer = bignum(address).toBuffer({ 'size' : '8' });

	for (var i = 0; i < addressBuffer.length; i++) {
		bb.writeByte(addressBuffer[i]);
	}

	bb.flip();
	return bb.toBuffer();
}

function getId(request) {
	var bb = new ByteBuffer(16, true);

	var address = request.address.slice(0, -1);
	var addressBuffer = bignum(address).toBuffer({ 'size': '8' });

	for (var i = 0; i < addressBuffer.length; i++) {
		bb.writeByte(addressBuffer[i]);
	}

	var blockIdBuffer = bignum(request.blockId).toBuffer({ size: '8'});

	for (var i = 0; i < blockIdBuffer.length; i++) {
		bb.writeByte(blockIdBuffer[i]);
	}

	bb.flip();

	var buffer = bb.toBuffer();
	var hash = crypto.createHash('sha256').update(buffer).digest();

	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

function getHash(request) {
	return crypto.createHash('sha256').update(getBytes(request)).digest();
}


module.exports = {
	getBytes : getBytes,
	getId : getId,
	getHash : getHash
}
