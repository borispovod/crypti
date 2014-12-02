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

