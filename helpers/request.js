var crypto = require('crypto');

function getBytes(request) {
	var bb = new ByteBuffer(8, true);

	var address = this.address.slice(0, -1);
	var addressBuffer = bignum(address).toBuffer({ 'size' : '8' });

	for (var i = 0; i < addressBuffer.length; i++) {
		bb.writeByte(addressBuffer[i]);
	}

	bb.flip();
	return bb.toBuffer();
}

function getId(request) {
	var hash = getHash(request);
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id =  bignum.fromBuffer(temp).toString();
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
