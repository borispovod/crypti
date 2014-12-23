function getBytes(confirmation) {
	var bb = new ByteBuffer(8 + 1 + 4 + 64, true);

	var companyIdBuffer = bignum(confirmation.companyId).toBuffer({'size': '8'});

	for (var i = 0; i < companyIdBuffer.length; i++) {
		bb.writeByte(companyIdBuffer[i]);
	}

	if (confirmation.verified) {
		bb.writeByte(1);
	} else {
		bb.writeByte(0);
	}

	bb.writeInt(confirmation.timestamp);

	if (confirmation.signature) {
		for (var i = 0; i < 64; i++) {
			bb.writeByte(confirmation.signature[i]);
		}
	}

	bb.flip();
	return bb.toBuffer();
}

function verifySignature(confirmation, publicKey) {
	var bytes = getBytes(confirmation);
	var data2 = new Buffer(bytes.length - 64);

	for (var i = 0; i < data2.length; i++) {
		data2[i] = bytes[i];
	}

	var hash = crypto.createHash('sha256').update(data2).digest();
	return ed.Verify(hash, confirmation.signature || ' ', publicKey || ' ');
}

module.exports = {
	getBytes: getBytes,
	verifySignature: verifySignature
}