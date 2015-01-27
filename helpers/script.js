var crypto = require('crypto'),
	bignum = require('bignum');

exports.getBytes = getBytes;

function getBytes(script) {
	var inputBuffer = new Buffer(script.params, 'hex');
	var codeBuffer = new Buffer(script.code, 'hex');
	var objBuffer = Buffer.concat([inputBuffer, codeBuffer])

	return objBuffer;
}