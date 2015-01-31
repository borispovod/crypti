var crypto = require('crypto'),
	bignum = require('bignum');

exports.getBytes = getBytes;

function getBytes(script) {
	var inputBuffer = new Buffer(script.parameters, 'hex');
	var codeBuffer = new Buffer(script.code, 'hex');
	var name = new Buffer(script, "utf8");
	var description = new Buffer(script.description? description : "", "utf8");
	var objBuffer = Buffer.concat([inputBuffer, codeBuffer, name, description]);

	return objBuffer;
}