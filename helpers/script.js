var crypto = require('crypto'),
	bignum = require('bignum');

function getBytes(script) {
	var inputBuffer = new Buffer(JSON.stringify(script.input), 'utf8');
	var codeBuffer = new Buffer(script.code, 'utf8');
	var objBuffer = Buffer.concat([inputBuffer, codeBuffer])

	return objBuffer;
}

function getHash(script) {
	return crypto.createHash("sha256").update(getBytes(script)).digest();
}

function getId(script) {
	var hash = getHash(script);
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}


module.exports = {
	getBytes: getBytes,
	getHash: getHash,
	getId: getId
};