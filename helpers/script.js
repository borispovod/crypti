var crypto = require('crypto'),
	bignum = require('bignum');

function getBytes(script) {
	var inputBuffer = new Buffer(script.input, 'hex');
	var codeBuffer = new Buffer(script.code, 'hex');
	var objBuffer = Buffer.concat([inputBuffer, codeBuffer])

	return objBuffer;
}

module.exports = {
	getBytes: getBytes
};